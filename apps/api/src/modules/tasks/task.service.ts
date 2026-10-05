import type { FastifyInstance } from "fastify";
import type { ObjectId } from "mongodb";
import { ObjectId as ObjectIdCtor } from "mongodb";
import { RRule, type Weekday } from "rrule";
import type {
  CreateTaskDto,
  RecurrenceRule,
  SyncOperation,
  SyncChangesResponse,
  SyncPushResponse,
  SyncTask,
  UpdateTaskDto,
} from "@template/contracts";
import {
  TaskRepository,
  type TaskDocument,
  type TaskPriorityValue,
  type TaskRecurrence,
  type TaskStatusValue,
  type TaskUpdateSet,
} from "./task.repository";
import { AppError } from "../../lib/errors/AppError";

const WEEKDAY_BY_INDEX: Record<number, Weekday> = {
  0: RRule.MO,
  1: RRule.TU,
  2: RRule.WE,
  3: RRule.TH,
  4: RRule.FR,
  5: RRule.SA,
  6: RRule.SU,
};

const FREQ_BY_NAME = {
  DAILY: RRule.DAILY,
  WEEKLY: RRule.WEEKLY,
  MONTHLY: RRule.MONTHLY,
  YEARLY: RRule.YEARLY,
} as const;

/** Contract by_weekday is 0-based from Monday; rrule expects its weekday objects. */
function toRruleWeekdays(indexes: number[]): Weekday[] {
  return indexes.map((i) => {
    const wd = WEEKDAY_BY_INDEX[i];
    if (!wd) throw AppError.validation(`Jour de semaine invalide : ${i}`);
    return wd;
  });
}

function toRecurrence(rule: RecurrenceRule) {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    byWeekday: rule.by_weekday,
    byMonthDay: rule.by_month_day,
    endDate: rule.end_date ? new Date(rule.end_date) : null,
  };
}

/**
 * Occurrence dates of a recurring parent inside [start, end]. The first
 * occurrence is the parent's own due date; it is excluded from the virtual list
 * (the parent document itself represents it).
 */
function computeOccurrences(
  rule: TaskRecurrence,
  dtstart: Date,
  windowStart: Date,
  windowEnd: Date
): Date[] {
  const effectiveStart = dtstart > windowStart ? dtstart : windowStart;
  const ruleEngine = new RRule({
    freq: FREQ_BY_NAME[rule.frequency],
    interval: rule.interval,
    dtstart,
    ...(rule.byWeekday && rule.byWeekday.length > 0
      ? { byweekday: toRruleWeekdays(rule.byWeekday) }
      : {}),
    ...(rule.byMonthDay !== undefined ? { bymonthday: rule.byMonthDay } : {}),
  });
  return ruleEngine
    .between(effectiveStart, windowEnd, true)
    .filter((d) => d.getTime() !== dtstart.getTime());
}

type TaskDto = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriorityValue;
  status: TaskStatusValue;
  due_date: string | null;
  has_time: boolean;
  tags: string[];
  subtasks: Array<{ id: string; title: string; is_completed: boolean }>;
  parent_task_id: string | null;
  original_due_date: string | null;
  recurrence_rule: RecurrenceRule | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

function taskToDto(doc: TaskDocument): TaskDto {
  return {
    id: doc._id!.toString(),
    title: doc.title,
    description: doc.description ?? null,
    priority: doc.priority,
    status: doc.status,
    due_date: doc.dueDate ? doc.dueDate.toISOString() : null,
    has_time: doc.hasTime,
    tags: doc.tags,
    subtasks: doc.subtasks.map((s) => ({
      id: s.id,
      title: s.title,
      is_completed: s.isCompleted,
    })),
    parent_task_id: doc.parentId ? doc.parentId.toString() : null,
    original_due_date: doc.originalDueDate ? doc.originalDueDate.toISOString() : null,
    recurrence_rule: doc.recurrence
      ? {
          frequency: doc.recurrence.frequency,
          interval: doc.recurrence.interval,
          ...(doc.recurrence.byWeekday ? { by_weekday: doc.recurrence.byWeekday } : {}),
          ...(doc.recurrence.byMonthDay ? { by_month_day: doc.recurrence.byMonthDay } : {}),
          ...(doc.recurrence.endDate ? { end_date: doc.recurrence.endDate.toISOString() } : {}),
        }
      : null,
    deleted_at: doc.deletedAt ? doc.deletedAt.toISOString() : null,
    created_at: doc.createdAt.toISOString(),
    updated_at: doc.updatedAt.toISOString(),
  };
}

/** Virtual-occurrence identity for a parent at a given instant. */
function occurrenceKey(parentId: string, at: Date): string {
  return `${parentId}:${at.getTime()}`;
}

export class TaskService {
  private repo: TaskRepository;

  constructor(app: FastifyInstance) {
    this.repo = new TaskRepository(app.db);
  }

  async ensureIndexes(): Promise<void> {
    return this.repo.ensureIndexes();
  }

  async create(userId: string, dto: CreateTaskDto) {
    const doc = await this.repo.insert({
      title: dto.title,
      description: dto.description ?? null,
      priority: dto.priority,
      status: dto.status,
      dueDate: dto.due_date ? new Date(dto.due_date) : null,
      hasTime: dto.has_time,
      tags: dto.tags,
      subtasks: dto.subtasks.map((s) => ({
        id: s.id,
        title: s.title,
        isCompleted: s.is_completed,
      })),
      recurrence: dto.recurrence_rule ? toRecurrence(dto.recurrence_rule) : null,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return taskToDto(doc);
  }

  /**
   * Materialize an occurrence of a recurring parent as a real instance document
   * (completion, postponement, edition). The parent itself is never modified.
   */
  async materializeOccurrence(
    userId: string,
    parentTaskId: string,
    input: { original_due_date: string; due_date?: string; status?: TaskStatusValue }
  ) {
    const parent = await this.repo.findById(parentTaskId, userId);
    if (!parent) throw AppError.notFound("Tâche parent introuvable.");
    if (!parent.recurrence) throw AppError.conflict("Cette tâche n'est pas récurrente.");

    const now = new Date();
    const doc = await this.repo.insert({
      title: parent.title,
      description: parent.description ?? null,
      priority: parent.priority,
      status: input.status ?? "TODO",
      dueDate: input.due_date ? new Date(input.due_date) : new Date(input.original_due_date),
      hasTime: parent.hasTime,
      tags: parent.tags,
      subtasks: parent.subtasks,
      parentId: parent._id!,
      originalDueDate: new Date(input.original_due_date),
      recurrence: null,
      userId,
      createdAt: now,
      updatedAt: now,
    });
    return taskToDto(doc);
  }

  async addSubtask(userId: string, taskId: string, title: string) {
    const parent = await this.repo.findById(taskId, userId);
    if (!parent) throw AppError.notFound("Tâche introuvable.");
    // Repository storage uses isCompleted; the response uses the contract shape.
    const stored = { id: crypto.randomUUID(), title, isCompleted: false };
    const updated = await this.repo.updateSet(taskId, userId, {
      subtasks: [...parent.subtasks, stored],
    });
    if (!updated) throw AppError.notFound("Tâche introuvable.");
    return { id: stored.id, title: stored.title, is_completed: stored.isCompleted };
  }

  async list(
    userId: string,
    filters: {
      status?: TaskStatusValue;
      priority?: TaskPriorityValue;
      tag?: string;
      backlog?: boolean;
    }
  ) {
    const docs = await this.repo.findAll(userId, {
      status: filters.status,
      priority: filters.priority,
      tag: filters.tag,
      backlogOnly: filters.backlog,
    });
    const items = docs.map(taskToDto);
    return { data: items, meta: { total: items.length } };
  }

  async get(userId: string, id: string) {
    const doc = await this.repo.findById(id, userId);
    if (!doc) throw AppError.notFound("Tâche introuvable.");
    return taskToDto(doc);
  }

  async update(userId: string, id: string, dto: UpdateTaskDto) {
    const set: TaskUpdateSet = {};
    if (dto.title !== undefined) set.title = dto.title;
    if (dto.description !== undefined) set.description = dto.description ?? null;
    if (dto.priority !== undefined) set.priority = dto.priority;
    if (dto.status !== undefined) set.status = dto.status;
    if (dto.has_time !== undefined) set.hasTime = dto.has_time;
    if (dto.tags !== undefined) set.tags = dto.tags;
    if (dto.subtasks !== undefined) {
      set.subtasks = dto.subtasks.map((s) => ({
        id: s.id,
        title: s.title,
        isCompleted: s.is_completed,
      }));
    }
    if (dto.due_date !== undefined) {
      if (dto.due_date === null) {
        set.unsetDueDate = true; // dated → backlog
      } else {
        set.dueDate = new Date(dto.due_date); // backlog → dated
      }
    }
    if (dto.recurrence_rule !== undefined) {
      set.recurrence = dto.recurrence_rule ? toRecurrence(dto.recurrence_rule) : null;
    }

    const doc = await this.repo.updateSet(id, userId, set);
    if (!doc) throw AppError.notFound("Tâche introuvable.");
    return taskToDto(doc);
  }

  async softDelete(userId: string, id: string) {
    const deleted = await this.repo.softDelete(id, userId, new Date());
    if (!deleted) throw AppError.notFound("Tâche introuvable.");
  }

  // ── Views ────────────────────────────────────────────────────────────────

  /**
   * Date-window view: dated tasks inside [start, end] (plain, instances and
   * recurring parents alike) merged with the parents' virtual occurrences,
   * excluding occurrences already materialized. A parent whose own due date is
   * covered by an instance (first occurrence completed) is hidden — the
   * instance represents it.
   */
  private mergeWithOccurrences(
    dated: TaskDocument[],
    parents: TaskDocument[],
    instances: TaskDocument[],
    start: Date,
    end: Date
  ): TaskDto[] {
    // Parents whose first occurrence was materialized: hidden, the instance shows.
    const hiddenParentIds = new Set<string>();
    const coveredVirtual = new Set<string>();
    for (const inst of instances) {
      if (!inst.parentId) continue;
      const parent = parents.find((p) => p._id!.equals(inst.parentId!));
      if (!parent) continue;
      if (inst.originalDueDate) {
        if (parent.dueDate?.getTime() === inst.originalDueDate.getTime()) {
          hiddenParentIds.add(inst.parentId.toString());
        }
        coveredVirtual.add(occurrenceKey(inst.parentId.toString(), inst.originalDueDate));
      }
    }

    // All dated documents in the window (plain tasks, instances, parents).
    const items = dated
      .filter((d) => !(d.recurrence && hiddenParentIds.has(d._id!.toString())))
      .map(taskToDto);

    // Virtual occurrences of the parents, minus materialized ones.
    for (const parent of parents) {
      if (!parent.dueDate || hiddenParentIds.has(parent._id!.toString())) continue;
      const occs = computeOccurrences(parent.recurrence!, parent.dueDate, start, end);
      const base = taskToDto(parent);
      for (const occ of occs) {
        if (coveredVirtual.has(occurrenceKey(parent._id!.toString(), occ))) continue;
        if (occ < start || occ > end) continue;
        items.push({
          ...base,
          id: `${parent._id!.toString()}:${occ.toISOString()}`,
          due_date: occ.toISOString(),
          parent_task_id: parent._id!.toString(),
          original_due_date: occ.toISOString(),
          status: parent.status,
        });
      }
    }

    items.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
    return items;
  }

  async listRange(userId: string, start: Date, end: Date) {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw AppError.validation("Fenêtre invalide (start après end, ou date invalide).");
    }

    const [dated, parents] = await Promise.all([
      this.repo.findDatedBetween(userId, start, end),
      this.repo.findRecurringParents(userId),
    ]);
    const parentIds: ObjectId[] = parents.map((p) => p._id!);
    const instances = await this.repo.findInstancesOf(userId, parentIds);

    return {
      tasks: this.mergeWithOccurrences(dated, parents, instances, start, end),
    };
  }

  async listOverdue(userId: string, now: Date) {
    const cutoff = new Date(now.getTime() - 1);

    // 1) Real dated tasks in the past (plain tasks AND materialized instances
    //    AND recurring parents whose first occurrence is already past).
    const dated = await this.repo.findDatedBetween(userId, new Date(0), cutoff);

    // 2) Virtual occurrences not yet materialized (their parents' due dates can
    //    predate `now` by weeks — fetch all recurring parents).
    const parents = await this.repo.findRecurringParents(userId);
    const parentIds: ObjectId[] = parents.map((p) => p._id!);
    const instances = await this.repo.findInstancesOf(userId, parentIds);
    const usedVirtual = new Set<string>();
    for (const inst of instances) {
      const parent = parents.find((p) => p._id!.equals(inst.parentId!));
      if (!parent) continue;
      if (inst.originalDueDate) {
        usedVirtual.add(occurrenceKey(inst.parentId!.toString(), inst.originalDueDate));
      }
    }

    const items: TaskDto[] = [];
    for (const doc of dated) {
      if (!doc.parentId && doc.status !== "DONE" && doc.status !== "ARCHIVED") {
        items.push(taskToDto(doc));
      }
    }
    for (const parent of parents) {
      if (!parent.dueDate) continue;
      if (parent.status === "DONE" || parent.status === "ARCHIVED") continue;
      const occs = computeOccurrences(parent.recurrence!, parent.dueDate, new Date(0), cutoff);
      const base = taskToDto(parent);
      for (const occ of occs) {
        const key = occurrenceKey(parent._id!.toString(), occ);
        if (usedVirtual.has(key)) continue;
        items.push({
          ...base,
          id: `${parent._id!.toString()}:${occ.toISOString()}`,
          due_date: occ.toISOString(),
          parent_task_id: parent._id!.toString(),
          original_due_date: occ.toISOString(),
        });
      }
    }

    items.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
    return { tasks: items };
  }

  // ── Offline-first sync ───────────────────────────────────────────────────

  /**
   * Pull: alive tasks updated since `since` (parents + instances alike) plus
   * tombstone ids for soft deletes. The client merges by id and reconciles.
   */
  async pull(userId: string, since: Date): Promise<SyncChangesResponse> {
    const all = await this.repo.findAll(userId, {});
    const changes = all.filter((d) => d.updatedAt > since).map(taskToDto);
    const deletions = await this.repo.findDeletedSince(userId, since);
    return { changes, deletions, server_time: new Date().toISOString() };
  }

  /** Push: apply a batch of offline operations with LWW (last-write-wins). */
  async push(userId: string, ops: SyncOperation[]): Promise<SyncPushResponse> {
    const conflicts: SyncPushResponse["conflicts"] = [];
    let applied = 0;
    let ignored = 0;

    for (const op of ops) {
      const t: SyncTask = op.task;

      if (op.op === "delete") {
        const result = await this.repo.softDeleteLww(userId, t.id, new Date(t.updated_at));
        if (result === "applied") {
          applied++;
        } else if (result === "conflict") {
          // An own newer write already won: report the LWW rejection.
          conflicts.push({ id: op.id, kept: "server", rejected_updated_at: t.updated_at });
        } else {
          // not_found (foreign id or gone): not applied, not a conflict.
          void ignored;
        }
        continue;
      }

      // upsert: full-document semantics (the client sends its whole local state).
      const result = await this.repo.upsertLww(userId, {
        id: t.id,
        title: t.title ?? "",
        description: t.description ?? null,
        priority: t.priority ?? "P3",
        status: t.status ?? "TODO",
        dueDate: t.due_date ? new Date(t.due_date) : null,
        hasTime: t.has_time ?? false,
        tags: t.tags ?? [],
        subtasks: (t.subtasks ?? []).map((s) => ({
          id: s.id,
          title: s.title,
          isCompleted: s.is_completed,
        })),
        recurrence: t.recurrence_rule ? toRecurrence(t.recurrence_rule) : null,
        parentId: t.parent_task_id ? new ObjectIdCtor(t.parent_task_id) : undefined,
        originalDueDate: t.original_due_date ? new Date(t.original_due_date) : undefined,
        deletedAt: t.deleted_at ? new Date(t.deleted_at) : null,
        updatedAt: new Date(t.updated_at),
      });

      if (result === "applied") {
        applied++;
      } else if (result === "conflict") {
        conflicts.push({ id: op.id, kept: "server", rejected_updated_at: t.updated_at });
      } else {
        ignored++;
      }
    }

    return { applied, conflicts };
  }
}
