/**
 * Local task cache for the offline-first mobile app — plain typed store over
 * async storage. The whole task collection of the user is kept locally; every
 * mutation is applied optimistically here (before reaching the server) and the
 * offline mutation is queued for replay.
 */
import type { SyncPushOperation, TaskDto } from "@template/contracts";
import { storage } from "@/lib/storage";

const TASKS_KEY = "tasks_cache_v1";

function parseTasks(raw: string | null): TaskDto[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TaskDto[]) : [];
  } catch {
    return [];
  }
}

function byUpdatedAtDesc(a: TaskDto, b: TaskDto): number {
  return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
}

export const tasksStore = {
  async getAll(): Promise<TaskDto[]> {
    return parseTasks(await storage.getItem(TASKS_KEY));
  },

  async replaceAll(tasks: TaskDto[]): Promise<void> {
    await storage.setItem(TASKS_KEY, JSON.stringify(tasks));
  },

  async upsertMany(incoming: TaskDto[]): Promise<TaskDto[]> {
    const current = await this.getAll();
    const byId = new Map(current.map((t) => [t.id, t]));
    for (const task of incoming) {
      const existing = byId.get(task.id);
      if (!existing || (task.updated_at ?? "") > (existing.updated_at ?? "")) {
        byId.set(task.id, task);
      }
    }
    const merged = Array.from(byId.values()).sort(byUpdatedAtDesc);
    await this.replaceAll(merged);
    return merged;
  },

  /**
   * LWW merge with the locally-mutated version: the local one wins ONLY if it
   * is the one still pending in the queue (otherwise server wins on clash) —
   * simplified: incoming server version replaces local unless local is newer.
   */
  async removeDeleted(deletedIds: string[]): Promise<TaskDto[]> {
    const current = await this.getAll();
    const ids = new Set(deletedIds);
    const kept = current.filter((t) => !ids.has(t.id));
    await this.replaceAll(kept);
    return kept;
  },

  async upsertOne(task: TaskDto): Promise<TaskDto[]> {
    return this.upsertMany([task]);
  },
};

/** Helper building a local-only task (optimistic creation, offline). */
export function buildLocalTask(dto: {
  id: string;
  title: string;
  priority?: TaskDto["priority"];
  due_date?: string | null;
  has_time?: boolean;
  description?: string | null;
  tags?: string[];
  subtasks?: TaskDto["subtasks"];
  recurrence_rule?: SyncPushOperation["data"] extends undefined
    ? never
    : TaskDto["recurrence_rule"];
  now: string;
}): TaskDto {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? null,
    priority: dto.priority ?? "P3",
    status: "TODO",
    due_date: dto.due_date ?? null,
    has_time: dto.has_time ?? false,
    tags: dto.tags ?? [],
    subtasks: dto.subtasks ?? [],
    recurrence_rule: dto.recurrence_rule ?? null,
    parent_task_id: null,
    original_due_date: null,
    deleted_at: null,
    updated_at: dto.now,
  };
}
