import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthResponse } from "@template/contracts";
import { AuthService } from "./auth.service";
import { LoginInputSchema, RegisterInputSchema } from "@template/contracts";
import { AppError } from "../../lib/errors/AppError";
import {
  loginRouteSchema,
  logoutRouteSchema,
  meRouteSchema,
  refreshRouteSchema,
  registerRouteSchema,
} from "./auth.schema";

export async function authRoutes(app: FastifyInstance) {
  const service = new AuthService(app);

  // POST /auth/register
  app.post("/auth/register", { schema: registerRouteSchema }, async (request, reply) => {
    const parsed = RegisterInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw AppError.validation("Données invalides", parsed.error.issues);
    }
    const result = await service.register(parsed.data);
    return reply.status(201).send(deliverRefresh(app, request, reply, result));
  });

  // POST /auth/login
  app.post("/auth/login", { schema: loginRouteSchema }, async (request, reply) => {
    const parsed = LoginInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw AppError.validation("Données invalides", parsed.error.issues);
    }
    const result = await service.login(parsed.data);
    return reply.send(deliverRefresh(app, request, reply, result));
  });

  // POST /auth/refresh
  app.post("/auth/refresh", { schema: refreshRouteSchema }, async (request, reply) => {
    const result = await service.refresh(request, reply);
    return reply.send(result);
  });

  // POST /auth/logout
  app.post(
    "/auth/logout",
    { preValidation: [app.authenticate], schema: logoutRouteSchema },
    async (request, reply) => {
      await service.logout(request, reply);
      return reply.status(204).send();
    }
  );

  // GET /auth/me (protégée)
  app.get(
    "/auth/me",
    { preValidation: [app.authenticate], schema: meRouteSchema },
    async (request, reply) => {
      const user = await service.me(request.user.sub);
      return reply.send({ user });
    }
  );
}

/**
 * On web: set the refresh token as an httpOnly cookie and strip it from the body.
 * On mobile: keep it in the body so the app can store it in expo-secure-store.
 */
function deliverRefresh(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  result: AuthResponse
): AuthResponse {
  if (app.wantsRefreshInBody(request)) {
    // Mobile: keep refreshToken in the body.
    return result;
  }
  // Web: move the refresh token to the cookie, never expose it in the body.
  if (result.refreshToken) {
    app.setRefreshCookie(reply, result.refreshToken);
    const { refreshToken: _omit, ...withoutRefresh } = result;
    return withoutRefresh;
  }
  return result;
}
