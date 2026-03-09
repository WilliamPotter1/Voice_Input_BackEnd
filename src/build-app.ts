import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { healthRoutes } from './routes/health.js';
import { speechToTextRoutes } from './routes/speech-to-text.js';
import { authRoutes } from './routes/auth.js';
import { extractQuoteItemsRoutes } from './routes/extract-quote-items.js';
import { quotesRoutes } from './routes/quotes.js';
import { authPlugin } from './plugins/auth.js';

const NODE_ENV = process.env.NODE_ENV ?? 'development';

// Comma-separated list of allowed origins, e.g.
// CORS_ALLOWLIST="https://my-frontend.vercel.app,http://localhost:5173"
const ALLOWLIST = (process.env.CORS_ALLOWLIST ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'process.env.DATABASE_URL',
          'process.env.OPENAI_API_KEY',
        ],
        remove: true,
      },
    },
    trustProxy: true,
    bodyLimit: 512 * 1024,
  });

  const secret = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

  // ---- CORS ----------------------------------------------------------------
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow non-browser clients (curl, Postman — no Origin header)
      if (!origin) return cb(null, true);
      // In development, allow everything
      if (NODE_ENV === 'development') return cb(null, true);
      // In production, check allowlist
      if (ALLOWLIST.length === 0 || ALLOWLIST.includes(origin)) return cb(null, true);
      return cb(new Error('CORS: origin not allowed'), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(jwt, { secret });
  await app.register(authPlugin);
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  // ---- Global error handler ------------------------------------------------
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status =
      typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500;

    const isValidation =
      (err as any).validation || err.code === 'FST_ERR_VALIDATION';

    req.log.error({ err, requestId: req.id }, 'request_error');

    const message = isValidation
      ? 'Invalid request'
      : status >= 500
        ? 'Internal Server Error'
        : err.message || 'Bad Request';

    reply
      .code(isValidation && status === 500 ? 400 : status)
      .type('application/json')
      .send({
        error: message,
        // TODO: remove debug field once deployment is stable
        debug: err.message,
        requestId: req.id,
      });
  });

  // ---- Routes --------------------------------------------------------------
  app.get('/', async (_request, reply) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voice Quote API</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;">
  <h1>Voice Quote API</h1>
  <p>Version 1.0. Backend is running.</p>
  <p><a href="/api/health">Check health: GET /api/health</a></p>
</body>
</html>`;
    return reply.type('text/html').send(html);
  });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(speechToTextRoutes, { prefix: '/api' });
  await app.register(extractQuoteItemsRoutes, { prefix: '/api' });
  await app.register(quotesRoutes, { prefix: '/api' });

  return app;
}
