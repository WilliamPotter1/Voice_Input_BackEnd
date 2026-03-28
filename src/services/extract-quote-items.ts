import { OpenAI } from 'openai';
import type { QuoteItemInput } from '../schemas/quotes.js';

let _openai: OpenAI;

/** Remove comma-separated literal "null"/"undefined" tokens that models sometimes emit for missing address parts. */
function normalizeExtractedCustomerAddress(addr: string | null): string | null {
  if (addr == null) return null;
  const segments = addr
    .split(',')
    .map((p) => p.trim())
    .filter(
      (p) =>
        p.length > 0 &&
        !/^null$/i.test(p) &&
        p.toLowerCase() !== 'undefined' &&
        !/^n\/?a$/i.test(p),
    );
  const s = segments.join(', ').trim();
  return s || null;
}

function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' });
  }
  return _openai;
}

const SYSTEM_PROMPT = `You are a quote extraction assistant. Given a transcription of someone describing products or services, their quantities, prices and tax/VAT, extract a structured list of line items and, if possible, the customer's name, address, tax rate, and main currency.

Rules:
- Output ONLY a valid JSON object with this exact shape (no markdown, no explanation):
  {
    "customerName": "string or null",
    "customerAddress": "string or null",
    "vatRate": 0.19,
    "currency": "EUR",
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
- "customerName" must be a string with the customer or company name if you can clearly identify it (e.g. "Müller GmbH", "Mr. Smith", "Acme Corp"); otherwise use null.
- "customerAddress" must be a single string with the customer's address if you can clearly identify it; otherwise use null.
- When you know the full German-style address, format "customerAddress" in this exact field order:
  1) ZIP/postal code
  2) City name
  3) Street name
  4) Street/house number
  For example: "10115 Berlin, Invalidenstraße 116".
- If you only know some parts, still keep the same order and omit the missing pieces, e.g. "10115 Berlin" or "10115 Berlin, Invalidenstraße".
- Never put the literal English words "null" or "undefined" inside "customerAddress"; if a part is unknown, leave it out (do not pad with placeholders).
 - "vatRate" must be a number between 0 and 1 representing the tax/VAT fraction (e.g. 0.19 for 19%, 0.07 for 7%). If no tax/VAT is clearly specified, use null.
 - "currency" must be a 3-letter ISO 4217 currency code (e.g. "EUR", "CHF", "USD") that matches the main currency implied in the text. If you cannot confidently determine the currency, use "EUR" by default.
 - Each element must have: "itemName" (string), "quantity" (number, can be fractional like 0.5), "unitPrice" (number, in the main currency unit, e.g. euros), and "unit" (string).
 - Infer product/service name from the text. Use clear, professional labels (e.g. "Window installation", "Door installation").
 - If the text mentions "3 windows for 250 euros each", output itemName like "Window installation" or "Windows", quantity 3, unitPrice 250.
 - If quantity or price is missing for an item, use quantity 1 and 0 for price.
 - Preserve the currency implied in the text; output numbers only (no currency symbols).
 - For units, DO NOT replace specific phrases with generic ones, and ALWAYS keep the units in exactly the same language as the transcription (never translate units to English when the transcription is not English):
  - If the transcription says "square meter", "m²", or "Quadratmeter", use the corresponding phrase in the user language (e.g. in German: "Quadratmeter"; in English: "square meter") – not just "meter".
  - If the transcription says something like "pauschal" (flat fee / lump sum), use a unit like "pauschal" in German, or the exact word from the transcription in the same language, not "piece".
  - If the transcription clearly implies a unit but does not name it explicitly, infer the most precise natural unit from context using the transcription language (for example: for "10 windows" use "window" / "Fenster"; for "3 hours of work" use "hour" / "Stunde"; for "monthly service" use "month" or the equivalent in the user language).
  - NEVER fall back to vague generic units like "piece" unless the word "piece" (or its direct translation in the same language) is actually used in the transcription.
  - In general, prefer the most specific unit phrase mentioned or clearly implied in the text, and keep both "itemName" and "unit" strictly in the same language as the user's transcription (no English leakage when language is not English).`;

export async function extractQuoteItems(
  text: string,
  options?: { language?: string }
): Promise<{ items: QuoteItemInput[]; customerName: string | null; customerAddress: string | null; vatRate: number | null; currency: string | null }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const languageHint = options?.language;

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(languageHint
        ? [
            {
              role: 'system' as const,
              content: `Language hint: ${languageHint}. You MUST use exactly this language for ALL text you output: "itemName", "unit", and any other strings. Do NOT translate units or item names to English when the language is not English; instead, always use the natural words and phrases from the transcription language.`,
            },
          ]
        : []),
      { role: 'user', content: text },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return { items: [], customerName: null, customerAddress: null, vatRate: null, currency: null };

  try {
    const parsed = JSON.parse(raw) as unknown;
    const root = parsed as { items?: unknown[]; customerName?: unknown; customerAddress?: unknown; vatRate?: unknown; currency?: unknown } | unknown[];
    const arr = Array.isArray(root) ? root : root.items ?? [];
    const customerNameRaw = Array.isArray(root) ? undefined : root.customerName;
    const customerName =
      typeof customerNameRaw === 'string'
        ? customerNameRaw.trim() || null
        : null;

    const customerAddressRaw = Array.isArray(root) ? undefined : root.customerAddress;
    const customerAddress = normalizeExtractedCustomerAddress(
      typeof customerAddressRaw === 'string' ? customerAddressRaw.trim() || null : null,
    );

    const vatRateRaw = Array.isArray(root) ? undefined : root.vatRate;
    const vatRateNum = typeof vatRateRaw === 'number' ? vatRateRaw : Number(vatRateRaw);
    const vatRate =
      Number.isFinite(vatRateNum) && vatRateNum >= 0 && vatRateNum <= 1
        ? vatRateNum
        : null;

    const currencyRaw = Array.isArray(root) ? undefined : root.currency;
    const currency =
      typeof currencyRaw === 'string' && currencyRaw.trim().length === 3
        ? currencyRaw.trim().toUpperCase()
        : null;

    const items = arr.map((x: unknown) => {
      const o = x as Record<string, unknown>;
      const baseName = String(o.itemName ?? o.name ?? 'Item').trim() || 'Item';
      let unit = String((o as any).unit ?? '').trim();

      // Post-process some common units into the transcription language when we have a hint.
      if (languageHint === 'de' && unit) {
        const u = unit.toLowerCase();
        if (u.includes('square meter') || u.includes('square metre')) {
          unit = 'Quadratmeter';
        } else if (u.includes('hour')) {
          unit = 'Stunde';
        } else if (u.includes('flat fee') || u.includes('lump sum')) {
          unit = 'pauschal';
        }
      }

      const nameWithUnit = unit ? `${baseName} (${unit})` : baseName;

      const rawQtyVal = (o as any).quantity;
      const qtyString = String(rawQtyVal ?? '').replace(',', '.').trim();
      const qtyNumber = qtyString === '' ? NaN : parseFloat(qtyString);
      const quantity = !Number.isNaN(qtyNumber) && qtyNumber >= 0 ? qtyNumber : 0;

      const rawPriceVal = (o as any).unitPrice ?? (o as any).price ?? 0;
      const priceNumber =
        typeof rawPriceVal === 'string'
          ? Number(rawPriceVal.replace(',', '.'))
          : Number(rawPriceVal);
      const unitPrice = Number.isFinite(priceNumber) && priceNumber >= 0 ? priceNumber : 0;

      return {
        itemName: nameWithUnit,
        quantity,
        unitPrice,
      };
    });

    return { items, customerName, customerAddress, vatRate, currency };
  } catch {
    return { items: [], customerName: null, customerAddress: null, vatRate: null, currency: null };
  }
}
