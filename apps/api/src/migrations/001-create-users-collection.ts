import type { Migration } from "./index";

export const migration001CreateUsersCollection: Migration = {
  id: "001",
  description: "Create users collection with document validation",

  async up(db): Promise<void> {
    const collectionExists = await db
      .listCollections({ name: "users" }, { nameOnly: true })
      .hasNext();

    if (collectionExists) {
      return;
    }

    await db.createCollection("users", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["email", "displayName", "role", "passwordHash", "createdAt", "updatedAt"],
          properties: {
            email: {
              bsonType: "string",
              description: "Must be a string and is required.",
            },
            displayName: {
              bsonType: "string",
              description: "Must be a string and is required.",
            },
            role: {
              enum: ["user", "admin"],
              description: "Must be either user or admin.",
            },
            passwordHash: {
              bsonType: "string",
              description: "Must be a string and is required.",
            },
            createdAt: {
              bsonType: "date",
              description: "Must be a date and is required.",
            },
            updatedAt: {
              bsonType: "date",
              description: "Must be a date and is required.",
            },
          },
        },
      },
      validationLevel: "strict",
      validationAction: "error",
    });
  },

  async down(db): Promise<void> {
    await db.collection("users").drop();
  },
};
