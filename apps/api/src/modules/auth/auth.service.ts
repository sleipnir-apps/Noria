import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import type { LoginInput, RegisterInput, AuthResponse, RefreshResponse } from "@template/contracts";
import { AppError } from "../../lib/errors/AppError";
import type { JwtPayload } from "../../plugins/auth";
import { appRefreshJwt } from "../../plugins/auth";

type UserPayload = { id: string; email: string; role: "user" | "admin" };

export class AuthService {
  constructor(private fastify: FastifyInstance) {}

  private get users() {
    return this.fastify.db.collection("users");
  }

  async register(input: RegisterInput): Promise<AuthResponse> {
    const existing = await this.users.findOne({ email: input.email });
    if (existing) {
      throw AppError.conflict("Cet email est déjà utilisé");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const now = new Date();

    const result = await this.users.insertOne({
      displayName: input.displayName,
      email: input.email,
      passwordHash,
      role: "user",
      createdAt: now,
      updatedAt: now,
    });

    const user = {
      id: result.insertedId.toString(),
      email: input.email,
      displayName: input.displayName,
      role: "user" as const,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    return this.buildAuthResponse(user);
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const userDoc = await this.users.findOne({ email: input.email });
    if (!userDoc) {
      throw AppError.unauthorized("Identifiants invalides");
    }

    const isMatch = await bcrypt.compare(input.password, userDoc.passwordHash as string);
    if (!isMatch) {
      throw AppError.unauthorized("Identifiants invalides");
    }

    const user = {
      id: userDoc._id.toString(),
      email: userDoc.email as string,
      displayName: userDoc.displayName as string,
      role: userDoc.role as "user" | "admin",
      createdAt: (userDoc.createdAt as Date).toISOString(),
      updatedAt: (userDoc.updatedAt as Date).toISOString(),
    };

    return this.buildAuthResponse(user);
  }

  async me(userId: string): Promise<AuthResponse["user"]> {
    const { ObjectId } = await import("mongodb");
    const userDoc = await this.users.findOne({ _id: new ObjectId(userId) });
    if (!userDoc) {
      throw AppError.notFound("Utilisateur introuvable");
    }

    return {
      id: userDoc._id.toString(),
      email: userDoc.email as string,
      displayName: userDoc.displayName as string,
      role: userDoc.role as "user" | "admin",
      createdAt: (userDoc.createdAt as Date).toISOString(),
      updatedAt: (userDoc.updatedAt as Date).toISOString(),
    };
  }

  /**
   * Validate the presented refresh token, revoke it (rotation), and issue a
   * fresh access + refresh token pair.
   */
  async refresh(request: FastifyRequest, reply: FastifyReply): Promise<RefreshResponse> {
    const token = this.fastify.readRefreshToken(request);
    if (!token) {
      throw AppError.unauthorized("Refresh token manquant");
    }

    let payload: JwtPayload;
    try {
      payload = refreshJwt(this.fastify).verify<JwtPayload>(token);
    } catch {
      throw AppError.unauthorized("Refresh token invalide");
    }

    if (payload.type !== "refresh" || !payload.jti || !payload.sub) {
      throw AppError.unauthorized("Refresh token invalide");
    }

    // Reject revoked tokens.
    if (await this.fastify.isRefreshTokenRevoked(payload.jti)) {
      throw AppError.unauthorized("Refresh token révoqué");
    }

    // Rotation: revoke the presented refresh token immediately.
    const expiresAt = this.expiryDateFromToken(token);
    await this.fastify.revokeRefreshToken(payload.jti, payload.sub, expiresAt);

    // Issue a new pair.
    const user: UserPayload = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    return this.buildRefreshResponse(user, request, reply);
  }

  /** Revoke the presented refresh token (if any) and clear the cookie. */
  async logout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = this.fastify.readRefreshToken(request);
    if (token) {
      try {
        const payload = refreshJwt(this.fastify).verify<JwtPayload>(token);
        if (payload.type === "refresh" && payload.jti && payload.sub) {
          await this.fastify.revokeRefreshToken(
            payload.jti,
            payload.sub,
            this.expiryDateFromToken(token)
          );
        }
      } catch {
        // Token already invalid/expired — nothing to revoke, just clear the cookie.
      }
    }
    this.fastify.clearRefreshCookie(reply);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private buildAuthResponse(user: AuthResponse["user"]): AuthResponse {
    const { accessToken, refreshToken } = this.fastify.signTokens({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    return { user, accessToken, refreshToken };
  }

  private buildRefreshResponse(
    user: UserPayload,
    request: FastifyRequest,
    reply: FastifyReply
  ): RefreshResponse {
    const { accessToken, refreshToken } = this.fastify.signTokens({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    // Web clients get the new refresh token via the cookie; mobile gets it in
    // the body. The route handler is responsible for actually setting the cookie.
    if (!this.fastify.wantsRefreshInBody(request)) {
      this.fastify.setRefreshCookie(reply, refreshToken);
      return { accessToken };
    }
    return { accessToken, refreshToken };
  }

  /** Decode the `exp` claim of a JWT into a Date (used for the revocation TTL). */
  private expiryDateFromToken(token: string): Date {
    try {
      const decoded = refreshJwt(this.fastify).decode(token) as { exp?: number } | null;
      if (decoded?.exp) {
        return new Date(decoded.exp * 1000);
      }
    } catch {
      // ignore — fall back to a 90-day TTL
    }
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 90);
    return fallback;
  }
}

/** Type-safe accessor for the namespaced `app.refresh.jwt` decorator. */
function refreshJwt(app: FastifyInstance): {
  sign: (payload: object | string | Buffer) => string;
  verify: <T = JwtPayload>(token: string) => T;
  decode: (token: string) => unknown;
} {
  return appRefreshJwt(app);
}
