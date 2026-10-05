export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "RATE_LIMITED";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown[];

  constructor(code: ErrorCode, message: string, statusCode: number, details?: unknown[]) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  static notFound(message = "Resource not found") {
    return new AppError("NOT_FOUND", message, 404);
  }

  static unauthorized(message = "Unauthorized") {
    return new AppError("UNAUTHORIZED", message, 401);
  }

  static forbidden(message = "Forbidden") {
    return new AppError("FORBIDDEN", message, 403);
  }

  static conflict(message: string) {
    return new AppError("CONFLICT", message, 409);
  }

  static validation(message: string, details?: unknown[]) {
    return new AppError("VALIDATION_ERROR", message, 400, details);
  }

  static internal(message = "Internal server error") {
    return new AppError("INTERNAL_ERROR", message, 500);
  }
}
