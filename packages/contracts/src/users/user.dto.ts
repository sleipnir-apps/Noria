import { z } from "zod";
import { UserBaseSchema } from "./user.schema";

export const UserDtoSchema = UserBaseSchema.extend({
  id: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type UserDto = z.infer<typeof UserDtoSchema>;

export const UpdateUserDtoSchema = UserBaseSchema.omit({ role: true }).partial();
export type UpdateUserDto = z.infer<typeof UpdateUserDtoSchema>;
