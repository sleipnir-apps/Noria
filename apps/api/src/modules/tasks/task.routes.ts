import type { FastifyInstance } from "fastify";
import {
  CreateTaskSchema,
  OccurrenceInputSchema,
  CreateSubtaskDtoSchema,
  SyncPushSchema,
  TaskFiltersSchema,
  UpdateTaskSchema,
} from "@template/contracts";
import { TaskService } from "./task.service";
import { AppError } from "../../lib/errors/AppError";
import {
  createTaskRouteSchema,
  listTaskRouteSchema,
  occurrenceRouteSchema,
  rangeRouteSchema,
  syncPullRouteSchema,
  syncPushRouteSchema,
  subtaskRouteSchema,
  taskParamsRouteSchema,
  updateTaskRouteSchema,
} from "./task.schema";

export async function taskRoutes(app: FastifyInstance) {
  const service = new TaskService(app);
  await service.ensureIndexes();

  // POST /tasks
  app.post(
    "/tasks",
    { preValidation: [app.authenticate], schema: createTaskRouteSchema },
    async (request, reply) => {
      const parsed = CreateTaskSchema.safeParse(request.body);
      if (!parsed.success) throw AppError.validation("Données invalides", parsed.error.issues);
      const task = await service.create(request.user.sub, parsed.data);
      return reply.status(201).send(task);
    }
  );

  // GET /tasks (list + filters; backlog=1 → tasks without a due date)
  app.get(
    "/tasks",
    { preValidation: [app.authenticate], schema: listTaskRouteSchema },
    async (request, reply) => {
      const parsed = TaskFiltersSchema.safeParse(request.query);
      if (!parsed.success) throw AppError.validation("Filtres invalides", parsed.error.issues);
      const result = await service.list(request.user.sub, {
        status: parsed.data.status,
        priority: parsed.data.priority,
        tag: parsed.data.tag,
        backlog: parsed.data.backlog === "1",
      });
      return reply.send(result);
    }
  );

  // GET /tasks/range (date-window view merged with recurrence occurrences)
  app.get(
    "/tasks/range",
    { preValidation: [app.authenticate], schema: rangeRouteSchema },
    async (request, reply) => {
      const { start, end } = request.query as { start: string; end: string };
      const result = await service.listRange(request.user.sub, new Date(start), new Date(end));
      return reply.send(result);
    }
  );

  // GET /tasks/overdue (past, uncompleted)
  app.get("/tasks/overdue", { preValidation: [app.authenticate] }, async (request, reply) => {
    const result = await service.listOverdue(request.user.sub, new Date());
    return reply.send(result);
  });

  // GET /tasks/:id
  app.get(
    "/tasks/:id",
    { preValidation: [app.authenticate], schema: taskParamsRouteSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const task = await service.get(request.user.sub, id);
      return reply.send(task);
    }
  );

  // PATCH /tasks/:id
  app.patch(
    "/tasks/:id",
    { preValidation: [app.authenticate], schema: updateTaskRouteSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateTaskSchema.safeParse(request.body);
      if (!parsed.success) throw AppError.validation("Données invalides", parsed.error.issues);
      const task = await service.update(request.user.sub, id, parsed.data);
      return reply.send(task);
    }
  );

  // DELETE /tasks/:id (soft delete)
  app.delete(
    "/tasks/:id",
    { preValidation: [app.authenticate], schema: taskParamsRouteSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await service.softDelete(request.user.sub, id);
      return reply.status(204).send();
    }
  );

  // POST /tasks/:id/occurrence (materialize a recurring occurrence as an instance)
  app.post(
    "/tasks/:id/occurrence",
    { preValidation: [app.authenticate], schema: occurrenceRouteSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = OccurrenceInputSchema.safeParse(request.body);
      if (!parsed.success) throw AppError.validation("Données invalides", parsed.error.issues);
      const task = await service.materializeOccurrence(request.user.sub, id, parsed.data);
      return reply.status(201).send(task);
    }
  );

  // POST /tasks/:id/subtasks
  app.post(
    "/tasks/:id/subtasks",
    { preValidation: [app.authenticate], schema: subtaskRouteSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = CreateSubtaskDtoSchema.safeParse(request.body);
      if (!parsed.success) throw AppError.validation("Données invalides", parsed.error.issues);
      const subtask = await service.addSubtask(request.user.sub, id, parsed.data.title);
      return reply.status(201).send(subtask);
    }
  );

  // ── Offline-first sync ──────────────────────────────────────────────────

  // GET /sync?since=<ISO> → { changes, deletions, server_time } (scoped: /api/v1/sync)
  app.get(
    "/sync",
    { preValidation: [app.authenticate], schema: syncPullRouteSchema },
    async (request, reply) => {
      const { since } = request.query as { since: string };
      const sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) {
        throw AppError.validation("`since` doit être une date ISO valide.");
      }
      const result = await service.pull(request.user.sub, sinceDate);
      return reply.send(result);
    }
  );

  // POST /sync/push → { applied, conflicts } (scoped: /api/v1/sync/push)
  app.post(
    "/sync/push",
    { preValidation: [app.authenticate], schema: syncPushRouteSchema },
    async (request, reply) => {
      const parsed = SyncPushSchema.safeParse(request.body);
      if (!parsed.success) throw AppError.validation("Opérations invalides", parsed.error.issues);
      const result = await service.push(request.user.sub, parsed.data.ops);
      return reply.send(result);
    }
  );
}
