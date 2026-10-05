import fastifyCors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env";

/** Origines locales acceptées en dev : localhost + n'importe quelle IP du LAN. */
const DEV_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/;

export async function registerCors(app: FastifyInstance) {
  await app.register(fastifyCors, {
    // En dev, on accepte toute origine du LAN (Expo Go depuis le
    // téléphone, web sur un autre PC) sans maintenir la liste à la
    // main. En prod, liste stricte depuis CORS_ORIGINS.
    origin: (origin, cb) => {
      // Requêtes non-browser (curl, health checks) : pas d'origine.
      if (!origin) return cb(null, true);
      if (env.NODE_ENV !== "production") {
        return cb(null, DEV_ORIGIN_RE.test(origin));
      }
      return cb(null, env.CORS_ORIGINS.map((o) => o.trim()).includes(origin));
    },
    credentials: env.CORS_CREDENTIALS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
}
