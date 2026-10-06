import { describe, expect, it } from "bun:test";
import {
  CreateTaskSchema,
  OccurrenceUpdateSchema,
  RecurrenceRuleSchema,
  SyncPullQuerySchema,
  SyncPushSchema,
  TaskRangeQuerySchema,
  UpdateTaskSchema,
  UpcomingQuerySchema,
} from "../index";

describe("UpcomingQuerySchema", () => {
  it("applique la fenêtre par défaut de 14 jours et borne days à 60", () => {
    expect(UpcomingQuerySchema.parse({}).days).toBe(14);
    expect(UpcomingQuerySchema.parse({ days: "7" }).days).toBe(7);
    expect(UpcomingQuerySchema.safeParse({ days: 61 }).success).toBe(false);
    expect(UpcomingQuerySchema.safeParse({ days: 0 }).success).toBe(false);
  });
});

describe("CreateTaskSchema", () => {
  it("valide une tâche minimale (titre seul)", () => {
    const result = CreateTaskSchema.safeParse({ title: "Ma tâche" });
    expect(result.success).toBe(true);
  });

  it("valide une tâche datée avec récurrence", () => {
    const result = CreateTaskSchema.safeParse({
      title: "Réunion hebdo",
      dueDate: "2026-10-05T00:00:00Z",
      hasTime: false,
      recurrenceRule: { frequency: "WEEKLY", interval: 1, byWeekday: [0] },
    });
    expect(result.success).toBe(true);
  });

  it("rejette un titre vide", () => {
    expect(CreateTaskSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("rejette une dueDate qui n'est pas un instant ISO", () => {
    expect(CreateTaskSchema.safeParse({ title: "T", dueDate: "05/10/2026" }).success).toBe(false);
  });

  it("applique la priorité par défaut P3 via la couche service", () => {
    // CreateTaskSchema est volontairement sans défaut : le service pose P3.
    const result = CreateTaskSchema.safeParse({ title: "T" });
    expect(result.success && result.data.priority).toBeUndefined();
  });
});

describe("UpdateTaskSchema", () => {
  it("accepte une mise à jour partielle", () => {
    expect(UpdateTaskSchema.safeParse({ status: "DONE" }).success).toBe(true);
  });

  it("accepte dueDate: null (conversion datée → backlog)", () => {
    expect(UpdateTaskSchema.safeParse({ dueDate: null }).success).toBe(true);
  });

  it("rejette un status hors enum", () => {
    expect(UpdateTaskSchema.safeParse({ status: "FINISHED" }).success).toBe(false);
  });
});

describe("OccurrenceUpdateSchema", () => {
  it("n'autorise pas recurrenceRule sur une occurrence", () => {
    const result = OccurrenceUpdateSchema.safeParse({
      status: "DONE",
      recurrenceRule: { frequency: "DAILY", interval: 1 },
    });
    expect(result.success).toBe(false);
  });
});

describe("RecurrenceRuleSchema", () => {
  it("valide une règle weekly par jours de semaine", () => {
    const result = RecurrenceRuleSchema.safeParse({ frequency: "WEEKLY", byWeekday: [0, 4] });
    expect(result.success).toBe(true);
    expect(result.success && result.data.interval).toBe(1);
  });

  it("rejette un weekday hors 0..6", () => {
    expect(RecurrenceRuleSchema.safeParse({ frequency: "WEEKLY", byWeekday: [7] }).success).toBe(
      false
    );
  });

  it("rejette un byMonthDay à 0", () => {
    expect(RecurrenceRuleSchema.safeParse({ frequency: "MONTHLY", byMonthDay: [0] }).success).toBe(
      false
    );
  });
});

describe("TaskRangeQuerySchema", () => {
  it("valide un intervalle ISO avec offset", () => {
    const result = TaskRangeQuerySchema.safeParse({
      start: "2026-10-05T00:00:00+02:00",
      end: "2026-10-06T00:00:00+02:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejette un intervalle inversé", () => {
    const result = TaskRangeQuerySchema.safeParse({
      start: "2026-10-06T00:00:00Z",
      end: "2026-10-05T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("SyncPushSchema", () => {
  it("valide un batch CREATE / UPDATE / DELETE", () => {
    const result = SyncPushSchema.safeParse({
      operations: [
        {
          type: "CREATE",
          opId: "op-1",
          doc: {
            id: "local-abc",
            title: "Créée hors ligne",
            priority: "P3",
            status: "TODO",
            hasTime: false,
            tags: [],
            subtasks: [],
            createdAt: "2026-10-05T10:00:00Z",
            updatedAt: "2026-10-05T10:00:00Z",
          },
        },
        {
          type: "UPDATE",
          opId: "op-2",
          id: "6515e1a0f2d3c4b5a6d7e8f9",
          doc: {
            title: "Editee",
            priority: "P2",
            status: "TODO",
            hasTime: true,
            tags: [],
            subtasks: [],
            createdAt: "2026-10-05T10:00:00Z",
            updatedAt: "2026-10-05T11:00:00Z",
          },
        },
        {
          type: "DELETE",
          opId: "op-3",
          id: "6515e1a0f2d3c4b5a6d7e8fa",
          deletedAt: "2026-10-05T11:30:00Z",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejette une opération de type inconnu", () => {
    const result = SyncPushSchema.safeParse({
      operations: [{ type: "PATCH", opId: "op-1", id: "a", doc: {} }],
    });
    expect(result.success).toBe(false);
  });
});

describe("SyncPullQuerySchema", () => {
  it("valide un watermark ISO", () => {
    expect(SyncPullQuerySchema.safeParse({ since: "2026-10-05T10:00:00Z" }).success).toBe(true);
  });

  it("rejette un since non ISO", () => {
    expect(SyncPullQuerySchema.safeParse({ since: "hier" }).success).toBe(false);
  });
});
