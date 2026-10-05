import type { FastifyInstance } from "fastify";
import type { CreateItemDto, UpdateItemDto, ItemFilters } from "@template/contracts";
import { ItemRepository } from "./item.repository";
import { AppError } from "../../lib/errors/AppError";

function toDto(doc: Awaited<ReturnType<ItemRepository["findById"]>>) {
  if (!doc) return null;
  return {
    id: doc._id!.toString(),
    title: doc.title,
    description: doc.description,
    status: doc.status,
    ownerId: doc.ownerId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export class ItemService {
  private repo: ItemRepository;

  constructor(app: FastifyInstance) {
    this.repo = new ItemRepository(app.db);
  }

  async ensureIndexes() {
    return this.repo.ensureIndexes();
  }

  async create(ownerId: string, dto: CreateItemDto) {
    const doc = await this.repo.create(ownerId, dto);
    return toDto(doc)!;
  }

  async list(ownerId: string, filters: ItemFilters) {
    const { items, total } = await this.repo.findAll(ownerId, filters);
    return {
      data: items.map((d) => toDto(d)!),
      meta: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  async get(ownerId: string, id: string) {
    const doc = await this.repo.findById(id, ownerId);
    if (!doc) throw AppError.notFound("Item introuvable.");
    return toDto(doc)!;
  }

  async update(ownerId: string, id: string, dto: UpdateItemDto) {
    const doc = await this.repo.update(id, ownerId, dto);
    if (!doc) throw AppError.notFound("Item introuvable.");
    return toDto(doc)!;
  }

  async delete(ownerId: string, id: string) {
    const deleted = await this.repo.delete(id, ownerId);
    if (!deleted) throw AppError.notFound("Item introuvable.");
  }
}
