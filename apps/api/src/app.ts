import Fastify from "fastify";
import { env } from "./config/env";
import { API_PREFIX } from "./config/api-prefix";
import { registerCors } from "./plugins/cors";
import { registerErrorHandler } from "./plugins/error-handler";
import { registerMongoDB } from "./plugins/mongodb";
import { registerRateLimit } from "./plugins/rate-limit";
import { registerSwagger } from "./plugins/swagger";
import { healthRoutes, registerHealthPaths } from "./modules/health/health.route";
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

  // Health at the root: the deployed API is served at the root and liveness
  // probes call GET /health without the /api/v1 prefix. One shared handler
  // and contract; the scoped /api/v1/health alias keeps working for the front.
  registerHealthPaths(app);

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

  return app;
}
