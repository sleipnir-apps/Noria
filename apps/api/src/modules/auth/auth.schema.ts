import {
  apiErrorResponseSchema,
  authResponseSchema,
  EXAMPLES,
  userDtoSchema,
} from "../../lib/swagger/components";

// POST /auth/register
export const registerRouteSchema = {
  tags: ["Auth"],
  summary: "Register a new user",
  description:
    "Creates a new user account, hashes the password (bcrypt), and returns the user along with a JWT access token.",
  body: {
    type: "object",
    required: ["email", "displayName", "password"],
    properties: {
      email: {
        type: "string",
        format: "email",
        description: "Unique email address",
        example: EXAMPLES.email,
      },
      displayName: {
        type: "string",
        minLength: 2,
        maxLength: 100,
        description: "Public display name",
        example: EXAMPLES.displayName,
      },
      password: {
        type: "string",
        minLength: 8,
        maxLength: 100,
        description: "Plain-text password (min 8 characters). Hashed before storage.",
        example: EXAMPLES.password,
      },
    },
  },
  response: {
    201: {
      description: "User created. Returns the user and a JWT access token.",
      ...authResponseSchema,
    },
    400: {
      description: "Invalid request body (validation error).",
      ...apiErrorResponseSchema,
    },
    409: {
      description: "Email already registered.",
      ...apiErrorResponseSchema,
    },
  },
} as const;

// POST /auth/login
export const loginRouteSchema = {
  tags: ["Auth"],
  summary: "Login",
  description: "Authenticates a user with email + password and returns a JWT access token.",
  body: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: {
        type: "string",
        format: "email",
        description: "Registered email address",
        example: EXAMPLES.email,
      },
      password: {
        type: "string",
        minLength: 1,
        description: "Plain-text password",
        example: EXAMPLES.password,
      },
    },
  },
  response: {
    200: {
      description: "Authenticated. Returns the user and a JWT access token.",
      ...authResponseSchema,
    },
    400: {
      description: "Invalid request body (validation error).",
      ...apiErrorResponseSchema,
    },
    401: {
      description: "Invalid credentials (unknown email or wrong password).",
      ...apiErrorResponseSchema,
    },
  },
} as const;

// GET /auth/me
export const meRouteSchema = {
  tags: ["Auth"],
  summary: "Get the current user",
  description: "Returns the profile of the authenticated user. Requires a valid `Bearer` JWT.",
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      description: "Current user profile.",
      type: "object",
      required: ["user"],
      properties: {
        user: userDtoSchema,
      },
    },
    401: {
      description: "Missing or invalid token.",
      ...apiErrorResponseSchema,
    },
  },
} as const;

// POST /auth/refresh
export const refreshRouteSchema = {
  tags: ["Auth"],
  summary: "Refresh the access token",
  description:
    "Exchange a valid refresh token for a new short-lived access token (and a new rotated refresh token). " +
    "Web clients send the refresh token via the `refresh_token` httpOnly cookie; native clients send it in the body. " +
    "The presented refresh token is revoked (rotation).",
  body: {
    // Web clients send no body (the refresh token travels via the cookie), so
    // accept an empty/null body in addition to { refreshToken }.
    type: ["object", "null"],
    properties: {
      refreshToken: {
        type: "string",
        description:
          "Required by native clients (stored in expo-secure-store). Web clients omit it — the token is read from the cookie.",
        example: EXAMPLES.token,
      },
    },
  },
  headers: {
    type: "object",
    properties: {
      "X-Client-Platform": {
        type: "string",
        enum: ["web", "mobile", "native", "ios", "android"],
        description:
          "Tells the server how to return the new refresh token: `web` → httpOnly cookie, `mobile`/`native` → JSON body.",
        example: "web",
      },
    },
  },
  response: {
    200: {
      description: "New access token (+ new refresh token in the body for native clients).",
      type: "object",
      required: ["accessToken"],
      properties: {
        accessToken: { type: "string", example: EXAMPLES.token },
        refreshToken: {
          type: "string",
          description: "Only present for native clients (web receives it via cookie).",
          example: EXAMPLES.token,
        },
      },
    },
    401: {
      description: "Missing, invalid or revoked refresh token.",
      ...apiErrorResponseSchema,
    },
  },
} as const;

// POST /auth/logout
export const logoutRouteSchema = {
  tags: ["Auth"],
  summary: "Logout (revoke the refresh token)",
  description:
    "Revokes the presented refresh token (rotation list) and clears the `refresh_token` cookie. " +
    "The short-lived access token is not revoked — it expires within 5 minutes.",
  security: [{ bearerAuth: [] }],
  response: {
    204: {
      description: "Logged out. Refresh token revoked, cookie cleared.",
      type: "null",
    },
    401: {
      description: "Missing or invalid access token.",
      ...apiErrorResponseSchema,
    },
  },
} as const;
