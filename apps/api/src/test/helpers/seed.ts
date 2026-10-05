import type { FastifyInstance } from "fastify";
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
