import { z } from "zod";

export const userFormSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, "letters/digits/._- only"),
  fullName: z.string().trim().min(1).max(150),
  fullNameAr: z.string().trim().max(150).optional().or(z.literal("")),
  email: z.string().trim().email().max(150).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  roleId: z.string().min(1),
  password: z.string().min(6).max(100).optional().or(z.literal("")),
});

export const userPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(6).max(100),
});
