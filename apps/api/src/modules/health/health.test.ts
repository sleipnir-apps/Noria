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

  it("GET /api/v1/health retourne 200 avec database connected", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("connected");
    expect(body.timestamp).toBeString();
  });

  it("GET /health (racine) retourne 200 avec le même contrat", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("connected");
    expect(body.timestamp).toBeString();
  });

  it("GET / (racine) répond aussi 200", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });
});
