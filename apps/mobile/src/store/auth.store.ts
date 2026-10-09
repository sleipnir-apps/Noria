import type { AuthResponse } from "@template/contracts";
import { storage, tokenStorage } from "@/lib/storage";

type AuthUser = AuthResponse["user"];
/** Offline boot: the last /auth/me user is kept in storage (see use-me). */
const USER_CACHE_KEY = "auth_user_cache";

export const authStore = {
  /** Store the access token (and the refresh token on native only). */
  async setTokens(tokens: { accessToken: string; refreshToken?: string }): Promise<void> {
    await tokenStorage.setAccessToken(tokens.accessToken);
    if (tokens.refreshToken) {
      await tokenStorage.setRefreshToken(tokens.refreshToken);
    }
  },
  async getAccessToken(): Promise<string | null> {
    return tokenStorage.getAccessToken();
  },
  async getRefreshToken(): Promise<string | null> {
    return tokenStorage.getRefreshToken();
  },
  async setCachedUser(user: AuthUser): Promise<void> {
    try {
      await storage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } catch {
      // The cache is an offline convenience only.
    }
  },
  async getCachedUser(): Promise<AuthUser | null> {
    try {
      const raw = await storage.getItem(USER_CACHE_KEY);
      if (raw === null) return null;
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },
  async clearTokens(): Promise<void> {
    await tokenStorage.clearAll();
    await storage.removeItem(USER_CACHE_KEY);
  },
};
