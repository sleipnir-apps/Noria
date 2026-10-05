import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env";

export async function registerSwagger(app: FastifyInstance) {
  if (env.NODE_ENV === "production") return;

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "API",
        description: "API documentation",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
  });

  app.addHook("onReady", async (): Promise<void> => {
    app.log.info(`📚 Swagger UI available at http://${env.HOST}:${env.PORT}/docs`);
  });
}
