import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { extractQuoteItems } from '../services/extract-quote-items.js';
import { extractQuoteItemsBodySchema } from '../schemas/quotes.js';

export async function extractQuoteItemsRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
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
      const items = await extractQuoteItems(parsed.data.text, {
        language: parsed.data.language,
      });
      return reply.send({ items });
    }
  );
}
