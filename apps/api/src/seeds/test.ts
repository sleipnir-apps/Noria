import { MongoClient } from "mongodb";
import { env } from "../config/env";

async function seedTest(): Promise<void> {
  if (env.NODE_ENV !== "test") {
    throw new Error("Test seeds can only run with NODE_ENV=test.");
  }

  const client = new MongoClient(env.MONGO_URL);

  try {
    await client.connect();

    const db = client.db();

    await db.collection("users").deleteMany({});
    console.info("Test seed completed.");
  } finally {
    await client.close();
  }
}

try {
  await seedTest();
} catch (error: unknown) {
  console.error("Test seed failed.", error);
  process.exitCode = 1;
}
