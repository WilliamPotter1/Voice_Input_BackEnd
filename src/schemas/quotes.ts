import { z } from 'zod';

export const quoteItemSchema = z.object({
  itemName: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});

export const extractQuoteItemsBodySchema = z.object({
  text: z.string().min(1),
  language: z.string().optional(),
});

export const createQuoteBodySchema = z.object({
  clientName: z.string().optional(),
  customerAddress: z.string().optional(),
  currency: z.string().length(3).optional(),
  vatRate: z.number().min(0).max(1).optional(), // e.g. 0.19
  items: z.array(quoteItemSchema).min(1),
});

export const updateQuoteBodySchema = z.object({
  clientName: z.string().optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  currency: z.string().length(3).optional().nullable(),
  vatRate: z.number().min(0).max(1).optional(),
  items: z.array(quoteItemSchema).optional(),
});

export type QuoteItemInput = z.infer<typeof quoteItemSchema>;
export type ExtractQuoteItemsBody = z.infer<typeof extractQuoteItemsBodySchema>;
export type CreateQuoteBody = z.infer<typeof createQuoteBodySchema>;
export type UpdateQuoteBody = z.infer<typeof updateQuoteBodySchema>;
