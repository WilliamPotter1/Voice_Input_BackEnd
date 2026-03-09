import { z } from 'zod';

export const transcribeBodySchema = z.object({
  language: z.string().optional(), // e.g. 'de', 'en', 'it', 'fr', 'es'
});

export type TranscribeBody = z.infer<typeof transcribeBodySchema>;
