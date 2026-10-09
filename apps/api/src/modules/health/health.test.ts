import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../test/helpers/build-app";

describe("Health route", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /health retourne 200 avec database connected", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("connected");
    expect(body.timestamp).toBeString();
  });

  it("GET /health répond 200 à la racine (hors /api/v1, sondes de monitoring)", async () => {
    const root = await app.inject({ method: "GET", url: "/health" });
    const prefixed = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(root.statusCode).toBe(200);
    expect(root.json().status).toBe("ok");
    expect(root.json().database).toBe("connected");
    // Même logique : uniquement le timestamp réel diffère entre deux appels.
    expect({ status: prefixed.json().status, database: prefixed.json().database }).toEqual({
      status: root.json().status,
      database: root.json().database,
    });
  });
});
