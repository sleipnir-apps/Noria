import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { ReactNode } from "react";

import { queryClient } from "./query-client";

/** Async storage persister for the offline-first query cache. */
const persister = createAsyncStoragePersister({ storage: AsyncStorage });

/**
 * App providers with a persisted QueryClient: the task cache survives app
 * restarts and is usable offline. Mutations go through the offline queue
 * (features/sync), not through React Query's own offline persistence.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days, mirrors gcTime
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
