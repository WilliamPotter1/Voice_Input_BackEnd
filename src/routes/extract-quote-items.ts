import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { extractQuoteItems } from '../services/extract-quote-items.js';
import { extractQuoteItemsBodySchema } from '../schemas/quotes.js';

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

export async function extractQuoteItemsRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  app.addHook('preHandler', requireAuth);

  app.post(
    '/extract-quote-items',
    {
      schema: {
        description: 'Extract structured quote line items from transcribed text using AI',
        body: {
          type: 'object',
          required: ['text'],
          properties: {
            text: { type: 'string' },
            language: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              customerName: { type: 'string', nullable: true },
              customerAddress: { type: 'string', nullable: true },
              vatRate: { type: 'number', nullable: true },
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
          400: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const parsed = extractQuoteItemsBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join('; ') || 'Validation failed';
        return reply.status(400).send({ error: msg });
      }
      const result = await extractQuoteItems(parsed.data.text, {
        language: parsed.data.language,
      });
      return reply.send({
        customerName: result.customerName,
        customerAddress: result.customerAddress,
        vatRate: result.vatRate,
        items: result.items,
      });
    }
  );
}
