import { z } from "zod";

export const ItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  status: z.enum(["active", "archived"]),
  ownerId: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Item = z.infer<typeof ItemSchema>;
