import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../test/helpers/build-app";
import { seedUser } from "../../test/helpers/seed";

describe("Admin routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    await app.db.collection("users").createIndex({ email: 1 }, { unique: true });
  });

  afterEach(async () => {
    await app.db.collection("users").deleteMany({});
    await app.close();
  });

  describe("GET /admin/users", () => {
    it("retourne la liste des utilisateurs pour un admin", async () => {
      const admin = await seedUser(app, { email: "admin@example.com", role: "admin" });
      await seedUser(app, { email: "user1@example.com" });
      await seedUser(app, { email: "user2@example.com" });

      const { accessToken } = app.signTokens({
        id: admin.id,
        email: admin.email,
        role: "admin",
      });

      const res = await app.inject({
        method: "GET",
        url: "/admin/users",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeGreaterThanOrEqual(3);
      expect(body.meta.total).toBeGreaterThanOrEqual(3);
      // passwordHash ne doit jamais être exposé
      expect(body.data[0].passwordHash).toBeUndefined();
    });

    it("retourne 403 pour un utilisateur non admin", async () => {
      const user = await seedUser(app, { email: "notadmin@example.com", role: "user" });
      const { accessToken } = app.signTokens({
        id: user.id,
        email: user.email,
        role: "user",
      });

      const res = await app.inject({
        method: "GET",
        url: "/admin/users",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("retourne 401 sans token", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/users" });
      expect(res.statusCode).toBe(401);
    });

    it("respecte la pagination", async () => {
      const admin = await seedUser(app, { email: "admin2@example.com", role: "admin" });
      for (let i = 0; i < 5; i++) {
        await seedUser(app, { email: `paginated${i}@example.com` });
      }

      const { accessToken } = app.signTokens({
        id: admin.id,
        email: admin.email,
        role: "admin",
      });

      const res = await app.inject({
        method: "GET",
        url: "/admin/users?page=1&limit=3",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(3);
    });
  });
});
