import type { AuthResponse, RegisterInput } from "@template/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { register } from "../../api/endpoints/auth.api";
import { authStore } from "../../store/auth.store";

export function useRegister(): UseMutationResult<AuthResponse, Error, RegisterInput> {
  const queryClient = useQueryClient();

  return useMutation<AuthResponse, Error, RegisterInput>({
    mutationFn: register,
    onSuccess: async (response: AuthResponse): Promise<void> => {
      await authStore.setTokens({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      // Rafraîchit ["auth", "me"] : même raison que use-login.
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}
