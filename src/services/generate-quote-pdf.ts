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
// Per-language text
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
    closingContact: (ph) => `N'hésitez pas à nous contacter pour toute question. Vous pouvez nous joindre au : ${ph}.`,
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
// Helpers
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

/** Right-align text inside a column of given width */
function textRight(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  colWidth: number,
) {
  doc.text(text, x, y, { width: colWidth, align: 'right' });
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

const ML = 60;              // left margin
const MR = 60;              // right margin
const PAGE_W = 595.28;      // A4 width in pt
const CONTENT_W = PAGE_W - ML - MR;

const BODY = 10;             // body font size
const SMALL = 8.5;           // small labels & footer
const H1 = 22;              // main title
const LINE_H = 14;          // line height for body text

export function generateQuotePdf(
  quote: PdfQuote,
  user: PdfUser,
  options: PdfOptions,
): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 45, bottom: 50, left: ML, right: MR },
    bufferPages: true,
  });

  const cur = quote.currency || 'EUR';
  const s = getStrings(options.lang);
  const R = 'Helvetica';
  const B = 'Helvetica-Bold';

  // =====================================================================
  //  HEADER AREA  (sender one-liner + client block + company block)
  // =====================================================================

  // Sender one-liner (tiny, underlined)
  doc.font(R).fontSize(7).fillColor('#888888');
  const senderLine = [user.companyName, user.companyAddress].filter(Boolean).join('  ·  ');
  doc.text(senderLine, ML, 45, { underline: true, width: 260 });

  // Client address block (left side)
  const addrTop = 72;
  doc.fillColor('#000000').font(R).fontSize(BODY);
  let ay = addrTop;
  if (quote.clientName) {
    doc.font(B).text(quote.clientName, ML, ay, { width: 250 });
    ay = doc.y + 2;
    doc.font(R);
  }
  if (quote.customerAddress) {
    doc.text(quote.customerAddress, ML, ay, { width: 250, lineGap: 2 });
  }

  // Company info block (right side)
  const rightX = 370;
  const rightW = PAGE_W - MR - rightX;
  let ry = addrTop;
  doc.font(B).fontSize(BODY).text(user.companyName ?? '', rightX, ry, { width: rightW });
  ry = doc.y + 2;
  doc.font(R).fontSize(9);
  if (user.companyAddress) {
    doc.text(user.companyAddress, rightX, ry, { width: rightW, lineGap: 1 });
    ry = doc.y + 6;
  }
  if (user.phone) {
    doc.text(`Tel.: ${user.phone}`, rightX, ry, { width: rightW });
    ry = doc.y + 1;
  }
  doc.text(`E-Mail: ${user.email}`, rightX, ry, { width: rightW });
  ry = doc.y + 1;
  if (user.websiteUrl) {
    doc.text(`Internet: ${user.websiteUrl}`, rightX, ry, { width: rightW });
    ry = doc.y + 1;
  }
  ry += 8;
  doc.font(R).fontSize(9);
  doc.text(`${s.quoteNr}: ${options.quoteNumber}`, rightX, ry, { width: rightW });
  ry = doc.y + 1;
  doc.text(`${s.date}: ${options.quoteDate}`, rightX, ry, { width: rightW });

  // =====================================================================
  //  TITLE
  // =====================================================================
  const titleY = Math.max(doc.y, ry, 168) + 18;
  doc.font(B).fontSize(H1).fillColor('#1a1a1a');
  doc.text(s.title, ML, titleY);

  // =====================================================================
  //  GREETING & INTRO
  // =====================================================================
  let cy = doc.y + 24;
  doc.font(R).fontSize(BODY).fillColor('#000000');
  const greeting = quote.clientName
    ? s.greetingNamed(quote.clientName)
    : s.greetingGeneric;
  doc.text(greeting, ML, cy, { width: CONTENT_W, lineGap: 3 });

  cy = doc.y + 10;
  doc.text(s.intro, ML, cy, { width: CONTENT_W, lineGap: 3 });
  cy = doc.y + 6;
  doc.text(s.introOffer, ML, cy, { width: CONTENT_W, lineGap: 3 });

  // =====================================================================
  //  ITEMS TABLE
  // =====================================================================
  cy = doc.y + 18;

  // Column layout (absolute offsets from ML)
  const C_POS   = 0;
  const C_NAME  = 32;
  const C_QTY   = 220;
  const C_UNIT  = 300;
  const C_TOTAL = 400;
  const TBL_W   = CONTENT_W;

  const ROW_H  = 22;
  const HDR_H  = 26;
  const PAD    = 6;

  // -- Header row --
  const hdrY = cy;
  doc.save();
  doc.rect(ML, hdrY, TBL_W, HDR_H).fill('#e8e8e8');
  doc.restore();
  doc.fillColor('#1a1a1a').font(B).fontSize(9);

  const hdrTextY = hdrY + (HDR_H - 9) / 2;
  doc.text(s.colPos,         ML + C_POS  + PAD, hdrTextY);
  doc.text(s.colDescription, ML + C_NAME + PAD, hdrTextY, { width: C_QTY - C_NAME - PAD * 2 });
  doc.text(s.colQuantity,    ML + C_QTY  + PAD, hdrTextY);
  textRight(doc, s.colUnitPrice, ML + C_UNIT + PAD, hdrTextY, C_TOTAL - C_UNIT - PAD * 2);
  textRight(doc, s.colTotal,     ML + C_TOTAL + PAD, hdrTextY, TBL_W - C_TOTAL - PAD * 2);

  cy = hdrY + HDR_H;

  // -- Item rows --
  doc.font(R).fontSize(9);
  for (let i = 0; i < quote.items.length; i++) {
    const item = quote.items[i];
    const baseName = getBaseNameFromItemName(item.itemName);
    const unit = getUnitFromItemName(item.itemName);
    const qtyStr = unit ? `${item.quantity} ${unit}` : String(item.quantity);

    // Alternating stripe
    if (i % 2 === 0) {
      doc.save();
      doc.rect(ML, cy, TBL_W, ROW_H).fill('#f7f7f7');
      doc.restore();
    }
    doc.fillColor('#1a1a1a');

    const rowTextY = cy + (ROW_H - 9) / 2;
    doc.text(String(i + 1), ML + C_POS + PAD, rowTextY);
    doc.text(baseName, ML + C_NAME + PAD, rowTextY, { width: C_QTY - C_NAME - PAD * 2 });
    doc.text(qtyStr, ML + C_QTY + PAD, rowTextY);
    textRight(doc, fmtMoney(item.price, cur), ML + C_UNIT + PAD, rowTextY, C_TOTAL - C_UNIT - PAD * 2);
    textRight(doc, fmtMoney(item.total, cur), ML + C_TOTAL + PAD, rowTextY, TBL_W - C_TOTAL - PAD * 2);

    cy += ROW_H;
  }

  // Bottom border of table
  doc.moveTo(ML, cy).lineTo(ML + TBL_W, cy).lineWidth(0.5).strokeColor('#cccccc').stroke();

  // -- Totals --
  cy += 12;
  const totLabelX = ML + C_QTY + PAD;
  const totValueX = ML + C_TOTAL + PAD;
  const totValueW = TBL_W - C_TOTAL - PAD * 2;

  doc.font(R).fontSize(BODY).fillColor('#333333');
  doc.text(s.subtotal, totLabelX, cy);
  textRight(doc, fmtMoney(quote.subtotal, cur), totValueX, cy, totValueW);
  cy += 18;

  const vatPct = (quote.vatRate * 100).toFixed(0);
  doc.text(s.vatLabel(vatPct), totLabelX, cy);
  textRight(doc, fmtMoney(quote.vat, cur), totValueX, cy, totValueW);
  cy += 20;

  doc.moveTo(totLabelX, cy - 6).lineTo(ML + TBL_W, cy - 6).lineWidth(0.5).strokeColor('#cccccc').stroke();

  doc.font(B).fontSize(11).fillColor('#000000');
  doc.text(s.grandTotal, totLabelX, cy);
  textRight(doc, fmtMoney(quote.total, cur), totValueX, cy, totValueW);

  // =====================================================================
  //  CLOSING TEXT
  // =====================================================================
  cy = doc.y + 30;
  doc.font(R).fontSize(BODY).fillColor('#000000');
  doc.text(s.closingInterest, ML, cy, { width: CONTENT_W, lineGap: 3 });

  cy = doc.y + 8;
  doc.text(s.closingContact(user.phone ?? ''), ML, cy, { width: CONTENT_W, lineGap: 3 });

  cy = doc.y + 14;
  doc.text(s.closingDelivery(options.quoteDate), ML, cy, { width: CONTENT_W, lineGap: 3 });
  cy = doc.y + 4;
  doc.text(s.closingValid(options.validUntil), ML, cy, { width: CONTENT_W, lineGap: 3 });

  // =====================================================================
  //  SIGNATURE
  // =====================================================================
  cy = doc.y + 26;
  doc.font(R).fontSize(BODY);
  doc.text(s.regards, ML, cy);
  cy = doc.y + 36;
  doc.moveTo(ML, cy).lineTo(ML + 180, cy).lineWidth(0.5).strokeColor('#999999').stroke();
  cy += 6;
  doc.font(B).fontSize(BODY);
  doc.text(user.name ?? '', ML, cy);

  // =====================================================================
  //  FOOTER  (bank details, tax info — pinned to bottom)
  // =====================================================================
  const footerTop = 755;
  doc.moveTo(ML, footerTop).lineTo(PAGE_W - MR, footerTop).lineWidth(0.5).strokeColor('#cccccc').stroke();

  const fSize = 7.5;
  const fLineGap = 2;
  const fCol1 = ML;
  const fCol2 = ML + 125;
  const fCol3 = ML + 255;
  const fCol4 = ML + 385;
  const fColW = 120;
  let fy1 = footerTop + 8;

  // Col 1 — company
  doc.font(B).fontSize(fSize).fillColor('#333333');
  doc.text(user.companyName ?? '', fCol1, fy1, { width: fColW, lineGap: fLineGap });
  doc.font(R).fontSize(fSize).fillColor('#555555');
  if (user.name) doc.text(`${s.owner} ${user.name}`, fCol1, doc.y, { width: fColW, lineGap: fLineGap });
  if (user.companyAddress) doc.text(user.companyAddress, fCol1, doc.y, { width: fColW, lineGap: fLineGap });

  // Col 2 — bank
  doc.font(R).fontSize(fSize).fillColor('#555555');
  let fy2 = fy1;
  if (user.bankName)   { doc.text(user.bankName, fCol2, fy2, { width: fColW, lineGap: fLineGap }); fy2 = doc.y; }
  if (user.blz)        { doc.text(`BLZ: ${user.blz}`, fCol2, fy2, { width: fColW, lineGap: fLineGap }); fy2 = doc.y; }
  if (user.kto)        { doc.text(`KTO: ${user.kto}`, fCol2, fy2, { width: fColW, lineGap: fLineGap }); }

  // Col 3 — IBAN / BIC
  let fy3 = fy1;
  if (user.iban)       { doc.text(`IBAN: ${user.iban}`, fCol3, fy3, { width: fColW, lineGap: fLineGap }); fy3 = doc.y; }
  if (user.bic)        { doc.text(`BIC: ${user.bic}`, fCol3, fy3, { width: fColW, lineGap: fLineGap }); }

  // Col 4 — tax
  let fy4 = fy1;
  if (user.taxNumber)     { doc.text(`${s.taxId}: ${user.taxNumber}`, fCol4, fy4, { width: fColW, lineGap: fLineGap }); fy4 = doc.y; }
  if (user.taxOfficeName) { doc.text(`${s.taxOffice}: ${user.taxOfficeName}`, fCol4, fy4, { width: fColW, lineGap: fLineGap }); }

  doc.end();
  return doc;
}
