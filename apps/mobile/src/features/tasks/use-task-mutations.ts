import { useMemo } from "react";
import type { LocalTask } from "@/store/task.store";
import {
  completeOccurrence,
  createTask,
  deleteTask,
  saveOccurrence,
  setTaskStatus,
  toggleTaskDone,
  toggleSubtask,
  updateTask,
} from "@/features/tasks/task-mutations";
import { newTaskFromForm, taskPatchFromForm } from "@/features/tasks/task-form";
import type { TaskFormValues } from "@/features/tasks/task-form";

/** Stable action bundle for the screens (all writes go through the queue). */
export interface TaskActions {
  createFromForm(values: TaskFormValues): Promise<LocalTask>;
  /** Full-snapshot edit of an existing document (task or instance). */
  updateFromForm(task: LocalTask, values: TaskFormValues): Promise<void>;
  /** Edit / postpone a computed occurrence (materializes an instance offline). */
  updateOccurrenceFromForm(
    parentTaskId: string,
    originalDueDate: string,
    values: TaskFormValues
  ): Promise<void>;
  toggleDone(task: LocalTask): Promise<void>;
  setStatus(task: LocalTask, status: LocalTask["status"]): Promise<void>;
  toggleSubtaskCheckbox(task: LocalTask, subtaskId: string): Promise<void>;
  remove(task: LocalTask): Promise<void>;
  completeOccurrence(parentTaskId: string, originalDueDate: string, done: boolean): Promise<void>;
}

/** Form values → the patch used by saveOccurrence (keep the occurrence date by default). */
function occurrencePatchFromForm(values: TaskFormValues, originalDueDate: string) {
  const patch = taskPatchFromForm(values);
  return { ...patch, dueDate: patch.dueDate ?? originalDueDate };
}

export function useTaskActions(): TaskActions {
  return useMemo(
    () => ({
      createFromForm: (values) => createTask(newTaskFromForm(values)),
      updateFromForm: async (task, values) => {
        const patch = taskPatchFromForm(values);
        await updateTask({ ...task, ...patch, updatedAt: new Date().toISOString() });
      },
      updateOccurrenceFromForm: async (parentTaskId, originalDueDate, values) => {
        await saveOccurrence(
          parentTaskId,
          originalDueDate,
          occurrencePatchFromForm(values, originalDueDate)
        );
      },
      toggleDone: toggleTaskDone,
      setStatus: setTaskStatus,
      toggleSubtaskCheckbox: toggleSubtask,
      remove: deleteTask,
      completeOccurrence: (parentTaskId, originalDueDate, done) =>
        completeOccurrence(parentTaskId, originalDueDate, done),
    }),
    []
  );
}
