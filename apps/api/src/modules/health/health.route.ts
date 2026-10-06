import type { FastifyInstance } from "fastify";
import { healthController } from "./health.controller";

export async function healthRoutes(app: FastifyInstance) {
  app.get(
    "/health",
    {
      schema: {
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
      },
    },
    healthController
  );
}

/** Same handler, but registered at the ROOT: the deployed API is served at /
 * (no /api/v1), so uptime probes target GET /health. */
export function rootHealthRoutes(app: FastifyInstance) {
  app.get("/health", healthController);
}
