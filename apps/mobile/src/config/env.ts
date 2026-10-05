import { z } from "zod";

const envSchema = z.object({
  apiUrl: z.url().default("http://localhost:3000"),
  jwtAccessExpireTime: z.coerce.number().default(5 * 60 * 1000),
});

export const env = envSchema.parse({
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  jwtAccessExpireTime: process.env.EXPO_PUBLIC_JWT_ACCESS_EXPIRES_MS,
});
