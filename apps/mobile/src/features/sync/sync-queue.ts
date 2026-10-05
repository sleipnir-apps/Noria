/**
 * Offline mutation queue for Noria — plain typed store over async storage.
 *
 * Every task mutation done offline is recorded as a sync operation. The queue
 * is replayed on reconnection (push, then pull) and survives app restarts.
 * `tasks.store.ts` owns the local task cache; this file only stores the
 * pending operations + the sync cursor.
 */
import type { SyncPushOperation } from "@template/contracts";
import { storage } from "@/lib/storage";

const QUEUE_KEY = "tasks_sync_queue_v1";
const CURSOR_KEY = "tasks_sync_cursor_v1";

export interface QueuedOperation {
  op: SyncPushOperation;
}

function parseQueue(raw: string | null): QueuedOperation[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedOperation[]) : [];
  } catch {
    return [];
  }
}

export const syncQueueStore = {
  async enqueue(op: SyncPushOperation): Promise<void> {
    const queue = parseQueue(await storage.getItem(QUEUE_KEY));
    queue.push({ op });
    await storage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },

  /** Current queue (oldest first). */
  async peek(): Promise<QueuedOperation[]> {
    return parseQueue(await storage.getItem(QUEUE_KEY));
  },

  /** Replace the stored queue (after a replay round). */
  async replace(queue: QueuedOperation[]): Promise<void> {
    await storage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },

  async clear(): Promise<void> {
    await storage.setItem(QUEUE_KEY, "[]");
  },

  /** Last successful server sync instant (anchor for the next pull). */
  async getCursor(): Promise<string | null> {
    return storage.getItem(CURSOR_KEY);
  },

  async setCursor(iso: string): Promise<void> {
    await storage.setItem(CURSOR_KEY, iso);
  },

  /** Purge queue + cursor (logout). */
  async reset(): Promise<void> {
    await storage.removeItem(QUEUE_KEY);
    await storage.removeItem(CURSOR_KEY);
  },
};
