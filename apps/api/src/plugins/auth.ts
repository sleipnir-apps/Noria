import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env";
import { API_PREFIX } from "../config/api-prefix";
import { AppError } from "../lib/errors/AppError";

const REFRESH_COOKIE_NAME = "refresh_token";
/** Cookie is scoped to the auth endpoints under the API prefix. */
const REFRESH_COOKIE_PATH = `${API_PREFIX}/auth`;

// How the client tells us where it wants the refresh token delivered.
// "web"   → httpOnly cookie (JS cannot read it → XSS-safe).
// "mobile"→ JSON body (the native app stores it in expo-secure-store).
const CLIENT_PLATFORM_HEADER = "x-client-platform";

export interface JwtPayload {
  sub: string;
  email: string;
  role: "user" | "admin";
  type: "access" | "refresh";
  jti?: string; // present on refresh tokens only
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorizeAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Sign an access (5m) + refresh (90d, with jti) pair for a user. */
    signTokens: (user: { id: string; email: string; role: "user" | "admin" }) => {
      accessToken: string;
      refreshToken: string;
      refreshJti: string;
    };
    /** Read the refresh token from the cookie (web) or the request body (mobile). */
    readRefreshToken: (request: FastifyRequest) => string | undefined;
    /** Set the refresh token as an httpOnly cookie (web clients). */
    setRefreshCookie: (reply: FastifyReply, token: string) => void;
    /** Clear the refresh cookie (logout). */
    clearRefreshCookie: (reply: FastifyReply) => void;
    /** Whether the client asked for the refresh token in the body (mobile). */
    wantsRefreshInBody: (request: FastifyRequest) => boolean;
    /** Revoke a refresh token by its jti (add to the revoked_tokens collection). */
    revokeRefreshToken: (jti: string, userId: string, expiresAt: Date) => Promise<void>;
    /** Check whether a refresh token jti has been revoked. */
    isRefreshTokenRevoked: (jti: string) => Promise<boolean>;
  }
}

function isSecureCookie(): boolean {
  return env.NODE_ENV === "production";
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  // Cookies must be registered before JWT can read refresh tokens from them.
  await app.register(fastifyCookie, {
    secret: env.JWT_REFRESH_SECRET,
  });

  // Access tokens — short lived (JWT_ACCESS_EXPIRES, default 5m).
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRES },
  });

  // Refresh tokens — long lived (JWT_REFRESH_EXPIRES, default 90d), separate
  // secret and namespaced under `refresh` so they can't be confused with
  // access tokens. Exposed as `app.refresh.jwt`.
  await app.register(fastifyJwt, {
    secret: env.JWT_REFRESH_SECRET,
    namespace: "refresh",
    sign: { expiresIn: env.JWT_REFRESH_EXPIRES },
  });

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify();
      } catch {
        throw new AppError("UNAUTHORIZED", "Token invalide ou manquant.", 401, []);
      }
      if (request.user.type !== "access") {
        throw new AppError("UNAUTHORIZED", "Token invalide ou manquant.", 401, []);
      }
    }
  );

  app.decorate(
    "authorizeAdmin",
    async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify();
      } catch {
        throw new AppError("UNAUTHORIZED", "Token invalide ou manquant.", 401, []);
      }
      if (request.user.type !== "access") {
        throw new AppError("UNAUTHORIZED", "Token invalide ou manquant.", 401, []);
      }
      if (request.user.role !== "admin") {
        throw new AppError("FORBIDDEN", "Accès réservé aux administrateurs.", 403, []);
      }
    }
  );

  app.decorate("signTokens", (user) => {
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: "access",
    };
    const refreshJti = crypto.randomUUID();
    const refreshPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: "refresh",
      jti: refreshJti,
    };

    const accessToken = app.jwt.sign(accessPayload);
    const refreshToken = appRefreshJwt(app).sign(refreshPayload);

    return { accessToken, refreshToken, refreshJti };
  });

  app.decorate("wantsRefreshInBody", (request) => {
    const platform = String(
      (request.headers as Record<string, string | undefined>)[CLIENT_PLATFORM_HEADER] ?? ""
    ).toLowerCase();
    return (
      platform === "mobile" || platform === "native" || platform === "ios" || platform === "android"
    );
  });

  app.decorate("readRefreshToken", (request) => {
    // Mobile sends it in the body; web sends it via the httpOnly cookie.
    const fromBody = (request.body as Record<string, unknown> | undefined)?.refreshToken;
    if (typeof fromBody === "string" && fromBody.length > 0) {
      return fromBody;
    }
    return request.cookies?.[REFRESH_COOKIE_NAME];
  });

  app.decorate("setRefreshCookie", (reply, token) => {
    reply.setCookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isSecureCookie(),
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      path: REFRESH_COOKIE_PATH,
      maxAge: 90 * 24 * 60 * 60, // 90 days, mirrors JWT_REFRESH_EXPIRES
    });
  });

  app.decorate("clearRefreshCookie", (reply) => {
    reply.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: isSecureCookie(),
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      path: REFRESH_COOKIE_PATH,
    });
  });

  app.decorate("revokeRefreshToken", async (jti, userId, expiresAt) => {
    await app.db.collection("revoked_tokens").insertOne({
      jti,
      userId,
      expiresAt,
      revokedAt: new Date(),
    });
  });

  app.decorate("isRefreshTokenRevoked", async (jti) => {
    const found = await app.db
      .collection("revoked_tokens")
      .findOne({ jti }, { projection: { _id: 1 } });
    return found !== null;
  });
}

// Re-exported so other modules (e.g. tests) can reference the cookie name.
export { REFRESH_COOKIE_NAME };

/** Type-safe accessor for the namespaced `app.jwt.refresh` decorator. */
export function appRefreshJwt(app: FastifyInstance): {
  sign: (payload: object | string | Buffer) => string;
  verify: <T = JwtPayload>(token: string) => T;
  decode: (token: string) => unknown;
} {
  // fastify-jwt with `namespace: 'refresh'` attaches the second decorator as
  // `app.jwt.refresh` (a property on the jwt decorator), NOT `app.refresh.jwt`.
  return (
    app.jwt as unknown as {
      refresh: {
        sign: (payload: object | string | Buffer) => string;
        verify: <T>(token: string) => T;
        decode: (token: string) => unknown;
      };
    }
  ).refresh;
}
