import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../test/helpers/build-app";
import { seedItem, seedUser } from "../../test/helpers/seed";

describe("Items routes", () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await app.db.collection("users").deleteMany({});
    await app.db.collection("items").deleteMany({});

    const user = await seedUser(app, { email: "items@example.com" });
    userId = user.id;
    ({ accessToken } = app.signTokens({ id: user.id, email: user.email, role: user.role }));
  });

  afterAll(async () => {
    await app.close();
  });

  const authHeader = () => ({ Authorization: `Bearer ${accessToken}` });

  // ── Create ───────────────────────────────────────────────────────────────

  describe("POST /items", () => {
    it("crée un item et retourne 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/items",
        headers: authHeader(),
        payload: { title: "Mon item", description: "Une description" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.title).toBe("Mon item");
      expect(body.status).toBe("active");
      expect(body.ownerId).toBe(userId);
    });

    it("retourne 400 avec un titre vide", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/items",
        headers: authHeader(),
        payload: { title: "" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("retourne 401 sans token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/items",
        payload: { title: "Item" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── List ─────────────────────────────────────────────────────────────────

  describe("GET /items", () => {
    it("retourne la liste paginée des items de l'utilisateur", async () => {
      await seedItem(app, userId, { title: "Item A" });
      await seedItem(app, userId, { title: "Item B" });

      const res = await app.inject({
        method: "GET",
        url: "/items",
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(2);
      expect(body.meta.total).toBe(2);
    });

    it("ne retourne pas les items d'un autre utilisateur", async () => {
      const other = await seedUser(app, { email: "other@example.com" });
      await seedItem(app, other.id, { title: "Item autre" });

      const res = await app.inject({
        method: "GET",
        url: "/items",
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(0);
    });

    it("filtre par status", async () => {
      await seedItem(app, userId, { title: "Actif", status: "active" });
      await seedItem(app, userId, { title: "Archivé", status: "archived" });

      const res = await app.inject({
        method: "GET",
        url: "/items?status=archived",
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe("archived");
    });

    it("respecte la pagination", async () => {
      for (let i = 0; i < 5; i++) {
        await seedItem(app, userId, { title: `Item ${i}` });
      }

      const res = await app.inject({
        method: "GET",
        url: "/items?page=1&limit=3",
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(3);
      expect(body.meta.totalPages).toBe(2);
    });
  });

  // ── Get ──────────────────────────────────────────────────────────────────

  describe("GET /items/:id", () => {
    it("retourne l'item par id", async () => {
      const { id } = await seedItem(app, userId, { title: "Detail item" });

      const res = await app.inject({
        method: "GET",
        url: `/items/${id}`,
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().title).toBe("Detail item");
    });

    it("retourne 404 pour un item d'un autre utilisateur", async () => {
      const other = await seedUser(app, { email: "other2@example.com" });
      const { id } = await seedItem(app, other.id, { title: "Pas le mien" });

      const res = await app.inject({
        method: "GET",
        url: `/items/${id}`,
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(404);
    });

    it("retourne 404 pour un id invalide", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/items/invalid-id",
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── Update ───────────────────────────────────────────────────────────────

  describe("PATCH /items/:id", () => {
    it("met à jour le titre et le status", async () => {
      const { id } = await seedItem(app, userId, { title: "Avant" });

      const res = await app.inject({
        method: "PATCH",
        url: `/items/${id}`,
        headers: authHeader(),
        payload: { title: "Après", status: "archived" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.title).toBe("Après");
      expect(body.status).toBe("archived");
    });

    it("retourne 404 pour un item d'un autre utilisateur", async () => {
      const other = await seedUser(app, { email: "other3@example.com" });
      const { id } = await seedItem(app, other.id);

      const res = await app.inject({
        method: "PATCH",
        url: `/items/${id}`,
        headers: authHeader(),
        payload: { title: "Hack" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── Delete ───────────────────────────────────────────────────────────────

  describe("DELETE /items/:id", () => {
    it("supprime l'item et retourne 204", async () => {
      const { id } = await seedItem(app, userId, { title: "À supprimer" });

      const res = await app.inject({
        method: "DELETE",
        url: `/items/${id}`,
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(204);

      const check = await app.inject({
        method: "GET",
        url: `/items/${id}`,
        headers: authHeader(),
      });
      expect(check.statusCode).toBe(404);
    });

    it("retourne 404 pour un item d'un autre utilisateur", async () => {
      const other = await seedUser(app, { email: "other4@example.com" });
      const { id } = await seedItem(app, other.id);

      const res = await app.inject({
        method: "DELETE",
        url: `/items/${id}`,
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
