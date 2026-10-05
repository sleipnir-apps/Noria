import type { AuthResponse } from "@template/contracts";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { env } from "@/config/env";

export function useMe(): UseQueryResult<{ user: AuthResponse["user"] }, Error> {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiClient<{ user: AuthResponse["user"] }>("/auth/me"),
    retry: false,
    staleTime: env.jwtAccessExpireTime,
  });
}
