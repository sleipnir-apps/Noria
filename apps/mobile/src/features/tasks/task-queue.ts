import { storage } from "@/lib/storage";

/**
 * Pending mutations made offline, replayed on reconnection (push then pull).
 * Persisted in the platform storage so they survive app restarts.
 */
export interface PendingOp {
  id: string;
  op: "upsert" | "delete";
  /** Complete local task state (client-generated 24-hex id included). */
  task: Record<string, unknown>;
  createdAt: string;
}

const QUEUE_KEY = "tasks_pending_ops";
const LAST_SYNC_KEY = "tasks_last_sync";

function genOpId(): string {
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export const taskQueue = {
  async all(): Promise<PendingOp[]> {
    const raw = await storage.getItem(QUEUE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as PendingOp[];
    } catch {
      return [];
    }
  },

  async enqueue(op: Omit<PendingOp, "id" | "createdAt">): Promise<PendingOp> {
    const entry: PendingOp = { ...op, id: genOpId(), createdAt: new Date().toISOString() };
    const all = await this.all();
    all.push(entry);
    await storage.setItem(QUEUE_KEY, JSON.stringify(all));
    return entry;
  },

  async replace(ops: PendingOp[]): Promise<void> {
    await storage.setItem(QUEUE_KEY, JSON.stringify(ops));
  },

  async clear(): Promise<void> {
    await storage.removeItem(QUEUE_KEY);
  },

  async count(): Promise<number> {
    return (await this.all()).length;
  },

  async getLastSync(): Promise<string | null> {
    return storage.getItem(LAST_SYNC_KEY);
  },

  async setLastSync(iso: string): Promise<void> {
    await storage.setItem(LAST_SYNC_KEY, iso);
  },
};
