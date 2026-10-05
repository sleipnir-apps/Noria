import type { Db } from "mongodb";
import type {
  CreateTaskDto,
  RecurrenceRule,
  TaskDto,
  TaskPriority,
  UpdateTaskDto,
} from "@template/contracts";
import { expandOccurrences } from "@template/contracts";
import {
  TaskRepository,
  type TaskDocument,
  type TaskSubtaskDocument,
  type RecurrenceRuleDocument,
} from "./task.repository";
import { AppError } from "../../lib/errors/AppError";

export function toDto(doc: TaskDocument, extras?: { is_occurrence?: boolean }): TaskDto {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description ?? undefined,
    priority: doc.priority,
    status: doc.status,
    due_date: doc.due_date ? doc.due_date.toISOString() : null,
    has_time: doc.has_time,
    tags: doc.tags,
    subtasks: doc.subtasks,
    recurrence_rule: doc.recurrence_rule ? serializeRule(doc.recurrence_rule) : null,
    parent_task_id: doc.parent_task_id ?? null,
    original_due_date: doc.original_due_date ? doc.original_due_date.toISOString() : null,
    is_instance: doc.parent_task_id !== undefined && doc.parent_task_id !== null,
    is_occurrence: extras?.is_occurrence ?? false,
    occurrence_date: extras?.is_occurrence
      ? doc.due_date
        ? doc.due_date.toISOString()
        : null
      : null,
    deleted_at: doc.deleted_at ? doc.deleted_at.toISOString() : null,
    created_at: doc.createdAt.toISOString(),
    updated_at: doc.updatedAt.toISOString(),
  };
}

/** Rule stored with Date end_date → DTO with ISO end_date. */
function serializeRule(rule: NonNullable<TaskDocument["recurrence_rule"]>): RecurrenceRule {
  const serialized: RecurrenceRule = {
    frequency: rule.frequency,
    interval: rule.interval,
  };
  if (rule.by_weekday && rule.by_weekday.length > 0) {
    serialized.by_weekday = rule.by_weekday as RecurrenceRule["by_weekday"];
  }
  if (rule.by_month_day !== null && rule.by_month_day !== undefined) {
    serialized.by_month_day = rule.by_month_day;
  }
  serialized.end_date = rule.end_date ? rule.end_date.toISOString() : null;
  return serialized;
}

/** DTO rule (ISO end_date) → document rule (Date end_date). */
export function ruleToDocument(rule: RecurrenceRule): RecurrenceRuleDocument {
  const doc: RecurrenceRuleDocument = {
    frequency: rule.frequency,
    interval: rule.interval,
  };
  if (rule.by_weekday && rule.by_weekday.length > 0) {
    doc.by_weekday = [...rule.by_weekday];
  }
  if (rule.by_month_day !== undefined && rule.by_month_day !== null) {
    doc.by_month_day = rule.by_month_day;
  }
  doc.end_date = rule.end_date ? new Date(rule.end_date) : null;
  return doc;
}

export function subtasksToDocuments(
  subtasks: Array<{ id: string; title: string; is_completed: boolean }>
): TaskSubtaskDocument[] {
  return subtasks.map((s) => ({ id: s.id, title: s.title, is_completed: s.is_completed }));
}

export class TaskService {
  private repo: TaskRepository;

  constructor(db: Db) {
    this.repo = new TaskRepository(db);
  }

  async ensureIndexes() {
    return this.repo.ensureIndexes();
  }

  async create(userId: string, dto: CreateTaskDto): Promise<TaskDto> {
    const now = new Date();
    const doc: TaskDocument = {
      id: crypto.randomUUID(),
      userId,
      title: dto.title,
      description: dto.description ?? null,
      priority: dto.priority ?? "P3",
      status: dto.status ?? "TODO",
      due_date: dto.due_date ? new Date(dto.due_date) : null,
      has_time: dto.has_time ?? false,
      tags: dto.tags ?? [],
      subtasks: subtasksToDocuments(dto.subtasks ?? []),
      recurrence_rule: dto.recurrence_rule ? ruleToDocument(dto.recurrence_rule) : null,
      parent_task_id: undefined,
      original_due_date: undefined,
      deleted_at: null,
      createdAt: now,
      updatedAt: now,
    };
    const inserted = await this.repo.insert(doc);
    return toDto(inserted);
  }

  async list(
    userId: string,
    filters: { status?: string; priority?: string; backlog?: boolean }
  ): Promise<TaskDto[]> {
    const docs = await this.repo.findActiveByUser(userId);
    // BSON stores explicit `undefined` keys as `null`, so any falsy
    // parent_task_id (absent or null) means "not an instance".
    let tasks = docs.filter((d) => !d.parent_task_id);

    if (filters.backlog) {
      tasks = tasks.filter((d) => d.due_date === null && d.status !== "ARCHIVED");
    }
    if (filters.status) {
      tasks = tasks.filter((d) => d.status === filters.status);
    }
    if (filters.priority) {
      tasks = tasks.filter((d) => d.priority === filters.priority);
    }

    // Backlog order: priority (P1 first) then created_at ascending.
    const priorityRank: Record<TaskPriority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
    return tasks
      .map((d) => toDto(d))
      .sort((a, b) => {
        const byPriority = priorityRank[a.priority ?? "P3"] - priorityRank[b.priority ?? "P3"];
        if (byPriority !== 0) return byPriority;
        const byDate = (a.created_at ?? "").localeCompare(b.created_at ?? "");
        if (byDate !== 0) return byDate;
        return a.id.localeCompare(b.id);
      });
  }

  async get(userId: string, id: string): Promise<TaskDto> {
    const doc = await this.repo.findByPublicId(id, userId);
    if (!doc) throw AppError.notFound("Tâche introuvable.");
    return toDto(doc);
  }

  /**
   * Generic PATCH. On a recurring parent, the client appends
   * `?occurrence_date=<ISO>`: the mutation applies to THAT occurrence, which
   * is materialized as an instance — the parent is never modified.
   */
  async update(
    userId: string,
    id: string,
    occurrenceDate: string | undefined,
    dto: UpdateTaskDto
  ): Promise<TaskDto> {
    const doc = await this.repo.findByPublicId(id, userId);
    if (!doc) throw AppError.notFound("Tâche introuvable.");

    // Materialized instance (or plain task): direct mutation.
    if (!occurrenceDate) {
      const updated = await this.applyUpdate(doc, dto, new Date());
      return toDto(updated);
    }

    // Occurrence mutation on a recurring parent.
    if (!doc.recurrence_rule) {
      throw AppError.validation("occurrence_date ne s'applique qu'à une tâche récurrente.");
    }
    if (!doc.due_date) throw AppError.conflict("La tâche parente n'a pas de première date.");

    const occurrence = new Date(occurrenceDate);
    if (Number.isNaN(occurrence.getTime())) {
      throw AppError.validation("occurrence_date invalide.");
    }

    // Reuse the existing instance for that instant, if already materialized.
    const existing = await this.repo.findInstanceByOccurrence(doc.id, userId, occurrence);
    const base = existing ?? this.instantiate(doc, occurrence);
    const updated = await this.applyUpdate(base, dto, new Date());
    return toDto(updated);
  }

  /**
   * Create (or reuse) the instance materializing an occurrence, without
   * applying any mutation yet (mutation applied by caller if any).
   */
  private instantiate(parent: TaskDocument, occurrence: Date): TaskDocument {
    const now = new Date();
    return {
      ...parent,
      _id: undefined,
      id: crypto.randomUUID(),
      parent_task_id: parent.id,
      original_due_date: new Date(occurrence),
      due_date: new Date(occurrence),
      recurrence_rule: null,
      // An edited instance may need its own editable copies of fields that
      // were readonly views of the parent: none in V1 — plain copies.
      subtasks: parent.subtasks.map((s) => ({ ...s })),
      tags: [...parent.tags],
      createdAt: now,
      updatedAt: now,
    };
  }

  private async applyUpdate(
    existing: TaskDocument,
    dto: UpdateTaskDto,
    now: Date
  ): Promise<TaskDocument> {
    const set: Partial<TaskDocument> = { updatedAt: now };
    if (dto.title !== undefined) set.title = dto.title;
    if (dto.description !== undefined) set.description = dto.description;
    if (dto.priority !== undefined) set.priority = dto.priority;
    if (dto.status !== undefined) set.status = dto.status;
    if (dto.due_date !== undefined)
      set.due_date = dto.due_date === null ? null : new Date(dto.due_date);
    if (dto.has_time !== undefined) set.has_time = dto.has_time;
    if (dto.tags !== undefined) set.tags = dto.tags;
    if (dto.subtasks !== undefined) set.subtasks = subtasksToDocuments(dto.subtasks);
    if (dto.recurrence_rule !== undefined) {
      set.recurrence_rule = dto.recurrence_rule ? ruleToDocument(dto.recurrence_rule) : null;
    }

    if (existing._id) {
      const updated = await this.repo.updateByPublicId(existing.id, existing.userId, set);
      if (!updated) throw AppError.notFound("Tâche introuvable.");
      return updated;
    }
    // Not yet materialized: insert the new instance now.
    return this.repo.insert({ ...existing, ...set });
  }

  /** Soft delete — excluded from all views, reported via sync `deletions`. */
  async delete(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.softDelete(id, userId, new Date());
    if (!deleted) throw AppError.notFound("Tâche introuvable.");
  }

  /**
   * GET /tasks/range: dated tasks of the window (parents' first occurrence
   * + standalone) merged with the computed rrule occurrences, reusing
   * materialized instances when one exists. Recurring parents whose first
   * occurrence (due_date) is before the window still render their future
   * occurrences inside it.
   */
  async range(userId: string, startIso: string, endIso: string): Promise<TaskDto[]> {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw AppError.validation("Intervalle invalide.");
    }

    const docs = await this.repo.findActiveByUser(userId);
    const result: TaskDto[] = [];

    for (const doc of docs) {
      if (doc.parent_task_id) continue; // instances follow their own due_date
      if (!doc.due_date) continue; // backlog is out of range views

      if (doc.recurrence_rule) {
        // Parent recurring: first occurrence (due_date) + computed ones.
        const occurrences = expandOccurrences(
          doc.recurrence_rule as unknown as RecurrenceRule,
          doc.due_date.toISOString(),
          startIso,
          endIso
        );
        for (const occurrence of occurrences) {
          result.push(this.occurrenceToDto(doc, occurrence, docs));
        }
        continue;
      }

      // Plain dated task in window.
      const due = doc.due_date.toISOString();
      if (due >= startIso && due <= endIso) {
        result.push(toDto(doc));
      }
    }

    return result.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  }

  /** Build the view DTO for one occurrence, reusing a materialized instance. */
  private occurrenceToDto(
    parent: TaskDocument,
    occurrenceIso: string,
    allDocs: TaskDocument[]
  ): TaskDto {
    const occurrenceDate = new Date(occurrenceIso);
    const instance = allDocs.find(
      (d) =>
        d.parent_task_id === parent.id &&
        d.original_due_date?.getTime() === occurrenceDate.getTime()
    );
    if (instance) {
      // Materialized: the instance carries the possibly-diverged state.
      const dto = toDto(instance);
      return { ...dto, is_occurrence: true, occurrence_date: occurrenceIso };
    }
    // Virtual: parent state, occurrence instant.
    return {
      ...toDto(parent),
      is_occurrence: true,
      occurrence_date: occurrenceIso,
      due_date: occurrenceIso,
    };
  }

  async overdue(userId: string, nowIso: string): Promise<TaskDto[]> {
    const now = new Date(nowIso);
    if (Number.isNaN(now.getTime())) throw AppError.validation("now invalide.");
    const docs = await this.repo.findActiveByUser(userId);
    const nowMs = now.getTime();

    return docs
      .filter((d) => {
        // Instances are overdue via their own due_date (same predicate), so we
        // can include them directly — but recurring parents are represented by
        // their first occurrence only, which is their due_date: included too.
        if (d.status === "DONE" || d.status === "ARCHIVED") return false;
        return d.due_date !== null && d.due_date !== undefined && d.due_date.getTime() < nowMs;
      })
      .map((d) => toDto(d));
  }
}
