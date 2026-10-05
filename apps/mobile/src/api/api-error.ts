import type { ApiResponseError } from "@template/contracts";

export class ApiError extends Error {
  public code: string;
  public details?: unknown[];
  public requestId: string;
  public statusCode: number;

  constructor(data: ApiResponseError, statusCode: number) {
    super(data.error.message);
    this.name = "ApiError";
    this.code = data.error.code;
    this.details = data.error.details;
    this.requestId = data.requestId;
    this.statusCode = statusCode;
  }
}
