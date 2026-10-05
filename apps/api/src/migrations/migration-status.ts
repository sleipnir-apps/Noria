import { MongoClient, type Collection, type Db } from "mongodb";
import { env } from "../config/env";
import { migrations } from "./index";

interface AppliedMigration {
  _id: string;
  description: string;
  appliedAt: Date;
}

function getMigrationsCollection(db: Db): Collection<AppliedMigration> {
  return db.collection<AppliedMigration>("_migrations");
}

async function printMigrationStatus(): Promise<void> {
  const client = new MongoClient(env.MONGO_URL);

  try {
    await client.connect();

    const db = client.db();
    const appliedMigrations = await getMigrationsCollection(db).find({}).toArray();
    const appliedMigrationIds = new Set(
      appliedMigrations.map((migration: AppliedMigration) => migration._id)
    );

    for (const migration of migrations) {
      const status = appliedMigrationIds.has(migration.id) ? "APPLIED" : "PENDING";

      console.info(`${status.padEnd(7)} ${migration.id}  ${migration.description}`);
    }
  } finally {
    await client.close();
  }
}

try {
  await printMigrationStatus();
} catch (error: unknown) {
  console.error("Unable to retrieve migration status.", error);
  process.exitCode = 1;
}
