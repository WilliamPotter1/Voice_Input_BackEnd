import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

export async function healthRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
}
