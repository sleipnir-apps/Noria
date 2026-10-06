import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import type {
  CreateTaskDto,
  OccurrenceUpdateDto,
  SyncDoc,
  SyncOperation,
  SyncPullResponse,
  SyncPushDto,
  SyncPushResponse,
  Task,
  TaskFilters,
  UpdateTaskDto,
  UpcomingResponse,
  UpcomingTask,
} from "@template/contracts";
import { AppError } from "../../lib/errors/AppError";
import { isSet, TaskRepository } from "./task.repository";
import type { TaskDocument, TaskUnsetKey } from "./task.repository";
import { expandOccurrences } from "./task-recurrence";

/** Occurrence ids are synthetic: nothing is stored in MongoDB for them. */
const OCCURRENCE_ID_PREFIX = "occ";

const PRIORITY_SORT: Task["priority"][] = ["P1", "P2", "P3", "P4"];

type SyncCreateOp = Extract<SyncOperation, { type: "CREATE" }>;
type SyncUpdateOp = Extract<SyncOperation, { type: "UPDATE" }>;
type SyncDeleteOp = Extract<SyncOperation, { type: "DELETE" }>;

function parseInstant(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw AppError.validation("Date invalide", [value]);
  }
  return date;
}

function isStrictlyLater(candidate: Date, reference: Date): boolean {
  return candidate.getTime() > reference.getTime();
}

function toDto(doc: TaskDocument): Task {
  const dto: Task = {
    id: doc._id!.toString(),
    userId: doc.userId,
    title: doc.title,
    priority: doc.priority,
    status: doc.status,
    hasTime: doc.hasTime,
    tags: [...doc.tags],
    subtasks: doc.subtasks.map((s) => ({ id: s.id, title: s.title, isCompleted: s.isCompleted })),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
  if (isSet(doc.description)) dto.description = doc.description;
  if (isSet(doc.dueDate)) dto.dueDate = doc.dueDate.toISOString();
  if (isSet(doc.recurrenceRule)) dto.recurrenceRule = doc.recurrenceRule;
  if (isSet(doc.parentTaskId)) dto.parentTaskId = doc.parentTaskId;
  if (isSet(doc.originalDueDate)) dto.originalDueDate = doc.originalDueDate.toISOString();
  if (isSet(doc.deletedAt)) dto.deletedAt = doc.deletedAt.toISOString();
  return dto;
}

/** The recurring parent itself never appears in calendar views: occurrences do. */
function isRecurringParent(doc: TaskDocument): boolean {
  return isSet(doc.recurrenceRule) && !isSet(doc.parentTaskId);
}

function occurrenceId(parentId: string, instant: Date): string {
  return `${OCCURRENCE_ID_PREFIX}:${parentId}:${instant.toISOString()}`;
}

/** Snapshot of a computed occurrence, same shape as a real task. */
function toOccurrenceDto(parent: TaskDocument, instant: Date): Task {
  const instantIso = instant.toISOString();
  const dto: Task = { ...toDto(parent) };
  dto.id = occurrenceId(parent._id!.toString(), instant);
  dto.status = "TODO";
  dto.dueDate = instantIso;
  dto.recurrenceRule = undefined;
  dto.parentTaskId = parent._id!.toString();
  dto.originalDueDate = instantIso;
  return dto;
}

function sortRangeItems<T extends Task>(items: T[]): T[] {
  return items.sort((a, b) => {
    const byDue = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    if (byDue !== 0) return byDue;
    const byPriority = PRIORITY_SORT.indexOf(a.priority) - PRIORITY_SORT.indexOf(b.priority);
    if (byPriority !== 0) return byPriority;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** UTC day key used by the calendar-like views ("YYYY-MM-DD"). */
function utcDayKey(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/**
 * Group tasks by UTC calendar day, chronologically. Each task lands in the
 * group of its dueDate (all upcoming items are dated); an empty day never
 * yields a group.
 */
function groupByDay(items: UpcomingTask[]): UpcomingResponse["groups"] {
  type Bucket = { date: string; tasks: UpcomingTask[] };
  const groups = new Map<string, Bucket>();
  for (const item of sortRangeItems([...items])) {
    const day = utcDayKey(new Date(item.dueDate!));
    const bucket = groups.get(day);
    if (bucket !== undefined) bucket.tasks.push(item);
    else groups.set(day, { date: day, tasks: [item] as UpcomingTask[] });
  }
  return [...groups.values()];
}

type AppliedList = SyncPushResponse["applied"];
type ConflictList = SyncPushResponse["conflicts"];

export class TaskService {
  private repo: TaskRepository;

  constructor(app: FastifyInstance) {
    this.repo = new TaskRepository(app.db);
  }

  async ensureIndexes(): Promise<void> {
    return this.repo.ensureIndexes();
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateTaskDto): Promise<Task> {
    if (dto.recurrenceRule !== undefined && dto.dueDate === undefined) {
      throw AppError.validation("Une tâche récurrente doit avoir une date d'échéance.");
    }
    const now = new Date();
    const doc = await this.repo.insert({
      userId,
      title: dto.title,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      priority: dto.priority ?? "P3",
      status: "TODO",
      ...(dto.dueDate !== undefined ? { dueDate: parseInstant(dto.dueDate) } : {}),
      hasTime: dto.hasTime ?? false,
      tags: dto.tags ? [...dto.tags] : [],
      subtasks: dto.subtasks ? dto.subtasks.map((s) => ({ ...s })) : [],
      ...(dto.recurrenceRule !== undefined ? { recurrenceRule: dto.recurrenceRule } : {}),
      createdAt: now,
      updatedAt: now,
    });
    return toDto(doc);
  }

  async get(userId: string, id: string): Promise<Task> {
    const doc = await this.repo.findById(id, userId);
    if (!doc || isSet(doc.deletedAt)) throw AppError.notFound("Tâche introuvable.");
    return toDto(doc);
  }

  async list(userId: string, filters: TaskFilters) {
    const { items, total } = await this.repo.findAll(userId, filters);
    return {
      data: items.map((doc) => toDto(doc)),
      meta: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  /**
   * Generic PATCH of a stored task — also serves the backlog ↔ dated
   * conversion (dueDate: null removes it, a value sets it).
   */
  async update(userId: string, id: string, dto: UpdateTaskDto): Promise<Task> {
    const existing = await this.repo.findById(id, userId);
    if (!existing || isSet(existing.deletedAt)) {
      throw AppError.notFound("Tâche introuvable.");
    }

    const isInstance = isSet(existing.parentTaskId);
    if (isInstance && dto.recurrenceRule !== undefined) {
      throw AppError.validation("Une occurrence de tâche ne porte pas sa propre récurrence.");
    }
    const effectiveRule =
      dto.recurrenceRule !== undefined ? dto.recurrenceRule : (existing.recurrenceRule ?? null);
    const effectiveDue = dto.dueDate !== undefined ? dto.dueDate : (existing.dueDate ?? null);
    if (!isInstance && effectiveRule !== null && effectiveDue === null) {
      throw AppError.validation("Une tâche récurrente doit avoir une date d'échéance.");
    }

    const patch: Partial<TaskDocument> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.priority !== undefined) patch.priority = dto.priority;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.hasTime !== undefined) patch.hasTime = dto.hasTime;
    if (dto.tags !== undefined) patch.tags = [...dto.tags];
    if (dto.subtasks !== undefined) patch.subtasks = dto.subtasks.map((s) => ({ ...s }));
    if (dto.description !== null && dto.description !== undefined) {
      patch.description = dto.description;
    }
    if (dto.dueDate !== null && dto.dueDate !== undefined) {
      patch.dueDate = parseInstant(dto.dueDate);
    }
    if (dto.recurrenceRule !== null && dto.recurrenceRule !== undefined) {
      patch.recurrenceRule = dto.recurrenceRule;
    }

    const unsetKeys: TaskUnsetKey[] = [];
    if (dto.description === null) unsetKeys.push("description");
    if (dto.dueDate === null) unsetKeys.push("dueDate");
    if (dto.recurrenceRule === null) unsetKeys.push("recurrenceRule");

    const doc = await this.repo.updateDirect(id, userId, patch, unsetKeys, new Date());
    if (!doc) throw AppError.notFound("Tâche introuvable.");
    return toDto(doc);
  }

  async softDelete(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.setDeleted(id, userId, new Date());
    if (!deleted) throw AppError.notFound("Tâche introuvable.");
  }

  // ── Calendar views ────────────────────────────────────────────────────────

  /** Dated tasks fused with computed occurrences; materialized occurrences excluded. */
  async getRange(userId: string, startIso: string, endIso: string): Promise<Task[]> {
    const start = parseInstant(startIso);
    const end = parseInstant(endIso);

    const [datedDocs, materialized, parents] = await Promise.all([
      this.repo.findDatedRange(userId, start, end),
      this.repo.findInstancesByOriginalDateRange(userId, start, end),
      this.repo.findRecurringParents(userId),
    ]);

    const instanceKey = (parentTaskId: string | undefined | null, instant: Date): string =>
      `${parentTaskId ?? ""}:${instant.getTime()}`;

    const materializedKeys = new Set(
      materialized.map((doc) => instanceKey(doc.parentTaskId, doc.originalDueDate!))
    );

    const occurrences: Task[] = [];
    for (const parent of parents) {
      if (!isSet(parent.dueDate)) continue; // unreachable: a rule implies a due date
      const dates = expandOccurrences(parent.recurrenceRule!, parent.dueDate, { start, end });
      for (const instant of dates) {
        if (materializedKeys.has(instanceKey(parent._id!.toString(), instant))) continue;
        occurrences.push(toOccurrenceDto(parent, instant));
      }
    }

    const dated = datedDocs.filter((doc) => !isRecurringParent(doc)).map((doc) => toDto(doc));

    return sortRangeItems([...dated, ...occurrences]);
  }

  /** Open tasks past their due date + the latest missed occurrence of each parent. */
  async getOverdue(userId: string, nowIso?: string): Promise<Task[]> {
    const now = nowIso ? parseInstant(nowIso) : new Date();

    const [datedDocs, parents] = await Promise.all([
      this.repo.findDatedOverdue(userId, now),
      this.repo.findRecurringParents(userId),
    ]);

    const overdue: Task[] = datedDocs
      .filter((doc) => !isRecurringParent(doc))
      .map((doc) => toDto(doc));

    for (const parent of parents) {
      if (!isSet(parent.dueDate)) continue;
      if (parent.dueDate.getTime() >= now.getTime()) continue;
      const dates = expandOccurrences(parent.recurrenceRule!, parent.dueDate, {
        start: parent.dueDate,
        end: now,
      });
      const latest = dates.at(-1);
      if (!latest) continue;
      const instance = await this.repo.findInstanceByOriginalDate(
        userId,
        parent._id!.toString(),
        latest
      );
      if (instance) continue; // a materialized instance owns that occurrence
      overdue.push(toOccurrenceDto(parent, latest));
    }

    return sortRangeItems(overdue);
  }

  /**
   * "À venir": open dated tasks of [now, now + days) fused with the computed
   * occurrences of active parents falling in the window (materialized
   * occurrences excluded, same rules as getRange), grouped by UTC day and
   * sorted chronologically. Occurrences carry isOccurrence: true.
   */
  async getUpcoming(userId: string, days: number, nowIso?: string): Promise<UpcomingResponse> {
    const now = nowIso !== undefined ? parseInstant(nowIso) : new Date();
    const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const [datedDocs, materialized, parents] = await Promise.all([
      this.repo.findOpenDatedRange(userId, now, end),
      this.repo.findInstancesByOriginalDateRange(userId, now, end),
      this.repo.findRecurringParents(userId),
    ]);

    const instanceKey = (parentTaskId: string | undefined | null, instant: Date): string =>
      `${parentTaskId ?? ""}:${instant.getTime()}`;

    const materializedKeys = new Set(
      materialized.map((doc) => instanceKey(doc.parentTaskId, doc.originalDueDate!))
    );

    const upcoming: UpcomingTask[] = datedDocs
      .filter((doc) => !isRecurringParent(doc))
      .map((doc) => ({ ...toDto(doc), isOccurrence: false }));

    for (const parent of parents) {
      if (!isSet(parent.dueDate)) continue; // unreachable: a rule implies a due date
      const dates = expandOccurrences(parent.recurrenceRule!, parent.dueDate, { start: now, end });
      for (const instant of dates) {
        if (materializedKeys.has(instanceKey(parent._id!.toString(), instant))) continue;
        upcoming.push({ ...toOccurrenceDto(parent, instant), isOccurrence: true });
      }
    }

    return {
      window: { start: now.toISOString(), end: end.toISOString() },
      groups: groupByDay(upcoming),
    };
  }

  /**
   * Mutate one computed occurrence: materialize an instance (or reuse the
   * existing one for that instant) and apply the patch on it. The parent
   * is never modified.
   */
  async patchOccurrence(
    userId: string,
    parentTaskId: string,
    originalDueIso: string,
    dto: OccurrenceUpdateDto
  ): Promise<Task> {
    const parent = await this.repo.findById(parentTaskId, userId);
    if (!parent || isSet(parent.deletedAt)) {
      throw AppError.notFound("Tâche introuvable.");
    }
    if (!isSet(parent.recurrenceRule) || !isSet(parent.dueDate)) {
      throw AppError.validation("Cette tâche n'est pas récurrente.");
    }

    const instant = this.resolveOccurrenceInstant(parent, parseInstant(originalDueIso));

    const existing = await this.repo.findInstanceByOriginalDate(
      userId,
      parent._id!.toString(),
      instant
    );
    const { set, unsetKeys } = this.buildOccurrencePatch(dto);
    if (existing) {
      const doc = await this.repo.updateDirect(
        existing._id!.toString(),
        userId,
        set,
        unsetKeys,
        new Date()
      );
      if (!doc) throw AppError.notFound("Occurrence introuvable.");
      return toDto(doc);
    }

    const now = new Date();
    const instance = await this.repo.insert({
      ...this.instanceFieldsFromParent(parent, instant),
      ...set,
      createdAt: now,
      updatedAt: now,
    });
    return toDto(instance);
  }

  // ── Sync ──────────────────────────────────────────────────────────────────

  async syncPull(userId: string, sinceIso: string): Promise<SyncPullResponse> {
    const since = parseInstant(sinceIso);
    const [changes, deletions] = await Promise.all([
      this.repo.findChangesSince(userId, since),
      this.repo.findDeletionsSince(userId, since),
    ]);
    return {
      changes: changes.map((doc) => toDto(doc)),
      deletions: deletions
        .filter((doc) => isSet(doc.deletedAt))
        .map((doc) => ({ id: doc._id!.toString(), deletedAt: doc.deletedAt!.toISOString() })),
      serverTime: new Date().toISOString(),
    };
  }

  async syncPush(userId: string, payload: SyncPushDto): Promise<SyncPushResponse> {
    const applied: AppliedList = [];
    const conflicts: ConflictList = [];

    for (const operation of payload.operations) {
      if (operation.type === "CREATE") {
        await this.handleSyncCreate(userId, operation, applied, conflicts);
      } else if (operation.type === "UPDATE") {
        await this.handleSyncUpdate(userId, operation, applied, conflicts);
      } else {
        await this.handleSyncDelete(userId, operation, applied, conflicts);
      }
    }

    return { applied, conflicts };
  }

  private async handleSyncCreate(
    userId: string,
    operation: SyncCreateOp,
    applied: AppliedList,
    conflicts: ConflictList
  ): Promise<void> {
    if (operation.doc.parentTaskId !== undefined) {
      // The client materialized an occurrence offline: rebuild it from the parent.
      const task = await this.materializeFromClientSnapshot(userId, operation.doc);
      applied.push({ opId: operation.opId, id: task.id, task });
      return;
    }
    const fields = this.toDocumentFields(userId, operation.doc);
    const { doc, keptExisting } = await this.applyLwwUpsert(userId, operation.doc.id, fields);
    if (keptExisting) {
      conflicts.push({
        opId: operation.opId,
        id: doc.id,
        kept: doc,
        rejectedUpdatedAt: operation.doc.updatedAt,
      });
      return;
    }
    applied.push({ opId: operation.opId, id: doc.id, task: doc });
  }

  private async handleSyncUpdate(
    userId: string,
    operation: SyncUpdateOp,
    applied: AppliedList,
    conflicts: ConflictList
  ): Promise<void> {
    const existing = await this.repo.findById(operation.id, userId);
    if (existing) {
      if (isSet(existing.deletedAt)) {
        conflicts.push(this.conflictEntry(operation.opId, existing, operation.doc.updatedAt));
        return;
      }
      if (!isStrictlyLater(parseInstant(operation.doc.updatedAt), existing.updatedAt)) {
        conflicts.push(this.conflictEntry(operation.opId, existing, operation.doc.updatedAt));
        return;
      }
      const fields = this.toDocumentFields(userId, operation.doc);
      if (isSet(existing.parentTaskId)) {
        // An instance never carries its own rule, whatever the snapshot says.
        delete fields.recurrenceRule;
      }
      await this.repo.applyClientWrite(existing._id!, userId, fields);
      const fresh = await this.repo.findById(existing._id!.toString(), userId);
      applied.push({ opId: operation.opId, id: operation.id, task: toDto(fresh!) });
      return;
    }

    // Unknown id (defensive): upsert so a queued UPDATE never dead-ends.
    const fields = this.toDocumentFields(userId, operation.doc);
    const { doc } = await this.applyLwwUpsert(userId, operation.id, fields);
    applied.push({ opId: operation.opId, id: doc.id, task: doc });
  }

  private async handleSyncDelete(
    userId: string,
    operation: SyncDeleteOp,
    applied: AppliedList,
    conflicts: ConflictList
  ): Promise<void> {
    const existing = await this.repo.findById(operation.id, userId);
    if (!existing) {
      // Unknown id: the client already removed it; acknowledge so it moves on.
      applied.push({ opId: operation.opId, id: operation.id });
      return;
    }
    const deletedAt = parseInstant(operation.deletedAt);
    if (isSet(existing.deletedAt)) {
      applied.push({
        opId: operation.opId,
        id: operation.id,
        task: toDto(existing),
      });
      return;
    }
    if (isStrictlyLater(existing.updatedAt, deletedAt)) {
      conflicts.push(this.conflictEntry(operation.opId, existing, operation.deletedAt));
      return;
    }
    const doc = await this.repo.setDeleted(operation.id, userId, deletedAt);
    applied.push({ opId: operation.opId, id: operation.id, task: toDto(doc!) });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private conflictEntry(
    opId: string,
    existing: TaskDocument,
    incomingUpdatedAt: string
  ): SyncPushResponse["conflicts"][number] {
    return {
      opId,
      id: existing._id!.toString(),
      kept: toDto(existing),
      rejectedUpdatedAt: incomingUpdatedAt,
    };
  }

  /**
   * applyClientWrite guarded against a foreign-owned id: the replaceOne
   * upsert would try to duplicate an _id that belongs to another user.
   */
  private async writeClientDoc(
    id: ObjectId,
    userId: string,
    fields: Omit<TaskDocument, "_id">
  ): Promise<void> {
    try {
      await this.repo.applyClientWrite(id, userId, fields);
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw AppError.conflict("Cette tâche appartient à un autre compte.");
      }
      throw error;
    }
  }

  /**
   * Insert, or LWW-merge when the id already exists server-side:
   * the newest updatedAt wins; when the server copy wins the op is a conflict.
   */
  private async applyLwwUpsert(
    userId: string,
    id: string | undefined,
    fields: Omit<TaskDocument, "_id">
  ): Promise<{ doc: Task; keptExisting: boolean }> {
    if (id !== undefined && ObjectId.isValid(id)) {
      const existing = await this.repo.findById(id, userId);
      if (existing) {
        if (isStrictlyLater(fields.updatedAt, existing.updatedAt)) {
          await this.writeClientDoc(existing._id!, userId, fields);
          return { doc: toDto({ ...fields, _id: existing._id }), keptExisting: false };
        }
        return { doc: toDto(existing), keptExisting: true };
      }
      const _id = new ObjectId(id);
      await this.writeClientDoc(_id, userId, fields);
      return { doc: toDto({ ...fields, _id }), keptExisting: false };
    }
    const doc = await this.repo.insert(fields);
    return { doc: toDto(doc), keptExisting: false };
  }

  /** Materialization received as a CREATE snapshot whose parentTaskId is set. */
  private async materializeFromClientSnapshot(userId: string, doc: SyncDoc): Promise<Task> {
    if (ObjectId.isValid(doc.parentTaskId ?? "") === false) {
      throw AppError.validation(
        "Impossible de matérialiser l'occurrence : tâche parente introuvable."
      );
    }
    const parent = await this.repo.findById(doc.parentTaskId!, userId);
    if (!parent || isSet(parent.deletedAt)) {
      throw AppError.validation(
        "Impossible de matérialiser l'occurrence : tâche parente introuvable."
      );
    }
    const rawInstant = doc.originalDueDate ?? doc.dueDate;
    if (rawInstant === undefined) {
      throw AppError.validation("La matérialisation d'occurrence exige une date d'occurrence.");
    }
    const instant =
      this.snapToOccurrence(parent, parseInstant(rawInstant)) ?? parseInstant(rawInstant);

    const existing = await this.repo.findInstanceByOriginalDate(
      userId,
      parent._id!.toString(),
      instant
    );
    if (existing) {
      if (isStrictlyLater(parseInstant(doc.updatedAt), existing.updatedAt)) {
        await this.repo.applyClientWrite(
          existing._id!,
          userId,
          this.instanceFieldsFromSnapshot(parent, instant, doc)
        );
      }
      const fresh = await this.repo.findById(existing._id!.toString(), userId);
      return toDto(fresh!);
    }

    const fields = this.instanceFieldsFromSnapshot(parent, instant, doc);
    if (doc.id !== undefined && ObjectId.isValid(doc.id)) {
      const _id = new ObjectId(doc.id);
      await this.writeClientDoc(_id, userId, fields);
      return toDto({ ...fields, _id });
    }
    const inserted = await this.repo.insert(fields);
    return toDto(inserted);
  }

  private instanceFieldsFromSnapshot(
    parent: TaskDocument,
    instant: Date,
    doc: SyncDoc
  ): Omit<TaskDocument, "_id"> {
    return {
      ...this.instanceFieldsFromParent(parent, instant),
      title: doc.title,
      ...(doc.description !== undefined ? { description: doc.description } : {}),
      priority: doc.priority,
      status: doc.status,
      ...(doc.dueDate !== undefined ? { dueDate: parseInstant(doc.dueDate) } : {}),
      hasTime: doc.hasTime,
      tags: [...doc.tags],
      subtasks: doc.subtasks.map((s) => ({ ...s })),
      createdAt: parseInstant(doc.createdAt),
      updatedAt: parseInstant(doc.updatedAt),
    };
  }

  /** LWW snapshot → document fields (userId and server identity are not trusted). */
  private toDocumentFields(userId: string, doc: SyncDoc): Omit<TaskDocument, "_id"> {
    return {
      userId,
      title: doc.title,
      ...(doc.description !== undefined ? { description: doc.description } : {}),
      priority: doc.priority,
      status: doc.status,
      ...(doc.dueDate !== undefined ? { dueDate: parseInstant(doc.dueDate) } : {}),
      hasTime: doc.hasTime,
      tags: [...doc.tags],
      subtasks: doc.subtasks.map((s) => ({ ...s })),
      ...(doc.recurrenceRule !== undefined ? { recurrenceRule: doc.recurrenceRule } : {}),
      createdAt: parseInstant(doc.createdAt),
      updatedAt: parseInstant(doc.updatedAt),
    };
  }

  private buildOccurrencePatch(dto: OccurrenceUpdateDto): {
    set: Partial<TaskDocument>;
    unsetKeys: TaskUnsetKey[];
  } {
    const set: Partial<TaskDocument> = {};
    const unsetKeys: TaskUnsetKey[] = [];
    if (dto.title !== undefined) set.title = dto.title;
    if (dto.priority !== undefined) set.priority = dto.priority;
    if (dto.status !== undefined) set.status = dto.status;
    if (dto.hasTime !== undefined) set.hasTime = dto.hasTime;
    if (dto.tags !== undefined) set.tags = [...dto.tags];
    if (dto.subtasks !== undefined) set.subtasks = dto.subtasks.map((s) => ({ ...s }));
    if (dto.description !== undefined && dto.description !== null) {
      set.description = dto.description;
    }
    if (dto.description === null) unsetKeys.push("description");
    if (dto.dueDate !== undefined && dto.dueDate !== null) set.dueDate = parseInstant(dto.dueDate);
    if (dto.dueDate === null) unsetKeys.push("dueDate");
    return { set, unsetKeys };
  }

  private instanceFieldsFromParent(
    parent: TaskDocument,
    instant: Date
  ): Omit<TaskDocument, "_id" | "createdAt" | "updatedAt"> {
    return {
      userId: parent.userId,
      title: parent.title,
      ...(parent.description !== undefined ? { description: parent.description } : {}),
      priority: parent.priority,
      status: "TODO",
      dueDate: instant,
      hasTime: parent.hasTime,
      tags: [...parent.tags],
      subtasks: parent.subtasks.map((s) => ({ ...s })),
      parentTaskId: parent._id!.toString(),
      originalDueDate: instant,
    };
  }

  /**
   * Snap the requested instant onto the exact instant computed by rrule, so
   * range fusion (exclusion of materialized occurrences) matches exactly.
   * Falls back to the requested instant when it matches no occurrence.
   */
  private snapToOccurrence(parent: TaskDocument, requested: Date): Date | null {
    const windowMs = 36 * 60 * 60 * 1000;
    const candidates = expandOccurrences(parent.recurrenceRule!, parent.dueDate!, {
      start: new Date(requested.getTime() - windowMs),
      end: new Date(requested.getTime() + windowMs),
    });
    const exact = candidates.find((date) => date.getTime() === requested.getTime());
    if (exact) return exact;
    // Tolerate small drifts between clients.
    const toleranceMs = 60 * 1000;
    return (
      candidates.find((date) => Math.abs(date.getTime() - requested.getTime()) <= toleranceMs) ??
      null
    );
  }

  private resolveOccurrenceInstant(parent: TaskDocument, requested: Date): Date {
    const snapped = this.snapToOccurrence(parent, requested);
    if (snapped === null) {
      throw AppError.validation("Cette date ne correspond à aucune occurrence de la tâche.");
    }
    return snapped;
  }
}
