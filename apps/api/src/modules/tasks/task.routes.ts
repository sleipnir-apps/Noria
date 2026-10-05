import type { FastifyInstance } from "fastify";
import { CreateTaskSchema, UpdateTaskSchema } from "@template/contracts";
import { TaskService } from "./task.service";
import { AppError } from "../../lib/errors/AppError";
import {
  createTaskRouteSchema,
  listTasksRouteSchema,
  overdueTasksRouteSchema,
  rangeTasksRouteSchema,
  taskParamsSchema,
  updateTaskRouteSchema,
} from "./task.schema";

export async function taskRoutes(app: FastifyInstance) {
  const service = new TaskService(app.db);
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

  // GET /tasks
  app.get(
    "/tasks",
    { preValidation: [app.authenticate], schema: listTasksRouteSchema },
    async (request, reply) => {
      const query = request.query as { status?: string; priority?: string; backlog?: string };
      const tasks = await service.list(request.user.sub, {
        status: query.status,
        priority: query.priority,
        backlog: query.backlog === "true",
      });
      return reply.send({ data: tasks });
    }
  );

  // GET /tasks/range — MUST be registered before /tasks/:id.
  app.get(
    "/tasks/range",
    { preValidation: [app.authenticate], schema: rangeTasksRouteSchema },
    async (request, reply) => {
      const query = request.query as { start: string; end: string };
      const tasks = await service.range(request.user.sub, query.start, query.end);
      return reply.send({ data: tasks });
    }
  );

  // GET /tasks/overdue
  app.get(
    "/tasks/overdue",
    { preValidation: [app.authenticate], schema: overdueTasksRouteSchema },
    async (request, reply) => {
      const query = request.query as { now?: string };
      const tasks = await service.overdue(request.user.sub, query.now ?? new Date().toISOString());
      return reply.send({ data: tasks });
    }
  );

  // GET /tasks/:id
  app.get(
    "/tasks/:id",
    { preValidation: [app.authenticate], schema: taskParamsSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const task = await service.get(request.user.sub, id);
      return reply.send(task);
    }
  );

  // PATCH /tasks/:id — generic update + backlog↔dated conversion (due_date)
  // + occurrence mutation with ?occurrence_date=<ISO>.
  app.patch(
    "/tasks/:id",
    { preValidation: [app.authenticate], schema: updateTaskRouteSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { occurrence_date } = request.query as { occurrence_date?: string };
      const parsed = UpdateTaskSchema.safeParse(request.body);
      if (!parsed.success) throw AppError.validation("Données invalides", parsed.error.issues);
      const task = await service.update(request.user.sub, id, occurrence_date, parsed.data);
      return reply.send(task);
    }
  );

  // DELETE /tasks/:id — soft delete.
  app.delete(
    "/tasks/:id",
    { preValidation: [app.authenticate], schema: taskParamsSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await service.delete(request.user.sub, id);
      return reply.status(204).send();
    }
  );
}
