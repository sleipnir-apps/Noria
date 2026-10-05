import { z } from "zod";
import { TaskDtoSchema } from "../tasks/task.dto";

/**
 * Pull response (GET /sync?since=...). `changes` carries the full documents
 * (tasks + materialized instances); `deletions` carries soft-deleted tasks
 * (deleted_at set) so clients can purge/flag their local cache.
 * `server_time` anchors the next `since`.
 */
export const SyncResponseSchema = z.object({
  changes: z.array(TaskDtoSchema),
  deletions: z.array(TaskDtoSchema),
  server_time: z.iso.datetime(),
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;

export const SyncPushOperationSchema = z.object({
  op: z.enum(["upsert", "delete"]),
  /** client-generated uuid */
  id: z.string().min(1).max(64),
  updated_at: z.iso.datetime(),
  /** required when op = upsert */
  data: TaskDtoSchema.partial().optional(),
});
export type SyncPushOperation = z.infer<typeof SyncPushOperationSchema>;

export const SyncPushBodySchema = z.object({
  operations: z.array(SyncPushOperationSchema).min(1).max(500),
});
export type SyncPushBody = z.infer<typeof SyncPushBodySchema>;

export const SyncPushResultSchema = z.object({
  applied: z.array(z.string()),
  conflicts: z.array(
    z.object({
      id: z.string(),
      /** the server-kept document's updated_at */
      kept: z.iso.datetime(),
      /** the rejected operation's updated_at */
      rejected_updated_at: z.iso.datetime(),
    })
  ),
});
export type SyncPushResult = z.infer<typeof SyncPushResultSchema>;
