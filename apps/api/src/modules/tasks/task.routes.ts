import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CreateTaskSchema,
  OccurrenceUpdateSchema,
  TaskFiltersSchema,
  TaskRangeQuerySchema,
  UpdateTaskSchema,
  UpcomingQuerySchema,
} from "@template/contracts";
import { TaskService } from "./task.service";
import { AppError } from "../../lib/errors/AppError";
import {
  createTaskRouteSchema,
  listTasksRouteSchema,
  overdueTasksRouteSchema,
  patchOccurrenceRouteSchema,
  rangeTasksRouteSchema,
  taskParamsSchema,
  updateTaskRouteSchema,
  upcomingTasksRouteSchema,
} from "./task.schema";

type AuthRequest = FastifyRequest & { user: { sub: string } };

export async function taskRoutes(app: FastifyInstance) {
  const service = new TaskService(app);
  await service.ensureIndexes();

  // POST /tasks
  app.post(
    "/tasks",
    { preValidation: [app.authenticate], schema: createTaskRouteSchema },
    async (request: AuthRequest, reply: FastifyReply) => {
      const parsed = CreateTaskSchema.safeParse(request.body);
      if (!parsed.success) throw AppError.validation("Données invalides", parsed.error.issues);
      const task = await service.create(request.user.sub, parsed.data);
      return reply.status(201).send(task);
    }
  );

  // GET /tasks
  app.get(
    "/tasks",
    { preValidation: [app.authenticate], schema: listTasksRouteSchema },
    async (request: AuthRequest, reply: FastifyReply) => {
      const parsed = TaskFiltersSchema.safeParse(request.query);
      if (!parsed.success) throw AppError.validation("Filtres invalides", parsed.error.issues);
      const result = await service.list(request.user.sub, parsed.data);
      return reply.send(result);
    }
  );

  // GET /tasks/range — dated tasks fused with computed occurrences
  app.get(
    "/tasks/range",
    { preValidation: [app.authenticate], schema: rangeTasksRouteSchema },
    async (request: AuthRequest, reply: FastifyReply) => {
      const parsed = TaskRangeQuerySchema.safeParse(request.query);
      if (!parsed.success) throw AppError.validation("Intervalle invalide", parsed.error.issues);
      const { start, end } = parsed.data;
      const data = await service.getRange(request.user.sub, start, end);
      return reply.send({ start, end, data });
    }
  );

  // GET /tasks/overdue
  app.get(
    "/tasks/overdue",
    { preValidation: [app.authenticate], schema: overdueTasksRouteSchema },
    async (request: AuthRequest, reply: FastifyReply) => {
      const now = (request.query as { now?: string } | undefined)?.now;
      const data = await service.getOverdue(request.user.sub, now);
      return reply.send({ since: now ?? new Date().toISOString(), data });
    }
  );

  // GET /tasks/upcoming — "À venir": [now, now + days) grouped by day
  app.get(
    "/tasks/upcoming",
    { preValidation: [app.authenticate], schema: upcomingTasksRouteSchema },
    async (request: AuthRequest, reply: FastifyReply) => {
      const parsed = UpcomingQuerySchema.safeParse(request.query);
      if (!parsed.success) throw AppError.validation("Fenêtre invalide", parsed.error.issues);
      const { days, now } = parsed.data;
      const result = await service.getUpcoming(request.user.sub, days, now);
      return reply.send(result);
    }
  );

  // GET /tasks/:id
  app.get(
    "/tasks/:id",
    { preValidation: [app.authenticate], schema: taskParamsSchema },
    async (request: AuthRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const task = await service.get(request.user.sub, id);
      return reply.send(task);
    }
  );

  // PATCH /tasks/:id
  app.patch(
    "/tasks/:id",
    { preValidation: [app.authenticate], schema: updateTaskRouteSchema },
    async (request: AuthRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateTaskSchema.safeParse(request.body);
      if (!parsed.success) throw AppError.validation("Données invalides", parsed.error.issues);
      const task = await service.update(request.user.sub, id, parsed.data);
      return reply.send(task);
    }
  );

  // PATCH /tasks/:id/occurrences/:date — mutate a computed occurrence
  app.patch(
    "/tasks/:id/occurrences/:date",
    { preValidation: [app.authenticate], schema: patchOccurrenceRouteSchema },
    async (request: AuthRequest, reply: FastifyReply) => {
      const { id, date } = request.params as { id: string; date: string };
      const parsed = OccurrenceUpdateSchema.safeParse(request.body);
      if (!parsed.success) throw AppError.validation("Données invalides", parsed.error.issues);
      const task = await service.patchOccurrence(request.user.sub, id, date, parsed.data);
      return reply.send(task);
    }
  );

  // DELETE /tasks/:id (soft)
  app.delete(
    "/tasks/:id",
    { preValidation: [app.authenticate], schema: taskParamsSchema },
    async (request: AuthRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      await service.softDelete(request.user.sub, id);
      return reply.status(204).send();
    }
  );
}
