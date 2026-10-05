import { MongoClient, type Collection, type Db } from "mongodb";
import { env } from "../config/env";
import { migrations, type Migration } from "./index";

interface AppliedMigration {
  _id: string;
  description: string;
  appliedAt: Date;
}

const migrationsCollectionName = "_migrations";

function getMigrationsCollection(db: Db): Collection<AppliedMigration> {
  return db.collection<AppliedMigration>(migrationsCollectionName);
}

async function ensureMigrationsIndex(db: Db): Promise<void> {
  const exists = await db.listCollections({ name: "_migrations" }, { nameOnly: true }).hasNext();

  if (!exists) {
    await db.createCollection("_migrations");
  }
}

async function getAppliedMigrationIds(db: Db): Promise<Set<string>> {
  const appliedMigrations = await getMigrationsCollection(db)
    .find({}, { projection: { _id: 1 } })
    .toArray();

  return new Set(appliedMigrations.map((migration: AppliedMigration) => migration._id));
}

function validateMigrations(registeredMigrations: readonly Migration[]): void {
  const migrationIds = registeredMigrations.map((migration: Migration) => migration.id);
  const uniqueMigrationIds = new Set(migrationIds);

  if (migrationIds.length !== uniqueMigrationIds.size) {
    throw new Error("Duplicate migration IDs detected.");
  }

  const sortedMigrationIds = [...migrationIds].sort((a: string, b: string) => a.localeCompare(b));

  if (migrationIds.join(",") !== sortedMigrationIds.join(",")) {
    throw new Error("Migrations must be registered in ascending ID order.");
  }
}

export async function runMigrations(): Promise<void> {
  validateMigrations(migrations);

  const client = new MongoClient(env.MONGO_URL);

  try {
    await client.connect();

    const db = client.db();
    await ensureMigrationsIndex(db);

    const appliedMigrationIds = await getAppliedMigrationIds(db);
    const pendingMigrations = migrations.filter(
      (migration: Migration) => !appliedMigrationIds.has(migration.id)
    );

    if (pendingMigrations.length === 0) {
      console.info("No pending migrations.");
      return;
    }

    for (const migration of pendingMigrations) {
      console.info(`Applying migration ${migration.id}: ${migration.description}`);

      await migration.up(db);

      await getMigrationsCollection(db).insertOne({
        _id: migration.id,
        description: migration.description,
        appliedAt: new Date(),
      });

      console.info(`Applied migration ${migration.id}.`);
    }
  } finally {
    await client.close();
  }
}

if (import.meta.main) {
  try {
    await runMigrations();
  } catch (error: unknown) {
    console.error("Migration process failed.", error);
    process.exitCode = 1;
  }
}
