import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../lib/db.js';
import { createQuoteBodySchema, updateQuoteBodySchema } from '../schemas/quotes.js';
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

export async function quotesRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR ?? path.join(process.cwd(), 'uploads');
  const supportedLangs = ['de', 'en', 'it', 'fr', 'es'] as const;
  type SupportedLang = (typeof supportedLangs)[number];

  function normalizeLang(input: unknown): SupportedLang {
    const s = String(input ?? '').toLowerCase();
    return (supportedLangs as readonly string[]).includes(s) ? (s as SupportedLang) : 'de';
  }

  function formatDateForLang(lang: SupportedLang, isoOrDate: string): string {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return '';
    const locale =
      lang === 'de'
        ? 'de-DE'
        : lang === 'en'
          ? 'en-GB'
          : lang === 'it'
            ? 'it-IT'
            : lang === 'fr'
              ? 'fr-FR'
              : 'es-ES';
    return new Intl.DateTimeFormat(locale).format(d);
  }

  app.post(
    '/quotes',
    {
      preHandler: requireAuth,
      schema: {
        body: {
          type: 'object',
          required: ['items'],
          properties: {
            clientName: { type: 'string' },
            customerAddress: { type: 'string' },
            currency: { type: 'string' },
            vatRate: { type: 'number' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  itemName: { type: 'string' },
                  quantity: { type: 'number' },
                  unitPrice: { type: 'number' },
                },
              },
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              clientName: { type: 'string' },
              customerAddress: { type: 'string' },
              currency: { type: 'string' },
              vatRate: { type: 'number' },
              subtotal: { type: 'number' },
              vat: { type: 'number' },
              total: { type: 'number' },
              quoteNumber: { type: 'integer' },
              quoteDate: { type: 'string' },
              validUntil: { type: 'string' },
              sentAt: { type: 'string' },
              sentByEmail: { type: 'boolean' },
              sentByWhats: { type: 'boolean' },
              createdAt: { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const parsed = createQuoteBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join('; ') || 'Validation failed';
        return reply.status(400).send({ error: msg });
      }
      const userId = request.userId!;
      const {
        clientName,
        customerAddress,
        freeText,
        currency,
        vatRate = 0.19,
        quoteNumber,
        quoteDate,
        validUntil,
        items,
      } = parsed.data;

      let subtotal = 0;
      const itemRows = items.map((it) => {
        const total = it.quantity * it.unitPrice;
        subtotal += total;
        return {
          itemName: it.itemName,
          quantity: it.quantity,
          price: it.unitPrice,
          total,
        };
      });
      const vatAmount = subtotal * vatRate;
      const total = subtotal + vatAmount;

      const quote = await prisma.quote.create({
        data: {
          userId,
          clientName: clientName ?? null,
          ...(customerAddress !== undefined ? { customerAddress } : {}),
          ...(freeText !== undefined ? { freeText } : {}),
          currency: (currency ?? 'EUR').toUpperCase(),
          vatRate,
          subtotal,
          vat: vatAmount,
          total,
          quoteNumber: quoteNumber ?? null,
          quoteDate: quoteDate ? new Date(quoteDate) : null,
          validUntil: validUntil ? new Date(validUntil) : null,
          items: { create: itemRows },
        } as any,
        include: { items: true },
      });
      return reply.status(201).send({
        id: quote.id,
        clientName: quote.clientName,
        customerAddress: (quote as any).customerAddress ?? null,
        currency: (quote as any).currency ?? 'EUR',
        vatRate: quote.vatRate,
        subtotal: quote.subtotal,
        vat: quote.vat,
        total: quote.total,
        quoteNumber: (quote as any).quoteNumber ?? null,
        quoteDate: (quote as any).quoteDate ? (quote as any).quoteDate.toISOString() : null,
        validUntil: (quote as any).validUntil ? (quote as any).validUntil.toISOString() : null,
        createdAt: quote.createdAt.toISOString(),
        items: quote.items.map((i: { id: string; itemName: string; quantity: number; price: number; total: number }) => ({
          id: i.id,
          itemName: i.itemName,
          quantity: i.quantity,
          unitPrice: i.price,
          total: i.total,
        })),
      });
    }
  );

  app.get(
    '/quotes',
    {
      preHandler: requireAuth,
      schema: {
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                clientName: { type: 'string' },
                customerAddress: { type: 'string' },
              currency: { type: 'string' },
              subtotal: { type: 'number' },
              vat: { type: 'number' },
              total: { type: 'number' },
              quoteNumber: { type: 'integer' },
              quoteDate: { type: 'string' },
              validUntil: { type: 'string' },
              createdAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const userId = request.userId!;
      const quotes = await prisma.quote.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      return quotes.map((q: any) => ({
        id: q.id,
        clientName: q.clientName,
        customerAddress: q.customerAddress ?? null,
        freeText: (q as any).freeText ?? null,
        currency: q.currency ?? 'EUR',
        subtotal: q.subtotal,
        vat: q.vat,
        total: q.total,
        quoteNumber: q.quoteNumber ?? null,
        quoteDate: q.quoteDate ? q.quoteDate.toISOString() : null,
        validUntil: q.validUntil ? q.validUntil.toISOString() : null,
        sentAt: q.sentAt ? q.sentAt.toISOString() : null,
        sentByEmail: q.sentByEmail ?? false,
        sentByWhats: q.sentByWhats ?? false,
        createdAt: q.createdAt.toISOString(),
      }));
    }
  );

  app.get(
    '/quotes/:id',
    {
      preHandler: requireAuth,
      schema: {
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              clientName: { type: 'string' },
              customerAddress: { type: 'string' },
              currency: { type: 'string' },
              vatRate: { type: 'number' },
              subtotal: { type: 'number' },
              vat: { type: 'number' },
              total: { type: 'number' },
              createdAt: { type: 'string' },
              quoteNumber: { type: 'integer' },
              quoteDate: { type: 'string' },
              validUntil: { type: 'string' },
              sentAt: { type: 'string' },
              sentByEmail: { type: 'boolean' },
              sentByWhats: { type: 'boolean' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    itemName: { type: 'string' },
                    quantity: { type: 'number' },
                    unitPrice: { type: 'number' },
                    total: { type: 'number' },
                  },
                },
              },
            },
          },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const quote = await prisma.quote.findFirst({
        where: { id, userId },
        include: { items: true },
      });
      if (!quote) return reply.status(404).send({ error: 'Quote not found' });
      return {
        id: quote.id,
        clientName: quote.clientName,
        customerAddress: (quote as any).customerAddress ?? null,
        freeText: (quote as any).freeText ?? null,
        currency: (quote as any).currency ?? 'EUR',
        vatRate: quote.vatRate,
        subtotal: quote.subtotal,
        vat: quote.vat,
        total: quote.total,
        createdAt: quote.createdAt.toISOString(),
        quoteNumber: (quote as any).quoteNumber ?? null,
        quoteDate: (quote as any).quoteDate ? (quote as any).quoteDate.toISOString() : null,
        validUntil: (quote as any).validUntil ? (quote as any).validUntil.toISOString() : null,
        sentAt: (quote as any).sentAt ? (quote as any).sentAt.toISOString() : null,
        sentByEmail: (quote as any).sentByEmail ?? false,
        sentByWhats: (quote as any).sentByWhats ?? false,
        items: quote.items.map((i: { id: string; itemName: string; quantity: number; price: number; total: number }) => ({
          id: i.id,
          itemName: i.itemName,
          quantity: i.quantity,
          unitPrice: i.price,
          total: i.total,
        })),
      };
    }
  );

  app.patch(
    '/quotes/:id',
    {
      preHandler: requireAuth,
      schema: {
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        body: {
          type: 'object',
          properties: {
            clientName: { type: 'string' },
            customerAddress: { type: 'string' },
            currency: { type: 'string' },
            vatRate: { type: 'number' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  itemName: { type: 'string' },
                  quantity: { type: 'number' },
                  unitPrice: { type: 'number' },
                },
              },
            },
          },
        },
        response: {
          200: { type: 'object' },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const parsed = updateQuoteBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join('; ') || 'Validation failed';
        return reply.status(400).send({ error: msg });
      }

      const existing = await prisma.quote.findFirst({ where: { id, userId }, include: { items: true } });
      if (!existing) return reply.status(404).send({ error: 'Quote not found' });

      const { clientName, customerAddress, currency, vatRate, quoteNumber, quoteDate, validUntil, items: itemsInput } = parsed.data;
      const vatRateNum = vatRate ?? existing.vatRate;
      const itemsToUse =
        itemsInput ??
        (existing.items as any[]).map((i) => ({
          itemName: i.itemName,
          quantity: i.quantity,
          unitPrice: i.price,
        }));
      const subtotal = itemsToUse.reduce((s: number, it: { quantity: number; unitPrice: number }) => s + it.quantity * it.unitPrice, 0);
      const vatAmount = subtotal * vatRateNum;
      const total = subtotal + vatAmount;

      await prisma.quoteItem.deleteMany({ where: { quoteId: id } });
      const quote = await prisma.quote.update({
        where: { id },
        data: {
          clientName: clientName !== undefined ? clientName : existing.clientName,
          ...(customerAddress !== undefined
            ? { customerAddress }
            : (existing as any).customerAddress !== undefined
              ? { customerAddress: (existing as any).customerAddress }
              : {}),
          ...(parsed.data.freeText !== undefined
            ? { freeText: parsed.data.freeText }
            : (existing as any).freeText !== undefined
              ? { freeText: (existing as any).freeText }
              : {}),
          ...(currency
            ? { currency: currency.toUpperCase() }
            : (existing as any).currency !== undefined
              ? { currency: (existing as any).currency as string }
              : {}),
          vatRate: vatRateNum,
          subtotal,
          vat: vatAmount,
          total,
          ...(quoteNumber !== undefined ? { quoteNumber } : {}),
          ...(quoteDate !== undefined ? { quoteDate: quoteDate ? new Date(quoteDate) : null } : {}),
          ...(validUntil !== undefined ? { validUntil: validUntil ? new Date(validUntil) : null } : {}),
          items: {
            create: itemsToUse.map((it: { itemName: string; quantity: number; unitPrice: number }) => ({
              itemName: it.itemName,
              quantity: it.quantity,
              price: it.unitPrice,
              total: it.quantity * it.unitPrice,
            })),
          },
        } as any,
        include: { items: true },
      });

      return {
        id: quote.id,
        clientName: quote.clientName,
        customerAddress: (quote as any).customerAddress ?? null,
        freeText: (quote as any).freeText ?? null,
        currency: (quote as any).currency ?? 'EUR',
        vatRate: quote.vatRate,
        subtotal: quote.subtotal,
        vat: quote.vat,
        total: quote.total,
        createdAt: quote.createdAt.toISOString(),
        quoteNumber: (quote as any).quoteNumber ?? null,
        quoteDate: (quote as any).quoteDate ? (quote as any).quoteDate.toISOString() : null,
        validUntil: (quote as any).validUntil ? (quote as any).validUntil.toISOString() : null,
        items: quote.items.map((i: { id: string; itemName: string; quantity: number; price: number; total: number }) => ({
          id: i.id,
          itemName: i.itemName,
          quantity: i.quantity,
          unitPrice: i.price,
          total: i.total,
        })),
      };
    }
  );

  app.delete(
    '/quotes/:id',
    {
      preHandler: requireAuth,
      schema: {
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        response: {
          204: { type: 'null' },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const q = await prisma.quote.findFirst({ where: { id, userId } });
      if (!q) return reply.status(404).send({ error: 'Quote not found' });
      await prisma.quote.delete({ where: { id } });
      return reply.status(204).send();
    }
  );

  // PDF export
  app.get(
    '/quotes/:id/pdf',
    {
      preHandler: requireAuth,
      schema: {
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        querystring: {
          type: 'object',
          properties: {
            quoteDate: { type: 'string' },
            validUntil: { type: 'string' },
            lang: { type: 'string' },
            quoteNumber: { type: 'integer' },
          },
          required: ['quoteDate', 'validUntil', 'quoteNumber'],
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const q = request.query as { quoteDate: string; validUntil: string; lang?: string; quoteNumber?: number };
      const quoteNumberParam = q.quoteNumber != null ? Number(q.quoteNumber) : NaN;
      if (!Number.isInteger(quoteNumberParam) || quoteNumberParam < 1) {
        return reply.status(400).send({ error: 'quoteNumber is required and must be a positive integer' });
      }

      const [quote, user, attachments] = await Promise.all([
        prisma.quote.findFirst({ where: { id, userId }, include: { items: true } }),
        prisma.user.findUnique({ where: { id: userId } }),
        (prisma as any).quoteAttachment.findMany({ where: { quoteId: id }, orderBy: { createdAt: 'asc' } }),
      ]);
      if (!quote) return reply.status(404).send({ error: 'Quote not found' });
      if (!user) return reply.status(404).send({ error: 'User not found' });

      const quoteNumber = String(quoteNumberParam);
      const baseUrl = `${request.protocol}://${request.hostname}`;

      const pdfDoc = generateQuotePdf(
        {
          id: quote.id,
          clientName: quote.clientName,
          customerAddress: (quote as any).customerAddress ?? null,
          freeText: (quote as any).freeText ?? null,
          currency: (quote as any).currency ?? 'EUR',
          vatRate: quote.vatRate,
          subtotal: quote.subtotal,
          vat: quote.vat,
          total: quote.total,
          items: quote.items.map((i: any) => ({
            itemName: i.itemName,
            quantity: i.quantity,
            price: i.price,
            total: i.total,
          })),
          attachments: (attachments as any[]).map((a: any) => ({
            filename: a.filename,
            url: `${baseUrl}/uploads/quotes/${id}/attachments/${a.id}/download`,
          })),
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
        { quoteDate: q.quoteDate, validUntil: q.validUntil, quoteNumber, lang: q.lang ?? 'de' },
      );

      const titleMap: Record<string, string> = { de: 'Angebot', en: 'Quotation', it: 'Preventivo', fr: 'Devis', es: 'Presupuesto' };
      const pdfTitle = titleMap[q.lang ?? 'de'] ?? titleMap.en;
      const companyLabel = ((user as any).companyName ?? 'Firma').replace(/[^a-zA-Z0-9]/g, ' ').trim();
      const clientLabel = (quote.clientName ?? pdfTitle).replace(/[^a-zA-Z0-9]/g, ' ').trim();
      const downloadName = `${companyLabel} - ${pdfTitle} ${quoteNumber} ${clientLabel}`.trim();
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${downloadName}.pdf"`);

      return reply.send(pdfDoc);
    },
  );

  // Get public links for quote PDF and attachments (for pre-filling email / WhatsApp).
  // This is a POST so we can generate and persist the PDF.
  app.post(
    '/quotes/:id/send-links',
    {
      preHandler: requireAuth,
      schema: {
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        body: {
          type: 'object',
          properties: {
            quoteDate: { type: 'string' },
            validUntil: { type: 'string' },
            quoteNumber: { type: 'integer' },
            lang: { type: 'string' },
          },
          required: ['quoteDate', 'validUntil', 'quoteNumber'],
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const q = request.body as { quoteDate: string; validUntil: string; quoteNumber: number; lang?: string };
      const quoteNumberParam = Number(q.quoteNumber);
      if (!Number.isInteger(quoteNumberParam) || quoteNumberParam < 1) {
        return reply.status(400).send({ error: 'quoteNumber must be a positive integer' });
      }

      const [quote, user, attachments] = await Promise.all([
        prisma.quote.findFirst({ where: { id, userId }, include: { items: true } }),
        prisma.user.findUnique({ where: { id: userId } }),
        (prisma as any).quoteAttachment.findMany({ where: { quoteId: id }, orderBy: { createdAt: 'asc' } }),
      ]);
      if (!quote) return reply.status(404).send({ error: 'Quote not found' });
      if (!user) return reply.status(404).send({ error: 'User not found' });

      const baseUrl = process.env.PUBLIC_URL
        ? process.env.PUBLIC_URL.replace(/\/+$/, '')
        : `https://${request.hostname}`;
      const pdfNumber = String(quoteNumberParam);

      // Generate PDF document
      const pdfDoc = generateQuotePdf(
        {
          id: quote.id,
          clientName: quote.clientName,
          customerAddress: (quote as any).customerAddress ?? null,
          freeText: (quote as any).freeText ?? null,
          currency: (quote as any).currency ?? 'EUR',
          vatRate: quote.vatRate,
          subtotal: quote.subtotal,
          vat: quote.vat,
          total: quote.total,
          items: quote.items.map((i: any) => ({
            itemName: i.itemName,
            quantity: i.quantity,
            price: i.price,
            total: i.total,
          })),
          attachments: (attachments as any[]).map((a: any) => ({
            filename: a.filename,
            url: '',
          })),
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
        { quoteDate: q.quoteDate, validUntil: q.validUntil, quoteNumber: pdfNumber, lang: q.lang ?? 'de' },
      );

      // Persist PDF under uploads so it can be served statically
      const pdfDir = path.join(ATTACHMENTS_DIR, 'quotes', id);
      await fsp.mkdir(pdfDir, { recursive: true });
      const pdfPath = path.join(pdfDir, `pdf-${pdfNumber}.pdf`);
      await new Promise<void>((resolve, reject) => {
        const out = fs.createWriteStream(pdfPath);
        pdfDoc.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        pdfDoc.on('error', reject);
        // generateQuotePdf already calls doc.end(), so we don't end again here.
      });

      const uploadsBase = `${baseUrl}/uploads`;
      const pdfUrl = `${uploadsBase}/quotes/${id}/pdf-${encodeURIComponent(pdfNumber)}.pdf`;

      // Public attachment links served via /uploads (no auth, static files)
      const attachmentUrls = (attachments as any[]).map((a: any) => {
        const rawPath = String(a.path ?? '').replace(/^[/\\]+/, '');
        const encodedPath = encodeURI(rawPath);
        return {
          filename: a.filename,
          url: `${uploadsBase}/${encodedPath}`,
        };
      });

      return reply.send({ pdfUrl, attachmentUrls });
    },
  );

  // Send quote via email or WhatsApp
  app.post(
    '/quotes/:id/send',
    {
      preHandler: requireAuth,
      schema: {
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        body: {
          type: 'object',
          properties: {
            channel: { type: 'string', enum: ['email', 'whatsapp'] },
            recipient: { type: 'string' },
            quoteDate: { type: 'string' },
            validUntil: { type: 'string' },
            quoteNumber: { type: 'integer' },
            lang: { type: 'string' },
          },
          required: ['channel', 'recipient', 'quoteDate', 'validUntil'],
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const body = request.body as {
        channel: 'email' | 'whatsapp';
        recipient: string;
        quoteDate: string;
        validUntil: string;
        quoteNumber?: number;
        lang?: string;
      };
      const { channel, recipient, quoteDate, validUntil } = body;
      const quoteNumberParam = body.quoteNumber != null ? Number(body.quoteNumber) : NaN;
      if (!Number.isInteger(quoteNumberParam) || quoteNumberParam < 1) {
        return reply.status(400).send({ error: 'quoteNumber is required and must be a positive integer' });
      }

      const [quote, user, attachments] = await Promise.all([
        prisma.quote.findFirst({ where: { id, userId }, include: { items: true } }),
        prisma.user.findUnique({ where: { id: userId } }),
        (prisma as any).quoteAttachment.findMany({ where: { quoteId: id }, orderBy: { createdAt: 'asc' } }),
      ]);
      if (!quote) return reply.status(404).send({ error: 'Quote not found' });
      if (!user) return reply.status(404).send({ error: 'User not found' });

      const quoteNumber = String(quoteNumberParam);
      const lang = normalizeLang(body.lang);

      // Generate PDF into buffer
      const pdfDoc = generateQuotePdf(
        {
          id: quote.id,
          clientName: quote.clientName,
          customerAddress: (quote as any).customerAddress ?? null,
          freeText: (quote as any).freeText ?? null,
          currency: (quote as any).currency ?? 'EUR',
          vatRate: quote.vatRate,
          subtotal: quote.subtotal,
          vat: quote.vat,
          total: quote.total,
          items: quote.items.map((i: any) => ({
            itemName: i.itemName,
            quantity: i.quantity,
            price: i.price,
            total: i.total,
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
        { quoteDate, validUntil, quoteNumber, lang },
      );

      const pdfChunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        pdfDoc.on('data', (c) => pdfChunks.push(c as Buffer));
        pdfDoc.on('end', () => resolve());
        pdfDoc.on('error', reject);
      });
      const pdfBuffer = Buffer.concat(pdfChunks);

      const fileAttachments = (attachments as any[]).map((a: any) => ({
        filename: a.filename,
        path: path.join(ATTACHMENTS_DIR, a.path),
      }));

      try {
        const companyLabel = ((user as any).companyName ?? 'Firma').trim();
        const clientLabel = (quote.clientName ?? '').trim();
        const subjectTitle = `Angebot ${quoteNumber}`;
        const pdfFilenameBase = `${companyLabel} - ${subjectTitle} ${clientLabel}`.trim();

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
        const validUntilStr = validUntil ? formatDateForLang(lang, validUntil) : '';
        const senderName = ((user as any).name ?? '').trim() || companyLabel;

        const emailTextByLang: Record<
          SupportedLang,
          {
            greeting: (customer: string) => string;
            intro: string;
            interest: string;
            contact: string;
            validUntil: (date: string) => string;
            regards: string;
          }
        > = {
          de: {
            greeting: (c) => `Sehr geehrte(r) ${c},`,
            intro: 'Wir freuen uns über Ihr Interesse an unserem Service/unseren Produkten.',
            interest: 'Ist unser Angebot für Sie interessant? Dann freuen wir uns über Ihren Auftrag!',
            contact: 'Zögern Sie bitte nicht, uns bei Fragen zu kontaktieren.',
            validUntil: (d) => `Dieses Angebot ist gültig bis zum ${d}.`,
            regards: 'Mit freundlichen Grüßen',
          },
          en: {
            greeting: (c) => `Dear ${c},`,
            intro: 'We are pleased about your interest in our services/products.',
            interest: 'Is our offer interesting for you? We look forward to your order!',
            contact: 'Please do not hesitate to contact us if you have any questions.',
            validUntil: (d) => `This offer is valid until ${d}.`,
            regards: 'Kind regards',
          },
          it: {
            greeting: (c) => `Gentile ${c},`,
            intro: 'Siamo lieti del Suo interesse per i nostri servizi/prodotti.',
            interest: 'Il nostro preventivo Le interessa? Saremo lieti di ricevere il Suo ordine!',
            contact: 'Non esiti a contattarci per qualsiasi domanda.',
            validUntil: (d) => `Questo preventivo è valido fino al ${d}.`,
            regards: 'Cordiali saluti',
          },
          fr: {
            greeting: (c) => `Bonjour ${c},`,
            intro: "Nous vous remercions de l’intérêt que vous portez à nos services/produits.",
            interest: 'Notre offre vous intéresse ? Nous serions ravis de recevoir votre commande !',
            contact: "N’hésitez pas à nous contacter si vous avez des questions.",
            validUntil: (d) => `Ce devis est valable jusqu’au ${d}.`,
            regards: 'Cordialement',
          },
          es: {
            greeting: (c) => `Estimado/a ${c},`,
            intro: 'Gracias por su interés en nuestros servicios/productos.',
            interest: '¿Le interesa nuestra oferta? ¡Esperamos su pedido con gusto!',
            contact: 'No dude en contactarnos si tiene alguna pregunta.',
            validUntil: (d) => `Este presupuesto es válido hasta el ${d}.`,
            regards: 'Atentamente',
          },
        };

        const s = emailTextByLang[lang];
        const bodyTextLines = [
          `${s.greeting(customerName)}`,
          s.intro,
          s.interest,
          s.contact,
          validUntilStr ? s.validUntil(validUntilStr) : '',
          s.regards,
          senderName,
        ].filter(Boolean);

        await sendQuoteEmail({
          to: recipient,
          cc: user.email,
          // Subject format: "Company name - Quote number customer name"
          subject: `${companyLabel} - ${subjectTitle} ${clientLabel}`.trim(),
          text: bodyTextLines.join('\n\n'),
          pdf: {
            filename: `${pdfFilenameBase}.pdf`,
            content: pdfBuffer,
          },
          attachments: fileAttachments,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to send quote';
        return reply.status(400).send({ error: msg });
      }

      return reply.send({ ok: true });
    },
  );

  // Attachments
  app.post(
    '/quotes/:id/attachments',
    {
      preHandler: requireAuth,
      schema: {
        description: 'Upload an attachment for a quote',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              filename: { type: 'string' },
              mimeType: { type: 'string' },
              size: { type: 'number' },
              url: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };

      const quote = await prisma.quote.findFirst({ where: { id, userId } });
      if (!quote) {
        return reply.status(400).send({ error: 'Quote not found' });
      }

      const data = await (request as any).file?.();
      if (!data) return reply.status(400).send({ error: 'No file uploaded' });

      const buf = await data.toBuffer();
      if (buf.length > 25 * 1024 * 1024) {
        return reply.status(400).send({ error: 'File too large. Max 25 MB.' });
      }

      const filename: string = data.filename ?? 'attachment';
      const mimeType: string = data.mimetype ?? 'application/octet-stream';

      await fsp.mkdir(ATTACHMENTS_DIR, { recursive: true });
      const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storedName = `${id}-${Date.now()}-${safeName}`;
      const fullPath = path.join(ATTACHMENTS_DIR, storedName);
      await fsp.writeFile(fullPath, buf);

      const attachment = await (prisma as any).quoteAttachment.create({
        data: {
          quoteId: id,
          filename,
          mimeType,
          size: buf.length,
          path: storedName,
        },
      });

      // URL must match actual file path for static serving: /uploads/<path>
      const url = `/uploads/${attachment.path}`;

      return reply.send({
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        url,
        createdAt: attachment.createdAt.toISOString(),
      });
    }
  );

  app.get(
    '/quotes/:id/attachments',
    {
      preHandler: requireAuth,
      schema: {
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                filename: { type: 'string' },
                mimeType: { type: 'string' },
                size: { type: 'number' },
                url: { type: 'string' },
                createdAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };

      const quote = await prisma.quote.findFirst({ where: { id, userId } });
      if (!quote) return reply.status(200).send({ error: 'Quote not found' } as any);

      const atts = await (prisma as any).quoteAttachment.findMany({
        where: { quoteId: id },
        orderBy: { createdAt: 'asc' },
      });

      // URL must match actual file path for static serving: /uploads/<path>
      const mapped = atts.map((a: any) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        url: `/uploads/${a.path}`,
        createdAt: a.createdAt.toISOString(),
      }));

      return reply.send(mapped);
    }
  );

  app.get(
    '/quotes/:id/attachments/:attachmentId/download',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string' }, attachmentId: { type: 'string' } },
          required: ['id', 'attachmentId'],
        },
        response: {
          200: { type: 'string' },
          400: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { id, attachmentId } = request.params as { id: string; attachmentId: string };

      const att = await (prisma as any).quoteAttachment.findFirst({ where: { id: attachmentId, quoteId: id } });
      if (!att) {
        return reply.status(400).send({ error: 'Attachment not found' });
      }

      const filePath = path.join(ATTACHMENTS_DIR, att.path);
      if (!fs.existsSync(filePath)) {
        return reply.status(400).send({ error: 'File not found' });
      }

      const stream = fs.createReadStream(filePath);
      const isInline =
        att.mimeType === 'application/pdf' || att.mimeType.startsWith('image/');
      const dispositionType = isInline ? 'inline' : 'attachment';
      return reply
        .header('Content-Type', att.mimeType)
        .header('Content-Disposition', `${dispositionType}; filename="${att.filename}"`)
        .send(stream);
    }
  );

  app.delete(
    '/quotes/:id/attachments/:attachmentId',
    {
      preHandler: requireAuth,
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string' }, attachmentId: { type: 'string' } },
          required: ['id', 'attachmentId'],
        },
        response: {
          204: { type: 'null' },
          400: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId!;
      const { id, attachmentId } = request.params as { id: string; attachmentId: string };

      const quote = await prisma.quote.findFirst({ where: { id, userId } });
      if (!quote) {
        return reply.status(400).send({ error: 'Quote not found' });
      }

      const att = await (prisma as any).quoteAttachment.findFirst({ where: { id: attachmentId, quoteId: id } });
      if (!att) {
        return reply.status(400).send({ error: 'Attachment not found' });
      }

      const filePath = path.join(ATTACHMENTS_DIR, att.path);
      try {
        await fsp.unlink(filePath);
      } catch {
        // ignore file system errors (already deleted, etc.)
      }

      await (prisma as any).quoteAttachment.delete({ where: { id: attachmentId } });

      return reply.status(204).send();
    }
  );
}