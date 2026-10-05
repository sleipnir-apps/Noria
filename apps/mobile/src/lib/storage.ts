import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ACCESS_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";

// expo-secure-store has no web implementation (it throws on web), so on web we
// use localStorage. The refresh token only needs to be persisted on native
// anyway (web uses an httpOnly cookie handled by the browser).
export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    return storage.getItem(ACCESS_TOKEN_KEY);
  },
  async setAccessToken(token: string): Promise<void> {
    await storage.setItem(ACCESS_TOKEN_KEY, token);
  },
  /**
   * Refresh token is only stored on native (in expo-secure-store). On web the
   * refresh token travels via an httpOnly cookie managed by the browser, so we
   * never persist it client-side.
   */
  async getRefreshToken(): Promise<string | null> {
    if (Platform.OS === "web") return null;
    return storage.getItem(REFRESH_TOKEN_KEY);
  },
  async setRefreshToken(token: string): Promise<void> {
    if (Platform.OS === "web") return;
    await storage.setItem(REFRESH_TOKEN_KEY, token);
  },
  async clearAll(): Promise<void> {
    await storage.removeItem(ACCESS_TOKEN_KEY);
    if (Platform.OS !== "web") {
      await storage.removeItem(REFRESH_TOKEN_KEY);
    }
  },
};
