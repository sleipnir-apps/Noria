import type { FastifyRequest, FastifyReply } from "fastify";

export async function healthController(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.server.db.command({ ping: 1 });
    return reply.send({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return reply.status(503).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Database unreachable.",
        details: [],
      },
      requestId: request.id,
    });
  }
}
