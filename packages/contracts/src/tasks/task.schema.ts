import { z } from "zod";

export const TaskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(["P1", "P2", "P3", "P4"]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskFrequencySchema = z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
export type TaskFrequency = z.infer<typeof TaskFrequencySchema>;

export const TaskWeekdaySchema = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
export type TaskWeekday = z.infer<typeof TaskWeekdaySchema>;

export const TaskSubtaskSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  is_completed: z.boolean(),
});
export type TaskSubtask = z.infer<typeof TaskSubtaskSchema>;

export const RecurrenceRuleSchema = z
  .object({
    frequency: TaskFrequencySchema,
    interval: z.number().int().min(1).max(52),
    by_weekday: z.array(TaskWeekdaySchema).max(7).optional(),
    by_month_day: z.number().int().min(1).max(31).optional(),
    end_date: z.iso.datetime().nullable().optional(),
  })
  .refine(
    (rule) =>
      rule.frequency !== "WEEKLY" ||
      (rule.by_weekday !== undefined && rule.by_weekday.length > 0) ||
      rule.end_date === undefined,
    { message: "WEEKLY recurrence requires by_weekday" }
  )
  .refine((rule) => rule.frequency !== "MONTHLY" || rule.by_month_day !== undefined, {
    message: "MONTHLY recurrence requires by_month_day",
  });
export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;
