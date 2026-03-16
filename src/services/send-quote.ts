import nodemailer from 'nodemailer';

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

