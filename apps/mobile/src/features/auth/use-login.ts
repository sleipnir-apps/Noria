import type { AuthResponse, LoginInput } from "@template/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { login } from "../../api/endpoints/auth.api";
import { authStore } from "../../store/auth.store";

export function useLogin(): UseMutationResult<AuthResponse, Error, LoginInput> {
  const queryClient = useQueryClient();

  return useMutation<AuthResponse, Error, LoginInput>({
    mutationFn: login,
    onSuccess: async (response: AuthResponse): Promise<void> => {
      await authStore.setTokens({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      // Sans ça, le cache React Query de ["auth", "me"] reste sur
      // "pas connecté" (staleTime = durée de vie du token) et le
      // RootNavigator (Stack.Protected) continue d'afficher (auth).
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}
