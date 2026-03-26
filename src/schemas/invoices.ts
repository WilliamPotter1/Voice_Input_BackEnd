import { z } from 'zod';

export const invoiceItemSchema = z.object({
  itemName: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});

export const createInvoiceBodySchema = z.object({
  quoteId: z.string().optional().nullable(),
  clientName: z.string().optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  additionalInfo: z.string().max(2000).optional().nullable(),
  currency: z.string().length(3).optional().nullable(),
  vatRate: z.number().min(0).max(1).optional(),
  invoiceNumber: z.number().int().positive().optional().nullable(),
  invoiceDate: z.string().optional().nullable(),
  deliveryDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  items: z.array(invoiceItemSchema).min(1),
});

export const updateInvoiceBodySchema = z.object({
  clientName: z.string().optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  additionalInfo: z.string().max(2000).optional().nullable(),
  currency: z.string().length(3).optional().nullable(),
  vatRate: z.number().min(0).max(1).optional(),
  invoiceNumber: z.number().int().positive().optional().nullable(),
  invoiceDate: z.string().optional().nullable(),
  deliveryDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  items: z.array(invoiceItemSchema).optional(),
});

export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
export type CreateInvoiceBody = z.infer<typeof createInvoiceBodySchema>;
export type UpdateInvoiceBody = z.infer<typeof updateInvoiceBodySchema>;

