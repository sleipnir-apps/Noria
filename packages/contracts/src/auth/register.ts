import { z } from "zod";

export const RegisterInputSchema = z.object({
  email: z.email(),
  displayName: z.string().min(2).max(100),
  password: z.string().min(8).max(100),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;
