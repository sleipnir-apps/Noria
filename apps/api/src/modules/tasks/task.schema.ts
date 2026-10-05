// Route-level JSON schemas (AJV validation + OpenAPI docs), mirroring the Zod
// contracts. Body validation happens in the routes via Zod (contract-first);
// these schemas document params/querystring and enable serialization.
export const createTaskRouteSchema = {
  tags: ["Tasks"],
  body: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      description: { type: "string", maxLength: 2000, nullable: true },
      priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
      status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"] },
      due_date: { type: "string", nullable: true },
      has_time: { type: "boolean" },
      tags: { type: "array", items: { type: "string" } },
      subtasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            is_completed: { type: "boolean" },
          },
        },
      },
      recurrence_rule: { type: "object", nullable: true },
    },
  },
} as const;

export const taskParamsRouteSchema = {
  tags: ["Tasks"],
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string" },
    },
  },
} as const;

export const updateTaskRouteSchema = {
  ...taskParamsRouteSchema,
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      description: { type: "string", maxLength: 2000, nullable: true },
      priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
      status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"] },
      due_date: { type: "string", nullable: true },
      has_time: { type: "boolean" },
      tags: { type: "array", items: { type: "string" } },
      subtasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            is_completed: { type: "boolean" },
          },
        },
      },
      recurrence_rule: { type: "object", nullable: true },
    },
  },
} as const;

export const listTaskRouteSchema = {
  tags: ["Tasks"],
  querystring: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"] },
      priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
      tag: { type: "string" },
      backlog: { type: "string" },
    },
  },
} as const;

export const rangeRouteSchema = {
  tags: ["Tasks"],
  querystring: {
    type: "object",
    required: ["start", "end"],
    properties: {
      start: { type: "string" },
      end: { type: "string" },
    },
  },
} as const;

export const occurrenceRouteSchema = {
  ...taskParamsRouteSchema,
  body: {
    type: "object",
    required: ["original_due_date"],
    properties: {
      original_due_date: { type: "string" },
      due_date: { type: "string" },
      status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"] },
    },
  },
} as const;

export const subtaskRouteSchema = {
  ...taskParamsRouteSchema,
  body: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
} as const;

export const syncPullRouteSchema = {
  tags: ["Sync"],
  querystring: {
    type: "object",
    required: ["since"],
    properties: {
      since: { type: "string" },
    },
  },
} as const;

export const syncPushRouteSchema = {
  tags: ["Sync"],
  body: {
    type: "object",
    required: ["ops"],
    properties: {
      ops: { type: "array" },
    },
  },
} as const;
