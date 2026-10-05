import type { Db } from "mongodb";
import type { SyncPushBody, SyncPushOperation, SyncPushResult, TaskDto } from "@template/contracts";
import { TaskRepository, type TaskDocument } from "../tasks/task.repository";
import { toDto, subtasksToDocuments, ruleToDocument } from "../tasks/task.service";
import { AppError } from "../../lib/errors/AppError";

/**
 * Offline-first sync.
 *
 * Pull: GET /sync?since=<ISO> — full documents updated after `since`
 * (including soft-deleted ones, reported in `deletions`).
 *
 * Push: POST /sync/push — batch of client operations resolved with
 * Last-Writer-Wins on `updated_at`: an operation only applies when its
 * `updated_at` is strictly newer than the stored document's; otherwise the
 * operation is rejected as a conflict (the server keeps its version).
 */
export class SyncService {
  private repo: TaskRepository;

  constructor(db: Db) {
    this.repo = new TaskRepository(db);
  }

  async pull(
    userId: string,
    sinceIso: string | undefined
  ): Promise<{
    changes: TaskDto[];
    deletions: TaskDto[];
    server_time: string;
  }> {
    let since: Date | undefined;
    if (sinceIso !== undefined) {
      since = new Date(sinceIso);
      if (Number.isNaN(since.getTime())) throw AppError.validation("since invalide.");
    }

    const docs = await this.repo.findAllRaw(userId, since);
    const serverTime = new Date();

    const changes: TaskDto[] = [];
    const deletions: TaskDto[] = [];
    for (const doc of docs) {
      if (doc.deleted_at) deletions.push(toDto(doc));
      else changes.push(toDto(doc));
    }

    return { changes, deletions, server_time: serverTime.toISOString() };
  }

  async push(userId: string, body: SyncPushBody): Promise<SyncPushResult> {
    const applied: string[] = [];
    const conflicts: SyncPushResult["conflicts"] = [];
    const now = new Date();

    for (const op of body.operations) {
      const opUpdatedAt = new Date(op.updated_at);
      if (Number.isNaN(opUpdatedAt.getTime())) {
        // Malformed timestamp is rejected like a lost race.
        conflicts.push({
          id: op.id,
          kept: now.toISOString(),
          rejected_updated_at: op.updated_at,
        });
        continue;
      }

      const existing = await this.repo.findByIdAny(op.id, userId);

      if (op.op === "delete") {
        if (!existing || existing.deleted_at) {
          // Already gone server-side: the intent is achieved.
          applied.push(op.id);
          continue;
        }
        if (opUpdatedAt >= existing.updatedAt) {
          await this.repo.softDelete(existing.id, userId, now);
          applied.push(op.id);
        } else {
          conflicts.push({
            id: op.id,
            kept: existing.updatedAt.toISOString(),
            rejected_updated_at: op.updated_at,
          });
        }
        continue;
      }

      // op === "upsert": the client sends its full local document.
      if (!op.data || !op.data.title || op.data.title.length === 0) {
        throw AppError.validation(`Opération upsert sans data pour ${op.id}.`);
      }

      if (!existing) {
        await this.repo.insert(this.clientDocToDocument(op.id, userId, op.data, opUpdatedAt));
        applied.push(op.id);
        continue;
      }

      // LWW: strictly newer wins; equal or older is a conflict.
      if (opUpdatedAt > existing.updatedAt) {
        const updated = await this.applyUpsert(existing, op, opUpdatedAt);
        if (updated) applied.push(op.id);
        else conflicts.push(this.conflictOf(existing, op));
      } else {
        conflicts.push(this.conflictOf(existing, op));
      }
    }

    return { applied, conflicts };
  }

  private async applyUpsert(
    existing: TaskDocument,
    op: SyncPushOperation,
    opUpdatedAt: Date
  ): Promise<TaskDocument | null> {
    const data = op.data;
    if (typeof data?.title !== "string" || data.title.length === 0) {
      throw AppError.validation("Données invalides");
    }

    const set: Partial<TaskDocument> = { updatedAt: opUpdatedAt };

    if (data.title !== undefined) set.title = data.title;
    if (data.description !== undefined) set.description = data.description ?? null;
    if (data.priority !== undefined) set.priority = data.priority;
    if (data.status !== undefined) set.status = data.status;
    if (data.due_date !== undefined)
      set.due_date = data.due_date === null ? null : new Date(data.due_date);
    if (data.has_time !== undefined) set.has_time = data.has_time;
    if (data.tags !== undefined) set.tags = data.tags;
    if (data.subtasks !== undefined) set.subtasks = subtasksToDocuments(data.subtasks);
    if (data.recurrence_rule !== undefined) {
      set.recurrence_rule = data.recurrence_rule ? ruleToDocument(data.recurrence_rule) : null;
    }

    return this.repo.updateByPublicId(existing.id, existing.userId, set);
  }

  /** Convert a client-provided document into a server TaskDocument. */
  private clientDocToDocument(
    id: string,
    userId: string,
    data: SyncPushOperation["data"],
    opUpdatedAt: Date
  ): TaskDocument {
    const now = new Date();
    return {
      id,
      userId,
      title: typeof data?.title === "string" ? data.title : "",
      description: data?.description ?? null,
      priority: data?.priority ?? "P3",
      status: data?.status ?? "TODO",
      due_date: data?.due_date ? new Date(data.due_date) : null,
      has_time: data?.has_time ?? false,
      tags: data?.tags ?? [],
      subtasks: data?.subtasks ? subtasksToDocuments(data.subtasks) : [],
      recurrence_rule: data?.recurrence_rule ? ruleToDocument(data.recurrence_rule) : null,
      parent_task_id: data?.parent_task_id ?? undefined,
      original_due_date: data?.original_due_date ? new Date(data.original_due_date) : undefined,
      deleted_at: null,
      createdAt: now,
      updatedAt: opUpdatedAt,
    };
  }

  private conflictOf(existing: TaskDocument, op: SyncPushOperation) {
    return {
      id: existing.id,
      kept: existing.updatedAt.toISOString(),
      rejected_updated_at: op.updated_at,
    };
  }
}
