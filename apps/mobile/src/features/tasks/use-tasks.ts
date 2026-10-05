import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTaskDto, Task, TaskFilters, UpdateTaskDto } from "@template/contracts";
import {
  getOverdueTasks,
  getTask,
  getTaskRange,
  getTasks,
  materializeOccurrence,
} from "../../api/endpoints/tasks.api";
import { taskQueue } from "./task-queue";
import { useOnline, useTaskSyncLoop } from "./task-sync";

/** 24-hex ObjectId-compatible id, generated client-side (offline-safe). */
export function newTaskId(): string {
  let out = "";
  for (let i = 0; i < 24; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

/** Full local task shape used for optimistic offline upserts. */
export function localTaskFromCreate(dto: CreateTaskDto): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  return {
    id: newTaskId(),
    title: dto.title,
    description: dto.description ?? null,
    priority: dto.priority ?? "P3",
    status: dto.status ?? "TODO",
    due_date: dto.due_date ?? null,
    has_time: dto.has_time ?? false,
    tags: dto.tags ?? [],
    subtasks: dto.subtasks ?? [],
    parent_task_id: null,
    original_due_date: null,
    recurrence_rule: dto.recurrence_rule ?? null,
    deleted_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export function useTasks(filters: Partial<TaskFilters> = {}) {
  return useQuery({
    queryKey: ["tasks", "list", filters],
    queryFn: () => getTasks(filters),
  });
}

export function useTask(id: string) {
  return useQuery({ queryKey: ["tasks", "detail", id], queryFn: () => getTask(id) });
}

export function useTaskRange(start: string, end: string) {
  return useQuery({
    queryKey: ["tasks", "range", start, end],
    queryFn: () => getTaskRange(start, end),
  });
}

export function useOverdueTasks() {
  return useQuery({ queryKey: ["tasks", "overdue"], queryFn: () => getOverdueTasks() });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: Partial<CreateTaskDto> & { title: string }) => {
      // Offline-first: create goes through the queue (LWW push) directly.
      const local = localTaskFromCreate(dto as CreateTaskDto);
      await taskQueue.enqueue({ op: "upsert", task: local });
      return local;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...dto }: { id: string } & UpdateTaskDto) => {
      // Send the complete local state with a fresh updated_at (LWW semantics).
      await taskQueue.enqueue({ op: "upsert", task: { id, ...dto, updated_at: nowIso() } });
      return { id };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await taskQueue.enqueue({ op: "delete", task: { id, updated_at: nowIso() } });
      return id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useCompleteOccurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      parentId,
      originalDueDate,
      dueDate,
    }: {
      parentId: string;
      originalDueDate: string;
      dueDate?: string;
    }) =>
      materializeOccurrence(parentId, {
        original_due_date: originalDueDate,
        due_date: dueDate,
        status: "DONE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

/** Today's local-day bounds as ISO strings. */
export function todayRange(): { start: string; end: string } {
  const now = new Date();
  const startLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    start: new Date(startLocal.getTime() - startLocal.getTimezoneOffset() * 60000).toISOString(),
    end: new Date(endLocal.getTime() - endLocal.getTimezoneOffset() * 60000).toISOString(),
  };
}

export { taskQueue, useOnline, useTaskSyncLoop };
export type { Task };
