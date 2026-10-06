import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { logout } from "../../api/endpoints/auth.api";
import { authStore } from "../../store/auth.store";
import { taskStore } from "@/store/task.store";

export function useLogout(
  options?: UseMutationOptions<void, Error, void>
): UseMutationResult<void, Error, void> {
  return useMutation<void, Error, void>({
    mutationFn: logout,
    ...options,
    onSuccess: async (data, variables, onMutateResult, context): Promise<void> => {
      await authStore.clearTokens();
      // Offline dataset of the previous account: never mix tasks across users.
      await taskStore.clearAll();
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: async (error, variables, onMutateResult, context): Promise<void> => {
      await authStore.clearTokens();
      await taskStore.clearAll();
      await options?.onError?.(error, variables, onMutateResult, context);
    },
  });
}
