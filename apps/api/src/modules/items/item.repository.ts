import type { Collection, Db, Filter, ObjectId } from "mongodb";
import type { CreateItemDto, UpdateItemDto, ItemFilters } from "@template/contracts";

export interface ItemDocument {
  _id?: ObjectId;
  title: string;
  description?: string;
  status: "active" | "archived";
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ItemRepository {
  private col: Collection<ItemDocument>;

  constructor(db: Db) {
    this.col = db.collection<ItemDocument>("items");
  }

  async ensureIndexes(): Promise<void> {
    await this.col.createIndex({ ownerId: 1 });
    await this.col.createIndex({ status: 1 });
    await this.col.createIndex({ title: "text", description: "text" });
    await this.col.createIndex({ createdAt: -1 });
  }

  async create(ownerId: string, dto: CreateItemDto): Promise<ItemDocument> {
    const now = new Date();
    const doc: ItemDocument = {
      ...dto,
      status: "active",
      ownerId,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.col.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }

  async findAll(ownerId: string, filters: ItemFilters) {
    const query: Filter<ItemDocument> = { ownerId };
    if (filters.status) query.status = filters.status;
    if (filters.search) query.$text = { $search: filters.search };

    const skip = (filters.page - 1) * filters.limit;

    const [items, total] = await Promise.all([
      this.col.find(query).sort({ createdAt: -1 }).skip(skip).limit(filters.limit).toArray(),
      this.col.countDocuments(query),
    ]);

    return { items, total };
  }

  async findById(id: string, ownerId: string): Promise<ItemDocument | null> {
    const { ObjectId } = await import("mongodb");
    if (!ObjectId.isValid(id)) return null;
    return this.col.findOne({ _id: new ObjectId(id), ownerId });
  }

  async update(id: string, ownerId: string, dto: UpdateItemDto): Promise<ItemDocument | null> {
    const { ObjectId } = await import("mongodb");
    if (!ObjectId.isValid(id)) return null;
    const result = await this.col.findOneAndUpdate(
      { _id: new ObjectId(id), ownerId },
      { $set: { ...dto, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    return result ?? null;
  }

  async delete(id: string, ownerId: string): Promise<boolean> {
    const { ObjectId } = await import("mongodb");
    if (!ObjectId.isValid(id)) return false;
    const result = await this.col.deleteOne({ _id: new ObjectId(id), ownerId });
    return result.deletedCount === 1;
  }
}
