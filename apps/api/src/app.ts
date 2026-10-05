import Fastify from "fastify";
import { env } from "./config/env";
import { registerCors } from "./plugins/cors";
import { registerErrorHandler } from "./plugins/error-handler";
import { registerMongoDB } from "./plugins/mongodb";
import { registerRateLimit } from "./plugins/rate-limit";
import { registerSwagger } from "./plugins/swagger";
import { healthRoutes } from "./modules/health/health.route";
import { registerAuth } from "./plugins/auth";
import { authRoutes } from "./modules/auth/auth.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { itemRoutes } from "./modules/items/item.routes";
import { taskRoutes } from "./modules/tasks/task.routes";

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

  // All v1 payload routes live under the /api/v1 prefix (mobile clients pin it).
  await app.register(
    async (apiV1) => {
      await apiV1.register(healthRoutes);
      await apiV1.register(authRoutes);
      await apiV1.register(adminRoutes);
      await apiV1.register(itemRoutes);
      await apiV1.register(taskRoutes);
    },
    { prefix: "/api/v1" }
  );

  return app;
}
