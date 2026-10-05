import { Platform } from "react-native";
import { env } from "../config/env";
import { ApiError } from "./api-error";
import { authStore } from "@/store/auth.store";
import { authEvents } from "@/lib/auth-events";

const TIMEOUT_MS = 10000;

interface RequestOptions extends RequestInit {
  timeout?: number;
  /**
   * Ne pas tenter le refresh automatique sur 401. À mettre sur les routes
   * d'auth (login, register, refresh, logout) où un 401 signifie autre
   * chose qu'un token d'accès expiré (mauvais identifiants, etc.).
   */
  skipRefresh?: boolean;
}

const CLIENT_PLATFORM = Platform.OS === "web" ? "web" : "mobile";

export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return doFetch<T>(path, options).catch(async (error) => {
    // On 401, try to refresh the access token once, then retry the original
    // call. Only for routes that actually carry an access token.
    if (error instanceof ApiError && error.statusCode === 401 && !options.skipRefresh) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return doFetch<T>(path, { ...options, skipRefresh: true });
      }
    }
    throw error;
  });
}

async function doFetch<T>(path: string, options: RequestOptions): Promise<T> {
  const { timeout = TIMEOUT_MS, skipRefresh: _skipRefresh, ...init } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const token = await authStore.getAccessToken();

  const headers = new Headers(init.headers);
  // N'envoie Content-Type: application/json que s'il y a un body
  if (init.body !== undefined && init.body !== null) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-Client-Platform", CLIENT_PLATFORM);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  void _skipRefresh;

  try {
    const response = await fetch(`${env.apiUrl}${path}`, {
      ...init,
      headers,
      // Send cookies (the httpOnly refresh token on web) cross-origin.
      credentials: "include",
      signal: controller.signal,
    });

    clearTimeout(id);

    if (!response.ok) {
      const errorData = await response.json();
      throw new ApiError(errorData, response.status);
    }

    // Gérer les réponses vides (ex: 204 No Content)
    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  } catch (error) {
    clearTimeout(id);
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("NETWORK_TIMEOUT");
    }
    throw error;
  }
}

/** Call /auth/refresh and persist the new tokens. Returns false on failure. */
async function tryRefresh(): Promise<boolean> {
  try {
    const refreshToken = await authStore.getRefreshToken();
    const isWeb = Platform.OS === "web";
    const body = isWeb ? undefined : JSON.stringify({ refreshToken: refreshToken ?? "" });

    const response = await fetch(`${env.apiUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        ...(isWeb ? {} : { "Content-Type": "application/json" }),
        "X-Client-Platform": CLIENT_PLATFORM,
      },
      body,
      credentials: "include",
    });

    if (!response.ok) {
      await authStore.clearTokens();
      authEvents.emit();
      return false;
    }

    const data = (await response.json()) as { accessToken: string; refreshToken?: string };
    await authStore.setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    return true;
  } catch {
    await authStore.clearTokens();
    authEvents.emit();
    return false;
  }
}
