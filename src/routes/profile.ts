import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/db.js';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

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

const PROFILE_FIELDS = {
  name: true,
  phone: true,
  email: true,
  taxRate: true,
  websiteUrl: true,
  companyName: true,
  companyAddress: true,
  bankName: true,
  blz: true,
  kto: true,
  iban: true,
  bic: true,
  taxNumber: true,
  taxOfficeName: true,
  avatarPath: true,
} as const;

export async function profileRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  const AVATARS_DIR = process.env.AVATARS_DIR ?? path.join(process.cwd(), 'uploads', 'avatars');

  app.get(
    '/profile',
    { preHandler: requireAuth },
    async (request) => {
      const user = await prisma.user.findUnique({
        where: { id: request.userId! },
        select: PROFILE_FIELDS,
      });
      if (!user) return { error: 'User not found' };

      const avatarUrl = user.avatarPath
        ? `/api/profile/avatar/${path.basename(user.avatarPath)}`
        : null;

      return {
        name: user.name ?? '',
        phone: user.phone ?? '',
        email: user.email,
        taxRate: user.taxRate,
        websiteUrl: user.websiteUrl ?? '',
        companyName: user.companyName ?? '',
        companyAddress: user.companyAddress ?? '',
        bankName: user.bankName ?? '',
        blz: user.blz ?? '',
        kto: user.kto ?? '',
        iban: user.iban ?? '',
        bic: user.bic ?? '',
        taxNumber: user.taxNumber ?? '',
        taxOfficeName: user.taxOfficeName ?? '',
        avatarUrl,
      };
    },
  );

  app.patch(
    '/profile',
    { preHandler: requireAuth },
    async (request) => {
      const body = request.body as Record<string, unknown>;
      const data: Record<string, unknown> = {};

      const stringFields = [
        'name', 'phone', 'websiteUrl', 'companyName', 'companyAddress',
        'bankName', 'blz', 'kto', 'iban', 'bic', 'taxNumber', 'taxOfficeName',
      ];
      for (const key of stringFields) {
        if (body[key] !== undefined) {
          data[key] = typeof body[key] === 'string' ? (body[key] as string).trim() : null;
        }
      }

      if (body.taxRate !== undefined) {
        const val = Number(body.taxRate);
        data.taxRate = Number.isFinite(val) && val >= 0 && val <= 1 ? val : null;
      }

      const user = await prisma.user.update({
        where: { id: request.userId! },
        data,
        select: PROFILE_FIELDS,
      });

      const avatarUrl = user.avatarPath
        ? `/api/profile/avatar/${path.basename(user.avatarPath)}`
        : null;

      return {
        name: user.name ?? '',
        phone: user.phone ?? '',
        email: user.email,
        taxRate: user.taxRate,
        websiteUrl: user.websiteUrl ?? '',
        companyName: user.companyName ?? '',
        companyAddress: user.companyAddress ?? '',
        bankName: user.bankName ?? '',
        blz: user.blz ?? '',
        kto: user.kto ?? '',
        iban: user.iban ?? '',
        bic: user.bic ?? '',
        taxNumber: user.taxNumber ?? '',
        taxOfficeName: user.taxOfficeName ?? '',
        avatarUrl,
      };
    },
  );

  app.post(
    '/profile/avatar',
    { preHandler: requireAuth },
    async (request, reply) => {
      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded' });

      const mimeType = data.mimetype;
      if (!mimeType.startsWith('image/')) {
        return reply.status(400).send({ error: 'Only image files are allowed' });
      }

      await fsp.mkdir(AVATARS_DIR, { recursive: true });

      const ext = path.extname(data.filename) || '.jpg';
      const filename = `${request.userId!}-${randomUUID()}${ext}`;
      const filePath = path.join(AVATARS_DIR, filename);

      const buffer = await data.toBuffer();
      await fsp.writeFile(filePath, buffer);

      const oldUser = await prisma.user.findUnique({
        where: { id: request.userId! },
        select: { avatarPath: true },
      });
      if (oldUser?.avatarPath) {
        await fsp.unlink(oldUser.avatarPath).catch(() => {});
      }

      await prisma.user.update({
        where: { id: request.userId! },
        data: { avatarPath: filePath },
      });

      return { avatarUrl: `/api/profile/avatar/${filename}` };
    },
  );

  app.get(
    '/profile/avatar/:filename',
    async (request, reply) => {
      const { filename } = request.params as { filename: string };
      const safeName = path.basename(filename);
      const filePath = path.join(AVATARS_DIR, safeName);

      try {
        const stat = await fsp.stat(filePath);
        if (!stat.isFile()) return reply.status(404).send({ error: 'Not found' });
      } catch {
        return reply.status(404).send({ error: 'Not found' });
      }

      const ext = path.extname(safeName).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      };

      const { createReadStream } = await import('node:fs');
      const stream = createReadStream(filePath);
      return reply
        .header('Content-Type', mimeMap[ext] ?? 'application/octet-stream')
        .header('Cache-Control', 'public, max-age=86400')
        .send(stream);
    },
  );
}
