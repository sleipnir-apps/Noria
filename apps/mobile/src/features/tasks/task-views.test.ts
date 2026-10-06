import { describe, expect, it } from "bun:test";
import type { LocalTask } from "@/store/task.store";
import { computeUpcomingGroups, type UpcomingGroup } from "@/features/tasks/task-views";
import { formatUpcomingDayLabel } from "@/features/tasks/local-date";

/**
 * "À venir" view computation, pure dataset → groups. Runs on bun:test with
 * the workspace's path aliases (bunfig/tsconfig paths).
 */

/** Local-midnight anchor of "now" for stable day keys. */
function at(reference: Date, dayOffset: number, hour = 9): Date {
  return new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() + dayOffset,
    hour
  );
}

const iso = (date: Date): string => date.toISOString();

function task(overrides: Partial<LocalTask> & { id: string }): LocalTask {
  const now = new Date().toISOString();
  return {
    title: "Tâche",
    priority: "P3",
    status: "TODO",
    hasTime: false,
    tags: [],
    subtasks: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const recordOf = (tasks: LocalTask[]): Record<string, LocalTask> =>
  Object.fromEntries(tasks.map((task) => [task.id, task]));

const flat = (groups: UpcomingGroup[]): string[] =>
  groups.flatMap((group) => group.items.map((item) => item.task.title));

describe("computeUpcomingGroups", () => {
  // A fixed reference: Wednesday Jan 14 2026 (local clock of the test runner).
  const now = new Date(2026, 0, 14, 10, 0, 0);

  it("groupe par jour chronologiquement et saute les jours vides", () => {
    const tasks = [
      task({ id: "a", title: "Dans 9 jours", dueDate: iso(at(now, 9)) }),
      task({ id: "b", title: "Demain matin", dueDate: iso(at(now, 1)) }),
      task({ id: "c", title: "Aujourd'hui", dueDate: iso(at(now, 0)) }),
    ];

    const groups = computeUpcomingGroups(recordOf(tasks), 14, now);

    expect(groups.map((group) => group.date)).toEqual(["2026-01-14", "2026-01-15", "2026-01-23"]);
    expect(flat(groups)).toEqual(["Aujourd'hui", "Demain matin", "Dans 9 jours"]);
  });

  it("exclut le passé, DONE, ARCHIVED, soft-delete, backlog et parents récurrents", () => {
    const parent = task({
      id: "parent",
      title: "Série",
      dueDate: iso(new Date(2026, 0, 5, 9)), // lundi 5 janvier (heure locale du runner)
      recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [1] }, // lundis (conv. rrule)
    });
    const tasks = [
      task({ id: "old", title: "Hier", dueDate: iso(at(now, -1)) }),
      task({ id: "done", title: "Finie", dueDate: iso(at(now, 2)), status: "DONE" }),
      task({ id: "arch", title: "Archivée", dueDate: iso(at(now, 2)), status: "ARCHIVED" }),
      task({
        id: "del",
        title: "Supprimée",
        dueDate: iso(at(now, 2)),
        deletedAt: new Date().toISOString(),
      }),
      task({ id: "backlog", title: "Backlog" }),
      parent,
      // Une vraie instance planifiée reste visible (tâche ouverte datée),
      // ancrée exactement sur l'occurrence du lundi 19 (même heure locale).
      task({
        id: "inst",
        title: "Instance ouverte de la série",
        dueDate: iso(new Date(2026, 0, 19, 9)),
        parentTaskId: "parent",
        originalDueDate: iso(new Date(2026, 0, 19, 9)),
      }),
    ];

    const groups = computeUpcomingGroups(recordOf(tasks), 14, now);

    // Parent (lundi 5) → occurrences lundis 19 et 26 ; le 19 est matérialisé
    // par `inst` (ouvert) → l'instance remplace l'occurrence, le 26 reste une
    // occurrence calculée.
    const day19 = groups.find((group) => group.date === "2026-01-19");
    expect(day19?.items.map((item) => item.id)).toEqual(["inst"]);
    expect(day19?.items[0]?.isOccurrence).toBe(false);
    // Lundi 26 : l'occurrence calculée reste visible (pas matérialisée).
    expect(flat(groups)).toEqual(["Instance ouverte de la série", "Série", "Série"]);
  });

  it("déplie les occurrences rrule des parents actifs dans la fenêtre, marque isOccurrence", () => {
    const parent = task({
      id: "parent",
      title: "Sprint",
      priority: "P2",
      tags: ["travail"],
      dueDate: iso(new Date(2026, 0, 5, 0, 0)), // lundi 5 janvier
      recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] }, // lundis
    });

    const groups = computeUpcomingGroups(recordOf([parent]), 14, now);

    // Lundis dans [14 janv, 28 janv) : 19 et 26 (carnet local).
    expect(groups.map((group) => group.date)).toEqual(["2026-01-19", "2026-01-26"]);
    const all = groups.flatMap((group) => group.items);
    expect(all).toHaveLength(2);
    for (const item of all) {
      expect(item.isOccurrence).toBe(true);
      expect(item.parentTaskId).toBe("parent");
      expect(item.task.title).toBe("Sprint");
      expect(item.task.priority).toBe("P2");
      expect(item.task.tags).toEqual(["travail"]);
      expect(item.originalDueDate).toBe(item.task.dueDate);
    }
  });

  it("exclut les occurrences déjà matérialisées (l'instance remplace l'occurrence)", () => {
    const parent = task({
      id: "parent",
      title: "Série",
      dueDate: iso(new Date(2026, 0, 8, 8)), // jeudi 8 janvier 08:00 (tz locale du runner)
      recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [3] }, // jeudis
    });
    // Jeudi 15 janv. : ancré au même instant local que l'occurrence rrule.
    const occurrenceInstant = (() => {
      // Reconstitue l'instant du jeudi 15 à l'heure du parent, comme rrule :
      // dtstart local 08:00 → occurrences locales 08:00.
      return new Date(2026, 0, 15, 8);
    })();
    const materialized = task({
      id: "inst-open",
      title: "Série",
      dueDate: iso(occurrenceInstant),
      parentTaskId: "parent",
      originalDueDate: iso(occurrenceInstant),
    });

    const groups = computeUpcomingGroups(recordOf([parent, materialized]), 14, now);
    // Jan 15 shows the instance only (occurrence matérialisée exclue);
    // Jan 22 shows the computed occurrence; nothing elsewhere.
    const expected15 = "2026-01-15";
    const expected22 = "2026-01-22";
    const jan15 = groups.find((group) => group.date === expected15);
    const jan22 = groups.find((group) => group.date === expected22);
    expect(jan15?.items).toHaveLength(1);
    expect(jan15?.items[0]?.id).toBe("inst-open");
    expect(jan15?.items[0]?.isOccurrence).toBe(false);
    expect(jan22?.items[0]?.isOccurrence).toBe(true);
    expect(flat(groups)).toEqual(["Série", "Série"]);
  });

  it("trier par priorité à instant égal, bornes de fenêtre exactes", () => {
    const boundary = at(now, 14); // borne exclusive
    const tasks = [
      task({ id: "in", title: "Jour 13", dueDate: iso(at(now, 13)) }),
      task({ id: "out", title: "Borne exacte", dueDate: iso(boundary) }),
      task({ id: "p1", title: "P1 même instant", priority: "P1", dueDate: iso(at(now, 2, 7)) }),
      task({ id: "p4", title: "P4 même instant", priority: "P4", dueDate: iso(at(now, 2, 7)) }),
    ];

    const groups = computeUpcomingGroups(recordOf(tasks), 14, now);

    expect(flat(groups)).not.toContain("Borne exacte");
    const day2 = groups.find((group) => group.date === "2026-01-16");
    expect(day2?.items.map((item) => item.task.priority)).toEqual(["P1", "P4"]);
  });

  it("formatUpcomingDayLabel nomme aujourd'hui, demain, puis la date", () => {
    const today = new Date(2026, 0, 14);
    expect(formatUpcomingDayLabel("2026-01-14", today)).toBe("Aujourd'hui");
    expect(formatUpcomingDayLabel("2026-01-15", today)).toBe("Demain");
    expect(formatUpcomingDayLabel("2026-01-20", today)).toBe("mardi 20 janvier");
  });
});
