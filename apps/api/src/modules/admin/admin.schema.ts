import { apiErrorResponseSchema, userDtoSchema } from "../../lib/swagger/components";

// GET /admin/users
export const adminUsersRouteSchema = {
  tags: ["Admin"],
  summary: "List users (paginated)",
  description:
    "Returns a paginated list of all users (without password hashes). " +
    "Requires an `admin` JWT (the `role` claim must be `admin`).",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: "object",
    properties: {
      page: {
        type: "integer",
        minimum: 1,
        default: 1,
        description: "Page number (1-based)",
        example: 1,
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 20,
        description: "Number of users per page",
        example: 20,
      },
    },
  },
  response: {
    200: {
      description: "Paginated list of users.",
      type: "object",
      required: ["data", "meta"],
      properties: {
        data: {
          type: "array",
          items: userDtoSchema,
        },
        meta: {
          type: "object",
          required: ["total", "page", "limit", "totalPages"],
          properties: {
            total: { type: "integer", example: 42 },
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 20 },
            totalPages: { type: "integer", example: 3 },
          },
        },
      },
    },
    401: {
      description: "Missing or invalid token.",
      ...apiErrorResponseSchema,
    },
    403: {
      description: "Token is valid but the user is not an admin.",
      ...apiErrorResponseSchema,
    },
  },
} as const;
