import fastifyRateLimit, {
  type RateLimitPluginOptions,
  type errorResponseBuilderContext,
} from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../config/env";

const rateLimitOptions: RateLimitPluginOptions = {
  max: env.RATE_LIMIT_MAX,
  timeWindow: env.RATE_LIMIT_WINDOW,
  errorResponseBuilder: (_request: FastifyRequest, context: errorResponseBuilderContext) => ({
    error: {
      code: "RATE_LIMITED" as const,
      message: `Too many requests. Retry after ${context.after}.`,
      details: [] as unknown[],
    },
  }),
};

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(fastifyRateLimit, rateLimitOptions);
}
