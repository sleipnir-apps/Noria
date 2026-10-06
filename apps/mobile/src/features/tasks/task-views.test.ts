import { describe, expect, it } from "bun:test";
import { computeUpcomingGroups } from "./task-views";
import type { LocalTask } from "@/store/task.store";

function mk(overrides: Partial<LocalTask> & { id: string }): LocalTask {
  const now = "2026-01-13T10:00:00.000Z";
  return {
    title: overrides.id,
    priority: "P3",
    status: "TODO",
    hasTime: false,
    tags: [],
    subtasks: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as LocalTask;
}

// Ancres : mardi 13 janvier 2026 (device local, TZ neutre dans les tests bun)
// lundis 12/19/26, mercredi 14, jeudi 15.
const NOW = new Date(2026, 0, 13, 10, 0);

describe("computeUpcomingGroups", () => {
  it("groupe par jour chronologique, jours vides skippés", () => {
    const tasks: Record<string, LocalTask> = {
      a: mk({ id: "a", dueDate: "2026-01-15T18:00:00.000Z" }),
      b: mk({ id: "b", dueDate: "2026-01-14T08:00:00.000Z" }),
      c: mk({ id: "c", dueDate: "2026-01-20T00:00:00.000Z" }),
    };
    const groups = computeUpcomingGroups(tasks, NOW);
    expect(groups.map((g) => g.date)).toEqual(["2026-01-14", "2026-01-15", "2026-01-20"]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["b"]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("exclut DONE daté, ARCHIVÉ et soft-deleted ; garde l'instance DONE de la série", () => {
    const tasks: Record<string, LocalTask> = {
      done: mk({ id: "done", dueDate: "2026-01-15T18:00:00.000Z", status: "DONE" }),
      archived: mk({ id: "archived", dueDate: "2026-01-15T18:00:00.000Z", status: "ARCHIVED" }),
      deleted: mk({
        id: "deleted",
        dueDate: "2026-01-15T18:00:00.000Z",
        deletedAt: "2026-01-14T00:00:00.000Z",
      }),
      instanceDone: mk({
        id: "inst1",
        dueDate: "2026-01-19T00:00:00.000Z",
        originalDueDate: "2026-01-19T00:00:00.000Z",
        parentTaskId: "parent1",
        status: "DONE",
      }),
    };
    const groups = computeUpcomingGroups(tasks, NOW);
    const flatted = groups.flatMap((g) => g.items);
    expect(flatted.map((i) => i.id)).toEqual(["inst1"]);
    expect(flatted[0]!.isOccurrence).toBe(false);
  });

  it("déroule les occurrences rrule futures non matérialisées (marqueur isOccurrence)", () => {
    const tasks: Record<string, LocalTask> = {
      parent1: mk({
        id: "parent1",
        dueDate: "2026-01-19T00:00:00.000Z",
        recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
      }),
    };
    const groups = computeUpcomingGroups(tasks, NOW);
    const flatted = groups.flatMap((g) => g.items);
    // lundis 19 et 26 dans la fenêtre 14j [13/01, 27/01)
    expect(flatted).toHaveLength(2);
    expect(flatted.every((i) => i.isOccurrence)).toBe(true);
    expect(flatted.every((i) => i.parentTaskId === "parent1")).toBe(true);
    expect(groups.map((g) => g.date)).toEqual(["2026-01-19", "2026-01-26"]);
  });

  it("remplace l'occurrence virtuelle par l'instance matérialisée (dédup)", () => {
    const tasks: Record<string, LocalTask> = {
      parent1: mk({
        id: "parent1",
        dueDate: "2026-01-19T00:00:00.000Z",
        recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
      }),
      inst1: mk({
        id: "inst1",
        dueDate: "2026-01-19T00:00:00.000Z",
        originalDueDate: "2026-01-19T00:00:00.000Z",
        parentTaskId: "parent1",
        status: "IN_PROGRESS",
      }),
    };
    const groups = computeUpcomingGroups(tasks, NOW);
    // Le 19 : l'instance remplace l'occurrence virtuelle ; le 26 reste virtuel.
    const day19 = groups.find((g) => g.date === "2026-01-19")!;
    expect(day19.items).toHaveLength(1);
    expect(day19.items[0]!.id).toBe("inst1");
    expect(day19.items[0]!.isOccurrence).toBe(false);
    const day26 = groups.find((g) => g.date === "2026-01-26")!;
    expect(day26.items).toHaveLength(1);
    expect(day26.items[0]!.isOccurrence).toBe(true);
  });

  it("borne la fenêtre : la borne de fin (27/01 avec days=14) est exclue", () => {
    const tasks: Record<string, LocalTask> = {
      a: mk({ id: "a", dueDate: "2026-01-27T00:00:00.000Z" }),
      b: mk({ id: "b", dueDate: "2026-01-26T00:00:00.000Z" }),
    };
    const groups = computeUpcomingGroups(tasks, NOW);
    const dates = groups.map((g) => g.date);
    expect(dates).toContain("2026-01-26");
    expect(dates).not.toContain("2026-01-27");
  });

  it("n'inclut pas le passé ni le backlog", () => {
    const tasks: Record<string, LocalTask> = {
      past: mk({ id: "past", dueDate: "2026-01-12T00:00:00.000Z" }),
      backlog: mk({ id: "backlog" }),
      today: mk({ id: "today", dueDate: "2026-01-13T18:00:00.000Z" }),
    };
    const groups = computeUpcomingGroups(tasks, NOW);
    const flatted = groups.flatMap((g) => g.items);
    expect(flatted.map((i) => i.id)).toEqual(["today"]);
  });
});
