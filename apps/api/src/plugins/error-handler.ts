import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FastifyError } from "fastify";
import { AppError } from "../lib/errors/AppError";

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
  requestId: string;
}

function buildErrorResponse(
  code: string,
  message: string,
  details: unknown[],
  requestId: string
): ErrorResponse {
  return {
    error: { code, message, details },
    requestId,
  };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply): void => {
    const requestId = String(request.id);

    if (error instanceof AppError) {
      void reply
        .status(error.statusCode)
        .send(buildErrorResponse(error.code, error.message, error.details ?? [], requestId));
      return;
    }

    if (error.validation) {
      void reply
        .status(400)
        .send(
          buildErrorResponse("VALIDATION_ERROR", "Données invalides.", error.validation, requestId)
        );
      return;
    }

    app.log.error({ err: error, requestId }, "Unhandled error");

    void reply
      .status(500)
      .send(
        buildErrorResponse("INTERNAL_ERROR", "Une erreur interne est survenue.", [], requestId)
      );
  });
}
