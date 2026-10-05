import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../test/helpers/build-app";
import { seedUser } from "../../test/helpers/seed";

const MOBILE_HEADERS = { "x-client-platform": "mobile" };

describe("Auth routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    // Migrations légères : index email unique
    await app.db.collection("users").createIndex({ email: 1 }, { unique: true });
  });

  afterEach(async () => {
    await app.db.collection("users").deleteMany({});
    await app.db.collection("revoked_tokens").deleteMany({});
    await app.close();
  });

  // ── Register ────────────────────────────────────────────────────────────

  describe("POST /auth/register", () => {
    it("crée un utilisateur et retourne les tokens", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        headers: MOBILE_HEADERS,
        payload: {
          email: "new@example.com",
          displayName: "New User",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.user.email).toBe("new@example.com");
      expect(body.accessToken).toBeString();
      expect(body.refreshToken).toBeString();
      expect(body.user.passwordHash).toBeUndefined();
    });

    it("retourne 409 si l'email est déjà utilisé", async () => {
      await seedUser(app, { email: "dup@example.com" });

      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        headers: MOBILE_HEADERS,
        payload: {
          email: "dup@example.com",
          displayName: "Dup User",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it("retourne 400 si le body est invalide", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        headers: MOBILE_HEADERS,
        payload: { email: "bad-email", password: "123" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── Login ────────────────────────────────────────────────────────────────

  describe("POST /auth/login", () => {
    it("retourne les tokens avec des identifiants valides", async () => {
      await seedUser(app, { email: "login@example.com" });

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: MOBILE_HEADERS,
        payload: { email: "login@example.com", password: "password123" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeString();
      expect(body.refreshToken).toBeString();
    });

    it("retourne 401 avec un mauvais mot de passe", async () => {
      await seedUser(app, { email: "login2@example.com" });

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: MOBILE_HEADERS,
        payload: { email: "login2@example.com", password: "wrongpassword" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("retourne 401 si l'utilisateur n'existe pas", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: MOBILE_HEADERS,
        payload: { email: "ghost@example.com", password: "password123" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── Me ───────────────────────────────────────────────────────────────────

  describe("GET /auth/me", () => {
    it("retourne le profil avec un token valide", async () => {
      const user = await seedUser(app, { email: "me@example.com" });
      const { accessToken } = app.signTokens({ id: user.id, email: user.email, role: user.role });

      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().user.email).toBe("me@example.com");
    });

    it("retourne 401 sans token", async () => {
      const res = await app.inject({ method: "GET", url: "/auth/me" });
      expect(res.statusCode).toBe(401);
    });

    it("retourne 401 avec un refresh token à la place d'un access token", async () => {
      const user = await seedUser(app, { email: "me2@example.com" });
      const { refreshToken } = app.signTokens({ id: user.id, email: user.email, role: user.role });

      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { Authorization: `Bearer ${refreshToken}` },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── Refresh ──────────────────────────────────────────────────────────────

  describe("POST /auth/refresh", () => {
    it("émet un nouvel access token avec un refresh token valide", async () => {
      const user = await seedUser(app, { email: "refresh@example.com" });
      const { refreshToken } = app.signTokens({ id: user.id, email: user.email, role: user.role });

      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: MOBILE_HEADERS,
        payload: { refreshToken },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().accessToken).toBeString();
    });

    it("retourne 401 si le refresh token est révoqué", async () => {
      const user = await seedUser(app, { email: "refresh2@example.com" });
      const { refreshToken, refreshJti } = app.signTokens({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      await app.revokeRefreshToken(refreshJti, user.id, new Date(Date.now() + 1000 * 60));

      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: MOBILE_HEADERS,
        payload: { refreshToken },
      });

      expect(res.statusCode).toBe(401);
    });

    it("retourne 401 avec un token invalide", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: MOBILE_HEADERS,
        payload: { refreshToken: "invalid.token.here" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── Logout ───────────────────────────────────────────────────────────────

  describe("POST /auth/logout", () => {
    it("retourne 204 et révoque le refresh token", async () => {
      const user = await seedUser(app, { email: "logout@example.com" });
      const { accessToken, refreshToken } = app.signTokens({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      const res = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { ...MOBILE_HEADERS, Authorization: `Bearer ${accessToken}` },
        payload: { refreshToken },
      });

      expect(res.statusCode).toBe(204);
    });

    it("retourne 401 sans access token", async () => {
      const res = await app.inject({ method: "POST", url: "/auth/logout" });
      expect(res.statusCode).toBe(401);
    });
  });
});
