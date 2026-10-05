import { z } from "zod";

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(z.unknown()).optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ApiResponseErrorSchema = z.object({
  error: ApiErrorSchema,
  requestId: z.string(),
});

export type ApiResponseError = z.infer<typeof ApiResponseErrorSchema>;
