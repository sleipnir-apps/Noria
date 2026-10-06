import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../test/helpers/build-app";
import { seedTask, seedUser } from "../../test/helpers/seed";

/** GET /tasks/upcoming?days=N — "À venir" groups: window bounds, exclusions, ordering. */
describe("Tasks upcoming", () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  // Reference now inside the window under test: Wednesday Jan 14 2026, 10:00 UTC.
  const NOW = "2026-01-14T10:00:00.000Z";
  const FRI_16 = "2026-01-16T09:00:00Z"; // in window
  const THU_15 = "2026-01-15T18:00:00Z"; // in window
  const TUE_13 = "2026-01-13T09:00:00Z"; // before the window → excluded
  const MON_26 = "2026-01-26T09:00:00Z"; // day 12 of the window (still < +14d)
  const MON_5 = "2026-01-05T00:00:00.000Z";
  const RANGE_START = "2026-01-05T00:00:00Z";
  const RANGE_END = "2026-01-27T00:00:00Z"; // exclut le lundi 2 février

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

  interface Grouped {
    groups: Array<{ date: string; tasks: UpcomingTaskBody[] }>;
    window: { start: string; end: string };
  }

  interface RawResponse {
    statusCode: number;
    body: Grouped;
  }

  const upcoming = (query = ""): Promise<RawResponse> =>
    app
      .inject({
        method: "GET",
        url: `/api/v1/tasks/upcoming${query}`,
        headers: authHeader(),
      })
      .then((res) => ({ statusCode: res.statusCode, body: res.json() as Grouped }));

  interface UpcomingTaskBody {
    id: string;
    title: string;
    isOccurrence: boolean;
    status: string;
    dueDate?: string;
    originalDueDate?: string;
    parentTaskId?: string;
    priority?: string;
    tags?: string[];
  }

  interface Grouped {
    groups: Array<{ date: string; tasks: UpcomingTaskBody[] }>;
    window: { start: string; end: string };
  }

  const allTasks = (body: Grouped) => body.groups.flatMap((group) => group.tasks);

  // ── Window bounds ────────────────────────────────────────────────────────

  describe("boundaries", () => {
    it("excludes tasks due before 'now' and includes the window days", async () => {
      await seedTask(app, userId, { title: "Hier", dueDate: new Date(TUE_13) });
      await seedTask(app, userId, { title: "Aujourd'hui (fenêtre)", dueDate: new Date(NOW) });
      await seedTask(app, userId, { title: "Demain", dueDate: new Date(THU_15) });
      await seedTask(app, userId, { title: "Dans 2 jours", dueDate: new Date(FRI_16) });

      const { statusCode, body } = await upcoming(`?now=${encodeURIComponent(NOW)}`);

      expect(statusCode).toBe(200);
      const titles = allTasks(body).map((task) => task.title);
      expect(titles).not.toContain("Hier");
      expect(titles).toContain("Aujourd'hui (fenêtre)");
      expect(titles).toContain("Demain");
      expect(titles).toContain("Dans 2 jours");
      // Window echoes the request clock + days.
      expect(body.window.start).toBe(NOW);
      expect(new Date(body.window.end).getTime()).toBe(new Date(NOW).getTime() + 14 * 86_400_000);
    });

    it("enforces an exclusive end: task at now+days exactly is out", async () => {
      const endExclusive = new Date(new Date(NOW).getTime() + 14 * 86_400_000);
      await seedTask(app, userId, { title: "Dans 12 jours", dueDate: new Date(MON_26) });
      await seedTask(app, userId, { title: "À la borne exacte", dueDate: endExclusive });

      const { statusCode, body } = await upcoming(`?now=${encodeURIComponent(NOW)}`);

      expect(statusCode).toBe(200);
      const titles = allTasks(body).map((task) => task.title);
      expect(titles).toContain("Dans 12 jours");
      expect(titles).not.toContain("À la borne exacte");
    });

    it("caps days at 60 and defaults to 14", async () => {
      const tooBig = await upcoming("?days=61");
      expect(tooBig.statusCode).toBe(400);

      const ok = await upcoming("?days=60");
      expect(ok.statusCode).toBe(200);
      expect(new Date(ok.body.window.end).getTime()).toBe(
        new Date(ok.body.window.start).getTime() + 60 * 86_400_000
      );

      const { statusCode, body } = await upcoming();
      expect(statusCode).toBe(200);
      expect(new Date(body.window.end).getTime()).toBe(
        new Date(body.window.start).getTime() + 14 * 86_400_000
      );
    });
  });

  // ── Exclusions ───────────────────────────────────────────────────────────

  describe("exclusions", () => {
    it("excludes DONE, ARCHIVED and soft-deleted tasks", async () => {
      await seedTask(app, userId, { title: "Finie", dueDate: new Date(THU_15), status: "DONE" });
      await seedTask(app, userId, {
        title: "Archivée",
        dueDate: new Date(THU_15),
        status: "ARCHIVED",
      });
      await seedTask(app, userId, {
        title: "Supprimée",
        dueDate: new Date(THU_15),
        deletedAt: new Date(NOW),
      });
      const kept = await seedTask(app, userId, { title: "Ouverte", dueDate: new Date(THU_15) });

      const { statusCode, body } = await upcoming(`?now=${encodeURIComponent(NOW)}`);

      expect(statusCode).toBe(200);
      const titles = allTasks(body).map((task) => task.title);
      expect(titles).toEqual(["Ouverte"]);
      // The kept task keeps isOccurrence: false (real document).
      const item = allTasks(body).find((task) => task.title === "Ouverte");
      expect(item).toMatchObject({ id: kept.id, isOccurrence: false, status: "TODO" });
    });

    it("keeps IN_PROGRESS instances (open) and excludes DONE instances", async () => {
      const parent = await seedTask(app, userId, {
        title: "Série hebdo",
        dueDate: new Date(MON_5),
        recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
      });
      // Monday Jan 19 occurs in the window [Jan 14 → Jan 28); materialize it as DONE.
      await seedTask(app, userId, {
        title: "Série hebdo",
        dueDate: new Date("2026-01-19T00:00:00Z"),
        status: "DONE",
        parentTaskId: parent.id,
        originalDueDate: new Date("2026-01-19T00:00:00Z"),
      });

      const { statusCode, body } = await upcoming(`?now=${encodeURIComponent(NOW)}`);

      expect(statusCode).toBe(200);
      const tasks = allTasks(body);
      expect(tasks).toHaveLength(1);
      const instance = tasks[0]!;
      expect(instance.isOccurrence).toBe(true);
      expect(instance.dueDate).toBe("2026-01-26T00:00:00.000Z");
    });
  });

  // ── Occurrences ──────────────────────────────────────────────────────────

  describe("occurrences", () => {
    it("expands weekly occurrences of active parents, marking isOccurrence + parent info", async () => {
      await seedTask(app, userId, {
        title: "Sprint review",
        priority: "P1",
        dueDate: new Date(MON_5),
        tags: ["travail"],
        recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
      });

      const { statusCode, body } = await upcoming(`?now=${encodeURIComponent(NOW)}`);

      expect(statusCode).toBe(200);
      // Mondays Jan 19 and 26 fall in [Jan 14, Jan 28).
      expect(allTasks(body).map((task) => task.dueDate)).toEqual([
        "2026-01-19T00:00:00.000Z",
        "2026-01-26T00:00:00.000Z",
      ]);
      for (const task of allTasks(body)) {
        expect(task.isOccurrence).toBe(true);
        expect(task.title).toBe("Sprint review");
        expect(task.priority).toBe("P1");
        expect(task.tags).toEqual(["travail"]);
        expect(task.originalDueDate).toBe(task.dueDate);
        expect(typeof task.parentTaskId).toBe("string");
      }
    });

    it("excludes occurrences already materialized (instance replaces the occurrence)", async () => {
      const parent = await seedTask(app, userId, {
        title: "Série hebdo",
        dueDate: new Date(MON_5),
        recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
      });
      // Materialize the Jan 19 occurrence as DONE (instance, not occ:*).
      const patched = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${parent.id}/occurrences/2026-01-19T00:00:00.000Z`,
        headers: authHeader(),
        payload: { status: "DONE" },
      });
      expect(patched.statusCode).toBe(200);

      const { statusCode, body } = await upcoming(`?now=${encodeURIComponent(NOW)}`);

      expect(statusCode).toBe(200);
      const tasks = allTasks(body);
      // Only the un-materialized Jan 26 occurrence shows up: the Jan 19 one is
      // both an occurrence (excluded) and a DONE instance (excluded).
      expect(tasks.map((task) => task.dueDate)).toEqual(["2026-01-26T00:00:00.000Z"]);
      // The range view sees the DONE instance at the same slot (fusion parity).
      const range = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/range?start=${RANGE_START}&end=${RANGE_END}`,
        headers: authHeader(),
      });
      const rangeItems = range.json().data as Array<{ id: string; dueDate: string }>;
      const slotItem = rangeItems.find((item) => item.dueDate === "2026-01-19T00:00:00.000Z");
      expect(slotItem).toBeDefined();
      expect(slotItem!.id).not.toMatch(/^occ:/);
    });

    it("excludes occurrences of a soft-deleted parent and of an ARCHIVED parent", async () => {
      const doomed = await seedTask(app, userId, {
        title: "Série supprimée",
        dueDate: new Date(MON_5),
        recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
      });
      await seedTask(app, userId, {
        title: "Série archivée",
        dueDate: new Date(MON_5),
        status: "ARCHIVED",
        recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
      });
      await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${doomed.id}`,
        headers: authHeader(),
      });

      const { statusCode, body } = await upcoming(`?now=${encodeURIComponent(NOW)}`);
      expect(statusCode).toBe(200);
      expect(allTasks(body)).toHaveLength(0);
    });

    it("excludes tasks of other users", async () => {
      await seedTask(app, userId, { title: "À moi", dueDate: new Date(THU_15) });
      const other = await seedUser(app, { email: "other-upcoming@example.com" });
      await seedTask(app, other.id, { title: "Chez l'autre", dueDate: new Date(THU_15) });

      const { statusCode, body } = await upcoming(`?now=${encodeURIComponent(NOW)}`);
      expect(statusCode).toBe(200);
      expect(allTasks(body).map((task) => task.title)).toEqual(["À moi"]);
    });
  });

  // ── Grouping ─────────────────────────────────────────────────────────────

  describe("grouping", () => {
    it("groups by day chronologically with tasks sorted inside a day", async () => {
      // The Série parent anchors on MON_5 (00:00, P3); its occurrences land
      // on Thursdays Jan 15 + Jan 22 at 00:00Z. A P1 task sits on Jan 15 at
      // 18:00Z and another task on Jan 16.
      await seedTask(app, userId, {
        title: "P1 du jour",
        priority: "P1",
        dueDate: new Date(THU_15),
      });
      await seedTask(app, userId, {
        title: "Série",
        dueDate: new Date(MON_5),
        recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [3] },
      });
      await seedTask(app, userId, { title: "Jour suivant", dueDate: new Date(FRI_16) });

      const { statusCode, body } = await upcoming(`?now=${encodeURIComponent(NOW)}`);
      expect(statusCode).toBe(200);

      const dates = body.groups.map((group: { date: string }) => group.date);
      expect(dates).toEqual(["2026-01-15", "2026-01-16", "2026-01-22"]);

      const thursday = body.groups[0]!.tasks;
      expect(thursday).toHaveLength(2);
      // Same day, sorted by due instant: the 00:00Z occurrence before the 18:00Z task.
      expect(thursday[0]!.isOccurrence).toBe(true);
      expect(thursday[1]!.title).toBe("P1 du jour");
      expect(body.groups[1]!.tasks[0]!.title).toBe("Jour suivant");
      expect(body.groups[2]!.tasks[0]!.isOccurrence).toBe(true);
    });

    it("never emits a group for an empty day", async () => {
      await seedTask(app, userId, { title: "Seulement vendredi", dueDate: new Date(FRI_16) });

      const { statusCode, body } = await upcoming(`?now=${encodeURIComponent(NOW)}`);
      expect(statusCode).toBe(200);
      expect(body.groups).toHaveLength(1);
      expect(body.groups[0]!.date).toBe("2026-01-16");
    });
  });

  // ── Auth + misc ──────────────────────────────────────────────────────────

  it("retourne 401 sans token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/tasks/upcoming" });
    expect(res.statusCode).toBe(401);
  });
});
