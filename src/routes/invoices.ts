import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/db.js';
import { createInvoiceBodySchema, updateInvoiceBodySchema } from '../schemas/invoices.js';
import { generateQuotePdf } from '../services/generate-quote-pdf.js';

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const payload = request.user as { sub?: string };
    if (!payload?.sub) return reply.status(401).send({ error: 'Unauthorized' });
    request.userId = payload.sub;
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}

function startOfTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toInvoiceDetail(invoice: any) {
  return {
    id: invoice.id,
    quoteId: invoice.quoteId ?? null,
    clientName: invoice.clientName ?? null,
    customerAddress: invoice.customerAddress ?? null,
    additionalInfo: invoice.additionalInfo ?? null,
    currency: invoice.currency ?? 'EUR',
    vatRate: invoice.vatRate,
    subtotal: invoice.subtotal,
    vat: invoice.vat,
    total: invoice.total,
    invoiceNumber: invoice.invoiceNumber ?? null,
    invoiceDate: invoice.invoiceDate ? invoice.invoiceDate.toISOString() : null,
    deliveryDate: invoice.deliveryDate ? invoice.deliveryDate.toISOString() : null,
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
    sentAt: invoice.sentAt ? invoice.sentAt.toISOString() : null,
    sentByEmail: invoice.sentByEmail ?? false,
    sentByWhats: invoice.sentByWhats ?? false,
    createdAt: invoice.createdAt.toISOString(),
    items: (invoice.items as any[]).map((it: any) => ({
      id: it.id,
      itemName: it.itemName,
      quantity: it.quantity,
      unitPrice: it.price,
      total: it.total,
    })),
  };
}

export async function invoicesRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.addHook('preHandler', requireAuth);

  app.post('/invoices/from-quote/:quoteId', async (request, reply) => {
    const userId = request.userId!;
    const { quoteId } = request.params as { quoteId: string };
    const quote = await prisma.quote.findFirst({ where: { id: quoteId, userId }, include: { items: true } });
    if (!quote) return reply.status(404).send({ error: 'Quote not found' });

    const last = await (prisma as any).invoice.findFirst({
      where: { userId },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    const nextNumber = ((last as any)?.invoiceNumber ?? 0) + 1;
    const today = startOfTodayIso();

    const items = (quote.items as any[]).map((i) => ({
      itemName: i.itemName,
      quantity: i.quantity,
      price: i.price,
      total: i.total,
    }));

    const invoice = await (prisma as any).invoice.create({
      data: {
        userId,
        quoteId: quote.id,
        clientName: quote.clientName ?? null,
        customerAddress: (quote as any).customerAddress ?? null,
        additionalInfo: null,
        currency: (quote as any).currency ?? 'EUR',
        vatRate: quote.vatRate,
        subtotal: quote.subtotal,
        vat: quote.vat,
        total: quote.total,
        invoiceNumber: nextNumber,
        invoiceDate: new Date(today),
        deliveryDate: new Date(today),
        dueDate: new Date(today),
        items: { create: items },
      },
      include: { items: true },
    });

    return reply.status(201).send(toInvoiceDetail(invoice));
  });

  app.post('/invoices', async (request, reply) => {
    const userId = request.userId!;
    const parsed = createInvoiceBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join('; ') || 'Validation failed';
      return reply.status(400).send({ error: msg });
    }
    const data = parsed.data;
    const items = data.items.map((i) => ({
      itemName: i.itemName,
      quantity: i.quantity,
      price: i.unitPrice,
      total: i.quantity * i.unitPrice,
    }));
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const vatRate = data.vatRate ?? 0.19;
    const vat = subtotal * vatRate;
    const total = subtotal + vat;
    const invoice = await (prisma as any).invoice.create({
      data: {
        userId,
        clientName: data.clientName ?? null,
        customerAddress: data.customerAddress ?? null,
        additionalInfo: data.additionalInfo ?? null,
        currency: (data.currency ?? 'EUR').toUpperCase(),
        vatRate,
        subtotal,
        vat,
        total,
        invoiceNumber: data.invoiceNumber ?? null,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : null,
        deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        items: { create: items },
      },
      include: { items: true },
    });
    return reply.status(201).send(toInvoiceDetail(invoice));
  });

  app.get('/invoices', async (request) => {
    const userId = request.userId!;
    const invoices = await (prisma as any).invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return invoices.map((i: any) => ({
      id: i.id,
      quoteId: i.quoteId ?? null,
      clientName: i.clientName ?? null,
      customerAddress: i.customerAddress ?? null,
      additionalInfo: i.additionalInfo ?? null,
      currency: i.currency ?? 'EUR',
      subtotal: i.subtotal,
      vat: i.vat,
      total: i.total,
      invoiceNumber: i.invoiceNumber ?? null,
      invoiceDate: i.invoiceDate ? i.invoiceDate.toISOString() : null,
      deliveryDate: i.deliveryDate ? i.deliveryDate.toISOString() : null,
      dueDate: i.dueDate ? i.dueDate.toISOString() : null,
      sentAt: i.sentAt ? i.sentAt.toISOString() : null,
      sentByEmail: i.sentByEmail ?? false,
      sentByWhats: i.sentByWhats ?? false,
      createdAt: i.createdAt.toISOString(),
    }));
  });

  app.get('/invoices/:id', async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const invoice = await (prisma as any).invoice.findFirst({ where: { id, userId }, include: { items: true } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
    return toInvoiceDetail(invoice);
  });

  app.get('/invoices/:id/pdf', async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const q = request.query as { invoiceDate?: string; dueDate?: string; lang?: string; invoiceNumber?: number };
    const invoiceNumberParam = q.invoiceNumber != null ? Number(q.invoiceNumber) : NaN;
    if (!Number.isInteger(invoiceNumberParam) || invoiceNumberParam < 1) {
      return reply.status(400).send({ error: 'invoiceNumber is required and must be a positive integer' });
    }
    const [invoice, user] = await Promise.all([
      (prisma as any).invoice.findFirst({ where: { id, userId }, include: { items: true } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const pdfDoc = generateQuotePdf(
      {
        id: invoice.id,
        clientName: invoice.clientName ?? null,
        customerAddress: invoice.customerAddress ?? null,
        freeText: invoice.additionalInfo ?? null,
        currency: invoice.currency ?? 'EUR',
        vatRate: invoice.vatRate,
        subtotal: invoice.subtotal,
        vat: invoice.vat,
        total: invoice.total,
        items: (invoice.items as any[]).map((it: any) => ({
          itemName: it.itemName,
          quantity: it.quantity,
          price: it.price,
          total: it.total,
        })),
        attachments: [],
      },
      {
        name: (user as any).name ?? null,
        websiteUrl: (user as any).websiteUrl ?? null,
        bankName: (user as any).bankName ?? null,
        blz: (user as any).blz ?? null,
        kto: (user as any).kto ?? null,
        iban: (user as any).iban ?? null,
        bic: (user as any).bic ?? null,
        taxNumber: (user as any).taxNumber ?? null,
        taxOfficeName: (user as any).taxOfficeName ?? null,
        email: user.email,
        phone: (user as any).phone ?? null,
        companyName: (user as any).companyName ?? null,
        companyAddress: (user as any).companyAddress ?? null,
        companyCity: (user as any).companyCity ?? null,
      },
      {
        quoteDate: q.invoiceDate ?? new Date().toISOString().slice(0, 10),
        validUntil: q.dueDate ?? '',
        quoteNumber: String(invoiceNumberParam),
        lang: q.lang ?? 'de',
        deliveryDate: invoice.deliveryDate ? invoice.deliveryDate.toISOString() : '',
        docType: 'invoice',
      },
    );
    const companyLabel = ((user as any).companyName ?? 'Company').replace(/[^a-zA-Z0-9]/g, ' ').trim();
    const titleByLang: Record<string, string> = {
      de: 'Rechnung',
      en: 'Invoice',
      it: 'Fattura',
      fr: 'Facture',
      es: 'Factura',
    };
    const invoiceNrLabelByLang: Record<string, string> = {
      de: 'Rechnungs-Nr.:',
      en: 'Invoice No.:',
      it: 'Fattura n.:',
      fr: 'Facture n°:',
      es: 'Factura n.º:',
    };
    const lang = String(q.lang ?? 'de');
    const clientLabel = (invoice.clientName ?? (titleByLang[lang] ?? titleByLang.en)).replace(/[^a-zA-Z0-9]/g, ' ').trim();
    const nrLabel = invoiceNrLabelByLang[lang] ?? invoiceNrLabelByLang.en;
    const filename = `${companyLabel} - ${nrLabel} ${invoiceNumberParam} ${clientLabel}`.trim();
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${filename}.pdf"`);
    return reply.send(pdfDoc);
  });

  app.patch('/invoices/:id', async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const parsed = updateInvoiceBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join('; ') || 'Validation failed';
      return reply.status(400).send({ error: msg });
    }
    const existing = await (prisma as any).invoice.findFirst({ where: { id, userId }, include: { items: true } });
    if (!existing) return reply.status(404).send({ error: 'Invoice not found' });

    const data = parsed.data;
    const itemsInput =
      data.items ??
      (existing.items as any[]).map((i: any) => ({ itemName: i.itemName, quantity: i.quantity, unitPrice: i.price }));
    const items = itemsInput.map((i) => ({
      itemName: i.itemName,
      quantity: i.quantity,
      price: i.unitPrice,
      total: i.quantity * i.unitPrice,
    }));
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const vatRate = data.vatRate ?? existing.vatRate;
    const vat = subtotal * vatRate;
    const total = subtotal + vat;

    await (prisma as any).invoiceItem.deleteMany({ where: { invoiceId: id } });
    const updated = await (prisma as any).invoice.update({
      where: { id },
      data: {
        clientName: data.clientName !== undefined ? data.clientName : existing.clientName,
        customerAddress: data.customerAddress !== undefined ? data.customerAddress : existing.customerAddress,
        additionalInfo: data.additionalInfo !== undefined ? data.additionalInfo : existing.additionalInfo,
        currency: data.currency ? data.currency.toUpperCase() : existing.currency,
        vatRate,
        subtotal,
        vat,
        total,
        ...(data.invoiceNumber !== undefined ? { invoiceNumber: data.invoiceNumber } : {}),
        ...(data.invoiceDate !== undefined ? { invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : null } : {}),
        ...(data.deliveryDate !== undefined ? { deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : null } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
        items: { create: items },
      },
      include: { items: true },
    });
    return toInvoiceDetail(updated);
  });

  app.delete('/invoices/:id', async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const invoice = await (prisma as any).invoice.findFirst({ where: { id, userId } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
    await (prisma as any).invoice.delete({ where: { id } });
    return reply.status(204).send();
  });
}

