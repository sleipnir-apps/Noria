import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

export async function seedUser(
  app: FastifyInstance,
  overrides: { email?: string; role?: "user" | "admin" } = {}
) {
  const email = overrides.email ?? "test@example.com";
  const passwordHash = await bcrypt.hash("password123", 10);

  const result = await app.db.collection("users").insertOne({
    email,
    displayName: "Test User",
    passwordHash,
    role: overrides.role ?? "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    id: result.insertedId.toString(),
    email,
    password: "password123",
    role: overrides.role ?? "user",
  };
}

export async function seedItem(
  app: FastifyInstance,
  userId: string,
  overrides: { title?: string; status?: "active" | "archived" } = {}
) {
  const result = await app.db.collection("items").insertOne({
    title: overrides.title ?? "Test Item",
    description: "A test item",
    status: overrides.status ?? "active",
    ownerId: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { id: result.insertedId.toString() };
}

export interface SeedTaskOverrides {
  title?: string;
  description?: string;
  priority?: "P1" | "P2" | "P3" | "P4";
  status?: "TODO" | "IN_PROGRESS" | "DONE" | "ARCHIVED";
  due_date?: string | null;
  has_time?: boolean;
  tags?: string[];
  subtasks?: Array<{ id: string; title: string; is_completed: boolean }>;
  recurrence_rule?: {
    frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    interval: number;
    by_weekday?: number[];
    by_month_day?: number;
    end_date?: string;
  };
  parent_task_id?: string;
  original_due_date?: string;
  deleted_at?: string;
  updated_at?: string;
}

export async function seedTask(
  app: FastifyInstance,
  userId: string,
  overrides: SeedTaskOverrides = {}
) {
  const now = new Date();
  const updatedAt = overrides.updated_at ? new Date(overrides.updated_at) : now;
  const createdAt = new Date(updatedAt.getTime() - 1);

  const doc: Record<string, unknown> = {
    title: overrides.title ?? "Test Task",
    priority: overrides.priority ?? "P3",
    status: overrides.status ?? "TODO",
    has_time: overrides.has_time ?? false,
    tags: overrides.tags ?? [],
    subtasks: overrides.subtasks ?? [],
    userId,
    createdAt,
    updatedAt,
  };
  if (overrides.description !== undefined) doc.description = overrides.description;
  if (overrides.due_date !== undefined)
    doc.dueDate = overrides.due_date ? new Date(overrides.due_date) : null;
  if (overrides.recurrence_rule) {
    doc.recurrence = {
      frequency: overrides.recurrence_rule.frequency,
      interval: overrides.recurrence_rule.interval,
      byWeekday: overrides.recurrence_rule.by_weekday,
      byMonthDay: overrides.recurrence_rule.by_month_day,
      endDate: overrides.recurrence_rule.end_date
        ? new Date(overrides.recurrence_rule.end_date)
        : null,
    };
  }
  if (overrides.parent_task_id) doc.parentId = new ObjectId(overrides.parent_task_id);
  if (overrides.original_due_date) doc.originalDueDate = new Date(overrides.original_due_date);
  if (overrides.deleted_at) doc.deletedAt = new Date(overrides.deleted_at);

  const result = await app.db.collection("tasks").insertOne(doc);
  const inserted = await app.db.collection("tasks").findOne({ _id: result.insertedId });

  return {
    id: result.insertedId.toString(),
    created_at: (inserted?.createdAt as Date).toISOString(),
    updated_at: (inserted?.updatedAt as Date).toISOString(),
  };
}
