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
- Output ONLY a valid JSON object with this exact shape (no markdown, no explanation):
  {
    "items": [
      {
        "itemName": "string",
        "quantity": 1,
        "unitPrice": 0,
        "unit": "string"
      }
    ]
  }
- "items" must always be an array (possibly empty).
- Each element must have: "itemName" (string), "quantity" (integer), "unitPrice" (number, in the main currency unit, e.g. euros), and "unit" (string, e.g. "meter", "piece", "hour").
- Infer product/service name from the text. Use clear, professional labels (e.g. "Window installation", "Door installation").
- If the text mentions "3 windows for 250 euros each", output itemName like "Window installation" or "Windows", quantity 3, unitPrice 250.
- If quantity or price is missing for an item, use quantity 1 and 0 for price.
- Preserve the currency implied in the text; output numbers only (no currency symbols).
- If a unit (e.g. "meters", "m", "pieces", "pcs") is mentioned, normalize it to a clear singular form (e.g. "meter", "piece") and set it in "unit".`;

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
      const baseName = String(o.itemName ?? o.name ?? 'Item').trim() || 'Item';
      const unit = String((o as any).unit ?? '').trim();
      const nameWithUnit = unit ? `${baseName} (${unit})` : baseName;
      return {
        itemName: nameWithUnit,
        quantity: Math.max(1, Number(o.quantity) || 1),
        unitPrice: Math.max(0, Number(o.unitPrice ?? o.price ?? 0)),
      };
    });
  } catch {
    return [];
  }
}
