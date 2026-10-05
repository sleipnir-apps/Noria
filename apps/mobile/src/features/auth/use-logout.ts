import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { logout } from "../../api/endpoints/auth.api";
import { authStore } from "../../store/auth.store";

export function useLogout(
  options?: UseMutationOptions<void, Error, void>
): UseMutationResult<void, Error, void> {
  return useMutation<void, Error, void>({
    mutationFn: logout,
    ...options,
    onSuccess: async (data, variables, onMutateResult, context): Promise<void> => {
      await authStore.clearTokens();
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: async (error, variables, onMutateResult, context): Promise<void> => {
      await authStore.clearTokens();
      await options?.onError?.(error, variables, onMutateResult, context);
    },
  });
}
