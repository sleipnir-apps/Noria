import type { FastifyInstance } from "fastify";
import { healthController } from "./health.controller";

/** Shared OpenAPI contract of the health check (one handler, several paths). */
const healthSchema = {
  tags: ["Health"],
  summary: "Check API and database status",
  response: {
    200: {
      type: "object",
      properties: {
        status: { type: "string" },
        database: { type: "string" },
        timestamp: { type: "string" },
      },
    },
  },
} as const;

/**
 * GET /health (+ GET /) on the target scope.
 * - The API registers it at the application root: the deployed API is served
 *   at the root, so liveness probes must not depend on knowing the prefix.
 * - `app.register` inside the scoped API plugin would duplicate the route
 *   (Fastify forbids adding the same path twice in one scope), so the scoped
 *   alias is declared by app.ts calling this helper again — one shared
 *   handler + contract, two mount points.
 */
export function registerHealthPaths(app: FastifyInstance): void {
  app.get("/health", { schema: healthSchema }, healthController);
  app.get("/", { schema: healthSchema }, healthController);
}

export async function healthRoutes(app: FastifyInstance) {
  registerHealthPaths(app);
}
