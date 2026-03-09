import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId?: string;
  }
}

export async function authPlugin(app: FastifyInstance) {
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
      const payload = request.user as { sub?: string };
      if (!payload?.sub) return reply.status(401).send({ error: 'Unauthorized' });
      request.userId = payload.sub;
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
}
