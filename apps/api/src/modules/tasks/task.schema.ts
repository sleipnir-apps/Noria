import type { FastifySchema } from "fastify";

const idParams = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", minLength: 1, maxLength: 64 },
    },
  },
};

export const createTaskRouteSchema: FastifySchema = {
  tags: ["Tasks"],
  body: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 100 },
      description: { type: "string", maxLength: 500 },
      priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
      dueDate: { type: "string" },
      hasTime: { type: "boolean" },
      tags: { type: "array", items: { type: "string" } },
      recurrenceRule: { type: "object" },
    },
  },
};

export const listTasksRouteSchema: FastifySchema = {
  tags: ["Tasks"],
  querystring: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"] },
      priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
      dated: { type: "string", enum: ["dated", "dateless", "all"] },
      page: { type: "number" },
      limit: { type: "number" },
    },
  },
};

export const taskParamsSchema: FastifySchema = {
  tags: ["Tasks"],
  ...idParams,
};

export const updateTaskRouteSchema: FastifySchema = {
  tags: ["Tasks"],
  ...idParams,
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 100 },
      description: { type: "string", maxLength: 500, nullable: true },
      priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
      status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"] },
      dueDate: { type: "string", nullable: true },
      hasTime: { type: "boolean" },
      recurrenceRule: { type: "object", nullable: true },
    },
  },
};

export const rangeTasksRouteSchema: FastifySchema = {
  tags: ["Tasks"],
  querystring: {
    type: "object",
    required: ["start", "end"],
    properties: {
      start: { type: "string" },
      end: { type: "string" },
    },
  },
};

export const overdueTasksRouteSchema: FastifySchema = {
  tags: ["Tasks"],
  querystring: {
    type: "object",
    properties: {
      now: { type: "string" },
    },
  },
};

export const upcomingTasksRouteSchema: FastifySchema = {
  tags: ["Tasks"],
  querystring: {
    type: "object",
    properties: {
      days: { type: "number", minimum: 1, maximum: 60 },
      now: { type: "string" },
    },
  },
};

export const occurrenceParamsSchema: FastifySchema = {
  tags: ["Tasks"],
  params: {
    type: "object",
    required: ["id", "date"],
    properties: {
      id: { type: "string", minLength: 1, maxLength: 64 },
      date: { type: "string", minLength: 10, maxLength: 40 },
    },
  },
};

export const patchOccurrenceRouteSchema: FastifySchema = {
  tags: ["Tasks"],
  ...occurrenceParamsSchema,
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 100 },
      description: { type: "string", maxLength: 500, nullable: true },
      priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
      status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"] },
      dueDate: { type: "string", nullable: true },
      hasTime: { type: "boolean" },
      tags: { type: "array", items: { type: "string" } },
    },
  },
};

export const syncPullRouteSchema: FastifySchema = {
  tags: ["Sync"],
  querystring: {
    type: "object",
    required: ["since"],
    properties: {
      since: { type: "string" },
    },
  },
};

export const syncPushRouteSchema: FastifySchema = {
  tags: ["Sync"],
  body: {
    type: "object",
    required: ["operations"],
    properties: {
      operations: { type: "array", maxItems: 200 },
    },
  },
};
