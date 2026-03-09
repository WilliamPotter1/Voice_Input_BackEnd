import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { speechToTextService } from '../services/speech-to-text.js';

const ALLOWED_MIMES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/webm'];
const ALLOWED_EXT = ['.mp3', '.wav', '.m4a', '.webm'];

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIMES.some((m) => mime?.toLowerCase().includes(m.replace('audio/', '')));
}

function isAllowedFilename(filename: string): boolean {
  const ext = filename?.toLowerCase().slice(filename.lastIndexOf('.'));
  return ALLOWED_EXT.includes(ext);
}

export async function speechToTextRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  app.post('/transcribe', {
    schema: {
      description: 'Transcribe audio file to text using OpenAI Whisper. Send multipart form: file (audio), optional language (de, en, it, fr, es).',
      response: {
        200: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            language: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
    handler: async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }
      const buf = await data.toBuffer();
      const mime = data.mimetype;
      const filename = data.filename;

      if (!isAllowedMime(mime) && !isAllowedFilename(filename)) {
        return reply.status(400).send({
          error: 'Invalid file type. Allowed: mp3, wav, m4a, webm',
        });
      }
      if (buf.length > 25 * 1024 * 1024) {
        return reply.status(400).send({ error: 'File too large. Max 25 MB.' });
      }

      const language = (request.query as { language?: string })?.language;
      const result = await speechToTextService.transcribe(buf, {
        filename: data.filename,
        mimeType: mime,
        language: language || undefined,
      });
      return { text: result.text, language: result.language ?? undefined };
    },
  });
}
