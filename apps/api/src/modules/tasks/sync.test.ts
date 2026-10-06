import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../test/helpers/build-app";
import { seedUser } from "../../test/helpers/seed";

describe("Sync endpoints", () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  // « passant » et « futur » par rapport à l'horloge serveur du test : le LWW
  // repose sur updatedAt, jamais sur l'ordre d'arrivée.
  const PAST = "2026-01-15T00:00:00.000Z";
  const FUTURE = "2027-01-01T00:00:00.000Z";
  const EPOCH = "1970-01-01T00:00:00.000Z";

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await app.db.collection("users").deleteMany({});
    await app.db.collection("tasks").deleteMany({});

    const user = await seedUser(app, { email: "sync@example.com" });
    userId = user.id;
    ({ accessToken } = app.signTokens({ id: user.id, email: user.email, role: user.role }));
  });

  afterAll(async () => {
    await app.close();
  });

  const authHeader = () => ({ Authorization: `Bearer ${accessToken}` });

  /** Snapshot de tâche tel que le client hors-ligne le met en file d'attente. */
  const snapshot = (overrides: Record<string, unknown> = {}) => ({
    id: "local:1",
    title: "Créée hors ligne",
    priority: "P2",
    status: "TODO",
    hasTime: false,
    tags: [],
    subtasks: [],
    createdAt: PAST,
    updatedAt: FUTURE,
    ...overrides,
  });

  const pushOps = (operations: Record<string, unknown>[]) =>
    app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: authHeader(),
      payload: { operations },
    });

  async function createTaskViaApi(overrides: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: authHeader(),
      payload: { title: "Serv side", hasTime: false, ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  // ── Pull ──────────────────────────────────────────────────────────────────

  describe("GET /sync", () => {
    it("retourne les changements et le filigrane serveur", async () => {
      const task = await createTaskViaApi({ title: "Nouvelle" });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/sync?since=${EPOCH}`,
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.changes).toHaveLength(1);
      expect(body.changes[0].id).toBe(task.id);
      expect(body.changes[0].title).toBe("Nouvelle");
      expect(body.deletions).toHaveLength(0);
      expect(typeof body.serverTime).toBe("string");
      expect(Number.isNaN(new Date(body.serverTime).getTime())).toBe(false);
    });

    it("ne rejoue rien quand le filigrane est à jour", async () => {
      await createTaskViaApi();
      const first = await app.inject({
        method: "GET",
        url: `/api/v1/sync?since=${EPOCH}`,
        headers: authHeader(),
      });
      const body = first.json();

      const second = await app.inject({
        method: "GET",
        url: `/api/v1/sync?since=${body.serverTime}`,
        headers: authHeader(),
      });
      expect(second.statusCode).toBe(200);
      expect(second.json().changes).toHaveLength(0);
      expect(second.json().deletions).toHaveLength(0);
    });

    it("expose les suppressions logiques dans deletions", async () => {
      const task = await createTaskViaApi();
      await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}`,
        headers: authHeader(),
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/sync?since=${EPOCH}`,
        headers: authHeader(),
      });

      const body = res.json();
      expect(body.changes).toHaveLength(0); // la tombe n'est pas dans changes
      expect(body.deletions).toHaveLength(1);
      expect(body.deletions[0].id).toBe(task.id);
      expect(typeof body.deletions[0].deletedAt).toBe("string");
    });

    it("retourne 400 avec un watermark invalide", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/sync?since=hier",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(400);
    });

    it("retourne 401 sans token", async () => {
      const res = await app.inject({ method: "GET", url: `/api/v1/sync?since=${EPOCH}` });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── Push : création ───────────────────────────────────────────────────────

  describe("POST /sync/push — CREATE", () => {
    it("crée une tâche depuis un id local et mappe le nouvel id serveur", async () => {
      const res = await pushOps([{ type: "CREATE", opId: "op-1", doc: snapshot() }]);

      expect(res.statusCode).toBe(200);
      const applied = res.json().applied;
      expect(applied).toHaveLength(1);
      expect(applied[0].opId).toBe("op-1");
      expect(applied[0].id).not.toBe("local:1");
      expect(applied[0].task.title).toBe("Créée hors ligne");
      expect(applied[0].task.userId).toBe(userId);

      const fetched = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${applied[0].id}`,
        headers: authHeader(),
      });
      expect(fetched.statusCode).toBe(200);
      expect(fetched.json().title).toBe("Créée hors ligne");
    });

    it("conserve un id ObjectId fourni par le client (24 hexadécimaux)", async () => {
      const res = await pushOps([
        { type: "CREATE", opId: "op-2", doc: snapshot({ id: "66f1f1f1f1f1f1f1f1f1f1f1" }) },
      ]);

      expect(res.json().applied[0].id).toBe("66f1f1f1f1f1f1f1f1f1f1f1");
    });

    it("perd le LWW quand le serveur a déjà une version plus récente", async () => {
      const task = await createTaskViaApi({ title: "Version serveur" });

      const res = await pushOps([
        {
          type: "CREATE",
          opId: "op-3",
          doc: snapshot({
            id: task.id,
            title: "Version cliente",
            updatedAt: PAST,
            createdAt: PAST,
          }),
        },
      ]);

      const body = res.json();
      expect(body.applied).toHaveLength(0);
      expect(body.conflicts).toHaveLength(1);
      expect(body.conflicts[0].opId).toBe("op-3");
      expect(body.conflicts[0].id).toBe(task.id);
      expect(body.conflicts[0].kept.title).toBe("Version serveur");
      expect(body.conflicts[0].rejectedUpdatedAt).toBe(PAST);
    });

    it("applique le LWW quand la version cliente est plus récente", async () => {
      const task = await createTaskViaApi({ title: "Version serveur" });

      const res = await pushOps([
        {
          type: "CREATE",
          opId: "op-4",
          doc: snapshot({
            id: task.id,
            title: "Version cliente",
            updatedAt: FUTURE,
            createdAt: PAST,
          }),
        },
      ]);

      const body = res.json();
      expect(body.applied).toHaveLength(1);
      expect(body.conflicts).toHaveLength(0);
      const fetched = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}`,
        headers: authHeader(),
      });
      expect(fetched.json().title).toBe("Version cliente");
      // updatedAt suit l'horloge du client gagnant (LWW sur updatedAt).
      expect(fetched.json().updatedAt).toBe(FUTURE);
    });
  });

  // ── Push : mise à jour (LWW) ─────────────────────────────────────────────

  describe("POST /sync/push — UPDATE", () => {
    it("applique une op plus récente que la copie serveur", async () => {
      const task = await createTaskViaApi();

      const res = await pushOps([
        {
          type: "UPDATE",
          opId: "op-up-1",
          id: task.id,
          doc: snapshot({
            id: task.id,
            title: "Modifiée hors ligne",
            status: "DONE",
            updatedAt: FUTURE,
            createdAt: PAST,
          }),
        },
      ]);

      expect(res.json().applied).toHaveLength(1);
      expect(res.json().conflicts).toHaveLength(0);
      const fetched = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}`,
        headers: authHeader(),
      });
      expect(fetched.json().title).toBe("Modifiée hors ligne");
      expect(fetched.json().status).toBe("DONE");
    });

    it("rejette une op plus ancienne (conflit : la version serveur gagne)", async () => {
      const task = await createTaskViaApi({ title: "Mention du serveur" });

      const res = await pushOps([
        {
          type: "UPDATE",
          opId: "op-up-2",
          id: task.id,
          doc: snapshot({ id: task.id, title: "Ancienne op", updatedAt: PAST, createdAt: PAST }),
        },
      ]);

      const body = res.json();
      expect(body.applied).toHaveLength(0);
      expect(body.conflicts).toHaveLength(1);
      expect(body.conflicts[0].opId).toBe("op-up-2");
      expect(body.conflicts[0].kept.title).toBe("Mention du serveur");
      expect(body.conflicts[0].rejectedUpdatedAt).toBe(PAST);

      const fetched = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}`,
        headers: authHeader(),
      });
      expect(fetched.json().title).toBe("Mention du serveur");
    });

    it("la tombe serveur gagne sur un UPDATE", async () => {
      const task = await createTaskViaApi();
      await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}`,
        headers: authHeader(),
      });

      const res = await pushOps([
        {
          type: "UPDATE",
          opId: "op-up-3",
          id: task.id,
          doc: snapshot({ id: task.id, title: "Zombie", updatedAt: FUTURE, createdAt: PAST }),
        },
      ]);

      const body = res.json();
      expect(body.applied).toHaveLength(0);
      expect(body.conflicts).toHaveLength(1);
      expect(body.conflicts[0].kept.deletedAt).toBeDefined();

      // La tâche reste supprimée côté serveur.
      const gone = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}`,
        headers: authHeader(),
      });
      expect(gone.statusCode).toBe(404);
    });

    it("upsert défensif : un UPDATE pour un id inconnu crée la tâche", async () => {
      const res = await pushOps([
        {
          type: "UPDATE",
          opId: "op-up-4",
          id: "66f1f1f1f1f1f1f1f1f1f1f2",
          doc: snapshot({ id: "66f1f1f1f1f1f1f1f1f1f1f2" }),
        },
      ]);

      expect(res.json().applied).toHaveLength(1);
      const fetched = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/66f1f1f1f1f1f1f1f1f1f1f2",
        headers: authHeader(),
      });
      expect(fetched.statusCode).toBe(200);
      expect(fetched.json().title).toBe("Créée hors ligne");
    });
  });

  // ── Push : suppression (LWW) ─────────────────────────────────────────────

  describe("POST /sync/push — DELETE", () => {
    it("applique une suppression logique plus récente", async () => {
      const task = await createTaskViaApi();

      const res = await pushOps([
        { type: "DELETE", opId: "op-del-1", id: task.id, deletedAt: FUTURE },
      ]);

      expect(res.json().applied).toHaveLength(1);
      expect(res.json().conflicts).toHaveLength(0);
      const gone = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}`,
        headers: authHeader(),
      });
      expect(gone.statusCode).toBe(404);
    });

    it("acquitte une suppression pour un id inconnu", async () => {
      const res = await pushOps([
        { type: "DELETE", opId: "op-del-2", id: "66f1f1f1f1f1f1f1f1f1f1f3", deletedAt: PAST },
      ]);

      const body = res.json();
      expect(body.applied).toHaveLength(1);
      expect(body.conflicts).toHaveLength(0);
      expect(body.applied[0].task).toBeUndefined();
    });

    it("rejette une suppression plus ancienne que la dernière mutation", async () => {
      const task = await createTaskViaApi({ title: "Restée vive" });

      const res = await pushOps([
        { type: "DELETE", opId: "op-del-3", id: task.id, deletedAt: PAST },
      ]);

      const body = res.json();
      expect(body.applied).toHaveLength(0);
      expect(body.conflicts).toHaveLength(1);
      expect(body.conflicts[0].kept.title).toBe("Restée vive");

      const fetched = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}`,
        headers: authHeader(),
      });
      expect(fetched.statusCode).toBe(200); // pas supprimée
    });
  });

  // ── Push : matérialisation d'occurrence hors ligne ────────────────────────

  describe("POST /sync/push — occurrence materialization", () => {
    const MON_1 = "2026-01-05T00:00:00.000Z";
    const MON_2 = "2026-01-12T00:00:00.000Z";

    async function createWeeklyParent() {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: authHeader(),
        payload: {
          title: "Rendez-vous hebdo",
          dueDate: MON_1,
          hasTime: false,
          recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
        },
      });
      expect(res.statusCode).toBe(201);
      return res.json();
    }

    it("crée une instance attachée au parent depuis un CREATE client", async () => {
      const parent = await createWeeklyParent();

      const res = await pushOps([
        {
          type: "CREATE",
          opId: "op-mat-1",
          doc: snapshot({
            id: "local:occ-1",
            title: "Rendez-vous hebdo",
            status: "DONE",
            parentTaskId: parent.id,
            originalDueDate: MON_2,
            dueDate: MON_2,
          }),
        },
      ]);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.conflicts).toHaveLength(0);
      expect(body.applied).toHaveLength(1);
      const instance = body.applied[0].task;
      expect(instance.parentTaskId).toBe(parent.id);
      expect(instance.originalDueDate).toBe(MON_2);
      expect(instance.status).toBe("DONE");

      // La fenêtre fusionne l'instance à la place de l'occurrence du 12 janvier.
      const range = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/range?start=2026-01-05T00:00:00Z&end=2026-01-27T00:00:00Z",
        headers: authHeader(),
      });
      const items = range.json().data;
      expect(items).toHaveLength(4);
      const instances = items.filter((t: { id: string }) => !t.id.startsWith("occ:"));
      expect(instances).toHaveLength(1);
      expect(instances[0].id).toBe(instance.id);
      expect(instances[0].status).toBe("DONE");
      // L'occurrence du 12 janvier est bien exclue (matérialisée).
      expect(
        items.filter(
          (t: { id: string; dueDate: string }) => t.id.startsWith("occ:") && t.dueDate === MON_2
        )
      ).toHaveLength(0);
    });

    it("refuse une matérialisation sans parent valide (400)", async () => {
      const res = await pushOps([
        {
          type: "CREATE",
          opId: "op-mat-2",
          doc: snapshot({
            parentTaskId: "66f1f1f1f1f1f1f1f1f1f1ff",
            originalDueDate: MON_2,
          }),
        },
      ]);
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Batch & validation ───────────────────────────────────────────────────

  describe("POST /sync/push — batch", () => {
    it("applique un lot de plusieurs opérations", async () => {
      const task = await createTaskViaApi();

      const res = await pushOps([
        { type: "CREATE", opId: "bat-1", doc: snapshot({ id: "local:a" }) },
        {
          type: "UPDATE",
          opId: "bat-2",
          id: task.id,
          doc: snapshot({ id: task.id, title: "Batch update", updatedAt: FUTURE, createdAt: PAST }),
        },
        { type: "DELETE", opId: "bat-3", id: "66f1f1f1f1f1f1f1f1f1f1f4", deletedAt: FUTURE },
      ]);

      const body = res.json();
      expect(body.applied).toHaveLength(3);
      expect(body.conflicts).toHaveLength(0);
      expect(body.applied.map((a: { opId: string }) => a.opId)).toEqual([
        "bat-1",
        "bat-2",
        "bat-3",
      ]);

      const fetched = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}`,
        headers: authHeader(),
      });
      expect(fetched.json().title).toBe("Batch update");
    });

    it("retourne 400 pour un type d'opération inconnu", async () => {
      const res = await pushOps([{ type: "NOPE", opId: "x" }]);
      expect(res.statusCode).toBe(400);
    });

    it("retourne 401 sans token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        payload: { operations: [] },
      });
      expect(res.statusCode).toBe(401);
    });

    it("scoppe les opérations : un UPDATE sur la tâche d'autrui est refusé, pas modifié", async () => {
      const other = await seedUser(app, { email: "other-sync@example.com" });
      const theirs = await app.db.collection("tasks").insertOne({
        userId: other.id,
        title: "Chez l'autre",
        priority: "P3",
        status: "TODO",
        hasTime: false,
        tags: [],
        subtasks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const theirsId = theirs.insertedId.toString();

      const res = await pushOps([
        {
          type: "UPDATE",
          opId: "u-1",
          id: theirsId,
          doc: snapshot({ id: theirsId, title: "Tentative", updatedAt: FUTURE, createdAt: PAST }),
        },
      ]);

      // Impossible d'appliquer sur le document d'autrui sans l'écraser : 409.
      expect(res.statusCode).toBe(409);

      const theirsDoc = await app.db.collection("tasks").findOne({ _id: theirs.insertedId });
      expect(theirsDoc?.title).toBe("Chez l'autre"); // intact
      expect(theirsDoc?.userId).toBe(other.id);
    });
  });
});
