import { useEffect } from "react";
import { taskStore } from "@/store/task.store";
import { startSyncEngine } from "@/features/tasks/sync-engine";

/**
 * Mount once in the (app) layout: hydrate the persisted dataset, then run the
 * sync engine (initial retry, reconnect listener, minute tick).
 */
export function useTaskSync(): void {
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void taskStore.hydrate().then(() => {
      if (cancelled) return;
      stop = startSyncEngine();
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
}
