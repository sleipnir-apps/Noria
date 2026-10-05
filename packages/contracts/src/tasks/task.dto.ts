import { z } from "zod";
import {
  RecurrenceRuleSchema,
  SubtaskSchema,
  TaskPrioritySchema,
  TaskSchema,
  TaskStatusSchema,
} from "./task.schema";

export const CreateTaskSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    priority: TaskPrioritySchema.default("P3"),
    status: TaskStatusSchema.default("TODO"),
    due_date: z.iso.datetime().nullish(),
    has_time: z.boolean().default(false),
    tags: z.array(z.string().min(1).max(50)).max(20).default([]),
    subtasks: z.array(SubtaskSchema).max(100).default([]),
    recurrence_rule: RecurrenceRuleSchema.nullish(),
  })
  .strict();
export type CreateTaskDto = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullish(),
    priority: TaskPrioritySchema.optional(),
    status: TaskStatusSchema.optional(),
    due_date: z.iso.datetime().nullish(),
    has_time: z.boolean().optional(),
    tags: z.array(z.string().min(1).max(50)).max(20).optional(),
    subtasks: z.array(SubtaskSchema).max(100).optional(),
    recurrence_rule: RecurrenceRuleSchema.nullish(),
  })
  .strict();
export type UpdateTaskDto = z.infer<typeof UpdateTaskSchema>;

export const TaskFiltersSchema = z.object({
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  tag: z.string().optional(),
  // "1" → only tasks without a due date (backlog view)
  backlog: z.string().optional(),
});

export type TaskFilters = z.infer<typeof TaskFiltersSchema>;

export const CreateSubtaskDtoSchema = z.object({
  title: z.string().min(1).max(200),
});
export type CreateSubtaskDto = z.infer<typeof CreateSubtaskDtoSchema>;

// Materializing an occurrence (completion or postponement) of a recurring parent.
export const OccurrenceInputSchema = z.object({
  original_due_date: z.iso.datetime(),
  due_date: z.iso.datetime().optional(),
  status: TaskStatusSchema.optional(),
});
export type OccurrenceInput = z.infer<typeof OccurrenceInputSchema>;

// ── Offline-first sync (LWW) ────────────────────────────────────────────────

export const SyncTaskSchema = z
  .object({
    // Task id: 24-hex string, MongoDB ObjectId-compatible so the server can use
    // it directly as _id (no local→server mapping needed). Generated client-side
    // when the task is created offline.
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "id must be a 24-char hex (ObjectId-compatible)"),
    // Instances only: id of the recurring parent this occurrence materialized
    // (24-hex as well, same ObjectId-compatible constraint).
    parent_task_id: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .nullish(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullish(),
    priority: TaskPrioritySchema.optional(),
    status: TaskStatusSchema.optional(),
    due_date: z.iso.datetime().nullish(),
    has_time: z.boolean().optional(),
    tags: z.array(z.string().min(1).max(50)).max(20).optional(),
    subtasks: z.array(SubtaskSchema).max(100).optional(),
    recurrence_rule: RecurrenceRuleSchema.nullish(),
    original_due_date: z.iso.datetime().nullish(),
    updated_at: z.iso.datetime(),
    deleted_at: z.iso.datetime().nullish(),
  })
  .strict();
export type SyncTask = z.infer<typeof SyncTaskSchema>;

export const SyncOperationSchema = z.object({
  id: z.string(),
  op: z.enum(["upsert", "delete"]),
  task: SyncTaskSchema,
});

export type SyncOperation = z.infer<typeof SyncOperationSchema>;

export const SyncPushSchema = z.object({
  ops: z.array(SyncOperationSchema).max(200),
});
export type SyncPush = z.infer<typeof SyncPushSchema>;

export const SyncPushResponseSchema = z.object({
  applied: z.number().int().nonnegative(),
  conflicts: z.array(
    z.object({
      id: z.string(),
      kept: z.enum(["server", "client"]),
      rejected_updated_at: z.iso.datetime(),
    })
  ),
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;

export const SyncChangesResponseSchema = z.object({
  changes: z.array(TaskSchema),
  deletions: z.array(z.string()),
  server_time: z.iso.datetime(),
});
export type SyncChangesResponse = z.infer<typeof SyncChangesResponseSchema>;

// ── Views (range / overdue / backlog) ───────────────────────────────────────

export const TaskRangeResponseSchema = z.object({
  tasks: z.array(TaskSchema),
});
export type TaskRangeResponse = z.infer<typeof TaskRangeResponseSchema>;
