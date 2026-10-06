import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { env } from "../config/env";

async function seedDevelopment(): Promise<void> {
  if (env.NODE_ENV === "production") {
    throw new Error("Development seeds cannot run in production.");
  }

  const client = new MongoClient(env.MONGO_URL);

  try {
    await client.connect();

    const db = client.db();

    await db.collection("users").updateOne(
      { email: "admin@example.test" },
      {
        $set: {
          email: "admin@example.test",
          displayName: "Development Admin",
          role: "admin",
          passwordHash: await bcrypt.hash("admin-noria123", 10),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    console.info("Development seed completed.");
  } finally {
    await client.close();
  }
}

try {
  await seedDevelopment();
} catch (error: unknown) {
  console.error("Development seed failed.", error);
  process.exitCode = 1;
}
