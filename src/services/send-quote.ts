import nodemailer from 'nodemailer';
import type { Readable } from 'node:stream';

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  pdf: { filename: string; content: Buffer };
  attachments: { filename: string; path: string }[];
}

export async function sendQuoteEmail(opts: EmailOptions): Promise<void> {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_SECURE,
    SMTP_FROM,
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_FROM) {
    throw new Error('Email sending is not configured on the server.');
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === 'true',
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  await transporter.sendMail({
    from: SMTP_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: [
      {
        filename: opts.pdf.filename,
        content: opts.pdf.content,
        contentType: 'application/pdf',
      },
      ...opts.attachments,
    ],
  });
}

interface WhatsappOptions {
  to: string; // phone number in international format
  body: string;
  mediaUrls: string[]; // public URLs for PDF + attachments
}

export async function sendQuoteWhatsapp(opts: WhatsappOptions): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, WHATSAPP_FROM } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !WHATSAPP_FROM) {
    throw new Error('WhatsApp sending is not configured on the server.');
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  const params = new URLSearchParams();
  params.append('From', `whatsapp:${WHATSAPP_FROM}`);
  params.append('To', `whatsapp:${opts.to}`);
  params.append('Body', opts.body);
  for (const m of opts.mediaUrls) {
    params.append('MediaUrl', m);
  }

  console.log('[WhatsApp] Sending to:', opts.to);
  console.log('[WhatsApp] MediaUrls:', opts.mediaUrls);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const responseBody = await res.text().catch(() => '');
  console.log('[WhatsApp] Twilio response status:', res.status);
  console.log('[WhatsApp] Twilio response body:', responseBody);

  if (!res.ok) {
    throw new Error(`Failed to send WhatsApp message: ${res.status} ${responseBody}`);
  }

  try {
    const json = JSON.parse(responseBody);
    if (json.status === 'failed' || json.status === 'undelivered') {
      throw new Error(`WhatsApp message ${json.status}: ${json.error_message ?? 'unknown error'}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('WhatsApp message')) throw e;
  }
}

