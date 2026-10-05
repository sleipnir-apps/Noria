import { z } from "zod";

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export function buildSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function buildSortStage(
  sortBy?: string,
  sortOrder: "asc" | "desc" = "desc"
): Record<string, 1 | -1> {
  if (!sortBy) return { createdAt: -1 };
  return { [sortBy]: sortOrder === "asc" ? 1 : -1 };
}
