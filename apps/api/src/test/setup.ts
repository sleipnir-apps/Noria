import { afterAll, beforeAll } from "bun:test";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongoServer: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();

  process.env["MONGO_URL"] = mongoServer.getUri();
  process.env["JWT_SECRET"] = "test-secret-32-characters-minimum";
  process.env["JWT_REFRESH_SECRET"] = "test-refresh-secret-32-characters";
  process.env["NODE_ENV"] = "test";
  process.env["LOG_LEVEL"] = "fatal";
  process.env["RATE_LIMIT_MAX"] = "10000";
  process.env["CORS_ORIGINS"] = "http://localhost:8081";
});

afterAll(async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
});
