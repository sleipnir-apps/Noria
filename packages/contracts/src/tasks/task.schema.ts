import { z } from "zod";

export const TASK_PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"] as const;

export const TaskPrioritySchema = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * ISO instant that accepts an explicit UTC offset (e.g. "2026-10-05T00:00:00+02:00"):
 * date-only due dates are anchored on the client's local midnight at write time.
 */
export const IsoInstantSchema = z.iso.datetime({ offset: true });

export const SubtaskSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(100),
  isCompleted: z.boolean().default(false),
});
export type TaskSubtask = z.infer<typeof SubtaskSchema>;

/** Weekday numbers follow the `rrule` lib convention: 0 = Monday … 6 = Sunday. */
export const WeekdaySchema = z.number().int().min(0).max(6);
export const MonthDaySchema = z.number().int().min(1).max(31);

export const RecurrenceRuleSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  interval: z.coerce.number().int().min(1).max(366).default(1),
  byWeekday: z.array(WeekdaySchema).min(1).max(7).optional(),
  byMonthDay: z.array(MonthDaySchema).min(1).max(31).optional(),
  endDate: IsoInstantSchema.optional(),
});
export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  priority: TaskPrioritySchema.optional(),
  dueDate: IsoInstantSchema.optional(),
  hasTime: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(30)).max(10).optional(),
  subtasks: z.array(SubtaskSchema).max(50).optional(),
  recurrenceRule: RecurrenceRuleSchema.optional(),
});
export type CreateTaskDto = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullish(),
  priority: TaskPrioritySchema.optional(),
  status: TaskStatusSchema.optional(),
  // null = retirer la date (conversion datée → backlog). Définie = poser la date.
  dueDate: IsoInstantSchema.nullish(),
  hasTime: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(30)).max(10).optional(),
  subtasks: z.array(SubtaskSchema).max(50).optional(),
  // null = retirer la récurrence.
  recurrenceRule: RecurrenceRuleSchema.nullish(),
});
export type UpdateTaskDto = z.infer<typeof UpdateTaskSchema>;

/**
 * Occurrences are always derived from the parent: they never carry their own
 * rule. A strict object so recurrenceRule in the payload is rejected, not
 * silently stripped.
 */
const { recurrenceRule: _recurrenceRule, ...occurrenceShape } = UpdateTaskSchema.shape;
export const OccurrenceUpdateSchema = z.strictObject(occurrenceShape);
export type OccurrenceUpdateDto = z.infer<typeof OccurrenceUpdateSchema>;

export const TaskFiltersSchema = z.object({
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  /** "dated" = with a due date, "dateless" = backlog items, "all" = both. */
  dated: z.enum(["dated", "dateless", "all"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type TaskFilters = z.infer<typeof TaskFiltersSchema>;
