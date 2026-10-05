import type { AuthResponse, LoginInput, RefreshResponse, RegisterInput } from "@template/contracts";
import { apiClient } from "../client";

export function login(payload: LoginInput): Promise<AuthResponse> {
  return apiClient<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    // Un 401 ici = identifiants invalides, pas un token expiré.
    skipRefresh: true,
  });
}

export function register(payload: RegisterInput): Promise<AuthResponse> {
  return apiClient<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    // Un 401 ici = données invalides côté API, pas un token expiré.
    skipRefresh: true,
  });
}

export function logout(): Promise<void> {
  return apiClient<void>("/auth/logout", { method: "POST", skipRefresh: true });
}

export function refresh(refreshToken: string | null): Promise<RefreshResponse> {
  return apiClient<RefreshResponse>("/auth/refresh", {
    method: "POST",
    // Le refresh lui-même ne doit jamais se déclencher lui-même.
    skipRefresh: true,
    ...(refreshToken ? { body: JSON.stringify({ refreshToken }) } : {}),
  });
}
