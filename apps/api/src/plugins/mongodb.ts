import type { FastifyInstance } from "fastify";
import type { Db, MongoClient } from "mongodb";
import { MongoClient as MongoClientConstructor } from "mongodb";
import { env } from "../config/env";

declare module "fastify" {
  interface FastifyInstance {
    mongoClient: MongoClient;
    db: Db;
  }
}

export async function registerMongoDB(app: FastifyInstance) {
  const mongoClient = new MongoClientConstructor(env.MONGO_URL);

  await mongoClient.connect();

  const db = mongoClient.db();

  app.decorate("mongoClient", mongoClient);
  app.decorate("db", db);

  app.addHook("onClose", async () => {
    await mongoClient.close();
  });
}
