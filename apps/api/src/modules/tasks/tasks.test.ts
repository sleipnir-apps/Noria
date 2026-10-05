import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../test/helpers/build-app";
import { seedUser } from "../../test/helpers/seed";

describe("Tasks routes", () => {
  let app: FastifyInstance;
  let accessToken: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await app.db.collection("users").deleteMany({});
    await app.db.collection("tasks").deleteMany({});

    const user = await seedUser(app, { email: "tasks@example.com" });
    ({ accessToken } = app.signTokens({ id: user.id, email: user.email, role: user.role }));
  });

  afterAll(async () => {
    await app.close();
  });

  const authHeader = () => ({ Authorization: `Bearer ${accessToken}` });

  const createTask = async (payload: Record<string, unknown>) => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: authHeader(),
      payload,
    });
    return res;
  };

  // ── CRUD ────────────────────────────────────────────────────────────────

  describe("POST /api/v1/tasks", () => {
    it("creates a task with defaults", async () => {
      const res = await createTask({ title: "Ma tâche" });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.title).toBe("Ma tâche");
      expect(body.priority).toBe("P3");
      expect(body.status).toBe("TODO");
      expect(body.has_time).toBe(false);
      expect(body.due_date).toBeNull();
      expect(body.tags).toEqual([]);
      expect(body.subtasks).toEqual([]);
      expect(body.deleted_at).toBeNull();
    });

    it("creates a dated task with subtasks and tags", async () => {
      const res = await createTask({
        title: "Dentiste",
        due_date: "2026-10-07T14:30:00.000Z",
        has_time: true,
        priority: "P1",
        tags: ["santé"],
        subtasks: [{ id: "st-1", title: "Prendre carte", is_completed: false }],
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.due_date).toBe("2026-10-07T14:30:00.000Z");
      expect(body.has_time).toBe(true);
      expect(body.priority).toBe("P1");
      expect(body.tags).toEqual(["santé"]);
      expect(body.subtasks).toHaveLength(1);
    });

    it("requires a due_date on a recurring task", async () => {
      const res = await createTask({
        title: "Récurrente",
        recurrence_rule: { frequency: "WEEKLY", interval: 1, by_weekday: ["MO"] },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 with an empty title", async () => {
      const res = await createTask({ title: "" });
      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        payload: { title: "X" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/v1/tasks", () => {
    it("lists tasks and can filter the backlog", async () => {
      await createTask({ title: "Backlog A" });
      await createTask({ title: "Datée", due_date: "2026-10-07T09:00:00.000Z" });
      await createTask({
        title: "Backlog P1",
        priority: "P1",
      });

      const list = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: authHeader(),
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().data).toHaveLength(3);

      const backlog = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?backlog=true",
        headers: authHeader(),
      });
      const data: Array<{ title: string; priority: string }> = backlog.json().data;
      expect(data).toHaveLength(2);
      // Backlog order: priority first (P1 before P3), then created_at.
      expect(data[0]?.title).toBe("Backlog P1");
    });

    it("does not return another user's tasks", async () => {
      const other = await seedUser(app, { email: "other-tasks@example.com" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: {
          Authorization: `Bearer ${app.signTokens({ id: other.id, email: other.email, role: other.role }).accessToken}`,
        },
        payload: { title: "Pas à moi" },
      });
      expect(res.statusCode).toBe(201);

      const list = await app.inject({ method: "GET", url: "/api/v1/tasks", headers: authHeader() });
      expect(list.json().data).toHaveLength(0);
    });
  });

  describe("PATCH /api/v1/tasks/:id (backlog ↔ dated)", () => {
    it("sets a due_date on a backlog task (backlog → dated)", async () => {
      const created = (await (await createTask({ title: "à planifier" })).json()) as { id: string };
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${created.id}`,
        headers: authHeader(),
        payload: { due_date: "2026-10-08T10:00:00.000Z", has_time: true },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().due_date).toBe("2026-10-08T10:00:00.000Z");
    });

    it("clears due_date with null (dated → backlog)", async () => {
      const created = (await (
        await createTask({ title: "datée", due_date: "2026-10-08T10:00:00.000Z" })
      ).json()) as { id: string };
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${created.id}`,
        headers: authHeader(),
        payload: { due_date: null },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().due_date).toBeNull();

      const backlog = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?backlog=true",
        headers: authHeader(),
      });
      expect(backlog.json().data).toHaveLength(1);
    });
  });

  describe("DELETE /api/v1/tasks/:id (soft delete)", () => {
    it("soft-deletes and excludes from views", async () => {
      const created = (await (await createTask({ title: "à supprimer" })).json()) as { id: string };

      const del = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${created.id}`,
        headers: authHeader(),
      });
      expect(del.statusCode).toBe(204);

      const get = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${created.id}`,
        headers: authHeader(),
      });
      expect(get.statusCode).toBe(404);

      const list = await app.inject({ method: "GET", url: "/api/v1/tasks", headers: authHeader() });
      expect(list.json().data).toHaveLength(0);
    });
  });

  // ── Range + occurrences ─────────────────────────────────────────────────

  describe("GET /api/v1/tasks/range (rrule merge + materialization)", () => {
    it("returns 4 items for weekly MO with one occurrence materialized as DONE instance", async () => {
      // Parent: first Monday of Oct 2026 (the 5th), weekly on Mondays.
      const created = (await (
        await createTask({
          title: "Rapport hebdo",
          due_date: "2026-10-05T09:00:00.000Z",
          has_time: true,
          recurrence_rule: { frequency: "WEEKLY", interval: 1, by_weekday: ["MO"] },
        })
      ).json()) as { id: string };

      // Materialize the second Monday (12th) as a DONE instance.
      const mutated = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${created.id}?occurrence_date=2026-10-12T09:00:00.000Z`,
        headers: authHeader(),
        payload: { status: "DONE" },
      });
      expect(mutated.statusCode).toBe(200);
      const instance = mutated.json() as { id: string; parent_task_id: string; status: string };
      expect(instance.parent_task_id).toBe(created.id);
      expect(instance.id).not.toBe(created.id);

      // The parent must NOT have been modified.
      const parent = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${created.id}`,
        headers: authHeader(),
      });
      expect(parent.json().status).toBe("TODO");

      // Range over October: 4 Mondays → 3 virtual occurrences + 1 instance.
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/range?start=2026-10-01T00:00:00.000Z&end=2026-10-31T23:59:59.999Z",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const data: Array<{ id: string; is_occurrence: boolean; due_date: string; status: string }> =
        res.json().data;
      expect(data).toHaveLength(4);
      expect(data.map((t) => t.due_date)).toEqual([
        "2026-10-05T09:00:00.000Z",
        "2026-10-12T09:00:00.000Z",
        "2026-10-19T09:00:00.000Z",
        "2026-10-26T09:00:00.000Z",
      ]);
      // The 12th is the materialized instance (own id, DONE).
      const inst = data.find((t) => t.due_date === "2026-10-12T09:00:00.000Z");
      expect(inst?.id).toBe(instance.id);
      expect(inst?.status).toBe("DONE");
      // Others are virtual (parent id, occurrence flag).
      const virtuals = data.filter((t) => t.id === created.id);
      expect(virtuals).toHaveLength(3);
      for (const v of virtuals) {
        expect(v.status).toBe("TODO");
        expect(v.is_occurrence).toBe(true);
      }
    });
  });

  describe("GET /api/v1/tasks/overdue", () => {
    it("returns past undone dated tasks only", async () => {
      await createTask({ title: "en retard", due_date: "2026-10-01T09:00:00.000Z" });
      await createTask({ title: "futur", due_date: "2099-01-01T09:00:00.000Z" });
      const done = (await (
        await createTask({ title: "fait", due_date: "2026-10-01T10:00:00.000Z" })
      ).json()) as { id: string };
      await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${done.id}`,
        headers: authHeader(),
        payload: { status: "DONE" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/overdue?now=2026-10-10T09:00:00.000Z",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const data: Array<{ title: string }> = res.json().data;
      expect(data).toHaveLength(1);
      expect(data[0]?.title).toBe("en retard");
    });
  });
});
