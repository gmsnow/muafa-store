import { z } from "zod";

export const expenseSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.coerce.number().positive(),
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "WALLET", "CREDIT"]),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  nameAr: z.string().trim().max(100).optional().or(z.literal("")),
  description: z.string().trim().max(300).optional().or(z.literal("")),
});

export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;
