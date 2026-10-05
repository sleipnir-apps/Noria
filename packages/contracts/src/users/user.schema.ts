import { z } from "zod";

export const UserRoleSchema = z.enum(["user", "admin"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserBaseSchema = z.object({
  email: z.email(),
  displayName: z.string().min(1).max(100),
  role: UserRoleSchema,
});
