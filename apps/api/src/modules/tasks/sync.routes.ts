import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SyncPullQuerySchema, SyncPushSchema } from "@template/contracts";
import { TaskService } from "./task.service";
import { AppError } from "../../lib/errors/AppError";
import { syncPullRouteSchema, syncPushRouteSchema } from "./task.schema";

type AuthRequest = FastifyRequest & { user: { sub: string } };

/**
 * Offline-first sync gateway:
 * - GET  /sync?since=<iso> : incremental pull (changes + deletions + watermark)
 * - POST /sync/push        : replayed local mutations, LWW on updatedAt
 */
export async function syncRoutes(app: FastifyInstance) {
  const service = new TaskService(app);
  await service.ensureIndexes();

  app.get(
    "/sync",
    { preValidation: [app.authenticate], schema: syncPullRouteSchema },
    async (request: AuthRequest, reply: FastifyReply) => {
      const parsed = SyncPullQuerySchema.safeParse(request.query);
      if (!parsed.success)
        throw AppError.validation("Paramètres sync invalides", parsed.error.issues);
      const result = await service.syncPull(request.user.sub, parsed.data.since);
      return reply.send(result);
    }
  );

  app.post(
    "/sync/push",
    { preValidation: [app.authenticate], schema: syncPushRouteSchema },
    async (request: AuthRequest, reply: FastifyReply) => {
      const parsed = SyncPushSchema.safeParse(request.body);
      if (!parsed.success)
        throw AppError.validation("Opérations sync invalides", parsed.error.issues);
      const result = await service.syncPush(request.user.sub, parsed.data);
      return reply.send(result);
    }
  );
}
