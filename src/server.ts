import dotenv from 'dotenv';
dotenv.config();

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildApp } from './build-app.js';

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const PORT = Number(process.env.PORT ?? 3001);

let app: Awaited<ReturnType<typeof buildApp>>;

async function getApp() {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

// Vercel serverless handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fastify = await getApp();

  const response = await fastify.inject({
    method: req.method as any || 'GET',
    url: req.url || '/',
    headers: req.headers as Record<string, string>,
    payload: req.body != null ? JSON.stringify(req.body) : undefined,
  });

  res.status(response.statusCode);
  for (const [k, v] of Object.entries(response.headers)) {
    if (v !== undefined) res.setHeader(k, v);
  }
  res.end(response.payload);
}

// Local development: start listening
if (!process.env.VERCEL) {
  getApp()
    .then((fastify) => fastify.listen({ port: PORT, host: '0.0.0.0' }))
    .then(() => console.log(`Server listening on port ${PORT} (env=${NODE_ENV})`))
    .catch((err) => {
      console.error('Error starting server', err);
      process.exit(1);
    });
}
