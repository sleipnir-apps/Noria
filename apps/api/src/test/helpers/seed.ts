import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import type { RecurrenceRule, TaskPriority, TaskStatus, TaskSubtask } from "@template/contracts";

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

/**
 * Insert a raw task document matching the repository's TaskDocument shape
 * (userId as string, Date fields as Date). Optional fields stay absent unless
 * explicitly provided — passing `null` also leaves the field absent, so tests
 * can express "backlog task" as dueDate: null.
 */
export async function seedTask(
  app: FastifyInstance,
  userId: string,
  overrides: {
    title?: string;
    description?: string;
    priority?: TaskPriority;
    status?: TaskStatus;
    dueDate?: Date | null;
    hasTime?: boolean;
    tags?: string[];
    subtasks?: TaskSubtask[];
    recurrenceRule?: RecurrenceRule | null;
    parentTaskId?: string;
    originalDueDate?: Date;
    deletedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
  } = {}
) {
  const now = new Date();
  const doc: Record<string, unknown> = {
    userId,
    title: overrides.title ?? "Tâche de test",
    priority: overrides.priority ?? "P3",
    status: overrides.status ?? "TODO",
    hasTime: overrides.hasTime ?? false,
    tags: overrides.tags ?? [],
    subtasks: overrides.subtasks ?? [],
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
  const optional: Array<[string, unknown]> = [
    ["description", overrides.description],
    ["dueDate", overrides.dueDate],
    ["recurrenceRule", overrides.recurrenceRule],
    ["parentTaskId", overrides.parentTaskId],
    ["originalDueDate", overrides.originalDueDate],
    ["deletedAt", overrides.deletedAt],
  ];
  for (const [key, value] of optional) {
    // Skip null as well as undefined: a BSON null would break `field === undefined` checks.
    if (value !== undefined && value !== null) doc[key] = value;
  }

  const result = await app.db.collection("tasks").insertOne(doc);
  return { id: result.insertedId.toString() };
}
