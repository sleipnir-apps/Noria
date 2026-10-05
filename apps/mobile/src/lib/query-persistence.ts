import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { useEffect } from "react";
import { queryClient } from "./query-client";
import { storage } from "./storage";

/**
 * Offline-first: the React Query cache is persisted to platform storage and
 * rehydrated on startup, so tasks are visible without network. Reconnection
 * triggers the replay queue + pull cycle (features/tasks/task-sync.ts).
 */
const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  },
  key: "noria-query-cache",
  throttleTime: 1000,
});

export function persistQueryCache(): void {
  void persistQueryClient({ queryClient, persister });
}

/** Hook variant for React components (mount-once semantics). */
export function usePersistQueryCache(): void {
  useEffect(() => {
    persistQueryCache();
  }, []);
}
