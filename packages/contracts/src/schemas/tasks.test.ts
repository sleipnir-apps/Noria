import { describe, expect, it } from "bun:test";
import {
  CreateTaskSchema,
  SyncOperationSchema,
  TaskRangeResponseSchema,
  TaskSchema,
  SyncPushResponseSchema,
  RecurrenceRuleSchema,
} from "../index";

describe("CreateTaskSchema", () => {
  it("valide une tâche minimale avec défauts", () => {
    const result = CreateTaskSchema.safeParse({ title: "Ma tâche" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe("P3");
      expect(result.data.status).toBe("TODO");
      expect(result.data.has_time).toBe(false);
      expect(result.data.tags).toEqual([]);
      expect(result.data.subtasks).toEqual([]);
    }
  });

  it("rejette un titre vide", () => {
    expect(CreateTaskSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("rejette une priorité invalide", () => {
    expect(CreateTaskSchema.safeParse({ title: "T", priority: "P5" }).success).toBe(false);
  });

  it("rejette les champs inconnus (strict)", () => {
    expect(CreateTaskSchema.safeParse({ title: "T", unknown_field: 1 }).success).toBe(false);
  });

  it("accepte due_date avec récurrence weekly + by_weekday", () => {
    expect(
      CreateTaskSchema.safeParse({
        title: "Weekly",
        due_date: "2026-10-05T09:00:00.000Z",
        recurrence_rule: { frequency: "WEEKLY", interval: 1, by_weekday: [1] },
      }).success
    ).toBe(true);
  });
});

describe("TaskSchema", () => {
  it("valide une tâche complète", () => {
    const result = TaskSchema.safeParse({
      id: "507f1f77bcf86cd799439011",
      title: "T",
      priority: "P1",
      status: "TODO",
      has_time: true,
      tags: ["work"],
      subtasks: [{ id: "a", title: "s", is_completed: false }],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepte une instance avec parent_task_id et original_due_date", () => {
    const result = TaskSchema.safeParse({
      id: "507f1f77bcf86cd799439011",
      title: "Occurrence",
      priority: "P3",
      status: "TODO",
      has_time: false,
      tags: [],
      subtasks: [],
      parent_task_id: "507f1f77bcf86cd799439012",
      original_due_date: "2026-10-05T09:00:00.000Z",
      due_date: "2026-10-07T09:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("RecurrenceRuleSchema", () => {
  it("rejette un intervalle zéro", () => {
    expect(RecurrenceRuleSchema.safeParse({ frequency: "DAILY", interval: 0 }).success).toBe(false);
  });

  it("rejette un weekday hors bornes", () => {
    expect(
      RecurrenceRuleSchema.safeParse({ frequency: "WEEKLY", interval: 1, by_weekday: [7] }).success
    ).toBe(false);
  });
});

describe("SyncOperationSchema", () => {
  it("valide une op upsert avec updated_at (id 24-hex)", () => {
    const result = SyncOperationSchema.safeParse({
      id: "local-1",
      op: "upsert",
      task: { id: "507f1f77bcf86cd799439011", title: "T", updated_at: "2026-01-01T00:00:00.000Z" },
    });
    expect(result.success).toBe(true);
  });

  it("rejette une op sans updated_at", () => {
    const result = SyncOperationSchema.safeParse({
      id: "local-1",
      op: "upsert",
      task: { id: "507f1f77bcf86cd799439011", title: "T" },
    });
    expect(result.success).toBe(false);
  });

  it("rejette un id non 24-hex", () => {
    const result = SyncOperationSchema.safeParse({
      id: "local-1",
      op: "upsert",
      task: { id: "uuid-invalide", title: "T", updated_at: "2026-01-01T00:00:00.000Z" },
    });
    expect(result.success).toBe(false);
  });

  it("valide une op delete (id seul)", () => {
    const result = SyncOperationSchema.safeParse({
      id: "local-2",
      op: "delete",
      task: { id: "507f1f77bcf86cd799439011", updated_at: "2026-01-01T00:00:00.000Z" },
    });
    expect(result.success).toBe(true);
  });

  it("rejette une op inconnue", () => {
    const result = SyncOperationSchema.safeParse({
      id: "x",
      op: "patch",
      task: { id: "507f1f77bcf86cd799439011", updated_at: "2026-01-01T00:00:00.000Z" },
    });
    expect(result.success).toBe(false);
  });
});

describe("SyncPushResponseSchema", () => {
  it("valide une réponse avec conflit", () => {
    const result = SyncPushResponseSchema.safeParse({
      applied: 1,
      conflicts: [{ id: "t1", kept: "server", rejected_updated_at: "2026-01-01T00:00:00.000Z" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("SyncChangesResponseSchema", () => {
  it("valide une réponse pull", () => {
    const result = TaskRangeResponseSchema.safeParse({ tasks: [] });
    expect(result.success).toBe(true);
  });
});
