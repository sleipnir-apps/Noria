import type { Collection, Db, Filter } from "mongodb";
import { ObjectId } from "mongodb";

export type TaskPriorityValue = "P1" | "P2" | "P3" | "P4";
export type TaskStatusValue = "TODO" | "IN_PROGRESS" | "DONE" | "ARCHIVED";
export type TaskRecurrence = {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  byWeekday?: number[];
  byMonthDay?: number;
  endDate?: Date | null;
};

/** Mongo document shape for tasks (snake_case payload fields, camelCase storage columns). */
export interface TaskDocument {
  _id?: ObjectId;
  title: string;
  description?: string | null;
  priority: TaskPriorityValue;
  status: TaskStatusValue;
  /** Present (possibly null) only for dated tasks; absent key = backlog task. */
  dueDate?: Date | null;
  hasTime: boolean;
  tags: string[];
  subtasks: Array<{ id: string; title: string; isCompleted: boolean }>;
  /** Instances only: id of the recurring parent task. */
  parentId?: ObjectId;
  /** Instances only: due date of the occurrence that got materialized. */
  originalDueDate?: Date;
  /** Parents only: null when absent. */
  recurrence?: TaskRecurrence | null;
  /** Soft delete timestamp; null/absent = alive. */
  deletedAt?: Date | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskInsert {
  title: string;
  description?: string | null;
  priority: TaskPriorityValue;
  status: TaskStatusValue;
  dueDate?: Date | null;
  hasTime: boolean;
  tags: string[];
  subtasks: TaskDocument["subtasks"];
  parentId?: ObjectId;
  originalDueDate?: Date;
  recurrence?: TaskRecurrence | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Field-level update payload ($set), pre-validated by the service layer. */
export type TaskUpdateSet = Partial<Omit<TaskInsert, "userId" | "createdAt" | "updatedAt">> & {
  unsetDueDate?: boolean;
};

export class TaskRepository {
  private col: Collection<TaskDocument>;

  constructor(db: Db) {
    this.col = db.collection<TaskDocument>("tasks");
  }

  async ensureIndexes(): Promise<void> {
    await this.col.createIndex({ userId: 1, dueDate: 1 });
    await this.col.createIndex({ userId: 1, status: 1 });
    await this.col.createIndex({ parentId: 1 });
    // LWW conflict detection reads updatedAt per user's tasks.
    await this.col.createIndex({ userId: 1, updatedAt: 1 });
  }

  async insert(doc: TaskInsert): Promise<TaskDocument> {
    const result = await this.col.insertOne({ ...doc });
    return { ...doc, _id: result.insertedId };
  }

  async insertWithId(doc: TaskInsert & { id: string }): Promise<TaskDocument> {
    const { id, ...rest } = doc;
    const toInsert = { ...rest, _id: new ObjectId(id) } as TaskDocument;
    await this.col.insertOne(toInsert);
    return toInsert;
  }

  async findById(id: string, userId: string): Promise<TaskDocument | null> {
    if (!ObjectId.isValid(id)) return null;
    return this.col.findOne({
      _id: new ObjectId(id),
      userId,
      deletedAt: { $in: [null, undefined] },
    });
  }

  /** findById without the soft-delete filter (needed to check deletion state). */
  async findByIdIncludingDeleted(id: string, userId: string): Promise<TaskDocument | null> {
    if (!ObjectId.isValid(id)) return null;
    return this.col.findOne({ _id: new ObjectId(id), userId });
  }

  async findAll(
    userId: string,
    options: {
      status?: TaskStatusValue;
      priority?: TaskPriorityValue;
      tag?: string;
      backlogOnly?: boolean;
      limit?: number;
    } = {}
  ): Promise<TaskDocument[]> {
    const query: Filter<TaskDocument> = {
      userId,
      deletedAt: { $in: [null, undefined] },
    };
    if (options.status) query.status = options.status;
    if (options.priority) query.priority = options.priority;
    if (options.tag) query.tags = options.tag;
    if (options.backlogOnly) query.dueDate = null;

    const cursor = this.col.find(query).sort({ createdAt: -1 });
    if (options.limit) cursor.limit(options.limit);
    return cursor.toArray();
  }

  /**
   * Dated tasks (dueDate != null) whose due date falls inside [start, end].
   * Instances carry their own dates, parents the first occurrence's date.
   */
  async findDatedBetween(userId: string, start: Date, end: Date): Promise<TaskDocument[]> {
    return this.col
      .find({
        userId,
        deletedAt: { $in: [null, undefined] },
        dueDate: { $ne: null, $gte: start, $lte: end },
      })
      .sort({ dueDate: 1, createdAt: -1 })
      .toArray();
  }

  /** Alive instances materialized from occurrences of the given parents (any date). */
  async findInstancesOf(userId: string, parentIds: ObjectId[]): Promise<TaskDocument[]> {
    if (parentIds.length === 0) return [];
    return this.col
      .find({
        userId,
        deletedAt: { $in: [null, undefined] },
        parentId: { $in: parentIds },
      })
      .toArray();
  }

  /** Alive recurring parents (their own dueDate can predate the queried window). */
  async findRecurringParents(userId: string): Promise<TaskDocument[]> {
    return this.col
      .find({
        userId,
        deletedAt: { $in: [null, undefined] },
        recurrence: { $ne: null },
      })
      .toArray();
  }

  /** Tombstone ids for the sync pull (deleted after `since`). */
  async findDeletedSince(userId: string, since: Date): Promise<string[]> {
    const docs = await this.col
      .find({
        userId,
        deletedAt: { $ne: null, $gt: since },
      })
      .toArray();
    return docs.map((d) => d._id!.toString());
  }

  async updateSet(id: string, userId: string, set: TaskUpdateSet): Promise<TaskDocument | null> {
    const { unsetDueDate, ...fields } = set;
    const $set: Record<string, unknown> = { ...fields, updatedAt: new Date() };
    if (unsetDueDate) {
      // Keep the key present with null (backlog marker) so range queries
      // ($ne null) and the backlog filter stay consistent.
      $set.dueDate = null;
    }
    const result = await this.col.findOneAndUpdate(
      { _id: new ObjectId(id), userId, deletedAt: { $in: [null, undefined] } },
      { $set },
      { returnDocument: "after" }
    );
    return result ?? null;
  }

  /**
   * LWW upsert: applies only when the incoming op is not older than the stored
   * document, or on creation (id not taken). Returns "conflict" otherwise.
   */
  /**
   * LWW upsert. "conflict" = an own newer doc won; "ignored" = the id belongs
   * to another user (or vanished): the op does not apply and is not a conflict.
   */
  async upsertLww(
    userId: string,
    task: {
      id: string;
      title: string;
      description?: string | null;
      priority: TaskPriorityValue;
      status: TaskStatusValue;
      dueDate?: Date | null;
      hasTime: boolean;
      tags: string[];
      subtasks: TaskDocument["subtasks"];
      recurrence?: TaskRecurrence | null;
      parentId?: ObjectId;
      originalDueDate?: Date;
      deletedAt?: Date | null;
      updatedAt: Date;
      createdAt?: Date;
    }
  ): Promise<"applied" | "conflict" | "ignored"> {
    const _id = new ObjectId(task.id);
    const incoming = new Date(task.updatedAt);

    const updateResult = await this.col.updateOne(
      { _id, userId, updatedAt: { $lte: incoming } },
      {
        $set: {
          title: task.title,
          description: task.description ?? null,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate ?? null,
          hasTime: task.hasTime,
          tags: task.tags ?? [],
          subtasks: task.subtasks ?? [],
          recurrence: task.recurrence ?? null,
          parentId: task.parentId,
          originalDueDate: task.originalDueDate,
          deletedAt: task.deletedAt ?? null,
          updatedAt: incoming,
        },
      }
    );

    if (updateResult.matchedCount > 0) return "applied";

    // Creation: insert with the client-provided id (fails if the id is taken
    // by a newer doc → conflict). Full field defaults are supplied by callers.
    try {
      await this.col.insertOne({
        _id,
        title: task.title,
        description: task.description ?? null,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate ?? null,
        hasTime: task.hasTime,
        tags: task.tags ?? [],
        subtasks: task.subtasks ?? [],
        recurrence: task.recurrence ?? null,
        parentId: task.parentId,
        originalDueDate: task.originalDueDate,
        deletedAt: task.deletedAt ?? null,
        userId,
        createdAt: task.createdAt ?? incoming,
        updatedAt: incoming,
      });
      return "applied";
    } catch {
      // Duplicate key: either an own newer doc (LWW conflict) or a foreign id
      // (belongs to another user) — distinguish so the caller reports properly.
      const existing = await this.col.findOne({ _id }, { projection: { userId: 1 } });
      return existing?.userId === userId ? "conflict" : "ignored";
    }
  }

  async softDelete(id: string, userId: string, at: Date): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const result = await this.col.updateOne(
      { _id: new ObjectId(id), userId, deletedAt: { $in: [null, undefined] } },
      { $set: { deletedAt: at, updatedAt: at } }
    );
    return result.matchedCount === 1;
  }

  /** LWW soft delete: deletes only if the incoming op is not older. */
  async softDeleteLww(
    userId: string,
    id: string,
    at: Date
  ): Promise<"applied" | "conflict" | "not_found"> {
    if (!ObjectId.isValid(id)) return "not_found";
    const result = await this.col.updateOne(
      { _id: new ObjectId(id), userId, updatedAt: { $lte: at }, deletedAt: null },
      { $set: { deletedAt: at, updatedAt: at } }
    );
    if (result.matchedCount > 0) return "applied";

    // Already deleted? Applied no-op if the stored delete is at least as new.
    const doc = await this.col.findOne({ _id: new ObjectId(id), userId });
    if (!doc) return "not_found";
    if (doc.deletedAt && doc.updatedAt <= at) return "applied";
    return "conflict";
  }
}
