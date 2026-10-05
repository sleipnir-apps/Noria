import type {
  CreateTaskDto,
  TaskDto,
  TaskListResponse,
  TaskRangeQuery,
  UpdateTaskDto,
} from "@template/contracts";
import { apiClient } from "../client";

export interface OverdueQuery {
  /** Optional server "now" override (ISO), for tests/manual demos. */
  now?: string;
}

export function getTasks(filters: { backlog?: boolean } = {}): Promise<TaskListResponse> {
  const params = new URLSearchParams();
  if (filters.backlog) params.set("backlog", "true");
  return apiClient<TaskListResponse>(`/tasks?${params.toString()}`);
}

export function getTasksRange(query: TaskRangeQuery): Promise<TaskListResponse> {
  const params = new URLSearchParams({ start: query.start, end: query.end });
  return apiClient<TaskListResponse>(`/tasks/range?${params.toString()}`);
}

export function getTasksOverdue(query: OverdueQuery = {}): Promise<TaskListResponse> {
  const params = new URLSearchParams();
  if (query.now) params.set("now", query.now);
  return apiClient<TaskListResponse>(`/tasks/overdue?${params.toString()}`);
}

export function getTask(id: string): Promise<TaskDto> {
  return apiClient<TaskDto>(`/tasks/${id}`);
}

export function createTask(dto: CreateTaskDto): Promise<TaskDto> {
  return apiClient<TaskDto>("/tasks", { method: "POST", body: JSON.stringify(dto) });
}

export function updateTask(
  id: string,
  dto: UpdateTaskDto,
  occurrenceDate?: string
): Promise<TaskDto> {
  const qs = occurrenceDate ? `?occurrence_date=${encodeURIComponent(occurrenceDate)}` : "";
  return apiClient<TaskDto>(`/tasks/${id}${qs}`, { method: "PATCH", body: JSON.stringify(dto) });
}

export function deleteTask(id: string): Promise<void> {
  return apiClient<void>(`/tasks/${id}`, { method: "DELETE" });
}
