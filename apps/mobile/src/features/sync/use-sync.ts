/**
 * Offline sync engine (mobile).
 *
 * - Persists the TanStack Query cache to AsyncStorage (offline reads).
 * - Records every task mutation in an offline queue (offline writes).
 * - On reconnection (or app start when online): replays the queue as a batch
 *   push (LWW server-side), then pulls the changes since the last cursor.
 * - Exposes the offline/pending status consumed by the UI banner.
 */
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import { pullSync, pushSync } from "@/api/endpoints/sync.api";
import { syncQueueStore, type QueuedOperation } from "./sync-queue";
import { tasksStore } from "@/features/tasks/tasks.store";
import { queryClient } from "@/lib/query-client";

export type SyncStatus = "online" | "offline" | "syncing";

const statusListeners = new Set<(s: SyncStatus) => void>();

function setStatus(next: SyncStatus) {
  currentStatus = next;
  for (const listener of statusListeners) listener(next);
}

/**
 * One sync round: push the queued mutations (batch, LWW server-side), then
 * pull the server changes since the last cursor into the local cache.
 */
export async function runSync(): Promise<void> {
  try {
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected || net.isInternetReachable === false) {
      setStatus("offline");
      return;
    }

    setStatus("syncing");

    // 1) Push: replay the offline mutation queue.
    const queue = await syncQueueStore.peek();
    if (queue.length > 0) {
      await pushSync({
        operations: queue.map((q) => q.op),
      });
      // Conflicted operations are dropped too: LWW kept the server version and
      // the pull below brings the corrected documents to the client.
      await syncQueueStore.clear();
    }

    // 2) Pull: apply server changes to the local cache.
    const cursor = await syncQueueStore.getCursor();
    const pull = await pullSync(cursor ?? undefined);
    if (pull.deletions.length > 0) {
      await tasksStore.removeDeleted(pull.deletions.map((d) => d.id));
    }
    await tasksStore.upsertMany(pull.changes);
    await syncQueueStore.setCursor(pull.server_time);
    setStatus("online");

    // 3) Refresh React Query views from the local cache.
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
  } catch {
    setStatus("offline");
  }
}

/** Module-level status snapshot for non-hook consumers (e.g. optimistic writes). */
let currentStatus: SyncStatus = "online";

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

/** Shared status hook: online / offline / syncing + pending operation count. */
export function useSyncStatus(): { status: SyncStatus; pendingCount: number; syncNow: () => void } {
  const [status, setStatusState] = useState<SyncStatus>(currentStatus);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const listener = (s: SyncStatus) => setStatusState(s);
    statusListeners.add(listener);
    setStatusState(currentStatus);
    return () => {
      statusListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void syncQueueStore.peek().then((q) => {
        if (!cancelled) setPendingCount(q.length);
      });
    };
    void refresh();
    const interval = setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const syncNow = useCallback(() => {
    void runSync();
  }, []);

  return { status, pendingCount, syncNow };
}

/**
 * Wire the network/app-state listeners once (root layout). Runs a first sync
 * on mount and every time connectivity or app focus comes back.
 */
export function useSyncEngine(): void {
  useEffect(() => {
    let alive = true;

    const check = (): void => {
      if (!alive) return;
      void (async () => {
        try {
          const net = await Network.getNetworkStateAsync();
          if (net.isConnected && net.isInternetReachable !== false) {
            await runSync();
          } else {
            setStatus("offline");
          }
        } catch {
          setStatus("offline");
        }
      })();
    };

    const networkSub = Network.addNetworkStateListener(check);
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });

    check();

    return () => {
      alive = false;
      networkSub.remove();
      appSub.remove();
    };
  }, []);
}

export type { QueuedOperation };
