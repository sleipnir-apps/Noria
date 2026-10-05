import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../test/helpers/build-app";
import { seedUser } from "../../test/helpers/seed";

describe("Sync routes (offline-first)", () => {
  let app: FastifyInstance;
  let accessToken: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await app.db.collection("users").deleteMany({});
    await app.db.collection("tasks").deleteMany({});

    const user = await seedUser(app, { email: "sync@example.com" });
    ({ accessToken } = app.signTokens({ id: user.id, email: user.email, role: user.role }));
  });

  afterAll(async () => {
    await app.close();
  });

  const authHeader = () => ({ Authorization: `Bearer ${accessToken}` });

  const push = (operations: Array<Record<string, unknown>>) =>
    app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: authHeader(),
      payload: { operations },
    });

  describe("POST /api/v1/sync/push (LWW)", () => {
    it("applies a newer upsert", async () => {
      const res = await push([
        {
          op: "upsert",
          id: "uuid-1",
          updated_at: "2026-10-05T10:00:00.000Z",
          data: { title: "Créée offline", status: "TODO" },
        },
      ]);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.applied).toEqual(["uuid-1"]);
      expect(body.conflicts).toEqual([]);

      const stored = await app.db.collection("tasks").findOne({ id: "uuid-1" });
      expect(stored?.title).toBe("Créée offline");
    });

    it("rejects an older operation (LWW keeps the server version)", async () => {
      // Server version, updated_at = 12:00.
      await app.db.collection("tasks").insertOne({
        id: "uuid-lww",
        userId: (await app.db.collection("users").findOne({}))!._id.toString(),
        title: "Serveur",
        priority: "P3",
        status: "DONE",
        due_date: null,
        has_time: false,
        tags: [],
        subtasks: [],
        recurrence_rule: null,
        deleted_at: null,
        createdAt: new Date("2026-10-05T11:00:00.000Z"),
        updatedAt: new Date("2026-10-05T12:00:00.000Z"),
      });

      // Client pushes a stale edit (updated_at = 10:00 < 12:00).
      const res = await push([
        {
          op: "upsert",
          id: "uuid-lww",
          updated_at: "2026-10-05T10:00:00.000Z",
          data: { title: "Édition obsolète", status: "TODO" },
        },
      ]);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.applied).toEqual([]);
      expect(body.conflicts).toEqual([
        {
          id: "uuid-lww",
          kept: "2026-10-05T12:00:00.000Z",
          rejected_updated_at: "2026-10-05T10:00:00.000Z",
        },
      ]);

      const stored = await app.db.collection("tasks").findOne({ id: "uuid-lww" });
      expect(stored?.title).toBe("Serveur");
      expect(stored?.status).toBe("DONE");
    });

    it("applies a delete and reports it in pull deletions", async () => {
      await push([
        {
          op: "upsert",
          id: "uuid-del",
          updated_at: "2026-10-05T10:00:00.000Z",
          data: { title: "À effacer" },
        },
      ]);
      const res = await push([
        { op: "delete", id: "uuid-del", updated_at: "2026-10-05T11:00:00.000Z" },
      ]);
      expect(res.json().applied).toEqual(["uuid-del"]);

      // Pull must report the deletion (soft delete).
      const pull = await app.inject({
        method: "GET",
        url: "/api/v1/sync",
        headers: authHeader(),
      });
      const body = pull.json();
      expect(body.changes).toHaveLength(0);
      expect(body.deletions).toHaveLength(1);
      expect(body.deletions[0].id).toBe("uuid-del");
      expect(body.deletions[0].deleted_at).not.toBeNull();
      expect(body.server_time).not.toBeNull();
    });
  });

  describe("GET /api/v1/sync (pull)", () => {
    it("pulls only changes since `since`", async () => {
      await push([
        {
          op: "upsert",
          id: "s-1",
          updated_at: "2026-10-05T10:00:00.000Z",
          data: { title: "Ancienne" },
        },
        {
          op: "upsert",
          id: "s-2",
          updated_at: "2026-10-05T15:00:00.000Z",
          data: { title: "Récente" },
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/sync?since=2026-10-05T12:00:00.000Z",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.changes.map((c: { id: string }) => c.id)).toEqual(["s-2"]);
      expect(body.deletions).toEqual([]);
    });

    it("returns 401 without token", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/sync" });
      expect(res.statusCode).toBe(401);
    });
  });
});
