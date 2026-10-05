const taskProperties = {
  id: { type: "string" },
  title: { type: "string", minLength: 1, maxLength: 200 },
  description: { type: "string", maxLength: 2000, nullable: true },
  priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
  status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"] },
  due_date: { type: "string", format: "date-time", nullable: true },
  has_time: { type: "boolean" },
  tags: { type: "array", items: { type: "string" } },
  subtasks: {
    type: "array",
    items: {
      type: "object",
      required: ["id", "title", "is_completed"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        is_completed: { type: "boolean" },
      },
    },
  },
  recurrence_rule: {
    type: "object",
    nullable: true,
    required: ["frequency", "interval"],
    properties: {
      frequency: { type: "string", enum: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] },
      interval: { type: "integer", minimum: 1 },
      by_weekday: {
        type: "array",
        items: { type: "string", enum: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] },
      },
      by_month_day: { type: "integer", minimum: 1, maximum: 31 },
      end_date: { type: "string", format: "date-time", nullable: true },
    },
  },
  parent_task_id: { type: "string", nullable: true },
  original_due_date: { type: "string", format: "date-time", nullable: true },
  is_instance: { type: "boolean" },
  is_occurrence: { type: "boolean" },
  occurrence_date: { type: "string", format: "date-time", nullable: true },
  deleted_at: { type: "string", format: "date-time", nullable: true },
  created_at: { type: "string", format: "date-time" },
  updated_at: { type: "string", format: "date-time" },
} as const;

export const createTaskRouteSchema = {
  tags: ["Tasks"],
  summary: "Create a task",
  description:
    "Creates a task owned by the authenticated user. Supports recurrence (parent/instance model).",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      description: { type: "string", maxLength: 2000 },
      priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
      status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"] },
      due_date: { type: "string", format: "date-time", nullable: true },
      has_time: { type: "boolean" },
      tags: { type: "array", items: { type: "string" }, maxItems: 20 },
      subtasks: {
        type: "array",
        maxItems: 50,
        items: {
          type: "object",
          required: ["id", "title", "is_completed"],
          properties: {
            id: { type: "string" },
            title: { type: "string", minLength: 1, maxLength: 300 },
            is_completed: { type: "boolean" },
          },
        },
      },
      recurrence_rule: {
        type: "object",
        nullable: true,
        required: ["frequency", "interval"],
        properties: {
          frequency: { type: "string", enum: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] },
          interval: { type: "integer", minimum: 1, maximum: 52 },
          by_weekday: {
            type: "array",
            items: { type: "string", enum: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] },
          },
          by_month_day: { type: "integer", minimum: 1, maximum: 31 },
          end_date: { type: "string", format: "date-time", nullable: true },
        },
      },
    },
  },
  response: {
    201: { type: "object", properties: taskProperties } as unknown,
  },
} as const;

export const listTasksRouteSchema = {
  tags: ["Tasks"],
  summary: "List tasks",
  description:
    "Lists the authenticated user's tasks (parents & standalone). Backlog view: without due_date.",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"] },
      priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
      backlog: { type: "string", enum: ["true", "false"] },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        data: { type: "array", items: { type: "object", properties: taskProperties } },
      },
    },
  },
} as const;

export const rangeTasksRouteSchema = {
  tags: ["Tasks"],
  summary: "Range view (dated tasks + recurring occurrences)",
  description:
    "Dated tasks whose due_date falls in [start, end], merged with the computed occurrences of recurring parents. " +
    "Occurrences already materialized as instances are excluded from the virtual list (the instance itself is returned).",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: "object",
    required: ["start", "end"],
    properties: {
      start: { type: "string", format: "date-time" },
      end: { type: "string", format: "date-time" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        data: { type: "array", items: { type: "object", properties: taskProperties } },
      },
    },
  },
} as const;

export const overdueTasksRouteSchema = {
  tags: ["Tasks"],
  summary: "Overdue tasks",
  description: "Dated tasks (and instances) past their due_date and not DONE/ARCHIVED.",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: "object",
    properties: {
      now: {
        type: "string",
        format: "date-time",
        description: "Server 'now' override (ISO), for tests/clients.",
      },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        data: { type: "array", items: { type: "object", properties: taskProperties } },
      },
    },
  },
} as const;

export const taskParamsSchema = {
  tags: ["Tasks"],
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" } },
  },
} as const;

export const updateTaskRouteSchema = {
  ...taskParamsSchema,
  tags: ["Tasks"],
  summary: "Update a task",
  description:
    "Generic update. `due_date: null` converts to backlog (removes the date). " +
    "On a recurring parent pass `?occurrence_date=<ISO>` to mutate THAT occurrence: " +
    "it is materialized as an instance and the parent is left untouched.",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: "object",
    properties: {
      occurrence_date: { type: "string", format: "date-time" },
    },
  },
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      description: { type: "string", maxLength: 2000, nullable: true },
      priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
      status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"] },
      due_date: { type: "string", format: "date-time", nullable: true },
      has_time: { type: "boolean" },
      tags: { type: "array", items: { type: "string" }, maxItems: 20 },
      subtasks: {
        type: "array",
        maxItems: 50,
        items: {
          type: "object",
          required: ["id", "title", "is_completed"],
          properties: {
            id: { type: "string" },
            title: { type: "string", minLength: 1, maxLength: 300 },
            is_completed: { type: "boolean" },
          },
        },
      },
      recurrence_rule: {
        type: "object",
        nullable: true,
        required: ["frequency", "interval"],
        properties: {
          frequency: { type: "string", enum: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] },
          interval: { type: "integer", minimum: 1, maximum: 52 },
          by_weekday: {
            type: "array",
            items: { type: "string", enum: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] },
          },
          by_month_day: { type: "integer", minimum: 1, maximum: 31 },
          end_date: { type: "string", format: "date-time", nullable: true },
        },
      },
    },
  },
  response: {
    200: { type: "object", properties: taskProperties } as unknown,
  },
} as const;
