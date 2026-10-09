import { describe, expect, it } from "bun:test";
import type { LocalTask } from "@/store/task.store";
import { UPCOMING_DAYS, computeUpcomingGroups } from "@/features/tasks/task-views";

/**
 * Tests of the "À venir" offline view. All tasks and anchors are built with
 * local Date constructors, so the expectations hold in any timezone: both the
 * view and the assertions interpret instants in the same local calendar.
 */

const NOW = new Date(2026, 0, 13, 12); // mardi 13 janvier 2026, midi

/** Midnight UTC of a local calendar day built from NOW's month (Jan 2026). */
const atLocal = (day: number, hour: number, minute = 0): string =>
  new Date(NOW.getFullYear(), NOW.getMonth(), day, hour, minute).toISOString();

let nextId = 0;

const makeTask = (fields: Partial<LocalTask>): LocalTask => {
  nextId += 1;
  const createdAt = new Date(2026, 0, 1, 8, nextId).toISOString();
  return {
    id: `t${nextId}`,
    title: `Tâche ${nextId}`,
    priority: "P2",
    status: "TODO",
    hasTime: true,
    tags: [],
    subtasks: [],
    createdAt,
    updatedAt: createdAt,
    ...fields,
  };
};

const asRecord = (tasks: LocalTask[]): Record<string, LocalTask> =>
  Object.fromEntries(tasks.map((task) => [task.id, task]));

const dateKeys = (tasks: LocalTask[], days = UPCOMING_DAYS): string[] =>
  computeUpcomingGroups(asRecord(tasks), NOW, days).map((group) => group.date);

describe("computeUpcomingGroups (à venir)", () => {
  it("groupe chronologiquement par jour et saute les jours vides", () => {
    const tasks = [
      makeTask({ title: "Aujourd'hui", dueDate: atLocal(13, 14) }),
      makeTask({ title: "Dateless", hasTime: false }),
      makeTask({ title: "Dans deux jours", dueDate: atLocal(15, 9) }),
    ];

    const groups = computeUpcomingGroups(asRecord(tasks), NOW);

    expect(groups.map((group) => group.date)).toEqual(["2026-01-13", "2026-01-15"]);
    expect(groups[0]?.items.map((item) => item.task.title)).toEqual(["Aujourd'hui"]);
    expect(groups[0]?.items[0]?.isOccurrence).toBe(false);
  });

  it("borne la fenêtre : [minuit local du jour, minuit + days×24h)", () => {
    const tasks = [
      // Hier 23:59:59.999 local → hors fenêtre.
      makeTask({ title: "Hier", dueDate: atLocal(12, 23, 59) }),
      // Aujourd'hui au plus tôt (00:00:00.000 local) → inclus.
      makeTask({ title: "Minuit", dueDate: atLocal(13, 0) }),
      makeTask({ title: "Hors fenêtre", dueDate: atLocal(27, 12) }),
      makeTask({ title: "Dernier jour", dueDate: atLocal(26, 12) }),
    ];

    expect(dateKeys(tasks)).toEqual(["2026-01-13", "2026-01-26"]);
  });

  it("exclut DONE, ARCHIVED, supprimées et le backlog", () => {
    const tasks = [
      makeTask({ title: "Terminée", status: "DONE", dueDate: atLocal(14, 9) }),
      makeTask({ title: "Archivée", status: "ARCHIVED", dueDate: atLocal(14, 9) }),
      makeTask({
        title: "Supprimée",
        dueDate: atLocal(14, 9),
        deletedAt: new Date(2026, 0, 13, 8).toISOString(),
      }),
      makeTask({ title: "En cours", status: "IN_PROGRESS", dueDate: atLocal(14, 9) }),
      makeTask({
        title: "Instance sans date",
        parentTaskId: "p1",
        hasTime: false,
      }),
    ];

    expect(dateKeys(tasks)).toEqual(["2026-01-14"]);
    expect(
      computeUpcomingGroups(asRecord(tasks), NOW)[0]?.items.map((item) => item.task.title)
    ).toEqual(["En cours"]);
  });

  it("affiche les occurrences hebdo parentes, hors instances matérialisées", () => {
    // Parent : chaque lundi, ancré sur le 2e lundi de janvier.
    const parent = makeTask({
      title: "Récurrente",
      recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
      dueDate: atLocal(12, 9),
      hasTime: false,
    });
    // Occurrence du lundi 19 cochée hors ligne → instance DONE matérialisée.
    const materialized = makeTask({
      title: "Instance du 19",
      status: "DONE",
      parentTaskId: parent.id,
      originalDueDate: atLocal(19, 9),
      dueDate: atLocal(19, 9),
      hasTime: false,
    });

    const groups = computeUpcomingGroups(asRecord([parent, materialized]), NOW);

    // Le 19 est matérialisé : seul l'occurrence du 26 reste.
    expect(groups.map((group) => group.date)).toEqual(["2026-01-26"]);
    const occurrence = groups[0]?.items[0];
    expect(occurrence?.isOccurrence).toBe(true);
    expect(occurrence?.parentTaskId).toBe(parent.id);
    expect(occurrence?.task.title).toBe("Récurrente");
    expect(occurrence?.key).toBe(`occ:${parent.id}:${groups[0]?.items[0]?.task.dueDate}`);
  });

  it("trie les tâches d'un même jour P1 avant P3", () => {
    const tasks = [
      makeTask({ title: "P3", priority: "P3", dueDate: atLocal(13, 9) }),
      makeTask({ title: "P1", priority: "P1", dueDate: atLocal(13, 9) }),
      makeTask({ title: "P2", priority: "P2", dueDate: atLocal(13, 9) }),
    ];

    expect(
      computeUpcomingGroups(asRecord(tasks), NOW)[0]?.items.map((item) => item.task.priority)
    ).toEqual(["P1", "P2", "P3"]);
  });

  it("respecte la longueur de fenêtre demandée (days)", () => {
    const tasks = [makeTask({ title: "Dans 4 jours", dueDate: atLocal(17, 9) })];

    // 13 + 4 jours → fin au 17 00:00 : le 17 09:00 est dehors.
    expect(computeUpcomingGroups(asRecord(tasks), NOW, 4)).toEqual([]);
    // 13 + 5 jours → fin au 18 00:00 : le 17 09:00 est dedans.
    expect(dateKeys(tasks, 5)).toEqual(["2026-01-17"]);
  });
});
