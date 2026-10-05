import type { RefreshResponse } from "@template/contracts";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { refresh } from "../../api/endpoints/auth.api";
import { authStore } from "../../store/auth.store";

export function useRefresh(): UseMutationResult<RefreshResponse, Error, string | null> {
  return useMutation<RefreshResponse, Error, string | null>({
    mutationFn: refresh,
    onSuccess: async (response: RefreshResponse): Promise<void> => {
      await authStore.setTokens({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
    },
  });
}
