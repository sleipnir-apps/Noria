import type { FastifyInstance } from "fastify";

/**
 * Importe l'application après l'initialisation de l'environnement de test.
 * Cela garantit que env.MONGO_URL pointe sur MongoMemoryServer.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const { buildApp: createApp } = await import("../../app");
  const app = await createApp();
  await app.ready();
  return app;
}
