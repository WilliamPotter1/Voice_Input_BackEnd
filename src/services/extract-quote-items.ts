import { OpenAI } from 'openai';
import type { QuoteItemInput } from '../schemas/quotes.js';

let _openai: OpenAI;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' });
  }
  return _openai;
}

const SYSTEM_PROMPT = `You are a quote extraction assistant. Given a transcription of someone describing products or services and their quantities and prices, extract a structured list of line items.

Rules:
- Output ONLY a valid JSON array. No markdown, no explanation.
- Each element must have: "itemName" (string), "quantity" (integer), "unitPrice" (number, in the main currency unit, e.g. euros).
- Infer product/service name from the text. Use clear, professional labels (e.g. "Window installation", "Door installation").
- If the text mentions "3 windows for 250 euros each", output itemName like "Window installation" or "Windows", quantity 3, unitPrice 250.
- If quantity or price is missing for an item, use quantity 1 and 0 for price.
- Preserve the currency implied in the text; output numbers only (no currency symbols).`;

export async function extractQuoteItems(
  text: string,
  _options?: { language?: string }
): Promise<QuoteItemInput[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    const arr = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown[] }).items ?? [];
    return arr.map((x: unknown) => {
      const o = x as Record<string, unknown>;
      return {
        itemName: String(o.itemName ?? o.name ?? 'Item').trim() || 'Item',
        quantity: Math.max(1, Number(o.quantity) || 1),
        unitPrice: Math.max(0, Number(o.unitPrice ?? o.price ?? 0)),
      };
    });
  } catch {
    return [];
  }
}
