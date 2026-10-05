import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGO_URL: z.string().url(),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:8081,http://localhost:19006")
    .transform((val) => val.split(",").map((s) => s.trim())),
  CORS_CREDENTIALS: z
    .string()
    .default("true")
    .transform((val) => val === "true"),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  JWT_SECRET: z.string().min(32).default("changeme_changeme_changeme_changeme"),
  JWT_ACCESS_EXPIRES: z.string().default("5m"),
  JWT_REFRESH_SECRET: z.string().min(32).default("changeme_refresh_refresh_refresh_32chars"),
  JWT_REFRESH_EXPIRES: z.string().default("90d"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
