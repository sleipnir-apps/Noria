import type { Collection, Db, Filter, ObjectId } from "mongodb";
import type {
  RecurrenceRule,
  TaskFilters,
  TaskPriority,
  TaskStatus,
  TaskSubtask,
} from "@template/contracts";

export interface TaskDocument {
  _id?: ObjectId;
  userId: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  // Nullable on purpose: Mongo queries (and defensive seeds) may store BSON
  // null for these keys, and "absent or null" must always mean "not set".
  dueDate?: Date | null;
  hasTime: boolean;
  tags: string[];
  subtasks: TaskSubtask[];
  recurrenceRule?: RecurrenceRule | null;
  /** Set on instances of a recurring parent task. */
  parentTaskId?: string | null;
  /** The instant of the recurrence occurrence this instance materialized. */
  originalDueDate?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Narrow "absent or null" to "present" for optional document fields. */
export function isSet<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

export const TASK_OPEN_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS"];

export type TaskUnsetKey = "dueDate" | "recurrenceRule" | "description";

export class TaskRepository {
  private col: Collection<TaskDocument>;

  constructor(db: Db) {
    this.col = db.collection<TaskDocument>("tasks");
  }

  async ensureIndexes(): Promise<void> {
    await this.col.createIndex({ userId: 1, dueDate: 1 });
    await this.col.createIndex({ userId: 1, status: 1 });
    await this.col.createIndex({ parentTaskId: 1, userId: 1, originalDueDate: 1 });
    await this.col.createIndex({ userId: 1, updatedAt: 1 });
  }

  async insert(doc: TaskDocument): Promise<TaskDocument> {
    const result = await this.col.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }

  /** Sync push: the client snapshot replaces the whole document (LWW already decided). */
  async applyClientWrite(
    id: ObjectId,
    userId: string,
    fields: Omit<TaskDocument, "_id">
  ): Promise<void> {
    // Upsert: on insert, the server merges the filter's equality conditions
    // (here _id and userId) into the replacement document.
    await this.col.replaceOne({ _id: id, userId }, fields, { upsert: true });
  }

  async findById(id: string, userId: string): Promise<TaskDocument | null> {
    const { ObjectId } = await import("mongodb");
    if (!ObjectId.isValid(id)) return null;
    return this.col.findOne({ _id: new ObjectId(id), userId });
  }

  /**
   * Direct write (regular PATCH): $set / $unset built from the DTO by the
   * service; updatedAt is stamped by the caller.
   */
  async updateDirect(
    id: string,
    userId: string,
    patch: Partial<TaskDocument>,
    unsetKeys: TaskUnsetKey[],
    appliedAt: Date
  ): Promise<TaskDocument | null> {
    const { ObjectId } = await import("mongodb");
    if (!ObjectId.isValid(id)) return null;
    const update: Record<string, unknown> = { $set: { ...patch, updatedAt: appliedAt } };
    if (unsetKeys.length > 0) {
      update["$unset"] = Object.fromEntries(unsetKeys.map((key) => [key, ""]));
    }
    const result = await this.col.findOneAndUpdate({ _id: new ObjectId(id), userId }, update, {
      returnDocument: "after",
    });
    return result ?? null;
  }

  async setDeleted(id: string, userId: string, deletedAt: Date): Promise<TaskDocument | null> {
    const { ObjectId } = await import("mongodb");
    if (!ObjectId.isValid(id)) return null;
    const result = await this.col.findOneAndUpdate(
      { _id: new ObjectId(id), userId },
      { $set: { deletedAt, updatedAt: deletedAt } },
      { returnDocument: "after" }
    );
    return result ?? null;
  }

  /** All tasks with a due date in [start, end), including materialized instances. */
  async findDatedRange(userId: string, start: Date, end: Date): Promise<TaskDocument[]> {
    return this.col
      .find({
        userId,
        deletedAt: { $eq: null },
        dueDate: { $gte: start, $lt: end },
      })
      .sort({ dueDate: 1 })
      .toArray();
  }

  /** Dated tasks still open past their due date (instances included). */
  async findDatedOverdue(userId: string, now: Date): Promise<TaskDocument[]> {
    return this.col
      .find({
        userId,
        deletedAt: { $eq: null },
        dueDate: { $lt: now },
        status: { $in: TASK_OPEN_STATUSES },
      })
      .sort({ dueDate: 1 })
      .toArray();
  }

  /**
   * Upcoming view: dated open tasks of [start, end) whose due date is not
   * before the window start — DONE / ARCHIVED / soft-deleted excluded,
   * instances included (the recurring parent itself never matches: a rule
   * implies a due date, but instances carry parentTaskId ≠ null).
   */
  async findDatedUpcoming(userId: string, start: Date, end: Date): Promise<TaskDocument[]> {
    return this.col
      .find({
        userId,
        deletedAt: { $eq: null },
        dueDate: { $gte: start, $lt: end },
        status: { $in: TASK_OPEN_STATUSES },
      })
      .sort({ dueDate: 1 })
      .toArray();
  }

  /** Parents that expand into occurrences (own rule, never instances'). */
  async findRecurringParents(userId: string): Promise<TaskDocument[]> {
    return this.col
      .find({
        userId,
        deletedAt: { $eq: null },
        recurrenceRule: { $ne: null },
        status: { $ne: "ARCHIVED" },
      })
      .toArray();
  }

  /** Materialized instances whose source occurrence instant falls in [start, end). */
  async findInstancesByOriginalDateRange(
    userId: string,
    start: Date,
    end: Date
  ): Promise<TaskDocument[]> {
    return this.col
      .find({
        userId,
        deletedAt: { $eq: null },
        parentTaskId: { $ne: null },
        originalDueDate: { $gte: start, $lt: end },
      })
      .toArray();
  }

  async findInstanceByOriginalDate(
    userId: string,
    parentTaskId: string,
    originalDueDate: Date
  ): Promise<TaskDocument | null> {
    return this.col.findOne({
      userId,
      deletedAt: { $eq: null },
      parentTaskId,
      originalDueDate,
    });
  }

  async findAll(userId: string, filters: TaskFilters) {
    const query: Filter<TaskDocument> = { userId, deletedAt: { $eq: null } };
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    if (filters.dated === "dated") query.dueDate = { $ne: null };
    if (filters.dated === "dateless") query.dueDate = { $eq: null };

    const skip = (filters.page - 1) * filters.limit;
    const [items, total] = await Promise.all([
      this.col.find(query).sort({ createdAt: -1 }).skip(skip).limit(filters.limit).toArray(),
      this.col.countDocuments(query),
    ]);
    return { items, total };
  }

  // ── Sync pull ─────────────────────────────────────────────────────────────

  async findChangesSince(userId: string, since: Date): Promise<TaskDocument[]> {
    return this.col
      .find({ userId, deletedAt: { $eq: null }, updatedAt: { $gt: since } })
      .sort({ updatedAt: 1 })
      .toArray();
  }

  async findDeletionsSince(userId: string, since: Date): Promise<TaskDocument[]> {
    return this.col
      .find({ userId, deletedAt: { $ne: null }, updatedAt: { $gt: since } })
      .sort({ updatedAt: 1 })
      .toArray();
  }
}
