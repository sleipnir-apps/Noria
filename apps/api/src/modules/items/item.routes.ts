import type { FastifyInstance } from "fastify";
import { CreateItemSchema, UpdateItemSchema, ItemFiltersSchema } from "@template/contracts";
import { ItemService } from "./item.service";
import { AppError } from "../../lib/errors/AppError";
import {
  createItemRouteSchema,
  listItemsRouteSchema,
  itemParamsSchema,
  updateItemRouteSchema,
} from "./item.schema";

export async function itemRoutes(app: FastifyInstance) {
  const service = new ItemService(app);
  await service.ensureIndexes();

  // POST /items
  app.post(
    "/items",
    { preValidation: [app.authenticate], schema: createItemRouteSchema },
    async (request, reply) => {
      const parsed = CreateItemSchema.safeParse(request.body);
      if (!parsed.success) throw AppError.validation("Données invalides", parsed.error.issues);
      const item = await service.create(request.user.sub, parsed.data);
      return reply.status(201).send(item);
    }
  );

  // GET /items
  app.get(
    "/items",
    { preValidation: [app.authenticate], schema: listItemsRouteSchema },
    async (request, reply) => {
      const parsed = ItemFiltersSchema.safeParse(request.query);
      if (!parsed.success) throw AppError.validation("Filtres invalides", parsed.error.issues);
      const result = await service.list(request.user.sub, parsed.data);
      return reply.send(result);
    }
  );

  // GET /items/:id
  app.get(
    "/items/:id",
    { preValidation: [app.authenticate], schema: itemParamsSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = await service.get(request.user.sub, id);
      return reply.send(item);
    }
  );

  // PATCH /items/:id
  app.patch(
    "/items/:id",
    { preValidation: [app.authenticate], schema: updateItemRouteSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateItemSchema.safeParse(request.body);
      if (!parsed.success) throw AppError.validation("Données invalides", parsed.error.issues);
      const item = await service.update(request.user.sub, id, parsed.data);
      return reply.send(item);
    }
  );

  // DELETE /items/:id
  app.delete(
    "/items/:id",
    { preValidation: [app.authenticate], schema: itemParamsSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await service.delete(request.user.sub, id);
      return reply.status(204).send();
    }
  );
}
