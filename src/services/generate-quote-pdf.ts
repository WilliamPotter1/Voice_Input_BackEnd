import PDFDocument from 'pdfkit';

interface PdfQuoteItem {
  itemName: string;
  quantity: number;
  price: number;
  total: number;
}

interface PdfQuote {
  id: string;
  clientName: string | null;
  customerAddress: string | null;
  currency: string;
  vatRate: number;
  subtotal: number;
  vat: number;
  total: number;
  items: PdfQuoteItem[];
}

interface PdfUser {
  name: string | null;
  phone: string | null;
  email: string;
  companyName: string | null;
  companyAddress: string | null;
  websiteUrl: string | null;
  bankName: string | null;
  blz: string | null;
  kto: string | null;
  iban: string | null;
  bic: string | null;
  taxNumber: string | null;
  taxOfficeName: string | null;
}

interface PdfOptions {
  quoteDate: string;
  validUntil: string;
  quoteNumber: string;
  lang: string;
}

// ---------------------------------------------------------------------------
// Per-language text used in the PDF
// ---------------------------------------------------------------------------
interface PdfStrings {
  title: string;
  quoteNr: string;
  date: string;
  greetingNamed: (name: string) => string;
  greetingGeneric: string;
  intro: string;
  introOffer: string;
  colPos: string;
  colDescription: string;
  colQuantity: string;
  colUnitPrice: string;
  colTotal: string;
  subtotal: string;
  vatLabel: (pct: string) => string;
  grandTotal: string;
  closingInterest: string;
  closingContact: (phone: string) => string;
  closingDelivery: (date: string) => string;
  closingValid: (date: string) => string;
  regards: string;
  owner: string;
  taxId: string;
  taxOffice: string;
}

const pdfStrings: Record<string, PdfStrings> = {
  de: {
    title: 'Angebot',
    quoteNr: 'Angebot-Nr.',
    date: 'Datum',
    greetingNamed: (n) => `Sehr geehrte(r) ${n},`,
    greetingGeneric: 'Sehr geehrte Damen und Herren,',
    intro: 'wir freuen uns über Ihr Interesse an unserem Service/unseren Produkten.',
    introOffer: 'Hier unser Angebot für Sie:',
    colPos: 'Pos',
    colDescription: 'Bezeichnung',
    colQuantity: 'Menge',
    colUnitPrice: 'Einzelpreis',
    colTotal: 'Gesamtpreis',
    subtotal: 'Zwischensumme',
    vatLabel: (pct) => `${pct}% MwSt.`,
    grandTotal: 'Gesamtbetrag',
    closingInterest: 'Ist unser Angebot für Sie interessant? Dann freuen wir uns über Ihren Auftrag!',
    closingContact: (ph) => `Zögern Sie bitte nicht, uns bei Fragen zu kontaktieren. Sie erreichen uns jederzeit unter der Telefonnummer: ${ph}.`,
    closingDelivery: (d) => `Wenn Sie unser Angebot noch in dieser Woche erteilen, dann können wir bis zum ${d} ausführen.`,
    closingValid: (d) => `Dieses Angebot ist gültig bis zum ${d}.`,
    regards: 'Mit freundlichen Grüßen',
    owner: 'Inh.',
    taxId: 'Steuer-Nr. / USt-Id.',
    taxOffice: 'Finanzamt',
  },
  en: {
    title: 'Quotation',
    quoteNr: 'Quote No.',
    date: 'Date',
    greetingNamed: (n) => `Dear ${n},`,
    greetingGeneric: 'Dear Sir or Madam,',
    intro: 'Thank you for your interest in our services/products.',
    introOffer: 'Please find our quotation below:',
    colPos: 'Pos',
    colDescription: 'Description',
    colQuantity: 'Quantity',
    colUnitPrice: 'Unit price',
    colTotal: 'Total',
    subtotal: 'Subtotal',
    vatLabel: (pct) => `${pct}% VAT`,
    grandTotal: 'Grand total',
    closingInterest: 'Interested in our offer? We look forward to your order!',
    closingContact: (ph) => `Please do not hesitate to contact us with any questions. You can reach us at: ${ph}.`,
    closingDelivery: (d) => `If you accept this week, we can deliver by ${d}.`,
    closingValid: (d) => `This quotation is valid until ${d}.`,
    regards: 'Kind regards',
    owner: 'Owner',
    taxId: 'Tax No. / VAT ID',
    taxOffice: 'Tax office',
  },
  it: {
    title: 'Preventivo',
    quoteNr: 'Preventivo n.',
    date: 'Data',
    greetingNamed: (n) => `Gentile ${n},`,
    greetingGeneric: 'Gentili Signore e Signori,',
    intro: 'Grazie per il Suo interesse nei nostri servizi/prodotti.',
    introOffer: 'Di seguito il nostro preventivo:',
    colPos: 'Pos',
    colDescription: 'Descrizione',
    colQuantity: 'Quantità',
    colUnitPrice: 'Prezzo unitario',
    colTotal: 'Totale',
    subtotal: 'Subtotale',
    vatLabel: (pct) => `${pct}% IVA`,
    grandTotal: 'Totale complessivo',
    closingInterest: 'Le interessa il nostro preventivo? Saremo lieti di ricevere il Suo ordine!',
    closingContact: (ph) => `Non esiti a contattarci per qualsiasi domanda. Può raggiungerci al numero: ${ph}.`,
    closingDelivery: (d) => `Se accetta entro questa settimana, possiamo completare entro il ${d}.`,
    closingValid: (d) => `Questo preventivo è valido fino al ${d}.`,
    regards: 'Cordiali saluti',
    owner: 'Titolare',
    taxId: 'P.IVA / Cod. Fiscale',
    taxOffice: 'Agenzia delle Entrate',
  },
  fr: {
    title: 'Devis',
    quoteNr: 'Devis n°',
    date: 'Date',
    greetingNamed: (n) => `Cher/Chère ${n},`,
    greetingGeneric: 'Madame, Monsieur,',
    intro: 'Nous vous remercions de l\'intérêt que vous portez à nos services/produits.',
    introOffer: 'Veuillez trouver ci-dessous notre devis :',
    colPos: 'Pos',
    colDescription: 'Désignation',
    colQuantity: 'Quantité',
    colUnitPrice: 'Prix unitaire',
    colTotal: 'Total',
    subtotal: 'Sous-total',
    vatLabel: (pct) => `TVA ${pct}%`,
    grandTotal: 'Total TTC',
    closingInterest: 'Notre offre vous intéresse ? Nous serions ravis de recevoir votre commande !',
    closingContact: (ph) => `N\'hésitez pas à nous contacter pour toute question. Vous pouvez nous joindre au : ${ph}.`,
    closingDelivery: (d) => `Si vous acceptez cette semaine, nous pouvons livrer avant le ${d}.`,
    closingValid: (d) => `Ce devis est valable jusqu'au ${d}.`,
    regards: 'Cordialement',
    owner: 'Gérant',
    taxId: 'N° SIRET / TVA',
    taxOffice: 'Centre des impôts',
  },
  es: {
    title: 'Presupuesto',
    quoteNr: 'Presupuesto n.°',
    date: 'Fecha',
    greetingNamed: (n) => `Estimado/a ${n},`,
    greetingGeneric: 'Estimados señores,',
    intro: 'Agradecemos su interés en nuestros servicios/productos.',
    introOffer: 'A continuación, nuestro presupuesto:',
    colPos: 'Pos',
    colDescription: 'Descripción',
    colQuantity: 'Cantidad',
    colUnitPrice: 'Precio unitario',
    colTotal: 'Total',
    subtotal: 'Subtotal',
    vatLabel: (pct) => `${pct}% IVA`,
    grandTotal: 'Total',
    closingInterest: '¿Le interesa nuestro presupuesto? ¡Esperamos su pedido con gusto!',
    closingContact: (ph) => `No dude en contactarnos si tiene alguna pregunta. Puede comunicarse con nosotros al: ${ph}.`,
    closingDelivery: (d) => `Si acepta esta semana, podemos entregar antes del ${d}.`,
    closingValid: (d) => `Este presupuesto es válido hasta el ${d}.`,
    regards: 'Atentamente',
    owner: 'Propietario',
    taxId: 'NIF / CIF',
    taxOffice: 'Agencia Tributaria',
  },
};

function getStrings(lang: string): PdfStrings {
  return pdfStrings[lang] ?? pdfStrings.en;
}

// ---------------------------------------------------------------------------

function currencySymbol(code: string): string {
  switch (code.toUpperCase()) {
    case 'EUR': return '€';
    case 'USD': return '$';
    case 'GBP': return '£';
    case 'CHF': return 'CHF';
    default: return code;
  }
}

function fmtMoney(n: number, cur: string): string {
  const sym = currencySymbol(cur);
  const str = n.toFixed(2);
  const [intPart, decPart] = str.split('.');
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots},${decPart} ${sym}`;
}

function getUnitFromItemName(name: string): string {
  const match = name.match(/\(([^)]+)\)\s*$/);
  return match ? match[1].trim() : '';
}

function getBaseNameFromItemName(name: string): string {
  const match = name.match(/\(([^)]+)\)\s*$/);
  return match ? name.slice(0, match.index).trim() : name.trim();
}

export function generateQuotePdf(
  quote: PdfQuote,
  user: PdfUser,
  options: PdfOptions,
): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const cur = quote.currency || 'EUR';
  const s = getStrings(options.lang);
  const pageW = 595.28;
  const marginL = 50;
  const marginR = 50;
  const contentW = pageW - marginL - marginR;

  const FONT_REGULAR = 'Helvetica';
  const FONT_BOLD = 'Helvetica-Bold';

  // ---- Top: sender one-liner ----
  const senderLine = [user.companyName, user.companyAddress].filter(Boolean).join(' · ');
  doc.font(FONT_REGULAR).fontSize(7).fillColor('#666666');
  doc.text(senderLine, marginL, 40, { underline: true });

  // ---- Left block: client address ----
  doc.fillColor('#000000').font(FONT_REGULAR).fontSize(10);
  const clientY = 62;
  if (quote.clientName) doc.text(quote.clientName, marginL, clientY);
  if (quote.customerAddress) {
    doc.text(quote.customerAddress, marginL, doc.y + 2);
  }

  // ---- Right block: company info ----
  const rightX = 350;
  let ry = 62;
  doc.font(FONT_BOLD).fontSize(10).text(user.companyName ?? '', rightX, ry);
  ry = doc.y + 1;
  doc.font(FONT_REGULAR).fontSize(9);
  if (user.companyAddress) { doc.text(user.companyAddress, rightX, ry); ry = doc.y + 1; }
  ry += 4;
  if (user.phone) { doc.text(`Tel.: ${user.phone}`, rightX, ry); ry = doc.y + 1; }
  doc.text(`E-Mail: ${user.email}`, rightX, ry); ry = doc.y + 1;
  if (user.websiteUrl) { doc.text(`Internet: ${user.websiteUrl}`, rightX, ry); ry = doc.y + 1; }
  ry += 4;
  doc.text(`${s.quoteNr}: ${options.quoteNumber}`, rightX, ry); ry = doc.y + 1;
  doc.text(`${s.date}: ${options.quoteDate}`, rightX, ry);

  // ---- Title ----
  const titleY = Math.max(doc.y, 170) + 10;
  doc.font(FONT_BOLD).fontSize(20).fillColor('#000000');
  doc.text(s.title, marginL, titleY);

  // ---- Greeting & intro ----
  let cy = doc.y + 20;
  doc.font(FONT_REGULAR).fontSize(10);
  const greeting = quote.clientName ? s.greetingNamed(quote.clientName) : s.greetingGeneric;
  doc.text(greeting, marginL, cy); cy = doc.y + 8;
  doc.text(s.intro, marginL, cy); cy = doc.y + 4;
  doc.text(s.introOffer, marginL, cy); cy = doc.y + 12;

  // ---- Items table ----
  const tableX = marginL;
  const colPos = 0;
  const colName = 35;
  const colQty = 230;
  const colUnit = 300;
  const colTotal = 410;
  const tableW = contentW;

  // Header row
  const headerY = cy;
  doc.save();
  doc.rect(tableX, headerY, tableW, 20).fill('#e5e5e5');
  doc.restore();
  doc.fillColor('#000000').font(FONT_BOLD).fontSize(9);
  doc.text(s.colPos, tableX + colPos + 4, headerY + 5);
  doc.text(s.colDescription, tableX + colName + 4, headerY + 5);
  doc.text(s.colQuantity, tableX + colQty + 4, headerY + 5);
  doc.text(s.colUnitPrice, tableX + colUnit + 4, headerY + 5);
  doc.text(s.colTotal, tableX + colTotal + 4, headerY + 5);

  cy = headerY + 22;
  doc.font(FONT_REGULAR).fontSize(9);

  // Item rows
  for (let i = 0; i < quote.items.length; i++) {
    const item = quote.items[i];
    const baseName = getBaseNameFromItemName(item.itemName);
    const unit = getUnitFromItemName(item.itemName);
    const qtyStr = unit ? `${item.quantity} ${unit}` : String(item.quantity);

    if (i % 2 === 0) {
      doc.save();
      doc.rect(tableX, cy - 2, tableW, 18).fill('#f9f9f9');
      doc.restore();
      doc.fillColor('#000000');
    }

    doc.text(String(i + 1), tableX + colPos + 4, cy);
    doc.text(baseName, tableX + colName + 4, cy, { width: colQty - colName - 8 });
    doc.text(qtyStr, tableX + colQty + 4, cy);
    doc.text(fmtMoney(item.price, cur), tableX + colUnit + 4, cy);
    doc.text(fmtMoney(item.total, cur), tableX + colTotal + 4, cy);
    cy += 18;
  }

  // Separator line
  doc.moveTo(tableX, cy + 2).lineTo(tableX + tableW, cy + 2).stroke('#cccccc');
  cy += 10;

  // Totals
  const totalsLabelX = tableX + colQty;
  const totalsValueX = tableX + colTotal + 4;

  doc.font(FONT_REGULAR).fontSize(9);
  doc.text(s.subtotal, totalsLabelX, cy);
  doc.text(fmtMoney(quote.subtotal, cur), totalsValueX, cy);
  cy += 16;

  const vatPct = (quote.vatRate * 100).toFixed(0);
  doc.text(s.vatLabel(vatPct), totalsLabelX, cy);
  doc.text(fmtMoney(quote.vat, cur), totalsValueX, cy);
  cy += 16;

  doc.moveTo(totalsLabelX, cy - 4).lineTo(tableX + tableW, cy - 4).stroke('#cccccc');

  doc.font(FONT_BOLD).fontSize(10);
  doc.text(s.grandTotal, totalsLabelX, cy);
  doc.text(fmtMoney(quote.total, cur), totalsValueX, cy);
  cy += 26;

  // ---- Closing text ----
  doc.font(FONT_REGULAR).fontSize(9).fillColor('#000000');
  doc.text(s.closingInterest, marginL, cy, { width: contentW });
  cy = doc.y + 2;
  doc.text(s.closingContact(user.phone ?? ''), marginL, cy, { width: contentW });
  cy = doc.y + 10;
  doc.text(s.closingDelivery(options.quoteDate), marginL, cy, { width: contentW });
  cy = doc.y + 2;
  doc.text(s.closingValid(options.validUntil), marginL, cy, { width: contentW });
  cy = doc.y + 20;

  // ---- Signature ----
  doc.text(s.regards, marginL, cy);
  cy = doc.y + 30;
  doc.text('____________________________', marginL, cy);
  cy = doc.y + 4;
  doc.font(FONT_BOLD).fontSize(9);
  doc.text(user.name ?? '', marginL, cy);

  // ---- Footer: bank / tax info ----
  const footerY = 760;
  doc.moveTo(marginL, footerY).lineTo(pageW - marginR, footerY).stroke('#cccccc');
  doc.font(FONT_REGULAR).fontSize(7).fillColor('#444444');

  const col1 = marginL;
  const col2 = marginL + 130;
  const col3 = marginL + 280;
  const col4 = marginL + 400;
  let fy = footerY + 6;

  doc.font(FONT_BOLD).text(user.companyName ?? '', col1, fy);
  doc.font(FONT_REGULAR);
  if (user.name) doc.text(`${s.owner} ${user.name}`, col1);
  if (user.companyAddress) doc.text(user.companyAddress, col1);

  fy = footerY + 6;
  if (user.bankName) doc.text(user.bankName, col2, fy);
  if (user.blz) doc.text(`BLZ: ${user.blz}`, col2);
  if (user.kto) doc.text(`KTO: ${user.kto}`, col2);

  fy = footerY + 6;
  if (user.iban) doc.text(`IBAN: ${user.iban}`, col3, fy);
  if (user.bic) doc.text(`BIC: ${user.bic}`, col3);

  fy = footerY + 6;
  if (user.taxNumber) doc.text(`${s.taxId}: ${user.taxNumber}`, col4, fy);
  if (user.taxOfficeName) doc.text(`${s.taxOffice}: ${user.taxOfficeName}`, col4);

  doc.end();
  return doc;
}
