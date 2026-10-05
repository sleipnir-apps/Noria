import type { TaskPriority, TaskSubtask } from "@template/contracts";
import { TaskPrioritySchema } from "@template/contracts";
import { z } from "zod";
import type { LocalTask } from "@/store/task.store";
import { newLocalId, type TaskPatch } from "@/features/tasks/task-mutations";
import { formatChipTime, localDateText, parseDueDateInput } from "@/features/tasks/local-date";

/** Editor form model — one Zod schema, reused by the screen with zodResolver. */

export const taskFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Le titre est obligatoire")
      .max(100, "Le titre est limité à 100 caractères"),
    description: z.string().max(500, "Description limitée à 500 caractères"),
    priority: TaskPrioritySchema,
    dateText: z.string(),
    timeText: z.string(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10, "10 étiquettes maximum"),
    // Plain shape here: the contracts default isCompleted, which breaks the
    // resolver's input/output typing against react-hook-form.
    subtasks: z
      .array(z.object({ id: z.string(), title: z.string(), isCompleted: z.boolean() }))
      .max(50, "50 sous-tâches maximum"),
    recurrenceEnabled: z.boolean(),
    recurrenceWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
  })
  .refine(({ dateText }) => dateText === "" || /^\d{4}-\d{2}-\d{2}$/.test(dateText), {
    message: "Date invalide (format AAAA-MM-JJ)",
    path: ["dateText"],
  })
  .refine(({ timeText }) => timeText === "" || /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeText), {
    message: "Heure invalide (format HH:MM)",
    path: ["timeText"],
  })
  .refine(
    ({ recurrenceEnabled, recurrenceWeekdays }) =>
      !recurrenceEnabled || recurrenceWeekdays.length > 0,
    { message: "Choisissez au moins un jour de récurrence", path: ["recurrenceWeekdays"] }
  );
export type TaskFormValues = z.infer<typeof taskFormSchema>;

/** Blank form (dateless backlog item). */
export function emptyFormValues(): TaskFormValues {
  return {
    title: "",
    description: "",
    priority: "P3",
    dateText: "",
    timeText: "",
    tags: [],
    subtasks: [],
    recurrenceEnabled: false,
    recurrenceWeekdays: [],
  };
}

/** Editable document → form values. */
export function formValuesFromTask(task: LocalTask): TaskFormValues {
  const dueDate = task.dueDate;
  const dateText = dueDate !== undefined ? localDateText(new Date(dueDate)) : "";
  const timeText = task.hasTime && dueDate !== undefined ? formatChipTime(dueDate) : "";
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    dateText,
    timeText,
    tags: [...task.tags],
    subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
    recurrenceEnabled: task.recurrenceRule !== undefined,
    recurrenceWeekdays: task.recurrenceRule?.byWeekday
      ? [...task.recurrenceRule.byWeekday].sort((a, b) => a - b)
      : [],
  };
}

/** Form values → the fields the mutations apply on a local task. */
export interface TaskFormDoc {
  title: string;
  description: string | undefined;
  priority: TaskPriority;
  dueDate: string | undefined; // undefined = backlog, ISO instant otherwise
  hasTime: boolean;
  tags: string[];
  subtasks: TaskSubtask[];
  recurrenceRule: NonNullable<LocalTask["recurrenceRule"]> | undefined;
}

export function docFromForm(values: TaskFormValues): TaskFormDoc {
  const parsed =
    values.dateText === ""
      ? null
      : parseDueDateInput(values.dateText, values.timeText || undefined);
  return {
    title: values.title,
    description: values.description === "" ? undefined : values.description,
    priority: values.priority,
    dueDate: parsed?.iso,
    hasTime: parsed?.hasTime ?? false,
    tags: values.tags,
    subtasks: values.subtasks,
    recurrenceRule: values.recurrenceEnabled
      ? {
          frequency: "WEEKLY",
          interval: 1,
          ...(values.recurrenceWeekdays.length > 0
            ? { byWeekday: [...values.recurrenceWeekdays].sort((a, b) => a - b) }
            : {}),
        }
      : undefined,
  };
}

/** New task from the form (mutation base for createTask). */
export function newTaskFromForm(
  values: TaskFormValues
): Omit<LocalTask, "id" | "createdAt" | "updatedAt" | "deletedAt"> {
  const doc = docFromForm(values);
  return {
    title: doc.title,
    ...(doc.description !== undefined ? { description: doc.description } : {}),
    priority: doc.priority,
    status: "TODO",
    ...(doc.dueDate !== undefined
      ? { dueDate: doc.dueDate, hasTime: doc.hasTime }
      : { hasTime: false }),
    tags: [...doc.tags],
    subtasks: doc.subtasks.map((subtask) => ({ ...subtask })),
    ...(doc.recurrenceRule !== undefined ? { recurrenceRule: doc.recurrenceRule } : {}),
  };
}

/** Edited task = full new snapshot of the document (updatedAt recomputed). */
export function taskPatchFromForm(values: TaskFormValues): TaskPatch {
  const doc = docFromForm(values);
  return {
    title: doc.title,
    description: doc.description,
    priority: doc.priority,
    dueDate: doc.dueDate,
    hasTime: doc.hasTime,
    tags: [...doc.tags],
    subtasks: doc.subtasks.map((subtask) => ({ ...subtask })),
    recurrenceRule: doc.recurrenceRule,
  };
}

export function blankSubtask(title: string): TaskSubtask {
  return { id: newLocalId("sub"), title, isCompleted: false };
}
