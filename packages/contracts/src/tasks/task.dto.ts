import { z } from "zod";
import {
  IsoInstantSchema,
  RecurrenceRuleSchema,
  SubtaskSchema,
  TaskPrioritySchema,
  TaskStatusSchema,
} from "./task.schema";

export const TaskSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  hasTime: z.boolean(),
  dueDate: z.iso.datetime().optional(),
  tags: z.array(z.string()),
  subtasks: z.array(SubtaskSchema),
  recurrenceRule: RecurrenceRuleSchema.optional(),
  // Instances of a recurring task (materialized occurrences).
  parentTaskId: z.string().optional(),
  originalDueDate: z.iso.datetime().optional(),
  deletedAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Task = z.infer<typeof TaskSchema>;

/** Occurrences computed on the fly: same shape, synthetic id `occ:<parentId>:<iso>`. */
export type TaskOccurrence = Task;

export const TaskListResponseSchema = z.object({
  data: z.array(TaskSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  }),
});
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;

export const TaskRangeQuerySchema = z
  .object({
    start: IsoInstantSchema,
    end: IsoInstantSchema,
  })
  .refine(({ start, end }) => new Date(end).getTime() > new Date(start).getTime(), {
    message: "end must be after start",
  });
export type TaskRangeQuery = z.infer<typeof TaskRangeQuerySchema>;

export const TaskRangeResponseSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  data: z.array(TaskSchema),
});
export type TaskRangeResponse = z.infer<typeof TaskRangeResponseSchema>;

export const TaskOverdueResponseSchema = z.object({
  since: z.iso.datetime(),
  data: z.array(TaskSchema),
});
export type TaskOverdueResponse = z.infer<typeof TaskOverdueResponseSchema>;

/** GET /tasks/upcoming?days=… — window in days from today (device-local), clamped by the API. */
export const TaskUpcomingQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(60).default(14).optional(),
});
export type TaskUpcomingQuery = z.infer<typeof TaskUpcomingQuerySchema>;

/**
 * One day bucket of the "À venir" view. `date` is the device-local calendar
 * day "YYYY-MM-DD"; days without task are omitted by the server.
 */
export const UpcomingDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tasks: z.array(TaskSchema),
});
export type UpcomingDay = z.infer<typeof UpcomingDaySchema>;

export const TaskUpcomingResponseSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  days: z.number().int().min(1).max(60),
  data: z.array(UpcomingDaySchema),
});
export type TaskUpcomingResponse = z.infer<typeof TaskUpcomingResponseSchema>;

// ── Offline-first sync (pull + push) ─────────────────────────────────────────

/** GET /sync?since=<iso> — last-write-wins watermark sync. */
export const SyncPullQuerySchema = z.object({
  since: z.iso.datetime({ offset: true }),
});
export type SyncPullQuery = z.infer<typeof SyncPullQuerySchema>;

export const TaskDeletionSchema = z.object({
  id: z.string(),
  deletedAt: z.iso.datetime(),
});
export type TaskDeletion = z.infer<typeof TaskDeletionSchema>;

export const SyncPullResponseSchema = z.object({
  changes: z.array(TaskSchema),
  deletions: z.array(TaskDeletionSchema),
  serverTime: z.iso.datetime(),
});
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

/**
 * One queued mutation, sent as the post-mutation snapshot of the task.
 * The server resolves each operation against its local copy with LWW on
 * `updatedAt` — the newest wins, the loser is reported as a conflict.
 */
export const SyncDocSchema = z.object({
  id: z.string().max(64).optional(), // absent or "local:*" before the server assigns one
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  dueDate: IsoInstantSchema.optional(),
  hasTime: z.boolean(),
  tags: z.array(z.string().min(1).max(30)).max(10),
  subtasks: z.array(SubtaskSchema).max(50),
  recurrenceRule: RecurrenceRuleSchema.optional(),
  parentTaskId: z.string().optional(),
  originalDueDate: IsoInstantSchema.optional(),
  createdAt: IsoInstantSchema,
  updatedAt: IsoInstantSchema,
});
export type SyncDoc = z.infer<typeof SyncDocSchema>;

export const SyncOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("CREATE"),
    opId: z.string().min(1).max(64),
    doc: SyncDocSchema,
  }),
  z.object({
    type: z.literal("UPDATE"),
    opId: z.string().min(1).max(64),
    id: z.string().min(1).max(64),
    doc: SyncDocSchema,
  }),
  z.object({
    type: z.literal("DELETE"),
    opId: z.string().min(1).max(64),
    id: z.string().min(1).max(64),
    deletedAt: IsoInstantSchema,
  }),
]);
export type SyncOperation = z.infer<typeof SyncOperationSchema>;

export const SyncPushSchema = z.object({
  operations: z.array(SyncOperationSchema).max(200),
});
export type SyncPushDto = z.infer<typeof SyncPushSchema>;

export const AppliedOperationSchema = z.object({
  opId: z.string(),
  id: z.string(), // server-assigned task id (useful when the client sent "local:*")
  // Absent for a no-op ack (e.g. DELETE of an unknown id).
  task: TaskSchema.optional(),
});
export type AppliedOperation = z.infer<typeof AppliedOperationSchema>;

export const SyncConflictSchema = z.object({
  opId: z.string(),
  id: z.string(),
  kept: TaskSchema,
  rejectedUpdatedAt: z.iso.datetime(),
});
export type SyncConflict = z.infer<typeof SyncConflictSchema>;

export const SyncPushResponseSchema = z.object({
  applied: z.array(AppliedOperationSchema),
  conflicts: z.array(SyncConflictSchema),
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;
