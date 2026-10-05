import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { Task } from "@template/contracts";
import { syncPull, syncPush } from "../../api/endpoints/tasks.api";
import { taskQueue } from "./task-queue";

/** Live on/offline detection (web events; native defaults to online). */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (typeof navigator !== "undefined" && "onLine" in navigator) {
      const set = () => setOnline(true);
      const unset = () => setOnline(false);
      setOnline(navigator.onLine);
      window.addEventListener("online", set);
      window.addEventListener("offline", unset);
      return () => {
        window.removeEventListener("online", set);
        window.removeEventListener("offline", unset);
      };
    }
    return;
  }, []);
  return online;
}

function newOpId(): string {
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Full offline cycle: replay the pending queue (push), then pull changes newer
 * than the last successful sync timestamp. Returns applied counters.
 */
export async function runSyncCycle(
  queryClient: QueryClient
): Promise<{ pushed: number; pulled: number }> {
  const queue = await taskQueue.all();
  if (queue.length > 0) {
    const response = await syncPush(
      queue.map((entry) => ({
        id: entry.id,
        op: entry.op,
        task: entry.task as never,
      }))
    );
    // Applied ops leave the queue; conflicted ones stay for a later retry so
    // the user can decide (their updated_at makes LWW resolve them later).
    const rejectedIds = new Set(response.conflicts.map((c) => c.id));
    const remaining = queue.filter((entry) => !rejectedIds.has(entry.id));
    await taskQueue.replace(remaining);
  }

  const lastSync = await taskQueue.getLastSync();
  const since = lastSync ?? "1970-01-01T00:00:00.000Z";
  const pull = await syncPull(since);

  // Merge server changes into every tasks cache slice (server wins per id).
  queryClient.setQueriesData<{ data: Task[] }>({ queryKey: ["tasks"] }, (old) => {
    if (!old?.data) return old;
    const byId = new Map(old.data.map((t) => [t.id, t]));
    for (const change of pull.changes) byId.set(change.id, change);
    for (const del of pull.deletions) byId.delete(del);
    return { ...old, data: [...byId.values()] };
  });

  await taskQueue.setLastSync(pull.server_time);
  return { pushed: queue.length, pulled: pull.changes.length + pull.deletions.length };
}

/** Replays pending mutations then pulls, on mount and whenever we come back online. */
export function useTaskSyncLoop() {
  const queryClient = useQueryClient();
  const online = useOnline();

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    runSyncCycle(queryClient)
      .then((r) => {
        if (!cancelled && (r.pushed > 0 || r.pulled > 0)) {
          void queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }
      })
      .catch(() => {
        // Offline or server unreachable: ops stay queued, retried next cycle.
      });
    return () => {
      cancelled = true;
    };
  }, [online, queryClient]);
}

export { newOpId };
