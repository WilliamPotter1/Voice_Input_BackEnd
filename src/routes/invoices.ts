import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/db.js';
import { createInvoiceBodySchema, updateInvoiceBodySchema } from '../schemas/invoices.js';
import { generateQuotePdf } from '../services/generate-quote-pdf.js';
import { sendQuoteEmail } from '../services/send-quote.js';

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
  const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR ?? path.join(process.cwd(), 'uploads');
  app.addHook('preHandler', requireAuth);
  function normalizeLang(input: unknown): 'de' | 'en' | 'it' | 'fr' | 'es' {
    const s = String(input ?? '').toLowerCase();
    if (s === 'de' || s === 'en' || s === 'it' || s === 'fr' || s === 'es') return s;
    return 'de';
  }
  function formatDateForLang(lang: 'de' | 'en' | 'it' | 'fr' | 'es', dateStr: string): string {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat(lang, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }

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
        quoteId: data.quoteId ?? null,
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
    const [invoice, user, attachments] = await Promise.all([
      (prisma as any).invoice.findFirst({ where: { id, userId }, include: { items: true } }),
      prisma.user.findUnique({ where: { id: userId } }),
      (prisma as any).invoiceAttachment.findMany({ where: { invoiceId: id }, orderBy: { createdAt: 'asc' } }),
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
        attachments: (attachments as any[]).map((a: any) => ({ filename: a.filename, url: '' })),
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

  app.post('/invoices/:id/send', async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const body = request.body as {
      channel: 'email' | 'whatsapp';
      recipient: string;
      invoiceDate: string;
      dueDate: string;
      invoiceNumber?: number;
      lang?: string;
    };
    const { channel, recipient, invoiceDate, dueDate } = body;
    const invoiceNumberParam = body.invoiceNumber != null ? Number(body.invoiceNumber) : NaN;
    if (!Number.isInteger(invoiceNumberParam) || invoiceNumberParam < 1) {
      return reply.status(400).send({ error: 'invoiceNumber is required and must be a positive integer' });
    }
    const [invoice, user, attachments] = await Promise.all([
      (prisma as any).invoice.findFirst({ where: { id, userId }, include: { items: true } }),
      prisma.user.findUnique({ where: { id: userId } }),
      (prisma as any).invoiceAttachment.findMany({ where: { invoiceId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
    if (!user) return reply.status(404).send({ error: 'User not found' });
    const lang = normalizeLang(body.lang);
    const invoiceNumber = String(invoiceNumberParam);

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
        phone: (user as any).phone ?? null,
        email: user.email,
        companyName: (user as any).companyName ?? null,
        companyAddress: (user as any).companyAddress ?? null,
        companyCity: (user as any).companyCity ?? null,
        websiteUrl: (user as any).websiteUrl ?? null,
        bankName: (user as any).bankName ?? null,
        blz: (user as any).blz ?? null,
        kto: (user as any).kto ?? null,
        iban: (user as any).iban ?? null,
        bic: (user as any).bic ?? null,
        taxNumber: (user as any).taxNumber ?? null,
        taxOfficeName: (user as any).taxOfficeName ?? null,
      },
      {
        quoteDate: invoiceDate,
        validUntil: dueDate,
        quoteNumber: invoiceNumber,
        lang,
        deliveryDate: invoice.deliveryDate ? invoice.deliveryDate.toISOString() : '',
        docType: 'invoice',
      },
    );
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      pdfDoc.on('data', (c) => chunks.push(c as Buffer));
      pdfDoc.on('end', () => resolve());
      pdfDoc.on('error', reject);
    });
    const pdfBuffer = Buffer.concat(chunks);

    if (channel === 'whatsapp') {
      return reply.send({ ok: true });
    }

    try {
      const companyLabel = ((user as any).companyName ?? 'Firma').trim();
      const clientLabel = (invoice.clientName ?? '').trim();
      const invoiceNrLabelByLang: Record<'de' | 'en' | 'it' | 'fr' | 'es', string> = {
        de: 'Rechnungs-Nr.:',
        en: 'Invoice No.:',
        it: 'Fattura n.:',
        fr: 'Facture n°:',
        es: 'Factura n.º:',
      };
      const subjectTitle = `${invoiceNrLabelByLang[lang]} ${invoiceNumber}`;
      const pdfFilenameBase = `${companyLabel} - ${subjectTitle} ${clientLabel}`.trim();
      const dueDateStr = dueDate ? formatDateForLang(lang, dueDate) : '';
      const senderName = ((user as any).name ?? '').trim() || companyLabel;
      const customerName =
        clientLabel ||
        (lang === 'de'
          ? 'Kunde'
          : lang === 'en'
            ? 'Customer'
            : lang === 'it'
              ? 'Cliente'
              : lang === 'fr'
                ? 'Client'
                : 'Cliente');
      const bodyByLang: Record<
        'de' | 'en' | 'it' | 'fr' | 'es',
        {
          greeting: (customer: string) => string;
          intro: string;
          payment: string;
          closing: (d: string) => string;
          regards: string;
        }
      > = {
        de: {
          greeting: (c) => `Sehr geehrte(r) ${c},`,
          intro: 'vielen Dank für Ihren Auftrag, den wir wie folgt vereinbarungsgemäß in Rechnung stellen:',
          payment: 'Bitte überweisen Sie den Gesamtbetrag bis zum Fälligkeitsdatum auf das angegebene Konto.',
          closing: (d) => `Diese Rechnung ist gültig bis zum ${d}.`,
          regards: 'Mit freundlichen Grüßen',
        },
        en: {
          greeting: (c) => `Dear ${c},`,
          intro: 'Thank you for your order. We hereby invoice the agreed services as follows:',
          payment: 'Please transfer the total amount by the due date to the specified account.',
          closing: (d) => `This invoice is valid until ${d}.`,
          regards: 'Kind regards',
        },
        it: {
          greeting: (c) => `Gentile ${c},`,
          intro: 'La ringraziamo per il Suo ordine, che fatturiamo come concordato di seguito:',
          payment: 'La preghiamo di versare l’importo totale entro la data di scadenza sul conto indicato.',
          closing: (d) => `Questa fattura è valida fino al ${d}.`,
          regards: 'Cordiali saluti',
        },
        fr: {
          greeting: (c) => `Bonjour ${c},`,
          intro: 'Merci pour votre commande, que nous facturons conformément à l’accord comme suit :',
          payment: 'Veuillez virer le montant total avant la date d’échéance sur le compte indiqué.',
          closing: (d) => `Cette facture est valable jusqu’au ${d}.`,
          regards: 'Cordialement',
        },
        es: {
          greeting: (c) => `Estimado/a ${c},`,
          intro: 'Muchas gracias por su pedido, que facturamos según lo acordado de la siguiente manera:',
          payment: 'Por favor, transfiera el importe total antes de la fecha de vencimiento a la cuenta indicada.',
          closing: (d) => `Esta factura es válida hasta el ${d}.`,
          regards: 'Atentamente',
        },
      };
      const b = bodyByLang[lang];
      const text = [
        b.greeting(customerName),
        b.intro,
        b.payment,
        dueDateStr ? b.closing(dueDateStr) : '',
        b.regards,
        senderName,
      ]
        .filter(Boolean)
        .join('\n\n');

      const fileAttachments = (attachments as any[]).map((a: any) => ({
        filename: a.filename,
        path: path.join(ATTACHMENTS_DIR, a.path),
      }));

      await sendQuoteEmail({
        to: recipient,
        cc: user.email,
        subject: `${companyLabel} - ${subjectTitle} ${clientLabel}`.trim(),
        text,
        pdf: { filename: `${pdfFilenameBase}.pdf`, content: pdfBuffer },
        attachments: fileAttachments,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send invoice';
      return reply.status(400).send({ error: msg });
    }
    return reply.send({ ok: true });
  });

  app.post('/invoices/:id/send-links', async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const q = request.body as { invoiceDate: string; dueDate: string; invoiceNumber: number; lang?: string };
    const invoiceNumberParam = Number(q.invoiceNumber);
    if (!Number.isInteger(invoiceNumberParam) || invoiceNumberParam < 1) {
      return reply.status(400).send({ error: 'invoiceNumber must be a positive integer' });
    }
    const [invoice, user, attachments] = await Promise.all([
      (prisma as any).invoice.findFirst({ where: { id, userId }, include: { items: true } }),
      prisma.user.findUnique({ where: { id: userId } }),
      (prisma as any).invoiceAttachment.findMany({ where: { invoiceId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const baseUrl = process.env.PUBLIC_URL
      ? process.env.PUBLIC_URL.replace(/\/+$/, '')
      : `https://${request.hostname}`;
    const pdfNumber = String(invoiceNumberParam);

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
        attachments: (attachments as any[]).map((a: any) => ({ filename: a.filename, url: '' })),
      },
      {
        name: (user as any).name ?? null,
        phone: (user as any).phone ?? null,
        email: user.email,
        companyName: (user as any).companyName ?? null,
        companyAddress: (user as any).companyAddress ?? null,
        companyCity: (user as any).companyCity ?? null,
        websiteUrl: (user as any).websiteUrl ?? null,
        bankName: (user as any).bankName ?? null,
        blz: (user as any).blz ?? null,
        kto: (user as any).kto ?? null,
        iban: (user as any).iban ?? null,
        bic: (user as any).bic ?? null,
        taxNumber: (user as any).taxNumber ?? null,
        taxOfficeName: (user as any).taxOfficeName ?? null,
      },
      {
        quoteDate: q.invoiceDate,
        validUntil: q.dueDate,
        quoteNumber: pdfNumber,
        lang: q.lang ?? 'de',
        deliveryDate: invoice.deliveryDate ? invoice.deliveryDate.toISOString() : '',
        docType: 'invoice',
      },
    );

    const pdfDir = path.join(ATTACHMENTS_DIR, 'invoices', id);
    await fsp.mkdir(pdfDir, { recursive: true });
    const pdfPath = path.join(pdfDir, `pdf-${pdfNumber}.pdf`);
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(pdfPath);
      pdfDoc.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
      pdfDoc.on('error', reject);
    });

    const uploadsBase = `${baseUrl}/uploads`;
    const pdfUrl = `${uploadsBase}/invoices/${id}/pdf-${encodeURIComponent(pdfNumber)}.pdf`;
    const attachmentUrls = (attachments as any[]).map((a: any) => {
      const rawPath = String(a.path ?? '').replace(/^[/\\]+/, '');
      const encodedPath = encodeURI(rawPath);
      return { filename: a.filename, url: `${uploadsBase}/${encodedPath}` };
    });
    return reply.send({ pdfUrl, attachmentUrls });
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

  app.post('/invoices/:id/attachments', async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const invoice = await (prisma as any).invoice.findFirst({ where: { id, userId } });
    if (!invoice) return reply.status(400).send({ error: 'Invoice not found' });
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });
    const file = data.file;
    const filename = data.filename || 'attachment';
    const mimeType = data.mimetype || 'application/octet-stream';

    const chunks: Buffer[] = [];
    for await (const chunk of file) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);
    const size = buffer.byteLength;
    if (size > 25 * 1024 * 1024) {
      return reply.status(400).send({ error: 'File too large. Max 25 MB.' });
    }

    const attachmentId = randomUUID();
    const safeName = filename.replace(/[^\w.\-() ]+/g, '_');
    const ext = path.extname(safeName) || '';
    const base = path.basename(safeName, ext) || 'attachment';
    const storedName = `${base}-${attachmentId}${ext}`;

    const relPath = path.join('invoices', id, 'attachments', storedName).replace(/\\/g, '/');
    const absPath = path.join(ATTACHMENTS_DIR, relPath);
    await fsp.mkdir(path.dirname(absPath), { recursive: true });
    await fsp.writeFile(absPath, buffer);

    const attachment = await (prisma as any).invoiceAttachment.create({
      data: {
        id: attachmentId,
        invoiceId: id,
        filename: safeName,
        mimeType,
        size,
        path: relPath,
      },
    });
    return reply.send({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: `/uploads/${attachment.path}`,
      createdAt: attachment.createdAt.toISOString(),
    });
  });

  app.get('/invoices/:id/attachments', async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const invoice = await (prisma as any).invoice.findFirst({ where: { id, userId } });
    if (!invoice) return reply.status(200).send({ error: 'Invoice not found' } as any);
    const atts = await (prisma as any).invoiceAttachment.findMany({
      where: { invoiceId: id },
      orderBy: { createdAt: 'asc' },
    });
    return atts.map((a: any) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      url: `/uploads/${a.path}`,
      createdAt: a.createdAt.toISOString(),
    }));
  });

  app.delete('/invoices/:id/attachments/:attachmentId', async (request, reply) => {
    const userId = request.userId!;
    const { id, attachmentId } = request.params as { id: string; attachmentId: string };
    const invoice = await (prisma as any).invoice.findFirst({ where: { id, userId } });
    if (!invoice) return reply.status(400).send({ error: 'Invoice not found' });
    const att = await (prisma as any).invoiceAttachment.findFirst({ where: { id: attachmentId, invoiceId: id } });
    if (!att) return reply.status(400).send({ error: 'Attachment not found' });
    try {
      await fsp.unlink(path.join(ATTACHMENTS_DIR, att.path));
    } catch {}
    await (prisma as any).invoiceAttachment.delete({ where: { id: attachmentId } });
    return reply.status(204).send();
  });
}

