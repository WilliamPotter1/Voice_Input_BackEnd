import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { healthRoutes } from './routes/health.js';
import { speechToTextRoutes } from './routes/speech-to-text.js';
import { authRoutes } from './routes/auth.js';
import { extractQuoteItemsRoutes } from './routes/extract-quote-items.js';
import { quotesRoutes } from './routes/quotes.js';
import { invoicesRoutes } from './routes/invoices.js';
import { profileRoutes } from './routes/profile.js';
import { authPlugin } from './plugins/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    limits: { fileSize: 5 * 1024 * 1024 },
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

  // ---- API routes ----------------------------------------------------------
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(speechToTextRoutes, { prefix: '/api' });
  await app.register(extractQuoteItemsRoutes, { prefix: '/api' });
  await app.register(profileRoutes, { prefix: '/api' });
  await app.register(quotesRoutes, { prefix: '/api' });
  await app.register(invoicesRoutes, { prefix: '/api' });

  // ---- Serve uploaded files (before static frontend) -----------------------
  const uploadsDir = process.env.ATTACHMENTS_DIR ?? path.join(process.cwd(), 'uploads');
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // ---- Serve frontend ------------------------------------------------------
  const publicDir = process.env.PUBLIC_DIR ?? path.join(process.cwd(), 'public');
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
    decorateReply: false,
  });

  // ---- SPA fallback: serve index.html for any other GET request -------------
  app.setNotFoundHandler(async (request, reply) => {
    if (request.method !== 'GET') {
      return reply.code(404).send({ error: 'Not Found' });
    }
    const indexPath = path.join(publicDir, 'index.html');
    try {
      const fsp = await import('node:fs/promises');
      const html = await fsp.readFile(indexPath, 'utf-8');
      return reply.type('text/html').send(html);
    } catch {
      return reply.code(404).send({ error: 'Not Found' });
    }
  });

  return app;
}
