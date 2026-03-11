import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/db.js';
import { createQuoteBodySchema, updateQuoteBodySchema } from '../schemas/quotes.js';

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
  app.addHook('preHandler', requireAuth);

  app.post(
    '/quotes',
    {
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
                  quantity: { type: 'integer' },
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
      const { clientName, customerAddress, currency, vatRate = 0.19, items } = parsed.data;

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
          // cast to any to satisfy possibly stale Prisma types
          currency: (currency ?? 'EUR').toUpperCase(),
          vatRate,
          subtotal,
          vat: vatAmount,
          total,
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
        currency: q.currency ?? 'EUR',
        subtotal: q.subtotal,
        vat: q.vat,
        total: q.total,
        createdAt: q.createdAt.toISOString(),
      }));
    }
  );

  app.get(
    '/quotes/:id',
    {
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
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    itemName: { type: 'string' },
                    quantity: { type: 'integer' },
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
        currency: (quote as any).currency ?? 'EUR',
        vatRate: quote.vatRate,
        subtotal: quote.subtotal,
        vat: quote.vat,
        total: quote.total,
        createdAt: quote.createdAt.toISOString(),
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
                  quantity: { type: 'integer' },
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

      const { clientName, customerAddress, currency, vatRate, items: itemsInput } = parsed.data;
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
          ...(currency
            ? { currency: currency.toUpperCase() }
            : (existing as any).currency !== undefined
              ? { currency: (existing as any).currency as string }
              : {}),
          vatRate: vatRateNum,
          subtotal,
          vat: vatAmount,
          total,
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
        currency: (quote as any).currency ?? 'EUR',
        vatRate: quote.vatRate,
        subtotal: quote.subtotal,
        vat: quote.vat,
        total: quote.total,
        createdAt: quote.createdAt.toISOString(),
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
}