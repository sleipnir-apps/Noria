import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { buildApp } from "../../test/helpers/build-app";
import { seedTask, seedUser } from "../../test/helpers/seed";

/** Monday 2026-12-07 09:00 UTC and the 3 following Mondays (December has exactly 4). */
const MONDAYS = [
  "2026-12-07T09:00:00.000Z",
  "2026-12-14T09:00:00.000Z",
  "2026-12-21T09:00:00.000Z",
  "2026-12-28T09:00:00.000Z",
];

describe("Tasks routes", () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await app.db.collection("users").deleteMany({});
    await app.db.collection("tasks").deleteMany({});

    const user = await seedUser(app, { email: "tasks@example.com" });
    userId = user.id;
    ({ accessToken } = app.signTokens({ id: user.id, email: user.email, role: user.role }));
  });

  afterAll(async () => {
    await app.close();
  });

  const authHeader = () => ({ Authorization: `Bearer ${accessToken}` });

  // ── CRUD ─────────────────────────────────────────────────────────────────

  describe("POST /tasks", () => {
    it("crée une tâche avec les valeurs par défaut", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: authHeader(),
        payload: { title: "Ma tâche" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.title).toBe("Ma tâche");
      expect(body.priority).toBe("P3");
      expect(body.status).toBe("TODO");
      expect(body.has_time).toBe(false);
      expect(body.tags).toEqual([]);
      expect(body.subtasks).toEqual([]);
      expect(body.deleted_at).toBeNull();
    });

    it("crée une tâche datée avec sous-tâches et tags", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: authHeader(),
        payload: {
          title: "Courses",
          due_date: "2026-11-02T15:00:00.000Z",
          has_time: true,
          priority: "P1",
          tags: ["maison"],
          subtasks: [{ id: "s1", title: "Liste", is_completed: false }],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.due_date).toBe("2026-11-02T15:00:00.000Z");
      expect(body.has_time).toBe(true);
      expect(body.priority).toBe("P1");
      expect(body.subtasks[0].title).toBe("Liste");
    });

    it("rejette une priorité invalide (400)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: authHeader(),
        payload: { title: "T", priority: "P5" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejette un titre vide (400)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: authHeader(),
        payload: { title: "" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("retourne 401 sans token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        payload: { title: "T" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /tasks", () => {
    it("liste les tâches de l'utilisateur, triées par created_at desc", async () => {
      const a = await seedTask(app, userId, { title: "A" });
      const b = await seedTask(app, userId, { title: "B" });
      // b created after a → first in a desc sort
      expect(b.created_at >= a.created_at).toBe(true);

      const res = await app.inject({ method: "GET", url: "/api/v1/tasks", headers: authHeader() });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data[0].title).toBe("B");
    });

    it("exclut les tâches soft-deleted des vues", async () => {
      await seedTask(app, userId, { title: "Vivante" });
      await seedTask(app, userId, { title: "Morte", deleted_at: "2026-01-01T00:00:00.000Z" });

      const res = await app.inject({ method: "GET", url: "/api/v1/tasks", headers: authHeader() });
      expect(res.statusCode).toBe(200);
      const titles = res.json().data.map((t: { title: string }) => t.title);
      expect(titles).toEqual(["Vivante"]);
    });

    it("ne retourne pas les tâches d'un autre utilisateur", async () => {
      const other = await seedUser(app, { email: "other@example.com" });
      await seedTask(app, other.id, { title: "Pas à moi" });

      const res = await app.inject({ method: "GET", url: "/api/v1/tasks", headers: authHeader() });
      expect(res.json().data).toHaveLength(0);
    });

    it("filtre par status et priority", async () => {
      await seedTask(app, userId, { title: "Urgente", priority: "P1", status: "IN_PROGRESS" });
      await seedTask(app, userId, { title: "Normale" });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?status=IN_PROGRESS&priority=P1",
        headers: authHeader(),
      });
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("Urgente");
    });

    it("le filtre backlog=1 ne retourne que les tâches sans date", async () => {
      await seedTask(app, userId, { title: "Backlog" });
      await seedTask(app, userId, { title: "Datée", due_date: "2026-11-02T09:00:00.000Z" });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?backlog=1",
        headers: authHeader(),
      });
      const titles = res.json().data.map((t: { title: string }) => t.title);
      expect(titles).toEqual(["Backlog"]);
    });
  });

  describe("GET /tasks/:id", () => {
    it("retourne la tâche par id", async () => {
      const { id } = await seedTask(app, userId, { title: "Détail" });
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().title).toBe("Détail");
    });

    it("404 pour une tâche d'un autre utilisateur", async () => {
      const other = await seedUser(app, { email: "other2@example.com" });
      const { id } = await seedTask(app, other.id, { title: "Pas le mien" });
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(404);
    });

    it("404 pour un id invalide", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/nope",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /tasks/:id", () => {
    it("met à jour titre et statut", async () => {
      const { id } = await seedTask(app, userId, { title: "Avant" });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
        payload: { title: "Après", status: "DONE" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("DONE");
      expect(res.json().title).toBe("Après");
    });

    it("conversion backlog → datée en posant due_date", async () => {
      const { id } = await seedTask(app, userId, { title: "Backlog" });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
        payload: { due_date: "2026-11-02T09:00:00.000Z", has_time: true },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().due_date).toBe("2026-11-02T09:00:00.000Z");
    });

    it("conversion datée → backlog en retirant due_date (null)", async () => {
      const { id } = await seedTask(app, userId, {
        title: "Datée",
        due_date: "2026-11-02T09:00:00.000Z",
      });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
        payload: { due_date: null },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().due_date).toBeNull();
    });

    it("remplace le tableau de sous-tâches (complète une sous-tâche)", async () => {
      const { id } = await seedTask(app, userId, {
        title: "Avec sous-tâches",
        subtasks: [
          { id: "s1", title: "Uno", is_completed: false },
          { id: "s2", title: "Dos", is_completed: false },
        ],
      });
      // Le client renvoie le tableau complet (convention remplacer-le-tableau).
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
        payload: {
          subtasks: [
            { id: "s1", title: "Uno", is_completed: true },
            { id: "s2", title: "Dos", is_completed: false },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.subtasks).toHaveLength(2);
      expect(body.subtasks.find((s: { id: string }) => s.id === "s1")!.is_completed).toBe(true);
    });

    it("404 pour une tâche d'un autre utilisateur", async () => {
      const other = await seedUser(app, { email: "other3@example.com" });
      const { id } = await seedTask(app, other.id, { title: "Hack" });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
        payload: { title: "Hack" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /tasks/:id", () => {
    it("soft delete : deleted_at posé, exclu des vues, présent en sync", async () => {
      const { id } = await seedTask(app, userId, { title: "À supprimer" });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(204);

      // Exclue des vues REST
      const view = await app.inject({ method: "GET", url: "/api/v1/tasks", headers: authHeader() });
      expect(view.json().data).toHaveLength(0);
      const detail = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
      });
      expect(detail.statusCode).toBe(404);

      // Soft delete : le document existe toujours, deleted_at posé
      const doc = await app.db.collection("tasks").findOne({ title: "À supprimer" });
      expect(doc?.deletedAt).not.toBeNull();

      // Présent dans le pull sync (pour propager la suppression offline)
      const pull = await app.inject({
        method: "GET",
        url: "/api/v1/sync?since=2020-01-01T00:00:00.000Z",
        headers: authHeader(),
      });
      const deletions = pull.json().deletions as string[];
      expect(deletions).toContain(id);
    });

    it("404 pour une tâche d'un autre utilisateur", async () => {
      const other = await seedUser(app, { email: "other4@example.com" });
      const { id } = await seedTask(app, other.id, { title: "X" });
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Range + fusion rrule ────────────────────────────────────────────────

  describe("GET /tasks/range", () => {
    it("fusionne une tâche weekly MO avec ses 4 occurrences du mois", async () => {
      // Parent weekly Monday, du 2026-11-02, 09:00 UTC
      const { id } = await seedTask(app, userId, {
        title: "Weekly standup",
        due_date: MONDAYS[0],
        has_time: true,
        recurrence_rule: { frequency: "WEEKLY", interval: 1, by_weekday: [0] },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/range?start=2026-12-01T00:00:00.000Z&end=2026-12-31T23:59:59.000Z",
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(200);
      const tasks = res.json().tasks as Array<{
        title: string;
        due_date: string | null;
        parent_task_id: string | null;
        original_due_date: string | null;
        status: string;
      }>;

      // 4 lundis de décembre 2026 : 07, 14, 21, 28
      expect(tasks).toHaveLength(4);
      expect(tasks.map((t) => t.due_date)).toEqual(MONDAYS);

      // Le 1er lundi = le parent lui-même (pas d'instance)
      const first = tasks.find((t) => t.due_date === MONDAYS[0])!;
      expect(first.parent_task_id).toBeNull();
      expect(first.title).toBe("Weekly standup");

      // Les 3 suivants = occurrences virtuelles, rattachées au parent
      for (const date of MONDAYS.slice(1)) {
        const occ = tasks.find((t) => t.due_date === date)!;
        expect(occ.parent_task_id).toBe(id);
        expect(occ.original_due_date).toBe(date);
        expect(occ.title).toBe("Weekly standup");
      }
    });

    it("matérialise une instance quand une occurrence est complétée (override DONE)", async () => {
      const { id } = await seedTask(app, userId, {
        title: "Weekly standup",
        due_date: MONDAYS[0],
        has_time: true,
        recurrence_rule: { frequency: "WEEKLY", interval: 1, by_weekday: [0] },
      });

      // Le client matérialise l'occurrence du 3e lundi et la complète.
      // L'instance a son PROPRE id (généré client, 24-hex) — pas celui du parent.
      // 1er upsert (matérialisation), 2e upsert (mutation LWW avec updated_at > 1er).
      const instId = "5a1f77bcf86cd7994390aa01";
      const matTime = "2026-12-21T10:00:00.000Z";
      const doneTime = "2026-12-21T10:30:00.000Z";
      await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: authHeader(),
        payload: {
          ops: [
            {
              id: "op1",
              op: "upsert",
              task: {
                id: instId,
                title: "Weekly standup",
                due_date: MONDAYS[2],
                status: "IN_PROGRESS",
                parent_task_id: id,
                original_due_date: MONDAYS[2],
                has_time: true,
                updated_at: matTime,
              },
            },
            {
              id: "op2",
              op: "upsert",
              task: {
                id: instId,
                title: "Weekly standup",
                due_date: MONDAYS[2],
                status: "DONE",
                parent_task_id: id,
                original_due_date: MONDAYS[2],
                has_time: true,
                updated_at: doneTime,
              },
            },
          ],
        },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/range?start=2026-12-01T00:00:00.000Z&end=2026-12-31T23:59:59.000Z",
        headers: authHeader(),
      });

      const tasks = res.json().tasks as Array<{
        due_date: string | null;
        parent_task_id: string | null;
        status: string;
      }>;

      // Toujours 4 items pour 4 lundis : les 3 lundis non mutés = parent + 2 occurrences
      // virtuelles, le 3e = l'instance DONE (dédupliquée), le 4e = occurrence virtuelle.
      expect(tasks).toHaveLength(4);
      expect(tasks.map((t) => t.due_date)).toEqual(MONDAYS);

      const instance = tasks.find((t) => t.due_date === MONDAYS[2])!;
      expect(instance.parent_task_id).toBe(id);
      expect(instance.status).toBe("DONE");

      // Le 2e lundi reste une occurrence virtuelle
      const virtual = tasks.find((t) => t.due_date === MONDAYS[1])!;
      expect(virtual.status).toBe("TODO");
    });

    it("exclut les occurrences déjà matérialisées de la génération rrule", async () => {
      const { id } = await seedTask(app, userId, {
        title: "Weekly",
        due_date: MONDAYS[0],
        recurrence_rule: { frequency: "WEEKLY", interval: 1, by_weekday: [0] },
      });
      // Instance reportée : occurrence du 2e lundi déplacée au mardi
      await seedTask(app, userId, {
        title: "Weekly",
        due_date: "2026-12-15T09:00:00.000Z",
        parent_task_id: id,
        original_due_date: MONDAYS[1],
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/range?start=2026-12-01T00:00:00.000Z&end=2026-12-31T23:59:59.000Z",
        headers: authHeader(),
      });
      const tasks = res.json().tasks as Array<{ due_date: string | null }>;
      const dates = tasks.map((t) => t.due_date).sort();

      // parent (lundi 07) + instance (mardi 15) + occ virtuelles (21, 28) — pas de doublon du 14
      expect(dates).toEqual([
        "2026-12-07T09:00:00.000Z",
        "2026-12-15T09:00:00.000Z",
        "2026-12-21T09:00:00.000Z",
        "2026-12-28T09:00:00.000Z",
      ]);
    });

    it("n'inclut pas les tâches backlog ni les tâches hors intervalle", async () => {
      await seedTask(app, userId, { title: "Backlog" });
      await seedTask(app, userId, { title: "Novembre", due_date: "2026-11-05T09:00:00.000Z" });
      await seedTask(app, userId, { title: "Décembre", due_date: "2026-12-05T09:00:00.000Z" });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/range?start=2026-12-01T00:00:00.000Z&end=2026-12-31T23:59:59.000Z",
        headers: authHeader(),
      });
      const tasks = res.json().tasks as Array<{ title: string }>;
      expect(tasks.map((t) => t.title)).toEqual(["Décembre"]);
    });

    it("rejette une fenêtre invalide (start > end, 400)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/range?start=2026-12-31T00:00:00.000Z&end=2026-12-01T00:00:00.000Z",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(400);
    });

    it("n'inclut pas les occurrences d'un parent soft-deleted", async () => {
      await seedTask(app, userId, {
        title: "Parent supprimé",
        due_date: MONDAYS[0],
        recurrence_rule: { frequency: "WEEKLY", interval: 1, by_weekday: [0] },
        deleted_at: "2026-12-03T00:00:00.000Z",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/range?start=2026-12-01T00:00:00.000Z&end=2026-12-31T23:59:59.000Z",
        headers: authHeader(),
      });
      expect(res.json().tasks).toHaveLength(0);
    });
  });

  // ── Overdue ─────────────────────────────────────────────────────────────

  describe("GET /tasks/overdue", () => {
    it("retourne les datées non terminées avec due_date < maintenant", async () => {
      await seedTask(app, userId, { title: "Retard", due_date: "2026-01-15T09:00:00.000Z" });
      await seedTask(app, userId, { title: "Futur", due_date: "2027-01-15T09:00:00.000Z" });
      await seedTask(app, userId, {
        title: "Finie à l'heure",
        due_date: "2026-01-15T09:00:00.000Z",
        status: "DONE",
      });
      await seedTask(app, userId, { title: "Backlog" });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/overdue",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const tasks = res.json().tasks as Array<{ title: string }>;
      expect(tasks.map((t) => t.title)).toEqual(["Retard"]);
    });

    it("n'inclut pas les occurrences d'un parent soft-deleted ni les tâches supprimées", async () => {
      await seedTask(app, userId, {
        title: "Parent mort",
        due_date: "2026-01-15T09:00:00.000Z",
        recurrence_rule: { frequency: "DAILY", interval: 1 },
        deleted_at: "2026-01-16T00:00:00.000Z",
      });
      await seedTask(app, userId, {
        title: "Supprimée",
        due_date: "2026-01-10T09:00:00.000Z",
        deleted_at: "2026-01-11T00:00:00.000Z",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/overdue",
        headers: authHeader(),
      });
      expect(res.json().tasks).toHaveLength(0);
    });
  });

  // ── Sync : pull ─────────────────────────────────────────────────────────

  describe("GET /api/v1/sync (pull)", () => {
    it("retourne les changements depuis un timestamp + server_time", async () => {
      const t0 = "2026-01-01T00:00:00.000Z";
      const old = await seedTask(app, userId, { title: "Ancienne" });
      await seedTask(app, userId, { title: "Récente" });
      // Force updatedAt de "Ancienne" avant le cutoff
      await app.db
        .collection("tasks")
        .updateOne({ _id: new ObjectId(old.id) }, { $set: { updatedAt: new Date(t0) } });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/sync?since=${encodeURIComponent("2026-01-02T00:00:00.000Z")}`,
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const titles = (body.changes as Array<{ title: string }>).map((c) => c.title);
      expect(titles).toContain("Récente");
      expect(titles).not.toContain("Ancienne");
      expect(body.deletions).toEqual([]);
      expect(typeof body.server_time).toBe("string");
    });

    it("depuis=2020 retourne tout l'historique, avec les soft deletes en deletions", async () => {
      await seedTask(app, userId, { title: "Une" });
      const deleted = await seedTask(app, userId, {
        title: "Deux",
        deleted_at: "2026-01-01T00:00:00.000Z",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/sync?since=2020-01-01T00:00:00.000Z",
        headers: authHeader(),
      });
      const body = res.json();
      expect((body.changes as Array<{ title: string }>).map((c) => c.title)).toEqual(["Une"]);
      expect(body.deletions).toEqual([deleted.id]);
    });

    it("propage les soft deletes dans deletions", async () => {
      const { id } = await seedTask(app, userId, {
        title: "Morte",
        deleted_at: "2026-06-01T00:00:00.000Z",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/sync?since=2020-01-01T00:00:00.000Z",
        headers: authHeader(),
      });
      const body = res.json();
      expect(body.changes).toHaveLength(0);
      expect(body.deletions).toEqual([id]);
    });

    it("400 sans since ou since invalide", async () => {
      const res1 = await app.inject({
        method: "GET",
        url: "/api/v1/sync",
        headers: authHeader(),
      });
      expect(res1.statusCode).toBe(400);

      const res2 = await app.inject({
        method: "GET",
        url: "/api/v1/sync?since=pas-une-date",
        headers: authHeader(),
      });
      expect(res2.statusCode).toBe(400);
    });
  });

  // ── Sync : push (LWW) ───────────────────────────────────────────────────

  describe("POST /api/v1/sync/push", () => {
    it("applique un upsert de création avec un id client (devenu l'_id)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: authHeader(),
        payload: {
          ops: [
            {
              id: "local-1",
              op: "upsert",
              task: {
                id: "7f3a2b6c9d4e4f5a8b7c1d2e",
                title: "Créée offline",
                updated_at: "2026-11-01T10:00:00.000Z",
              },
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.applied).toBe(1);
      expect(body.conflicts).toEqual([]);

      const docs = await app.db.collection("tasks").find({ title: "Créée offline" }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0]!._id.toString()).toBe("7f3a2b6c9d4e4f5a8b7c1d2e");
      expect(docs[0]!.updatedAt.toISOString()).toBe("2026-11-01T10:00:00.000Z");
    });

    it("résolution LWW : une op ancienne est rejetée avec un conflit", async () => {
      const { id, updated_at } = await seedTask(app, userId, {
        title: "Version serveur",
        updated_at: "2026-11-05T12:00:00.000Z",
      });

      // Op client plus vieille que le serveur → rejetée
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: authHeader(),
        payload: {
          ops: [
            {
              id: "local-1",
              op: "upsert",
              task: {
                id: id,
                title: "Version client périmée",
                updated_at: "2026-11-01T08:00:00.000Z",
              },
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.applied).toBe(0);
      expect(body.conflicts).toEqual([
        { id: "local-1", kept: "server", rejected_updated_at: "2026-11-01T08:00:00.000Z" },
      ]);

      // Le serveur a gardé sa version
      const doc = await app.db.collection("tasks").findOne({ _id: new ObjectId(id) });
      expect(doc?.title).toBe("Version serveur");
      expect((doc?.updatedAt as Date).toISOString()).toBe(updated_at);

      // L'updated_at renvoyé dans le conflit = celui de l'op rejetée
      expect(doc?.title).not.toBe("Version client périmée");
    });

    it("une op plus récente que le serveur est appliquée", async () => {
      const { id } = await seedTask(app, userId, {
        title: "Avant",
        updated_at: "2026-11-01T08:00:00.000Z",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: authHeader(),
        payload: {
          ops: [
            {
              id: "local-1",
              op: "upsert",
              task: { id: id, title: "Après", updated_at: "2026-11-05T18:00:00.000Z" },
            },
          ],
        },
      });

      const body = res.json();
      expect(body.applied).toBe(1);
      expect(body.conflicts).toEqual([]);

      const doc = await app.db.collection("tasks").findOne({ _id: new ObjectId(id) });
      expect(doc?.title).toBe("Après");
      expect((doc?.updatedAt as Date).toISOString()).toBe("2026-11-05T18:00:00.000Z");
    });

    it("updated_at identique = l'ops client gagne l'égalité (LWW sur $lte), appliquée", async () => {
      const { id } = await seedTask(app, userId, {
        title: "Serveur",
        updated_at: "2026-11-01T08:00:00.000Z",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: authHeader(),
        payload: {
          ops: [
            {
              id: "local-1",
              op: "upsert",
              task: { id: id, title: "Client", updated_at: "2026-11-01T08:00:00.000Z" },
            },
          ],
        },
      });

      const body = res.json();
      expect(body.applied).toBe(1);
      expect(body.conflicts).toEqual([]);
      const doc = await app.db.collection("tasks").findOne({ _id: new ObjectId(id) });
      expect(doc?.title).toBe("Client");
      // updated_at identique conservé côté serveur
      expect((doc?.updatedAt as Date).toISOString()).toBe("2026-11-01T08:00:00.000Z");
    });

    it("op delete LWW : supprime si plus récent, conflit sinon", async () => {
      const newer = await seedTask(app, userId, {
        title: "Delete gagnant",
        updated_at: "2026-11-01T08:00:00.000Z",
      });
      const older = await seedTask(app, userId, {
        title: "Delete perdant",
        updated_at: "2026-11-05T08:00:00.000Z",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: authHeader(),
        payload: {
          ops: [
            {
              id: "op-a",
              op: "delete",
              task: { id: newer.id, updated_at: "2026-11-09T00:00:00.000Z" },
            },
            {
              id: "op-b",
              op: "delete",
              task: { id: older.id, updated_at: "2026-11-02T00:00:00.000Z" },
            },
          ],
        },
      });

      const body = res.json();
      expect(body.applied).toBe(1);
      expect(body.conflicts).toEqual([
        { id: "op-b", kept: "server", rejected_updated_at: "2026-11-02T00:00:00.000Z" },
      ]);

      const deleted = await app.db.collection("tasks").findOne({ _id: new ObjectId(newer.id) });
      expect(deleted?.deletedAt).not.toBeNull();
      const kept = await app.db.collection("tasks").findOne({ _id: new ObjectId(older.id) });
      expect(kept?.deletedAt ?? null).toBeNull();
    });

    it("une op pour une tâche d'un autre utilisateur est ignorée (404-like : pas appliquée)", async () => {
      const other = await seedUser(app, { email: "other5@example.com" });
      const { id } = await seedTask(app, other.id, {
        title: "Pas à moi",
        updated_at: "2026-01-01T00:00:00.000Z",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: authHeader(),
        payload: {
          ops: [
            {
              id: "op-x",
              op: "upsert",
              task: { id: id, title: "Hack", updated_at: "2026-11-09T00:00:00.000Z" },
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.applied).toBe(0);
      expect(body.conflicts).toEqual([]);

      const doc = await app.db.collection("tasks").findOne({ _id: new ObjectId(id) });
      expect(doc?.title).toBe("Pas à moi");
      expect((doc?.updatedAt as Date).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    });

    it("400 sur op invalide (updated_at manquant)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: authHeader(),
        payload: { ops: [{ id: "op-1", op: "upsert", task: { title: "T" } }] },
      });
      expect(res.statusCode).toBe(400);
    });

    it("400 sur payload sans ops", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: authHeader(),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Matérialisation d'occurrence via PATCH parent ───────────────────────

  describe("PATCH parent (occurrence)", () => {
    it("PATCH avec parent_task_id + original_due_date crée bien une instance séparée", async () => {
      const { id } = await seedTask(app, userId, {
        title: "Weekly",
        due_date: MONDAYS[0],
        has_time: true,
        recurrence_rule: { frequency: "WEEKLY", interval: 1, by_weekday: [0] },
      });

      // Le front matérialise en appelant POST /tasks avec un payload d'instance,
      // ou via POST /tasks/:id/occurrence — ici on teste l'endpoint dédié.
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${id}/occurrence`,
        headers: authHeader(),
        payload: { original_due_date: MONDAYS[1], due_date: MONDAYS[1], status: "DONE" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.parent_task_id).toBe(id);
      expect(body.original_due_date).toBe(MONDAYS[1]);
      expect(body.status).toBe("DONE");
      expect(body.title).toBe("Weekly");

      // Le parent n'a pas été modifié
      const parent = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
      });
      expect(parent.json().status).toBe("TODO");
      expect(parent.json().parent_task_id).toBeNull();

      // L'occurrence du 2e lundi est désormais matérialisée : pas de doublon dans range
      const range = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/range?start=2026-12-01T00:00:00.000Z&end=2026-12-31T23:59:59.000Z",
        headers: authHeader(),
      });
      const tasks = range.json().tasks as Array<{ due_date: string | null }>;
      expect(tasks.filter((t) => t.due_date === MONDAYS[1])).toHaveLength(1);
    });

    it("404 sur un id de parent inexistant", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks/000000000000000000000000/occurrence",
        headers: authHeader(),
        payload: { original_due_date: MONDAYS[1] },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Subtasks ────────────────────────────────────────────────────────────

  describe("POST /tasks/:id/subtasks", () => {
    it("ajoute une sous-tâche avec id généré", async () => {
      const { id } = await seedTask(app, userId, { title: "Parent" });
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${id}/subtasks`,
        headers: authHeader(),
        payload: { title: "Nouvelle sous-tâche" },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.title).toBe("Nouvelle sous-tâche");
      expect(body.is_completed).toBe(false);
      expect(body.id).toBeTruthy();
    });

    it("404 sur une tâche d'un autre utilisateur", async () => {
      const other = await seedUser(app, { email: "other6@example.com" });
      const { id } = await seedTask(app, other.id, { title: "X" });
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${id}/subtasks`,
        headers: authHeader(),
        payload: { title: "Hack" },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
