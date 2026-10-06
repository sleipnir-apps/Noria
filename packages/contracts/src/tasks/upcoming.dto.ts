import { z } from "zod";
import { IsoInstantSchema, TaskSchema } from "./task.dto";

/**
 * GET /tasks/upcoming?days=N — horizon in days from today (device calendar):
 * default 14, hard max 60 (the view is a radar, not a calendar).
 * `now` overrides the server clock (tests).
 */
export const TaskUpcomingQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(60).default(14),
  now: IsoInstantSchema.optional(),
});
export type TaskUpcomingQuery = z.infer<typeof TaskUpcomingQuerySchema>;

/** One calendar day of an upcoming view. */
export const UpcomingDaySchema = z
  .object({
    /** Local calendar day key "YYYY-MM-DD". */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tasks: z.array(TaskSchema),
  })
  .superRefine((day, ctx) => {
    for (let i = 1; i < day.tasks.length; i++) {
      const previous = day.tasks[i - 1]!.dueDate ?? "";
      const current = day.tasks[i]!.dueDate ?? "";
      if (previous.localeCompare(current) > 0) {
        ctx.addIssue({
          code: "custom",
          message: "tasks must be sorted chronologically within a day",
        });
        break;
      }
    }
  });
export type UpcomingDay = z.infer<typeof UpcomingDaySchema>;

/** Grouped response, sorted by date ascending. Empty days are omitted. */
export const TaskUpcomingResponseSchema = z
  .object({
    /** Server clock when the view was built (sync watermark / debug). */
    generatedAt: z.iso.datetime(),
    data: z.array(UpcomingDaySchema),
  })
  .superRefine((body, ctx) => {
    for (let i = 1; i < body.data.length; i++) {
      if (body.data[i - 1]!.date.localeCompare(body.data[i]!.date) >= 0) {
        ctx.addIssue({ code: "custom", message: "data must be sorted by date ascending" });
        break;
      }
    }
  });
export type TaskUpcomingResponse = z.infer<typeof TaskUpcomingResponseSchema>;
