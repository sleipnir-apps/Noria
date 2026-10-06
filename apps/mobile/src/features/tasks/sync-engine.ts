import type { SyncDoc, SyncOperation } from "@template/contracts";
import { ApiError } from "@/api/api-error";
import { pullChanges, pushOperations } from "@/api/endpoints/tasks.api";
import { taskStore, type LocalTask, type QueuedOperation } from "@/store/task.store";

/**
 * Sync engine: replays the queued mutations (push, oldest first), then pulls
 * the server changes. Runs at app start, when the connection comes back
 * (navigator.onLine on web; native relies on the periodic retry), and every
 * minute. 401s are left to the auth layer (the refresh already redirects).
 */

const EPOCH = "1970-01-01T00:00:00.000Z";
const MAX_OPS_PER_PUSH = 200;
const RESYNC_INTERVAL_MS = 60_000;

let inFlight = false;
let timer: ReturnType<typeof setInterval> | null = null;
const onlineHandler = (): void => {
  void resync();
};

function toSyncDoc(task: LocalTask): SyncDoc {
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
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function toSyncOperation(entry: QueuedOperation): SyncOperation {
  switch (entry.kind) {
    case "CREATE":
      return { type: "CREATE", opId: entry.opId, doc: toSyncDoc(taskDocOf(entry)) };
    case "UPDATE":
      return {
        type: "UPDATE",
        opId: entry.opId,
        id: entry.taskId,
        doc: toSyncDoc(taskDocOf(entry)),
      };
    case "DELETE":
      return {
        type: "DELETE",
        opId: entry.opId,
        id: entry.taskId,
        deletedAt: entry.deletedAt ?? new Date().toISOString(),
      };
  }
}

function taskDocOf(entry: QueuedOperation): LocalTask {
  if (!entry.doc)
    throw new Error(`Operation ${entry.opId} (${entry.kind}) is missing its snapshot.`);
  return entry.doc;
}

/** Push queued operations until the queue is empty (batched, oldest first). */
async function flushQueue(): Promise<void> {
  for (;;) {
    const { queue } = taskStore.getSnapshot();
    if (queue.length === 0) return;

    const batch = [...queue].sort((a, b) => a.queuedAt - b.queuedAt).slice(0, MAX_OPS_PER_PUSH);
    const response = await pushOperations({ operations: batch.map(toSyncOperation) });
    await taskStore.applyPushResults(response);

    // Every operation ends up applied or conflicted; if none was consumed the
    // batch is stuck — leave and let a later cycle retry.
    const remaining = taskStore.getSnapshot().queue.length;
    if (remaining >= queue.length || remaining === 0) return;
  }
}

async function pull(): Promise<void> {
  const { lastSync } = taskStore.getSnapshot();
  const result = await pullChanges(lastSync ?? EPOCH);
  await taskStore.applySyncPull(result);
}

/** One push-then-pull cycle. Safe to call concurrently (single flight). */
export async function resync(): Promise<void> {
  const snapshot = taskStore.getSnapshot();
  if (!snapshot.hydrated || inFlight) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await taskStore.setOffline(true, "Hors ligne — les modifications resteront en attente.");
    return;
  }

  inFlight = true;
  try {
    await taskStore.setSyncing(true);
    await flushQueue();
    await pull();
    await taskStore.setOffline(false, null);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) return;
    const message = error instanceof Error ? error.message : "Erreur réseau inconnue";
    await taskStore.setOffline(true, message);
  } finally {
    inFlight = false;
    await taskStore.setSyncing(false);
  }
}

/** Manual "Synchroniser maintenant". */
export const syncNow = (): void => {
  void resync();
};

/**
 * Start the engine (app start + reconnect hook + periodic retry).
 * Returns the stop function. Singleton: safe against double mounting.
 */
export function startSyncEngine(): () => void {
  if (timer !== null) return () => {};
  void resync();
  timer = setInterval(() => void resync(), RESYNC_INTERVAL_MS);
  if (typeof window !== "undefined") {
    window.addEventListener("online", onlineHandler);
  }
  return () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onlineHandler);
    }
  };
}
