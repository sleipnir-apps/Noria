import { QueryClient } from "@tanstack/react-query";

/**
 * Offline-first QueryClient:
 * - gcTime covers the persistence maxAge (queries survive restarts offline).
 * - retry: 1 (offline errors fail fast; the sync queue is the real retry).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days — allows offline persistence
    },
  },
});
