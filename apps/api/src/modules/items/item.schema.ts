export const createItemRouteSchema = {
  tags: ["Items"],
  body: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 100 },
      description: { type: "string", maxLength: 500 },
    },
  },
};

export const listItemsRouteSchema = {
  tags: ["Items"],
  querystring: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["active", "archived"] },
      search: { type: "string" },
      page: { type: "number" },
      limit: { type: "number" },
    },
  },
};

export const itemParamsSchema = {
  tags: ["Items"],
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string" },
    },
  },
};

export const updateItemRouteSchema = {
  ...itemParamsSchema,
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 100 },
      description: { type: "string", maxLength: 500 },
      status: { type: "string", enum: ["active", "archived"] },
    },
  },
};
