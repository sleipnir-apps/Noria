import type { SyncPullResponse, SyncPushResponse, Task } from "@template/contracts";
import { storage } from "@/lib/storage";

/**
 * Offline-first dataset of tasks + queued mutations, persisted through the
 * app storage (localStorage on web, expo-secure-store on native). All writes
 * (even online ones) go through the queue; the sync engine replays it with
 * POST /sync/push then pulls the changes with GET /sync?since=<watermark>.
 */

export const DATASET_KEY = "noria_tasks_dataset_v1";
export const QUEUE_KEY = "noria_tasks_queue_v1";
export const WATERMARK_KEY = "noria_tasks_watermark_v1";

/** Client-side task document: a Task minus the server-only userId. */
export interface LocalTask {
  /** Server id (ObjectId) once synced, "local:<uuid>" before. */
  id: string;
  title: string;
  description?: string;
  priority: "P1" | "P2" | "P3" | "P4";
  status: "TODO" | "IN_PROGRESS" | "DONE" | "ARCHIVED";
  dueDate?: string;
  hasTime: boolean;
  tags: string[];
  subtasks: Array<{ id: string; title: string; isCompleted: boolean }>;
  recurrenceRule?: {
    frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    interval: number;
    byWeekday?: number[];
    byMonthDay?: number[];
    endDate?: string;
  };
  /** Set on materialized instances of a recurring parent. */
  parentTaskId?: string;
  originalDueDate?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** One queued mutation, replayed in queue order by the sync engine. */
export interface QueuedOperation {
  opId: string;
  /** Epoch ms — gives the replay order (oldest first). */
  queuedAt: number;
  kind: "CREATE" | "UPDATE" | "DELETE";
  /** Id the mutation is about (the local snapshot id for CREATE). */
  taskId: string;
  /** Post-mutation snapshot (CREATE/UPDATE). */
  doc?: LocalTask;
  /** DELETE only. */
  deletedAt?: string;
}

export interface TaskStoreState {
  /** False until hydrate() finished — the UI shows a loader by then. */
  hydrated: boolean;
  /** Last synced task id: LocalTask record (including queued creations). */
  tasks: Record<string, LocalTask>;
  queue: QueuedOperation[];
  /** Watermark of the last successful pull. */
  lastSync: string | null;
  isSyncing: boolean;
  /** True when the last sync attempt failed (offline or API error). */
  isOffline: boolean;
  lastSyncError: string | null;
}

const initialState: TaskStoreState = {
  hydrated: false,
  tasks: {},
  queue: [],
  lastSync: null,
  isSyncing: false,
  isOffline: false,
  lastSyncError: null,
};

let state: TaskStoreState = initialState;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function patch(next: Partial<TaskStoreState>): void {
  state = { ...state, ...next };
  emit();
}

// ── Persisted state helpers ──────────────────────────────────────────────────

interface PersistedDataset {
  tasks: Record<string, LocalTask>;
  lastSync: string | null;
}

interface PersistedQueue {
  queue: QueuedOperation[];
}

async function loadDataset(): Promise<PersistedDataset> {
  const raw = await storage.getItem(DATASET_KEY);
  if (!raw) return { tasks: {}, lastSync: null };
  try {
    const parsed = JSON.parse(raw) as PersistedDataset;
    return { tasks: parsed.tasks ?? {}, lastSync: parsed.lastSync ?? null };
  } catch {
    return { tasks: {}, lastSync: null };
  }
}

async function loadQueue(): Promise<QueuedOperation[]> {
  const raw = await storage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as PersistedQueue).queue ?? [];
  } catch {
    return [];
  }
}

// ── Store ────────────────────────────────────────────────────────────────────

export const taskStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): TaskStoreState {
    return state;
  },

  /** Load the persisted dataset, queue and watermark from storage. */
  async hydrate(): Promise<void> {
    const [dataset, queue, lastSync] = await Promise.all([
      loadDataset(),
      loadQueue(),
      storage.getItem(WATERMARK_KEY),
    ]);
    patch({
      tasks: dataset.tasks,
      queue,
      lastSync: dataset.lastSync ?? lastSync,
      hydrated: true,
    });
  },

  /** Wipe everything (logout): local tasks, queue and watermark. */
  async clearAll(): Promise<void> {
    state = { ...initialState, hydrated: true };
    emit();
    await Promise.all([
      storage.removeItem(DATASET_KEY),
      storage.removeItem(QUEUE_KEY),
      storage.removeItem(WATERMARK_KEY),
    ]);
  },

  async persist(): Promise<void> {
    const dataset: PersistedDataset = { tasks: state.tasks, lastSync: state.lastSync };
    const queue: PersistedQueue = { queue: state.queue };
    try {
      await storage.setItem(DATASET_KEY, JSON.stringify(dataset));
      await storage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {
      // Storage full or unavailable: state stays in memory for this session.
    }
  },

  async setWatermark(since: string): Promise<void> {
    patch({ lastSync: since });
    try {
      await storage.setItem(WATERMARK_KEY, since);
    } catch {
      // Ignore: watermark falls back to the dataset copy.
    }
  },

  /** Insert or replace one local task (optimistic write). */
  async upsertLocal(task: LocalTask): Promise<void> {
    patch({ tasks: { ...state.tasks, [task.id]: task } });
    await taskStore.persist();
  },

  async removeLocal(id: string): Promise<void> {
    if (!(id in state.tasks)) return;
    const next = { ...state.tasks };
    delete next[id];
    patch({ tasks: next });
    await taskStore.persist();
  },

  async setQueue(queue: QueuedOperation[]): Promise<void> {
    patch({ queue });
    await taskStore.persist();
  },

  async setSyncing(isSyncing: boolean): Promise<void> {
    patch({ isSyncing });
  },

  async setOffline(isOffline: boolean, message: string | null): Promise<void> {
    patch({ isOffline, lastSyncError: message });
  },

  // ── Sync protocol application ──────────────────────────────────────────────

  /**
   * Merge a pull response. Documents with pending queued operations keep their
   * local version: the queued op is the newest known state and the push will
   * resolve it. Deletions are applied the same way.
   */
  async applySyncPull(pull: SyncPullResponse): Promise<void> {
    const pendingIds = new Set(state.queue.map((op) => op.taskId));
    const tasks: Record<string, LocalTask> = { ...state.tasks };

    for (const change of pull.changes) {
      if (pendingIds.has(change.id)) continue;
      tasks[change.id] = toLocalTask(change);
    }

    for (const deletion of pull.deletions) {
      if (pendingIds.has(deletion.id)) continue;
      delete tasks[deletion.id];
    }

    patch({ tasks });
    await taskStore.persist();
    await taskStore.setWatermark(pull.serverTime);
  },

  /**
   * Apply a push response: remove applied ops, migrate local ids to server ids
   * (a CREATE applied server-side returns the real id), and resolve conflicts
   * by adopting the server's kept version (last-write-wins).
   */
  async applyPushResults(response: SyncPushResponse): Promise<void> {
    const appliedOpIds = new Set(response.applied.map((entry) => entry.opId));
    const conflictedOpIds = new Set(response.conflicts.map((entry) => entry.opId));

    const queue = state.queue.filter(
      (op) => !appliedOpIds.has(op.opId) && !conflictedOpIds.has(op.opId)
    );
    const tasks: Record<string, LocalTask> = { ...state.tasks };

    for (const applied of response.applied) {
      const entry = state.queue.find((op) => op.opId === applied.opId);
      if (entry?.kind === "DELETE") {
        // Tombstone acknowledged: drop the local copy (both keys, in case a
        // server id replaced a local one).
        delete tasks[applied.id];
        delete tasks[entry.taskId];
      } else if (applied.task) {
        tasks[applied.id] = toLocalTask(applied.task);
        // A local id (local:*) got its official server id: re-key the document.
        if (entry && entry.taskId !== applied.id) {
          delete tasks[entry.taskId];
        }
      }
    }

    for (const conflict of response.conflicts) {
      // The server kept its version: adopt it (last-write-wins), drop the op.
      tasks[conflict.id] = toLocalTask(conflict.kept);
      const localKey = state.queue.find((op) => op.opId === conflict.opId)?.taskId;
      if (localKey && localKey !== conflict.id) {
        delete tasks[localKey];
      }
    }

    patch({ queue, tasks });
    await taskStore.persist();
  },

  /** Ids with pending queued operations (their local copy wins until push). */
  pendingTaskIds(): Set<string> {
    return new Set(state.queue.map((op) => op.taskId));
  },
};

/** Task DTO → client document (no userId client-side). */
export function toLocalTask(task: Task): LocalTask {
  return {
    id: task.id,
    title: task.title,
    ...(task.description !== undefined ? { description: task.description } : {}),
    priority: task.priority,
    status: task.status,
    ...(task.dueDate !== undefined ? { dueDate: task.dueDate } : {}),
    hasTime: task.hasTime,
    tags: [...task.tags],
    subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
    ...(task.recurrenceRule !== undefined ? { recurrenceRule: task.recurrenceRule } : {}),
    ...(task.parentTaskId !== undefined ? { parentTaskId: task.parentTaskId } : {}),
    ...(task.originalDueDate !== undefined ? { originalDueDate: task.originalDueDate } : {}),
    ...(task.deletedAt !== undefined ? { deletedAt: task.deletedAt } : {}),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
