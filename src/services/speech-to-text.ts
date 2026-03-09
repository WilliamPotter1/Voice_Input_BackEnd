import { OpenAI } from 'openai';

let _openai: OpenAI;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' });
  }
  return _openai;
}

export interface TranscribeOptions {
  filename?: string;
  mimeType?: string;
  language?: string;
}

export interface TranscribeResult {
  text: string;
  language?: string;
}

async function transcribe(
  audioBuffer: Buffer,
  options: TranscribeOptions = {}
): Promise<TranscribeResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const file = new File([audioBuffer], options.filename ?? 'audio.mp3', {
    type: options.mimeType ?? 'audio/mpeg',
  });

  const transcription = await getOpenAI().audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: options.language ?? undefined,
    response_format: 'verbose_json',
  });

  const verbose = transcription as { text: string; language?: string };
  return {
    text: verbose.text ?? (typeof transcription === 'string' ? transcription : ''),
    language: verbose.language ?? options.language,
  };
}

export const speechToTextService = { transcribe };
