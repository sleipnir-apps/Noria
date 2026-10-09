import type { AuthResponse } from "@template/contracts";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { ApiError } from "../../api/api-error";
import { authStore } from "../../store/auth.store";
import { env } from "@/config/env";

type Me = { user: AuthResponse["user"] };

/**
 * /auth/me with an offline fallback: the last successful result is cached in
 * storage, so the app can boot offline and stay on the tasks screens (the
 * sync engine picks the queue back up on its own).
 */
export function useMe(): UseQueryResult<Me, Error> {
  return useQuery<Me, Error>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const result = await apiClient<Me>("/auth/me");
        await authStore.setCachedUser(result.user);
        return result;
      } catch (error) {
        // Network error (offline boot): serve the cached user if we have one.
        // A 401 (session really over) must not be masked by the cache.
        if (error instanceof ApiError) throw error;
        const cached = await authStore.getCachedUser();
        if (cached !== null) return { user: cached };
        throw error;
      }
    },
    retry: false,
    staleTime: env.jwtAccessExpireTime,
  });
}
