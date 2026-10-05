// Reusable OpenAPI/JSON-schema fragments shared across route docs.
// Kept here so route files stay clean and all examples stay consistent.

export const EXAMPLES = {
  email: "user@example.com",
  password: "SuperSecret123",
  displayName: "Jean Dupont",
  token:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NjRhMWIyYzNkNGU1ZjZhN2I4YzlkMGUiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJyb2xlIjoidXNlciJ9.signature",
  userId: "664a1b2c3d4e5f6a7b8c9d0e",
  requestId: "c263eaac-ee25-46f0-8675-170f07c4f057",
} as const;

// A user as returned by the API (no passwordHash).
export const userDtoSchema = {
  type: "object",
  required: ["id", "email", "displayName", "role", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string", example: EXAMPLES.userId },
    email: { type: "string", format: "email", example: EXAMPLES.email },
    displayName: { type: "string", example: EXAMPLES.displayName },
    role: { type: "string", enum: ["user", "admin"], example: "user" },
    createdAt: { type: "string", format: "date-time", example: "2026-07-27T10:00:00.000Z" },
    updatedAt: { type: "string", format: "date-time", example: "2026-07-27T10:00:00.000Z" },
  },
} as const;

// { user, accessToken, refreshToken? } returned by register & login.
// refreshToken is only present for native clients (stored in expo-secure-store);
// web clients receive it via an httpOnly cookie instead.
export const authResponseSchema = {
  type: "object",
  required: ["user", "accessToken"],
  properties: {
    user: userDtoSchema,
    accessToken: { type: "string", example: EXAMPLES.token },
    refreshToken: {
      type: "string",
      description: "Only present for native clients. Web clients get it via the httpOnly cookie.",
      example: EXAMPLES.token,
    },
  },
} as const;

// Standard error envelope produced by the error handler.
export const apiErrorResponseSchema = {
  type: "object",
  required: ["error", "requestId"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", example: "VALIDATION_ERROR" },
        message: { type: "string", example: "Données invalides." },
        details: {
          type: "array",
          items: {},
          example: [
            {
              path: ["email"],
              message: "Invalid email",
            },
          ],
        },
      },
    },
    requestId: { type: "string", example: EXAMPLES.requestId },
  },
} as const;
