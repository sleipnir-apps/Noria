import type { Migration } from "./index";

// 90 days in seconds — matches the default refresh token lifetime. The TTL index
// uses `expiresAt` as the absolute expiry, so entries are removed once the
// underlying refresh token would have expired anyway (no point keeping a
// revoked token longer than its natural lifetime).
const REFRESH_TTL_SECONDS = 90 * 24 * 60 * 60;

export const migration003CreateRevokedTokensCollection: Migration = {
  id: "003",
  description: "Create revoked_tokens collection with unique jti index and TTL",

  async up(db): Promise<void> {
    const collectionExists = await db
      .listCollections({ name: "revoked_tokens" }, { nameOnly: true })
      .hasNext();

    if (collectionExists) {
      return;
    }

    await db.createCollection("revoked_tokens", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["jti", "userId", "expiresAt", "revokedAt"],
          properties: {
            jti: {
              bsonType: "string",
              description: "JWT ID of the revoked refresh token. Required and unique.",
            },
            userId: {
              bsonType: "string",
              description: "Subject of the revoked refresh token.",
            },
            expiresAt: {
              bsonType: "date",
              description: "When the refresh token would have expired. Drives the TTL index.",
            },
            revokedAt: {
              bsonType: "date",
              description: "When the token was revoked.",
            },
          },
        },
      },
      validationLevel: "strict",
      validationAction: "error",
    });

    // Fast lookup when checking a refresh token at /auth/refresh.
    await db.collection("revoked_tokens").createIndex(
      { jti: 1 },
      {
        name: "revoked_tokens_jti_unique",
        unique: true,
      }
    );

    // Auto-delete revoked entries once the token would have expired anyway.
    // expireAfterSeconds: 0 → documents are deleted at their `expiresAt` date.
    await db.collection("revoked_tokens").createIndex(
      { expiresAt: 1 },
      {
        name: "revoked_tokens_ttl",
        expireAfterSeconds: 0,
      }
    );

    // Belt-and-suspenders: a background TTL as a fallback so orphaned entries
    // without a precise expiresAt still get cleaned within the refresh lifetime.
    await db.collection("revoked_tokens").createIndex(
      { revokedAt: 1 },
      {
        name: "revoked_tokens_revokedAt_ttl",
        expireAfterSeconds: REFRESH_TTL_SECONDS,
      }
    );
  },

  async down(db): Promise<void> {
    await db.collection("revoked_tokens").drop();
  },
};
