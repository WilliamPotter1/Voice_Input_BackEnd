import PDFDocument from 'pdfkit';

interface InvoiceItem {
  itemName: string;
  quantity: number;
  price: number;
  total: number;
}

interface InvoiceData {
  clientName: string | null;
  customerAddress: string | null;
  additionalInfo: string | null;
  currency: string;
  vatRate: number;
  subtotal: number;
  vat: number;
  total: number;
  items: InvoiceItem[];
}

interface UserData {
  name: string | null;
  email: string;
  phone: string | null;
  companyName: string | null;
  companyAddress: string | null;
  companyCity: string | null;
}

interface InvoicePdfOptions {
  invoiceDate: string;
  dueDate: string;
  invoiceNumber: string;
  lang: string;
}

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency || 'EUR'}`;
  }
}

export function generateInvoicePdf(invoice: InvoiceData, user: UserData, options: InvoicePdfOptions): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  doc.fontSize(20).text('Invoice', { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(10);
  doc.text(`Invoice No.: ${options.invoiceNumber}`);
  doc.text(`Date: ${options.invoiceDate}`);
  doc.text(`Due date: ${options.dueDate}`);

  doc.moveDown(1);
  doc.fontSize(11).text(user.companyName ?? '', { continued: false });
  doc.fontSize(10).text(user.companyAddress ?? '');
  doc.text(user.companyCity ?? '');
  doc.text(user.email ?? '');
  if (user.phone) doc.text(user.phone);

  doc.moveDown(1);
  doc.fontSize(11).text('Bill to:');
  doc.fontSize(10).text(invoice.clientName ?? '');
  doc.text(invoice.customerAddress ?? '');

  doc.moveDown(1);
  doc.fontSize(11).text('Items');
  doc.moveDown(0.3);

  const yStart = doc.y;
  doc.fontSize(9);
  doc.text('Pos.', 50, yStart);
  doc.text('Description', 90, yStart);
  doc.text('Qty', 330, yStart, { width: 50, align: 'right' });
  doc.text('Unit', 390, yStart, { width: 70, align: 'right' });
  doc.text('Total', 470, yStart, { width: 80, align: 'right' });
  doc.moveTo(50, yStart + 14).lineTo(550, yStart + 14).stroke('#cccccc');

  let y = yStart + 20;
  invoice.items.forEach((it, idx) => {
    doc.text(String(idx + 1), 50, y);
    doc.text(it.itemName, 90, y, { width: 230 });
    doc.text(String(it.quantity), 330, y, { width: 50, align: 'right' });
    doc.text(fmtMoney(it.price, invoice.currency), 390, y, { width: 70, align: 'right' });
    doc.text(fmtMoney(it.total, invoice.currency), 470, y, { width: 80, align: 'right' });
    y += 18;
  });

  y += 10;
  doc.text(`Subtotal: ${fmtMoney(invoice.subtotal, invoice.currency)}`, 360, y, { width: 190, align: 'right' });
  y += 16;
  doc.text(`VAT (${(invoice.vatRate * 100).toFixed(0)}%): ${fmtMoney(invoice.vat, invoice.currency)}`, 360, y, { width: 190, align: 'right' });
  y += 18;
  doc.font('Helvetica-Bold').text(`Total: ${fmtMoney(invoice.total, invoice.currency)}`, 360, y, { width: 190, align: 'right' });
  doc.font('Helvetica');

  if (invoice.additionalInfo) {
    y += 28;
    doc.fontSize(10).text(invoice.additionalInfo, 50, y, { width: 500 });
  }

  doc.end();
  return doc;
}

