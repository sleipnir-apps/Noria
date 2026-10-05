import type {
  CreateTaskDto,
  OccurrenceInput,
  SyncChangesResponse,
  SyncOperation,
  SyncPushResponse,
  Task,
  TaskFilters,
  UpdateTaskDto,
} from "@template/contracts";
import { apiClient } from "../client";

export interface TaskListResponse {
  data: Task[];
  meta: { total: number };
}

export function getTasks(filters: Partial<TaskFilters> = {}): Promise<TaskListResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.backlog === "1") params.set("backlog", "1");
  return apiClient<TaskListResponse>(`/tasks?${params.toString()}`);
}

export function getTask(id: string): Promise<Task> {
  return apiClient<Task>(`/tasks/${id}`);
}

export function createTask(dto: CreateTaskDto): Promise<Task> {
  return apiClient<Task>("/tasks", { method: "POST", body: JSON.stringify(dto) });
}

export function updateTask(id: string, dto: UpdateTaskDto): Promise<Task> {
  return apiClient<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(dto) });
}

export function deleteTask(id: string): Promise<void> {
  return apiClient<void>(`/tasks/${id}`, { method: "DELETE" });
}

export function getTaskRange(start: string, end: string): Promise<{ tasks: Task[] }> {
  const params = new URLSearchParams({ start, end });
  return apiClient<{ tasks: Task[] }>(`/tasks/range?${params.toString()}`);
}

export function getOverdueTasks(): Promise<{ tasks: Task[] }> {
  return apiClient<{ tasks: Task[] }>("/tasks/overdue");
}

export function materializeOccurrence(id: string, input: OccurrenceInput): Promise<Task> {
  return apiClient<Task>(`/tasks/${id}/occurrence`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createSubtask(taskId: string, title: string): Promise<Task["subtasks"][number]> {
  return apiClient<Task["subtasks"][number]>(`/tasks/${taskId}/subtasks`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function syncPull(since: string): Promise<SyncChangesResponse> {
  return apiClient<SyncChangesResponse>(`/sync?since=${encodeURIComponent(since)}`);
}

export function syncPush(ops: SyncOperation[]): Promise<SyncPushResponse> {
  return apiClient<SyncPushResponse>("/sync/push", {
    method: "POST",
    body: JSON.stringify({ ops }),
  });
}
