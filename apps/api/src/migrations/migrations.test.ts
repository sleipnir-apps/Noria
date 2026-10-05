import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { migrations } from "./index";

describe("Migrations", () => {
  let client: MongoClient;
  let db: Db;

  beforeEach(async () => {
    client = new MongoClient(process.env["MONGO_URL"]!);
    await client.connect();
    db = client.db(`test_migrations_${Date.now()}`);
  });

  afterEach(async () => {
    await db.dropDatabase();
    await client.close();
  });

  it("toutes les migrations ont un id unique", () => {
    const ids = migrations.map((m) => m.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("les ids sont en ordre croissant", () => {
    const ids = migrations.map((m) => m.id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  it("001 — crée la collection users", async () => {
    await migrations[0]!.up(db);
    const collections = await db.listCollections({ name: "users" }).toArray();
    expect(collections).toHaveLength(1);
  });

  it("001 — est idempotente (double exécution sans erreur)", async () => {
    await migrations[0]!.up(db);
    await migrations[0]!.up(db);
    const collections = await db.listCollections({ name: "users" }).toArray();
    expect(collections).toHaveLength(1);
  });

  it("002 — crée l'index unique sur email", async () => {
    await migrations[0]!.up(db);
    await migrations[1]!.up(db);
    const indexes = await db.collection("users").indexes();
    const emailIndex = indexes.find((i) => i.name === "users_email_unique");
    expect(emailIndex).toBeDefined();
    expect(emailIndex?.unique).toBe(true);
  });

  it("003 — crée la collection revoked_tokens avec les index TTL", async () => {
    await migrations[2]!.up(db);
    const collections = await db.listCollections({ name: "revoked_tokens" }).toArray();
    expect(collections).toHaveLength(1);

    const indexes = await db.collection("revoked_tokens").indexes();
    expect(indexes.find((i) => i.name === "revoked_tokens_jti_unique")).toBeDefined();
    expect(indexes.find((i) => i.name === "revoked_tokens_ttl")).toBeDefined();
  });

  it("003 — est idempotente", async () => {
    await migrations[2]!.up(db);
    await migrations[2]!.up(db);
    const collections = await db.listCollections({ name: "revoked_tokens" }).toArray();
    expect(collections).toHaveLength(1);
  });

  it("down 001 — supprime la collection users", async () => {
    await migrations[0]!.up(db);
    await migrations[0]!.down?.(db);
    const collections = await db.listCollections({ name: "users" }).toArray();
    expect(collections).toHaveLength(0);
  });

  it("down 003 — supprime la collection revoked_tokens", async () => {
    await migrations[2]!.up(db);
    await migrations[2]!.down?.(db);
    const collections = await db.listCollections({ name: "revoked_tokens" }).toArray();
    expect(collections).toHaveLength(0);
  });
});
