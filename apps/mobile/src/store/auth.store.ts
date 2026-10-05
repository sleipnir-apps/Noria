import { tokenStorage } from "@/lib/storage";

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
  async clearTokens(): Promise<void> {
    await tokenStorage.clearAll();
  },
};
