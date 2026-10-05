import type { FastifyInstance } from "fastify";
import { SyncPushBodySchema } from "@template/contracts";
import { SyncService } from "./sync.service";
import { AppError } from "../../lib/errors/AppError";
import { syncPullRouteSchema, syncPushRouteSchema } from "./sync.schema";

export async function syncRoutes(app: FastifyInstance) {
  const service = new SyncService(app.db);

  // GET /sync?since=<ISO> — pull everything newer than `since`.
  app.get(
    "/sync",
    { preValidation: [app.authenticate], schema: syncPullRouteSchema },
    async (request, reply) => {
      const query = request.query as { since?: string };
      const result = await service.pull(request.user.sub, query.since);
      return reply.send(result);
    }
  );

  // POST /sync/push — batch of client operations, LWW on updated_at.
  app.post(
    "/sync/push",
    { preValidation: [app.authenticate], schema: syncPushRouteSchema },
    async (request, reply) => {
      const parsed = SyncPushBodySchema.safeParse(request.body);
      if (!parsed.success) throw AppError.validation("Opérations invalides", parsed.error.issues);
      const result = await service.push(request.user.sub, parsed.data);
      return reply.send(result);
    }
  );
}
