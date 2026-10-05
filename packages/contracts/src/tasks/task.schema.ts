import { z } from "zod";

export const TaskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(["P1", "P2", "P3", "P4"]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const SubtaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  is_completed: z.boolean().default(false),
});
export type Subtask = z.infer<typeof SubtaskSchema>;

export const RecurrenceRuleSchema = z
  .object({
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
    interval: z.number().int().positive(),
    by_weekday: z.array(z.number().int().min(0).max(6)).optional(),
    by_month_day: z.number().int().min(1).max(31).optional(),
    end_date: z.iso.datetime().optional(),
  })
  .strict();
export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;

const ISO_DATETIME = z.iso.datetime();

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  due_date: ISO_DATETIME.nullish(),
  has_time: z.boolean(),
  tags: z.array(z.string().min(1).max(50)).max(20),
  subtasks: z.array(SubtaskSchema),
  parent_task_id: z.string().nullish(),
  original_due_date: ISO_DATETIME.nullish(),
  recurrence_rule: RecurrenceRuleSchema.nullish(),
  deleted_at: ISO_DATETIME.nullish(),
  created_at: ISO_DATETIME,
  updated_at: ISO_DATETIME,
});

export type Task = z.infer<typeof TaskSchema>;
