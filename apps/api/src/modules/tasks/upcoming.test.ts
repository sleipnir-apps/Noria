import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../test/helpers/build-app";
import { seedTask, seedUser } from "../../test/helpers/seed";

/**
 * GET /tasks/upcoming — fenêtre [aujourd'hui, aujourd'hui + days) :
 * groupement chronologique par jour, occurrences rrule des parents actifs
 * (hors occurrences déjà matérialisées), exclusions DONE/ARCHIVED/soft-del.
 * Le endpoint accepte ?now= pour ancrer l'horloge du test.
 */

describe("Tasks upcoming", () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  // Ancres stables : lundi 5 janvier 2026 (les lundis sont les 5, 12, 19, 26),
  // "aujourd'hui" du test = mardi 13 janvier 10:00Z.
  const NOW = "2026-01-13T10:00:00.000Z";
  const MON_1 = "2026-01-05T00:00:00.000Z"; // passé
  const MON_3 = "2026-01-19T00:00:00.000Z"; // upcoming (J+6)
  const NEXT_TUESDAY = "2026-01-27T00:00:00.000Z"; // J+14 : hors fenêtre de 14 jours

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

  async function getUpcoming(query = `?now=${NOW}`) {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/upcoming${query}`,
      headers: authHeader(),
    });
    return { res, body: res.statusCode === 200 ? (res.json() as UpcomingBody) : null };
  }

  interface UpcomingBody {
    start: string;
    end: string;
    days: number;
    data: Array<{ date: string; tasks: Array<{ id: string; title: string; dueDate: string }> }>;
  }

  /** Flat map date → titles, the assertion workhorse of this suite. */
  function dayMap(body: UpcomingBody): Map<string, string[]> {
    return new Map(body.data.map((day) => [day.date, day.tasks.map((t) => t.title)]));
  }

  it("401 sans token", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/upcoming?now=${NOW}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("400 Quand la fenêtre dépasse le maximum de 60 jours", async () => {
    const { res } = await getUpcoming("?now=2026-01-13T10:00:00.000Z&days=61");
    expect(res.statusCode).toBe(400);
  });

  it("regroupe les tâches datées ouvertes par jour chronologique (jours vides skippés)", async () => {
    await seedTask(app, userId, {
      title: "Dans 3 jours",
      dueDate: new Date("2026-01-16T09:00:00Z"),
      hasTime: true,
    });
    await seedTask(app, userId, {
      title: "Aujourd'hui même",
      dueDate: new Date("2026-01-13T15:00:00Z"),
      hasTime: true,
    });
    // Même journée que le 16 : même groupe.
    await seedTask(app, userId, {
      title: "Le 16 aussi",
      dueDate: new Date("2026-01-16T20:00:00Z"),
      hasTime: true,
    });

    const { body } = await getUpcoming();
    expect(body!.days).toBe(14);
    expect(body!.data.map((d) => d.date)).toEqual(["2026-01-13", "2026-01-16"]); // jours vides skippés
    expect(dayMap(body!).get("2026-01-16")).toEqual(["Dans 3 jours", "Le 16 aussi"]);
  });

  it("exclut DONE, ARCHIVED et soft-deleted", async () => {
    await seedTask(app, userId, {
      title: "Finie",
      dueDate: new Date("2026-01-14T00:00:00Z"),
      status: "DONE",
    });
    await seedTask(app, userId, {
      title: "Archivée",
      dueDate: new Date("2026-01-14T00:00:00Z"),
      status: "ARCHIVED",
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
    await seedTask(app, userId, {
      title: "Ouverte",
      dueDate: new Date("2026-01-14T00:00:00Z"),
    });

    const { body } = await getUpcoming();
    expect(dayMap(body!).get("2026-01-14")).toEqual(["Ouverte"]);
  });

  it("exclut les occurrences déjà matérialisées et rapporte l'instance à sa place", async () => {
    const parent = await seedTask(app, userId, {
      title: "Hebdo",
      dueDate: new Date(MON_1),
      recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
    });
    await app.inject({
      method: "PATCH",
      url: `/api/v1/tasks/${parent.id}/occurrences/${MON_3}`,
      headers: authHeader(),
      payload: { status: "IN_PROGRESS" },
    });

    const { body } = await getUpcoming();
    expect(body).not.toBeNull();
    const daysWithTasks = dayMap(body!);
    // Le lundi 19 : l'instance matérialisée représente l'occurrence.
    expect(daysWithTasks.get("2026-01-19")).toEqual(["Hebdo"]);
    const day19 = body!.data.find((d) => d.date === "2026-01-19")!;
    expect(day19.tasks[0]!.id.startsWith("occ:")).toBe(false);
    // Le lundi 26 : occurrence calculée pure.
    const day26 = body!.data.find((d) => d.date === "2026-01-26")!;
    expect(day26.tasks[0]!.id.startsWith("occ:")).toBe(true);
    expect(day26.tasks[0]!.title).toBe("Hebdo");
  });

  it("n'embarque ni les parents récurrents eux-mêmes ni leurs occurrences passées", async () => {
    const parent = await seedTask(app, userId, {
      title: "Parent récurrent",
      dueDate: new Date(MON_1),
      recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
    });

    const { body } = await getUpcoming();
    const all = body!.data.flatMap((d) => d.tasks);
    // 2 occurrences futures (19 et 26)
    const titles = all.map((t) => t.title);
    expect(titles.filter((t) => t === "Parent récurrent")).toHaveLength(2);
    // Le parent (document du 5 janvier) n'est pas listé.
    expect(all.every((t) => t.id !== parent.id)).toBe(true);
    // Pas de jour "2026-01-05" ni "2026-01-12" dans les groupes.
    expect(body!.data.map((d) => d.date)).not.toContain("2026-01-05");
    expect(body!.data.map((d) => d.date)).not.toContain("2026-01-12");
  });

  it("borne la fenêtre : start < dueDate < end (J+14 exclus)", async () => {
    const parent = await seedTask(app, userId, {
      title: "Hebdo",
      dueDate: new Date(MON_1),
      recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
    });

    // Fenêtre de 14 jours à partir du 13 : [13 janv., 27 janv.) → les lundis 19 et 26 dedans, le mardi 27 dehors.
    const { body, res } = await getUpcoming(`?now=${NOW}&days=14`);
    expect(res.statusCode).toBe(200);
    expect(dayMap(body!).get("2026-01-26")).toEqual(["Hebdo"]);
    expect(body!.end).toBe(NEXT_TUESDAY);

    // Fenêtre de 7 jours : le lundi 19 dedans, le 26 dehors.
    const week = await getUpcoming(`?now=${NOW}&days=7`);
    expect(week.body!.data.map((d) => d.date)).toEqual(["2026-01-19"]);
    expect(week.body!.days).toBe(7);
    expect(parent).toBeDefined();
  });

  it("scopé à l'utilisateur : rien chez l'autre", async () => {
    const other = await seedUser(app, { email: "upcoming-other@example.com" });
    await seedTask(app, other.id, {
      title: "Chez l'autre",
      dueDate: new Date("2026-01-15T00:00:00Z"),
    });

    const { body } = await getUpcoming();
    expect(body!.data).toHaveLength(0);
  });
});
