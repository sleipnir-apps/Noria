import Fastify from "fastify";
import { env } from "./config/env";
import { API_PREFIX } from "./config/api-prefix";
import { registerCors } from "./plugins/cors";
import { registerErrorHandler } from "./plugins/error-handler";
import { registerMongoDB } from "./plugins/mongodb";
import { registerRateLimit } from "./plugins/rate-limit";
import { registerSwagger } from "./plugins/swagger";
import { healthController } from "./modules/health/health.controller";
import { healthRoutes } from "./modules/health/health.route";
import { registerAuth } from "./plugins/auth";
import { authRoutes } from "./modules/auth/auth.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { itemRoutes } from "./modules/items/item.routes";
import { taskRoutes } from "./modules/tasks/task.routes";
import { syncRoutes } from "./modules/tasks/sync.routes";
import type { FastifyInstance } from "fastify";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === "development" && {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
    },
    genReqId: () => crypto.randomUUID(),
    // fastify reuses route schemas for both validation (AJV) and OpenAPI docs.
    // AJV strict mode rejects OpenAPI-only keywords like `example`/`description`,
    // so relax the schema-strictness check to keep examples in the Swagger UI.
    ajv: { customOptions: { strictSchema: false } },
  });

  // Plugins
  await registerCors(app);
  await registerRateLimit(app);
  await registerSwagger(app);
  await registerMongoDB(app);
  await registerAuth(app);

  // Error handler (après les plugins)
  registerErrorHandler(app);

  // Routes — every module lives under the same /api/v1 prefix; the mobile
  // EXPO_PUBLIC_API_URL points at `<host>:<port>/api/v1`.
  await app.register(
    async (api: FastifyInstance) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(adminRoutes);
      await api.register(itemRoutes);
      await api.register(taskRoutes);
      await api.register(syncRoutes);
    },
    { prefix: API_PREFIX }
  );

  // Root-level health probe (deployment platforms ping GET /health): reuse
  // the same controller, no /api/v1 prefix. /api/v1/health stays for the app.
  await app.get("/health", ROOT_HEALTH_SCHEMA, healthController);

  return app;
}

/** Same response schema as /api/v1/health, at the deployment root. */
const ROOT_HEALTH_SCHEMA = {
  schema: {
    tags: ["Health"],
    summary: "Check API and database status (root level, no /api/v1 prefix)",
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
  } as const,
} as const;
