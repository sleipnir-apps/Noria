import { z } from "zod";
import { UserDtoSchema } from "../users/user.dto";

export const LoginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

// refreshToken is only present for native mobile clients (stored in expo-secure-store).
// On web, the refresh token travels via an httpOnly cookie and is NOT in the body.
export const AuthResponseSchema = z.object({
  user: UserDtoSchema,
  accessToken: z.string(),
  refreshToken: z.string().optional(),
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// Body sent by native clients to /auth/refresh (web sends the refresh token via cookie).
export const RefreshInputSchema = z.object({
  refreshToken: z.string().optional(),
});

export type RefreshInput = z.infer<typeof RefreshInputSchema>;

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
});

export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;
