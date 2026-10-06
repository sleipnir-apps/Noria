import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../test/helpers/build-app";
import { seedTask, seedUser } from "../../test/helpers/seed";

describe("Tasks routes", () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  // Ancres temporelles stables : janvier 2026, un mois dont les lundis sont
  // les 5, 12, 19 et 26.
  const MON_1 = "2026-01-05T00:00:00.000Z";
  const MON_2 = "2026-01-12T00:00:00.000Z";
  const MON_3 = "2026-01-19T00:00:00.000Z";
  const MON_4 = "2026-01-26T00:00:00.000Z";
  const TUESDAY_NOW = "2026-01-13T10:00:00.000Z"; // lendemain du 2e lundi
  const RANGE_START = "2026-01-05T00:00:00Z";
  const RANGE_END = "2026-01-27T00:00:00Z"; // exclut le lundi 2 février

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

  async function createWeeklyTask(payload: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: authHeader(),
      payload: {
        title: "Rendez-vous hebdo",
        dueDate: MON_1,
        hasTime: false,
        recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
        ...payload,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  // ── Create ───────────────────────────────────────────────────────────────

  describe("POST /tasks", () => {
    it("crée une tâche avec les valeurs par défaut (P3, TODO, backlog)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: authHeader(),
        payload: { title: "Acheter du pain" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.title).toBe("Acheter du pain");
      expect(body.priority).toBe("P3");
      expect(body.status).toBe("TODO");
      expect(body.hasTime).toBe(false);
      expect(body.tags).toEqual([]);
      expect(body.dueDate).toBeUndefined();
    });

    it("crée une tâche datée avec sous-tâches et tags", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: authHeader(),
        payload: {
          title: "Course matinale",
          priority: "P1",
          dueDate: "2026-01-05T08:30:00Z",
          hasTime: true,
          tags: ["sport", "santé"],
          subtasks: [{ id: "st-1", title: "Chaussettes", isCompleted: false }],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.priority).toBe("P1");
      expect(body.dueDate).toBe("2026-01-05T08:30:00.000Z");
      expect(body.hasTime).toBe(true);
      expect(body.tags).toEqual(["sport", "santé"]);
      expect(body.subtasks).toHaveLength(1);
    });

    it("accepte une dueDate en offset local (ancrage minuit local)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: authHeader(),
        payload: {
          title: "Sans heure",
          dueDate: "2026-01-05T00:00:00+02:00",
          hasTime: false,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().dueDate).toBe("2026-01-04T22:00:00.000Z");
    });

    it("rejette une tâche récurrente sans date d'échéance", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: authHeader(),
        payload: {
          title: "Récurrente malformée",
          recurrenceRule: { frequency: "WEEKLY", byWeekday: [1] },
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("retourne 401 sans token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        payload: { title: "X" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── List + scoping ───────────────────────────────────────────────────────

  describe("GET /tasks", () => {
    it("liste paginée scoppée à l'utilisateur", async () => {
      await seedTask(app, userId, { title: "À moi" });
      const other = await seedUser(app, { email: "other@example.com" });
      await seedTask(app, other.id, { title: "Pas à moi" });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?limit=20&page=1",
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("À moi");
      expect(body.meta.total).toBe(1);
    });

    it("filtre le backlog (sans date) et les tâches datées", async () => {
      await seedTask(app, userId, { title: "Backlog", dueDate: null });
      await seedTask(app, userId, { title: "Datée", dueDate: new Date(MON_2) });

      const backlog = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?dated=dateless",
        headers: authHeader(),
      });
      expect(backlog.json().data.map((t: { title: string }) => t.title)).toEqual(["Backlog"]);

      const dated = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?dated=dated",
        headers: authHeader(),
      });
      expect(dated.json().data.map((t: { title: string }) => t.title)).toEqual(["Datée"]);
    });
  });

  // ── Conversion backlog ↔ datée (PATCH générique) ─────────────────────────

  describe("PATCH /tasks/:id (conversion backlog ↔ datée)", () => {
    it("pose une date sur une tâche du backlog", async () => {
      const { id } = await seedTask(app, userId, { title: "Sans date", dueDate: null });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
        payload: { dueDate: MON_2 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().dueDate).toBe(MON_2);
    });

    it("retire la date (dueDate: null) pour repasser au backlog", async () => {
      const { id } = await seedTask(app, userId, { title: "Datée", dueDate: new Date(MON_2) });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
        payload: { dueDate: null },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().dueDate).toBeUndefined();
    });

    it("retire une récurrence (recurrenceRule: null)", async () => {
      const parent = await createWeeklyTask();

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${parent.id}`,
        headers: authHeader(),
        payload: { recurrenceRule: null },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().recurrenceRule).toBeUndefined();
    });

    it("refuse de dater une récurrence sans date d'échéance", async () => {
      const { id } = await seedTask(app, userId, { title: "Sans date", dueDate: null });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
        payload: { recurrenceRule: { frequency: "DAILY", interval: 1 } },
      });

      expect(res.statusCode).toBe(400);
    });

    it("refuse de retirer la date d'une tâche récurrente", async () => {
      const parent = await createWeeklyTask({ dueDate: MON_2 });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${parent.id}`,
        headers: authHeader(),
        payload: { dueDate: null },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Range : fusion rrule ─────────────────────────────────────────────────

  describe("GET /tasks/range", () => {
    it("fuse 4 lundis weekly (3 occurrences + 1 instance DONE après override)", async () => {
      const parent = await createWeeklyTask();

      // Vue initiale : 4 occurrences calculées (aucune matérialisée).
      const initial = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/range?start=${RANGE_START}&end=${RANGE_END}`,
        headers: authHeader(),
      });
      expect(initial.statusCode).toBe(200);
      let items = initial.json().data;
      expect(items).toHaveLength(4);
      expect(items.map((t: { dueDate: string }) => t.dueDate)).toEqual([
        MON_1,
        MON_2,
        MON_3,
        MON_4,
      ]);
      expect(items.every((t: { id: string }) => t.id.startsWith("occ:"))).toBe(true);
      expect(items.every((t: { status: string }) => t.status === "TODO")).toBe(true);

      // Complétion de la 2e occurrence → instance matérialisée DONE.
      const done = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${parent.id}/occurrences/${MON_2}`,
        headers: authHeader(),
        payload: { status: "DONE" },
      });
      expect(done.statusCode).toBe(200);
      expect(done.json().status).toBe("DONE");
      expect(done.json().id.startsWith("occ:")).toBe(false); // vraie instance

      const after = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/range?start=${RANGE_START}&end=${RANGE_END}`,
        headers: authHeader(),
      });
      items = after.json().data;
      // 4 items : 3 occurrences + la 1 instance (l'occurrence du 12 est exclue).
      expect(items).toHaveLength(4);
      const instances = items.filter((t: { id: string }) => !t.id.startsWith("occ:"));
      expect(instances).toHaveLength(1);
      expect(instances[0].status).toBe("DONE");
      expect(instances[0].parentTaskId).toBe(parent.id);
      expect(instances[0].originalDueDate).toBe(MON_2);
      expect(items.map((t: { dueDate: string }) => t.dueDate)[1]).toBe(MON_2);
      // L'instance remplace l'occurrence à la même place dans le tri par date.
      expect(items.map((t: { dueDate: string }) => t.dueDate)).toEqual([
        MON_1,
        MON_2,
        MON_3,
        MON_4,
      ]);
    });

    it("exclut les occurrences déjà matérialisées (instance encore TODO)", async () => {
      const parent = await createWeeklyTask();
      await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${parent.id}/occurrences/${MON_3}`,
        headers: authHeader(),
        payload: { status: "IN_PROGRESS" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/range?start=${RANGE_START}&end=${RANGE_END}`,
        headers: authHeader(),
      });

      const items = res.json().data;
      expect(items).toHaveLength(4);
      expect(items.filter((i: { status: string }) => i.status === "IN_PROGRESS")).toHaveLength(1);
      expect(items.filter((i: { id: string }) => i.id.startsWith("occ:"))).toHaveLength(3);
    });

    it("exclut les tâches supprimées (soft delete) et celles d'autres utilisateurs", async () => {
      const keep = await createWeeklyTask();
      const doomed = await createWeeklyTask({
        title: "À supprimer",
        dueDate: MON_1,
        recurrenceRule: { frequency: "DAILY", interval: 1 },
      });
      await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${doomed.id}`,
        headers: authHeader(),
      });

      const other = await seedUser(app, { email: "other@example.com" });
      await seedTask(app, other.id, {
        title: "Chez l'autre",
        dueDate: new Date(MON_2),
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/range?start=${RANGE_START}&end=${RANGE_END}`,
        headers: authHeader(),
      });

      const titles = res.json().data.map((t: { title: string }) => t.title);
      expect(titles).not.toContain("À supprimer");
      expect(titles).not.toContain("Chez l'autre");
      // Les 4 lundis du weekly restant + les dates de la tâche datée de l'autre exclues.
      expect(res.json().data).toHaveLength(4);
      expect(keep).toBeDefined(); // le parent reste actif, représenté par ses occurrences
      expect(titles.filter((t: string) => t === "Rendez-vous hebdo").length).toBeGreaterThan(0);
    });

    it("rapporte une instance reportée à sa nouvelle date", async () => {
      const parent = await createWeeklyTask();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${parent.id}/occurrences/${MON_2}`,
        headers: authHeader(),
        payload: { dueDate: "2026-01-13T09:00:00Z", status: "IN_PROGRESS" },
      });
      expect(res.statusCode).toBe(200);

      const range = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/range?start=${RANGE_START}&end=${RANGE_END}`,
        headers: authHeader(),
      });
      const titles = range.json().data.map((t: { title: string; dueDate: string }) => t.dueDate);
      expect(titles).not.toContain(MON_2); // occurrence exclue, rapportée ailleurs
      expect(titles).toContain("2026-01-13T09:00:00.000Z"); // l'instance vit au nouvel instant
    });
  });

  // ── Occurrence patch ─────────────────────────────────────────────────────

  describe("PATCH /tasks/:id/occurrences/:date", () => {
    it("muter deux fois la même occurrence met à jour la même instance", async () => {
      const parent = await createWeeklyTask();

      const first = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${parent.id}/occurrences/${MON_1}`,
        headers: authHeader(),
        payload: { status: "IN_PROGRESS" },
      });
      await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${parent.id}/occurrences/${MON_1}`,
        headers: authHeader(),
        payload: { status: "DONE" },
      });

      const range = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/range?start=${RANGE_START}&end=${RANGE_END}`,
        headers: authHeader(),
      });
      const instances = range.json().data.filter((t: { id: string }) => !t.id.startsWith("occ:"));
      expect(instances).toHaveLength(1);
      expect(instances[0].id).toBe(first.json().id);
      expect(instances[0].status).toBe("DONE");
    });

    it("ne modifie jamais le parent", async () => {
      const parent = await createWeeklyTask();
      await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${parent.id}/occurrences/${MON_1}`,
        headers: authHeader(),
        payload: { status: "DONE", title: "Renommé côté occurrence" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${parent.id}`,
        headers: authHeader(),
      });
      const body = res.json();
      expect(body.status).toBe("TODO");
      expect(body.title).toBe("Rendez-vous hebdo");
      expect(body.originalDueDate).toBeUndefined();
    });

    it("rejette une date qui n'est pas une occurrence", async () => {
      const parent = await createWeeklyTask();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${parent.id}/occurrences/2026-01-07T00:00:00Z`, // mercredi
        headers: authHeader(),
        payload: { status: "DONE" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Overdue ──────────────────────────────────────────────────────────────

  describe("GET /tasks/overdue", () => {
    it("liste les tâches datées en retard (TODO seulement)", async () => {
      await seedTask(app, userId, {
        title: "En retard",
        dueDate: new Date("2026-01-10T00:00:00Z"),
        status: "TODO",
      });
      await seedTask(app, userId, {
        title: "Finie à temps",
        dueDate: new Date("2026-01-10T00:00:00Z"),
        status: "DONE",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/overdue?now=${TUESDAY_NOW}`,
        headers: authHeader(),
      });

      const titles = res.json().data.map((t: { title: string }) => t.title);
      expect(titles).toContain("En retard");
      expect(titles).not.toContain("Finie à temps");
      expect(res.json().since).toBe(TUESDAY_NOW);
    });

    it("expose l'occurrence manquée d'un parent récurrent (une seule entrée, pas une par occurrence)", async () => {
      await createWeeklyTask();

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/overdue?now=${TUESDAY_NOW}`,
        headers: authHeader(),
      });

      const data = res.json().data;
      expect(data).toHaveLength(1);
      expect(data[0].id.startsWith("occ:")).toBe(true);
      expect(data[0].dueDate).toBe(MON_2); // la dernière occurrence manquée
    });

    it("vide le retard quand l'occurrence est complétée", async () => {
      const parent = await createWeeklyTask();
      await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${parent.id}/occurrences/${MON_2}`,
        headers: authHeader(),
        payload: { status: "DONE" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/overdue?now=${TUESDAY_NOW}`,
        headers: authHeader(),
      });
      expect(res.json().data).toHaveLength(0);
    });

    it("ignore les tâches supprimées et celles d'autres utilisateurs", async () => {
      const doomed = await seedTask(app, userId, {
        title: "Supprimée mais en retard",
        dueDate: new Date("2026-01-10T00:00:00Z"),
      });
      await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${doomed.id}`,
        headers: authHeader(),
      });
      const other = await seedUser(app, { email: "other2@example.com" });
      await seedTask(app, other.id, {
        title: "Retard chez l'autre",
        dueDate: new Date("2026-01-10T00:00:00Z"),
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/overdue?now=${TUESDAY_NOW}`,
        headers: authHeader(),
      });
      expect(res.json().data).toHaveLength(0);
    });
  });

  // ── Upcoming (« À venir ») ───────────────────────────────────────────────

  describe("GET /tasks/upcoming", () => {
    // now = mardi 13 janvier 10h → fenêtre défaut : [13T00:00Z, 27T00:00Z)
    const NOW = "2026-01-13T10:00:00.000Z";

    it("retourne 401 sans token", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/tasks/upcoming" });
      expect(res.statusCode).toBe(401);
    });

    it("regroupe par jour chronologiquement (jours vides omis) et marque les occurrences", async () => {
      const parent = await createWeeklyTask(); // lundis : 5, 12, 19, 26
      await seedTask(app, userId, {
        title: "Urgente",
        priority: "P1",
        dueDate: new Date("2026-01-13T08:00:00Z"),
      });
      await seedTask(app, userId, {
        title: "Course",
        priority: "P2",
        dueDate: new Date("2026-01-13T09:00:00Z"),
      });
      await seedTask(app, userId, {
        title: "Plus tard",
        dueDate: new Date("2026-01-15T00:00:00Z"),
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/upcoming?now=${NOW}`,
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.days).toBe(14); // défaut sans paramètre
      expect(body.start).toBe("2026-01-13T00:00:00.000Z");
      expect(body.end).toBe("2026-01-27T00:00:00.000Z");

      // Jours vides (16, 17, 18, 20…) omis.
      expect(body.data.map((g: { date: string }) => g.date)).toEqual([
        "2026-01-13",
        "2026-01-15",
        "2026-01-19",
        "2026-01-26",
      ]);

      const today = body.data[0].tasks;
      expect(today.map((t: { title: string }) => t.title)).toEqual(["Urgente", "Course"]);

      const monday19 = body.data[2].tasks;
      expect(monday19).toHaveLength(1);
      expect(monday19[0].id).toBe(`occ:${parent.id}:${MON_3}`);
      expect(monday19[0].isOccurrence).toBe(true);
      expect(monday19[0].parentTaskId).toBe(parent.id);
      expect(monday19[0].title).toBe("Rendez-vous hebdo"); // infos du parent
      expect(monday19[0].dueDate).toBe(MON_3);
    });

    it("respecte les bornes de fenêtre (aujourd'hui inclus, hier et end exclus)", async () => {
      await seedTask(app, userId, {
        title: "Aujourd'hui minuit",
        dueDate: new Date("2026-01-13T00:00:00Z"),
      });
      await seedTask(app, userId, {
        title: "Aujourd'hui soir",
        dueDate: new Date("2026-01-13T23:59:00Z"),
      });
      await seedTask(app, userId, { title: "Hier", dueDate: new Date("2026-01-12T23:00:00Z") });
      await seedTask(app, userId, {
        title: "Fin de fenêtre exacte",
        dueDate: new Date("2026-01-27T00:00:00Z"),
      });
      await seedTask(app, userId, {
        title: "Juste après la fin",
        dueDate: new Date("2026-01-27T00:01:00Z"),
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/upcoming?now=${NOW}`,
        headers: authHeader(),
      });

      const data = res.json().data;
      const titles = data.flatMap((g: { tasks: { title: string }[] }) =>
        g.tasks.map((t) => t.title)
      );
      expect(titles).toContain("Aujourd'hui minuit");
      expect(titles).toContain("Aujourd'hui soir");
      expect(titles).not.toContain("Hier"); // avant la fenêtre
      expect(titles).not.toContain("Fin de fenêtre exacte"); // end exclu (bornes [start, end))
      expect(titles).not.toContain("Juste après la fin");

      // days=15 élargit la fenêtre d'un jour : la borne end devient incluse.
      const wider = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/upcoming?days=15&now=${NOW}`,
        headers: authHeader(),
      });
      const wideTitles = wider
        .json()
        .data.flatMap((g: { tasks: { title: string }[] }) => g.tasks.map((t) => t.title));
      expect(wideTitles).toContain("Juste après la fin");
      expect(wider.json().days).toBe(15);
    });

    it("exclut DONE, ARCHIVED, soft-deleted, autres utilisateurs", async () => {
      await seedTask(app, userId, {
        title: "Déjà finie",
        status: "DONE",
        dueDate: new Date("2026-01-16T00:00:00Z"),
      });
      await seedTask(app, userId, {
        title: "Archivée",
        status: "ARCHIVED",
        dueDate: new Date("2026-01-17T00:00:00Z"),
      });
      await seedTask(app, userId, {
        title: "En cours",
        status: "IN_PROGRESS",
        dueDate: new Date("2026-01-18T00:00:00Z"),
      });
      const doomed = await seedTask(app, userId, {
        title: "Supprimée",
        dueDate: new Date("2026-01-14T00:00:00Z"),
      });
      await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${doomed.id}`,
        headers: authHeader(),
      });
      const other = await seedUser(app, { email: "other-upcoming@example.com" });
      await seedTask(app, other.id, {
        title: "Chez l'autre",
        dueDate: new Date("2026-01-20T00:00:00Z"),
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/upcoming?now=${NOW}`,
        headers: authHeader(),
      });

      const titles = res
        .json()
        .data.flatMap((g: { tasks: { title: string }[] }) => g.tasks.map((t) => t.title));
      expect(titles).not.toContain("Déjà finie");
      expect(titles).not.toContain("Archivée");
      expect(titles).not.toContain("Supprimée");
      expect(titles).not.toContain("Chez l'autre");
      expect(titles).toContain("En cours");
    });

    it("exclut les occurrences matérialisées, même statut DONE (disparaissent de la vue)", async () => {
      const parent = await createWeeklyTask();

      // L'occurrence du lundi 19 est terminée : ni occurrence ni instance ouverte.
      await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${parent.id}/occurrences/${MON_3}`,
        headers: authHeader(),
        payload: { status: "DONE" },
      });
      // Celle du lundi 26 est en cours : l'instance remplace l'occurrence.
      await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${parent.id}/occurrences/${MON_4}`,
        headers: authHeader(),
        payload: { status: "IN_PROGRESS" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/upcoming?now=${NOW}`,
        headers: authHeader(),
      });

      const body = res.json();
      // Le 19 est terminé → jour vide (ni occurrence, ni instance ouverte, ni instance DONE).
      expect(body.data.map((g: { date: string }) => g.date)).toEqual(["2026-01-26"]);

      const inProgress = body.data[0].tasks as Array<{
        id: string;
        status: string;
        parentTaskId: string;
        originalDueDate: string;
        isOccurrence?: boolean;
      }>;
      expect(inProgress).toHaveLength(1);
      expect(inProgress[0]?.status).toBe("IN_PROGRESS");
      expect(inProgress[0]?.parentTaskId).toBe(parent.id);
      expect(inProgress[0]?.originalDueDate).toBe(MON_4);
      expect(inProgress[0]?.id.startsWith("occ:")).toBe(false); // vraie instance stockée
      expect(inProgress[0]?.isOccurrence).toBeUndefined();
    });

    it("rejette une fenêtre invalide (days hors [1, 60])", async () => {
      for (const days of ["0", "61"]) {
        const res = await app.inject({
          method: "GET",
          url: `/api/v1/tasks/upcoming?days=${days}&now=${NOW}`,
          headers: authHeader(),
        });
        expect(res.statusCode).toBe(400);
      }
      const notNumber = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/upcoming?days=quatorze&now=${NOW}`,
        headers: authHeader(),
      });
      expect(notNumber.statusCode).toBe(400);
    });
  });

  // ── Soft delete ──────────────────────────────────────────────────────────

  describe("DELETE /tasks/:id", () => {
    it("supprime logiquement et masque de toutes les vues", async () => {
      const { id } = await seedTask(app, userId, { title: "Adieu" });

      const del = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
      });
      expect(del.statusCode).toBe(204);

      const gone = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${id}`,
        headers: authHeader(),
      });
      expect(gone.statusCode).toBe(404);

      const list = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: authHeader(),
      });
      expect(list.json().data).toHaveLength(0);
    });
  });
});
