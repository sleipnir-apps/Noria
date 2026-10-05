import type { Collection, Db, ObjectId as ObjectIdType } from "mongodb";
import { ObjectId } from "mongodb";
import type { RecurrenceRule, TaskPriority, TaskStatus } from "@template/contracts";

export interface TaskSubtaskDocument {
  id: string;
  title: string;
  is_completed: boolean;
}

export interface RecurrenceRuleDocument {
  frequency: RecurrenceRule["frequency"];
  interval: number;
  by_weekday?: string[];
  by_month_day?: number;
  end_date?: Date | null;
}

export interface TaskDocument {
  _id?: ObjectIdType;
  /** Client-generated uuid (offline-first) or server uuid. Immutable. */
  id: string;
  /** Authenticated owner, scoping every query. */
  userId: string;
  /** Set on materialized instances of a recurring parent. */
  parent_task_id?: string;
  /** Set on instances: the occurrence instant it materialized from. */
  original_due_date?: Date;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date?: Date | null;
  has_time: boolean;
  tags: string[];
  subtasks: TaskSubtaskDocument[];
  /** Only on recurring parents (the series anchor). */
  recurrence_rule?: RecurrenceRuleDocument | null;
  deleted_at?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TaskRepository {
  private col: Collection<TaskDocument>;

  constructor(db: Db) {
    this.col = db.collection<TaskDocument>("tasks");
  }

  async ensureIndexes(): Promise<void> {
    await this.col.createIndex({ userId: 1, due_date: 1 });
    await this.col.createIndex({ userId: 1, status: 1 });
    await this.col.createIndex({ parent_task_id: 1 });
    await this.col.createIndex({ userId: 1, updatedAt: -1 });
  }

  async insert(doc: TaskDocument): Promise<TaskDocument> {
    const result = await this.col.insertOne({ ...doc, _id: new ObjectId() });
    return { ...doc, _id: result.insertedId };
  }

  async findByPublicId(id: string, userId: string): Promise<TaskDocument | null> {
    return this.col.findOne({ id, userId, deleted_at: null });
  }

  /**
   * Find a materialized instance by its (parent, occurrence instant) key —
   * used to check whether an occurrence already exists before creating one.
   */
  async findInstanceByOccurrence(
    parentId: string,
    userId: string,
    originalDueDate: Date
  ): Promise<TaskDocument | null> {
    return this.col.findOne({
      parent_task_id: parentId,
      userId,
      original_due_date: originalDueDate,
      deleted_at: null,
    });
  }

  async findInstancesOfParents(
    userId: string,
    parentIds: string[],
    start: Date,
    end: Date
  ): Promise<TaskDocument[]> {
    if (parentIds.length === 0) return [];
    return this.col
      .find({
        userId,
        deleted_at: null,
        parent_task_id: { $in: parentIds },
        original_due_date: { $gte: start, $lte: end },
      })
      .sort({ original_due_date: 1 })
      .toArray();
  }

  async updateByPublicId(
    id: string,
    userId: string,
    set: Partial<TaskDocument>
  ): Promise<TaskDocument | null> {
    return this.col.findOneAndUpdate(
      { id, userId, deleted_at: null },
      { $set: set },
      { returnDocument: "after" }
    );
  }

  /**
   * Non-recurring, non-archived tasks (parents and standalone instances of
   * earlier queries come through other methods). Kept simple: user datasets
   * are small, the service narrows/filters in memory.
   */
  async findActiveByUser(userId: string): Promise<TaskDocument[]> {
    return this.col.find({ userId, deleted_at: null }).sort({ createdAt: -1 }).toArray();
  }

  /** Every document of the user, including soft-deleted (sync pull). */
  async findAllRaw(userId: string, since?: Date): Promise<TaskDocument[]> {
    const query: Record<string, unknown> = { userId };
    if (since) query.updatedAt = { $gt: since };
    return this.col.find(query).sort({ updatedAt: 1 }).toArray();
  }

  /** Find by public id WITHOUT the deleted_at filter (sync LWW). */
  async findByIdAny(id: string, userId: string): Promise<TaskDocument | null> {
    return this.col.findOne({ id, userId });
  }

  /** Soft delete (V1) — keeps the document for sync `deletions`. */
  async softDelete(id: string, userId: string, deletedAt: Date): Promise<boolean> {
    const result = await this.col.updateOne(
      { id, userId, deleted_at: null },
      { $set: { deleted_at: deletedAt, updatedAt: deletedAt } }
    );
    return result.modifiedCount === 1;
  }
}
