import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMe } from "@/features/auth/use-me";
import { ApiError } from "@/api/api-error";
import { authEvents } from "@/lib/auth-events";

export function useAuthGuard() {
  const { data, isLoading, isError, error } = useMe();
  const queryClient = useQueryClient();

  // Backend injoignable (timeout, serveur down) : ce n'est pas un problème
  // d'authentification, on affiche l'écran "Oups" au lieu du login.
  const isNetworkError = isError && !(error instanceof ApiError);

  useEffect(() => {
    return authEvents.onSessionExpired(() => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    });
  }, [queryClient]);

  const isAuthenticated = !isNetworkError && !isError && !!data?.user;

  return {
    isLoading,
    isError: isNetworkError,
    isAuthenticated,
  };
}
