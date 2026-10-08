import type { FastifyInstance, FastifySchema } from "fastify";
import { healthController } from "./health.controller";

const healthRouteSchema: FastifySchema = {
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
};

/** Health under the API prefix (what the client's EXPO_PUBLIC_API_URL points at). */
export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", { schema: healthRouteSchema }, healthController);
}

/**
 * Health at the origin root. The deployed API is served at the root of its
 * host (uptime probes hit GET /health), while the modules live under /api/v1.
 * Hidden from Swagger: docs describe the /api/v1 contract, not the probes.
 */
export async function rootHealthRoutes(app: FastifyInstance) {
  app.get("/health", { schema: { ...healthRouteSchema, hide: true } }, healthController);
}
