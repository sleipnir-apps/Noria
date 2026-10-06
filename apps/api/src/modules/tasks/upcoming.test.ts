import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../test/helpers/build-app";
import { seedTask, seedUser } from "../../test/helpers/seed";
import { groupByLocalDay, serverDayKey, upcomingWindow } from "./task-upcoming";
import type { Task } from "@template/contracts";

describe("Task upcoming helpers (pure)", () => {
  it("serverDayKey formate YYYY-MM-DD sur l'horloge locale", () => {
    expect(serverDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(serverDayKey(new Date(2026, 10, 26))).toBe("2026-11-26");
  });

  it("upcomingWindow borne [minuit local, minuit local + N jours)", () => {
    const now = new Date(2026, 0, 13, 10, 30);
    const { start, end } = upcomingWindow(now, 14);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(13);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(27);
    expect(end.getHours()).toBe(0);
  });

  it("upcomingWindow traverse correctement une fin de mois", () => {
    const now = new Date(2026, 0, 20, 8);
    const { start, end } = upcomingWindow(now, 14);
    expect(end.getDate()).toBe(3);
    expect(end.getMonth()).toBe(1);
  });

  it("groupByLocalDay groupe, trie les jours et trie les tâches", () => {
    const mk = (id: string, dueDate: string): Task =>
      ({
        id,
        userId: "u",
        title: id,
        priority: "P3",
        status: "TODO",
        hasTime: false,
        tags: [],
        subtasks: [],
        dueDate,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }) as Task;
    const items = [
      mk("t-late", "2026-01-14T18:00:00.000Z"),
      mk("t-early", "2026-01-14T08:00:00.000Z"),
      mk("t-day2", "2026-01-16T00:00:00.000Z"),
      mk("t-day1", "2026-01-13T00:00:00.000Z"),
    ];
    const days = groupByLocalDay(items);
    expect(days.map((d) => d.date)).toEqual(["2026-01-13", "2026-01-14", "2026-01-16"]);
    expect(days[1]!.tasks.map((t) => t.id)).toEqual(["t-early", "t-late"]);
  });

  it("groupByLocalDay ignore les tâches sans date", () => {
    const mk = (id: string, dueDate?: string): Task =>
      ({
        id,
        userId: "u",
        title: id,
        priority: "P3",
        status: "TODO",
        hasTime: false,
        tags: [],
        subtasks: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...(dueDate !== undefined ? { dueDate } : {}),
      }) as Task;
    const days = groupByLocalDay([mk("backlog")]);
    expect(days).toEqual([]);
  });
});

describe("GET /tasks/upcoming", () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  // Ancres stables : janvier 2026 (lundis 5/12/19/26). Le NOW pivot est le
  // mardi 13 janvier 10:00Z.
  const MON_1 = "2026-01-05T00:00:00.000Z";
  const MON_2 = "2026-01-12T00:00:00.000Z";
  const MON_3 = "2026-01-19T00:00:00.000Z";
  const MON_4 = "2026-01-26T00:00:00.000Z";
  const TUESDAY_NOW = "2026-01-13T10:00:00.000Z";

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await app.db.collection("users").deleteMany({});
    await app.db.collection("tasks").deleteMany({});

    const user = await seedUser(app, { email: "upcoming@example.com" });
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

  it("retourne 401 sans token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/tasks/upcoming" });
    expect(res.statusCode).toBe(401);
  });

  it("rejette days > 60 avec 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/upcoming?days=61",
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(400);
  });

  it("applique le défaut days = 14 (aucun paramètre)", async () => {
    // Fenêtre 14 jours depuis le 13/01 : le 27/01 est la borne EXCLUSIVE.
    await createWeeklyTask({ dueDate: MON_3 }); // lundis 19 & 26 dedans, 2 fév dehors

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/upcoming?now=" + TUESDAY_NOW,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.generatedAt).toBeString();
    const dates = body.data.map((d: { date: string }) => d.date);
    expect(dates).toContain("2026-01-19");
    expect(dates).toContain("2026-01-26");
    expect(dates).not.toContain("2026-02-02");
  });

  it("borne la fenêtre sur days et exclut la borne de fin", async () => {
    // days=7 → [13/01 00:00 local, 20/01 00:00 local) : le lundi 19 dedans, le 26 dehors.
    await createWeeklyTask({ dueDate: MON_3 });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/upcoming?days=7&now=" + TUESDAY_NOW,
      headers: authHeader(),
    });
    const dates = res.json().data.map((d: { date: string }) => d.date);
    expect(dates).toContain("2026-01-19");
    expect(dates).not.toContain("2026-01-26");
  });

  it("marque is_occurrence sur les occurrences calculées et transmet les infos parent", async () => {
    await createWeeklyTask();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/upcoming?days=30&now=" + TUESDAY_NOW,
      headers: authHeader(),
    });
    const flatted = res.json().data.flatMap((d: { tasks: Task[] }) => d.tasks);
    const occurrences = flatted.filter((t: Task) => t.id.startsWith("occ:"));
    expect(occurrences.length).toBeGreaterThan(0);
    for (const occurrence of occurrences) {
      expect((occurrence as Task & { isOccurrence?: boolean }).isOccurrence).toBe(true);
      expect(occurrence.parentTaskId).toBeString();
      expect(occurrence.originalDueDate).toBe(occurrence.dueDate);
    }
  });

  it("exclut les occurrences déjà matérialisées (l'instance apparaît à la place)", async () => {
    const parent = await createWeeklyTask();
    // Occurrence FUTURE (le lundi 19, dans la fenêtre) matérialisée.
    await app.inject({
      method: "PATCH",
      url: `/api/v1/tasks/${parent.id}/occurrences/${MON_3}`,
      headers: authHeader(),
      payload: { status: "IN_PROGRESS" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/upcoming?days=30&now=" + TUESDAY_NOW,
      headers: authHeader(),
    });
    const flatted = res.json().data.flatMap((d: { tasks: Task[] }) => d.tasks);
    const synthetic = flatted.filter((t: Task) => t.id.startsWith("occ:") && t.dueDate === MON_3);
    expect(synthetic).toHaveLength(0);
    const instances = flatted.filter(
      (t: Task) =>
        t.parentTaskId === parent.id && t.originalDueDate === MON_3 && !t.id.startsWith("occ:")
    );
    expect(instances).toHaveLength(1);
    expect(instances[0]!.status).toBe("IN_PROGRESS");
  });

  it("exclut les tâches DONE de la vue", async () => {
    await seedTask(app, userId, {
      title: "Pain",
      dueDate: new Date("2026-01-15T18:00:00.000Z"),
      status: "DONE",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/upcoming?days=14&now=" + TUESDAY_NOW,
      headers: authHeader(),
    });
    const flatted = res.json().data.flatMap((d: { tasks: Task[] }) => d.tasks);
    expect(flatted).toHaveLength(0);
  });

  it("exclut les tâches ARCHIVED", async () => {
    await seedTask(app, userId, {
      title: "Dossier archivé",
      dueDate: new Date("2026-01-15T18:00:00.000Z"),
      status: "ARCHIVED",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/upcoming?days=14&now=" + TUESDAY_NOW,
      headers: authHeader(),
    });
    const flatted = res.json().data.flatMap((d: { tasks: Task[] }) => d.tasks);
    expect(flatted).toHaveLength(0);
  });

  it("exclut les tâches soft-deleted", async () => {
    const { id } = await seedTask(app, userId, {
      title: "Supprimée",
      dueDate: new Date("2026-01-15T18:00:00.000Z"),
    });
    await app.inject({ method: "DELETE", url: `/api/v1/tasks/${id}`, headers: authHeader() });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/upcoming?days=14&now=" + TUESDAY_NOW,
      headers: authHeader(),
    });
    expect(res.json().data).toHaveLength(0);
  });

  it("groupe chronologiquement par jour et trie au sein du jour", async () => {
    await seedTask(app, userId, {
      title: "Soir",
      dueDate: new Date("2026-01-15T18:00:00.000Z"),
    });
    await seedTask(app, userId, {
      title: "Matin",
      dueDate: new Date("2026-01-15T08:00:00.000Z"),
    });
    await seedTask(app, userId, {
      title: "Plus tard",
      dueDate: new Date("2026-01-20T00:00:00.000Z"),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/upcoming?days=10&now=" + TUESDAY_NOW,
      headers: authHeader(),
    });
    const body = res.json();
    expect(body.data.map((d: { date: string }) => d.date)).toEqual(["2026-01-15", "2026-01-20"]);
    expect(body.data[0].tasks.map((t: { title: string }) => t.title)).toEqual(["Matin", "Soir"]);
  });

  it("scopping : ne renvoie que ses propres tâches", async () => {
    const other = await seedUser(app, { email: "upcoming-other@example.com" });
    await seedTask(app, other.id, {
      title: "Chez l'autre",
      dueDate: new Date("2026-01-15T18:00:00.000Z"),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/upcoming?days=14&now=" + TUESDAY_NOW,
      headers: authHeader(),
    });
    expect(res.json().data).toHaveLength(0);
  });

  it("n'inclut pas le passé (l'occurrence manquée reste un sujet overdue)", async () => {
    await createWeeklyTask(); // MON_1 passé par rapport à NOW
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/upcoming?days=30&now=" + TUESDAY_NOW,
      headers: authHeader(),
    });
    const flatted = res.json().data.flatMap((d: { tasks: Task[] }) => d.tasks);
    expect(flatted.filter((t: Task) => t.dueDate === MON_1)).toHaveLength(0);
    expect(flatted.filter((t: Task) => t.dueDate === MON_3).length).toBe(1);
  });
});
