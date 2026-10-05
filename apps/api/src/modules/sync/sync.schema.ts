const taskItemSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    updated_at: { type: "string", format: "date-time" },
    deleted_at: { type: "string", format: "date-time", nullable: true },
  },
} as const;

/** GET /sync */
export const syncPullRouteSchema = {
  tags: ["Sync"],
  summary: "Pull changes since a timestamp (offline-first)",
  description:
    "Returns every task document of the authenticated user updated after `since`, split into " +
    "`changes` (live documents) and `deletions` (soft-deleted), plus `server_time` to anchor the next pull.",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: "object",
    properties: {
      since: {
        type: "string",
        format: "date-time",
        description: "ISO timestamp of the client's last successful sync. Omit for a full pull.",
      },
    },
  },
  response: {
    200: {
      description: "Changes + deletions + server time.",
      type: "object",
      required: ["changes", "deletions", "server_time"],
      properties: {
        changes: { type: "array", items: taskItemSchema },
        deletions: { type: "array", items: taskItemSchema },
        server_time: { type: "string", format: "date-time" },
      },
    },
    401: { description: "Missing or invalid token.", type: "object" },
  },
} as const;

/** POST /sync/push */
export const syncPushRouteSchema = {
  tags: ["Sync"],
  summary: "Push client mutations (batch, LWW)",
  description:
    "Applies a batch of client operations (upsert / delete). Conflicts are resolved with " +
    "Last-Writer-Wins on `updated_at`: an operation older than the stored document is rejected " +
    "and reported in `conflicts` with the kept timestamp.",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    required: ["operations"],
    properties: {
      operations: {
        type: "array",
        minItems: 1,
        maxItems: 500,
        items: {
          type: "object",
          required: ["op", "id", "updated_at"],
          properties: {
            op: { type: "string", enum: ["upsert", "delete"] },
            id: { type: "string" },
            updated_at: { type: "string", format: "date-time" },
            data: { type: "object" },
          },
        },
      },
    },
  },
  response: {
    200: {
      description: "Applied ids + conflicts (rejected operations).",
      type: "object",
      required: ["applied", "conflicts"],
      properties: {
        applied: { type: "array", items: { type: "string" } },
        conflicts: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "kept", "rejected_updated_at"],
            properties: {
              id: { type: "string" },
              kept: { type: "string", format: "date-time" },
              rejected_updated_at: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    401: { description: "Missing or invalid token.", type: "object" },
  },
} as const;
