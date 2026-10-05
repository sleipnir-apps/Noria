import { z } from "zod";

export const CreateItemSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});
export type CreateItemDto = z.infer<typeof CreateItemSchema>;

export const UpdateItemSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(["active", "archived"]).optional(),
});
export type UpdateItemDto = z.infer<typeof UpdateItemSchema>;

export const ItemFiltersSchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type ItemFilters = z.infer<typeof ItemFiltersSchema>;
