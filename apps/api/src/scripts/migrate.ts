// apps/api/src/scripts/migrate.ts
import { MongoClient } from "mongodb";
import { env } from "../config/env";

async function run() {
  const client = new MongoClient(env.MONGO_URL);
  try {
    await client.connect();
    const db = client.db();

    console.log("Starting migrations...");

    // Exemple : Créer un index sur la collection users
    await db.collection("users").createIndex({ email: 1 }, { unique: true });

    console.log("Migrations finished successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await client.close();
  }
}

run();
