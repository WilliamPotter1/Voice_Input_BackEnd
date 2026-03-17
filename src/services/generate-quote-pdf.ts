import PDFDocument from 'pdfkit';

interface PdfQuoteItem {
  itemName: string;
  quantity: number;
  price: number;
  total: number;
}

interface PdfAttachment {
  filename: string;
  url: string;
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
  attachments: PdfAttachment[];
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
  attachmentsLabel: string;
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
    closingContact: () =>
      'Zögern Sie bitte nicht, uns bei Fragen zu kontaktieren.',
    closingDelivery: (d) => `Wenn Sie unser Angebot noch in dieser Woche erteilen, dann können wir bis zum ${d} ausführen.`,
    closingValid: (d) => `Dieses Angebot ist gültig bis zum ${d}.`,
    attachmentsLabel: 'Es liegen Anhänge zu diesem Angebot vor.',
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
    attachmentsLabel: 'This quote has attachments.',
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
    attachmentsLabel: 'A questo preventivo sono allegati dei documenti.',
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
    attachmentsLabel: 'Ce devis contient des pièces jointes.',
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
    attachmentsLabel: 'Este presupuesto tiene archivos adjuntos.',
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

const ML = 60;
const MR = 60;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - ML - MR;
const FOOTER_H = 75;        // space reserved for footer block
const FOOTER_TOP = PAGE_H - 40 - FOOTER_H;  // ~727

export function generateQuotePdf(
  quote: PdfQuote,
  user: PdfUser,
  options: PdfOptions,
): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 45, bottom: 40, left: ML, right: MR },
    bufferPages: true,
  });

  const cur = quote.currency || 'EUR';
  const s = getStrings(options.lang);
  const R = 'Helvetica';
  const B = 'Helvetica-Bold';
  const nItems = quote.items.length;

  // ---------------------------------------------------------------
  // Adaptive sizing: scale gaps & row heights so content fits
  // ---------------------------------------------------------------
  const nAttach = quote.attachments.length;
  const HEADER_END   = 185;
  const FIXED_BODY   = 260 + (nAttach > 0 ? 26 : 0);
  const availForRows = FOOTER_TOP - HEADER_END - FIXED_BODY;
  const idealRowH    = 22;
  const neededRows   = idealRowH * nItems + 26; // 26 for header
  const tight        = neededRows > availForRows;

  // Scaled values
  const rowH    = tight ? Math.max(14, Math.floor((availForRows - 20) / Math.max(nItems, 1))) : idealRowH;
  const hdrH    = tight ? 20 : 26;
  const gapSec  = tight ? 8  : 18;  // gap between major sections
  const gapLine = tight ? 3  : 8;   // gap between text lines within a section
  const bodyFs  = tight ? 9  : 10;  // body font size
  const tblFs   = tight ? 8  : 9;   // table font size
  const titleFs = tight ? 18 : 22;

  const PAD = 6;

  // =====================================================================
  //  HEADER  (sender one-liner + client block + company block)
  // =====================================================================
  const senderTop = 45;
  doc.font(R).fontSize(7).fillColor('#888888');
  function splitFullAddress(full?: string | null): { city?: string; street?: string } {
    if (!full) return {};
    const s = full.trim();
    if (!s) return {};

    // Prefer "street, ZIP City" style: split on first comma
    const parts = s.split(',').map((p) => p.trim());
    if (parts.length === 2) {
      const [first, second] = parts;
      // If second part starts with 5 digits, treat it as city, first as street
      if (/^\d{5}\b/.test(second)) {
        return { street: first, city: second };
      }
      // If first part starts with ZIP, invert
      if (/^\d{5}\b/.test(first)) {
        return { city: first, street: second };
      }
    }

    // Fallback: try splitting on " - " or " – "
    const dashParts = s.split(/[–-]/).map((p) => p.trim());
    if (dashParts.length === 2) {
      const [left, right] = dashParts;
      if (/^\d{5}\b/.test(left)) return { city: left, street: right };
      if (/^\d{5}\b/.test(right)) return { street: left, city: right };
    }

    // If string starts with ZIP, treat leading "ZIP City, rest" as city
    const zipCityMatch = s.match(/^(\d{5}\s+\S+(?:\s+\S+)*)(?:,\s*(.*))?$/);
    if (zipCityMatch) {
      const city = zipCityMatch[1];
      const street = zipCityMatch[2];
      return street ? { city, street } : { city };
    }

    // Otherwise treat whole as street
    return { street: s };
  }

  const senderAddr = splitFullAddress(user.companyAddress);
  const senderLine = [user.companyName, senderAddr.street, senderAddr.city].filter(Boolean).join('  ·  ');
  doc.text(senderLine, ML, senderTop, { underline: true, width: 260 });

  const addrTop = 68;
  doc.fillColor('#000000').font(R).fontSize(bodyFs);
  let ay = addrTop;
  if (quote.clientName) {
    doc.font(B).text(quote.clientName, ML, ay, { width: 250 });
    ay = doc.y + 2;
    doc.font(R);
  }
  if (quote.customerAddress) {
    const ca = splitFullAddress(quote.customerAddress);
    if (ca.street) {
      doc.text(ca.street, ML, ay, { width: 250, lineGap: 1 });
      ay = doc.y + 1;
    }
    if (ca.city) {
      doc.text(ca.city, ML, ay, { width: 250, lineGap: 1 });
    }
  }

  const rightX = 370;
  const rightW = PAGE_W - MR - rightX;
  // Align company name top with sender line
  let ry = senderTop;
  doc.font(B).fontSize(bodyFs).text(user.companyName ?? '', rightX, ry, { width: rightW });
  ry = doc.y + 1;
  doc.font(R).fontSize(8.5);
  if (user.companyAddress) {
    const ua = splitFullAddress(user.companyAddress);
    if (ua.street) { doc.text(ua.street, rightX, ry, { width: rightW, lineGap: 1 }); ry = doc.y + 1; }
    if (ua.city)   { doc.text(ua.city,   rightX, ry, { width: rightW, lineGap: 1 }); ry = doc.y + 4; }
  }
  if (user.phone)          { doc.text(`Tel.: ${user.phone}`, rightX, ry, { width: rightW }); ry = doc.y + 1; }
  doc.text(`E-Mail: ${user.email}`, rightX, ry, { width: rightW }); ry = doc.y + 1;
  if (user.websiteUrl)     { doc.text(`Internet: ${user.websiteUrl}`, rightX, ry, { width: rightW }); ry = doc.y + 1; }
  ry += 6;
  doc.text(`${s.quoteNr}: ${options.quoteNumber}`, rightX, ry, { width: rightW }); ry = doc.y + 1;
  doc.text(`${s.date}: ${options.quoteDate}`, rightX, ry, { width: rightW });

  // =====================================================================
  //  TITLE
  // =====================================================================
  const titleY = Math.max(doc.y, ry, 160) + gapSec;
  doc.font(B).fontSize(titleFs).fillColor('#1a1a1a');
  doc.text(s.title, ML, titleY);

  // =====================================================================
  //  GREETING & INTRO
  // =====================================================================
  let cy = doc.y + gapSec + 4;
  doc.font(R).fontSize(bodyFs).fillColor('#000000');
  const greeting = quote.clientName ? s.greetingNamed(quote.clientName) : s.greetingGeneric;
  doc.text(greeting, ML, cy, { width: CONTENT_W, lineGap: 2 });
  cy = doc.y + gapLine;
  doc.text(s.intro, ML, cy, { width: CONTENT_W, lineGap: 2 });
  cy = doc.y + Math.max(gapLine - 2, 2);
  doc.text(s.introOffer, ML, cy, { width: CONTENT_W, lineGap: 2 });

  // =====================================================================
  //  ITEMS TABLE
  // =====================================================================
  cy = doc.y + gapSec;

  const C_POS   = 0;
  const C_NAME  = 30;
  const C_QTY   = 215;
  const C_UNIT  = 295;
  const C_TOTAL = 395;
  const TBL_W   = CONTENT_W;

  // -- Header row --
  const hdrY = cy;
  doc.save(); doc.rect(ML, hdrY, TBL_W, hdrH).fill('#e8e8e8'); doc.restore();
  doc.fillColor('#1a1a1a').font(B).fontSize(tblFs);
  const hdrTextY = hdrY + (hdrH - tblFs) / 2;
  doc.text(s.colPos,         ML + C_POS  + PAD, hdrTextY);
  doc.text(s.colDescription, ML + C_NAME + PAD, hdrTextY, { width: C_QTY - C_NAME - PAD * 2 });
  doc.text(s.colQuantity,    ML + C_QTY  + PAD, hdrTextY);
  textRight(doc, s.colUnitPrice, ML + C_UNIT + PAD, hdrTextY, C_TOTAL - C_UNIT - PAD * 2);
  textRight(doc, s.colTotal,     ML + C_TOTAL + PAD, hdrTextY, TBL_W - C_TOTAL - PAD * 2);
  cy = hdrY + hdrH;

  // -- Item rows --
  doc.font(R).fontSize(tblFs);
  for (let i = 0; i < nItems; i++) {
    const item = quote.items[i];
    const baseName = getBaseNameFromItemName(item.itemName);
    const unit = getUnitFromItemName(item.itemName);
    const qtyStr = unit ? `${item.quantity} ${unit}` : String(item.quantity);

    if (i % 2 === 0) {
      doc.save(); doc.rect(ML, cy, TBL_W, rowH).fill('#f7f7f7'); doc.restore();
    }
    doc.fillColor('#1a1a1a');
    const rowTextY = cy + (rowH - tblFs) / 2;
    doc.text(String(i + 1),  ML + C_POS  + PAD, rowTextY);
    doc.text(baseName,       ML + C_NAME + PAD, rowTextY, { width: C_QTY - C_NAME - PAD * 2 });
    doc.text(qtyStr,         ML + C_QTY  + PAD, rowTextY);
    textRight(doc, fmtMoney(item.price, cur), ML + C_UNIT + PAD, rowTextY, C_TOTAL - C_UNIT - PAD * 2);
    textRight(doc, fmtMoney(item.total, cur), ML + C_TOTAL + PAD, rowTextY, TBL_W - C_TOTAL - PAD * 2);
    cy += rowH;
  }

  doc.moveTo(ML, cy).lineTo(ML + TBL_W, cy).lineWidth(0.5).strokeColor('#cccccc').stroke();

  // -- Totals --
  cy += gapLine + 2;
  const totLabelX = ML + C_QTY + PAD;
  const totValueX = ML + C_TOTAL + PAD;
  const totValueW = TBL_W - C_TOTAL - PAD * 2;

  doc.font(R).fontSize(bodyFs).fillColor('#333333');
  doc.text(s.subtotal, totLabelX, cy);
  textRight(doc, fmtMoney(quote.subtotal, cur), totValueX, cy, totValueW);
  cy += bodyFs + gapLine;

  const vatPct = (quote.vatRate * 100).toFixed(0);
  doc.text(s.vatLabel(vatPct), totLabelX, cy);
  textRight(doc, fmtMoney(quote.vat, cur), totValueX, cy, totValueW);
  cy += bodyFs + gapLine + 2;

  doc.moveTo(totLabelX, cy - 4).lineTo(ML + TBL_W, cy - 4).lineWidth(0.5).strokeColor('#cccccc').stroke();
  doc.font(B).fontSize(bodyFs + 1).fillColor('#000000');
  doc.text(s.grandTotal, totLabelX, cy);
  textRight(doc, fmtMoney(quote.total, cur), totValueX, cy, totValueW);

  // =====================================================================
  //  CLOSING TEXT
  // =====================================================================
  cy = doc.y + gapSec + 6;
  doc.font(R).fontSize(bodyFs).fillColor('#000000');
  doc.text(s.closingInterest, ML, cy, { width: CONTENT_W, lineGap: 2 });
  cy = doc.y + gapLine;
  doc.text(s.closingContact(user.phone ?? ''), ML, cy, { width: CONTENT_W, lineGap: 2 });
  cy = doc.y + gapLine + 2;
  doc.text(s.closingDelivery(options.quoteDate), ML, cy, { width: CONTENT_W, lineGap: 2 });
  cy = doc.y + Math.max(gapLine - 2, 2);
  doc.text(s.closingValid(options.validUntil), ML, cy, { width: CONTENT_W, lineGap: 2 });

  // =====================================================================
  //  ATTACHMENTS  (only indicate that attachments exist)
  // =====================================================================
  if (nAttach > 0) {
    cy = doc.y + gapSec;
    doc.font(B).fontSize(bodyFs).fillColor('#1a1a1a');
    doc.text(s.attachmentsLabel, ML, cy, { width: CONTENT_W });
    doc.fillColor('#000000');
  }

  // =====================================================================
  //  SIGNATURE
  // =====================================================================
  cy = doc.y + gapSec;
  doc.font(R).fontSize(bodyFs);
  doc.text(s.regards, ML, cy);
  cy = doc.y + gapSec + 4;
  doc.moveTo(ML, cy).lineTo(ML + 160, cy).lineWidth(0.5).strokeColor('#999999').stroke();
  cy += 12; // add extra vertical space between regards and name
  doc.font(B).fontSize(bodyFs);
  doc.text(user.name ?? '', ML, cy);

  // =====================================================================
  //  FOOTER  (company · bank · tax — pinned to bottom, 3 columns)
  // =====================================================================
  doc.moveTo(ML, FOOTER_TOP).lineTo(PAGE_W - MR, FOOTER_TOP).lineWidth(0.5).strokeColor('#bbbbbb').stroke();

  const fSize = 7.5;
  const fLG = 2;
  const fGutter = 15;
  const fColW = Math.floor((CONTENT_W - fGutter * 2) / 3);
  const fCol1 = ML;
  const fCol2 = ML + fColW + fGutter;
  const fCol3 = fCol2 + fColW + fGutter;
  const fTop = FOOTER_TOP + 8;

  doc.font(B).fontSize(fSize).fillColor('#333333');
  doc.text(user.companyName ?? '', fCol1, fTop, { width: fColW, lineGap: fLG });
  doc.font(R).fillColor('#555555');
  if (user.name)           doc.text(`${s.owner} ${user.name}`, { width: fColW, lineGap: fLG });
  if (user.companyAddress) doc.text(user.companyAddress, { width: fColW, lineGap: fLG });

  doc.font(B).fontSize(fSize).fillColor('#333333');
  doc.text(user.bankName ?? '', fCol2, fTop, { width: fColW, lineGap: fLG });
  doc.font(R).fillColor('#555555');
  if (user.blz)  doc.text(`BLZ: ${user.blz}`,   fCol2, doc.y, { width: fColW, lineGap: fLG });
  if (user.kto)  doc.text(`KTO: ${user.kto}`,   fCol2, doc.y, { width: fColW, lineGap: fLG });
  if (user.iban) doc.text(`IBAN: ${user.iban}`,  fCol2, doc.y, { width: fColW, lineGap: fLG });
  if (user.bic)  doc.text(`BIC: ${user.bic}`,   fCol2, doc.y, { width: fColW, lineGap: fLG });

  doc.font(B).fontSize(fSize).fillColor('#333333');
  doc.text(s.taxId, fCol3, fTop, { width: fColW, lineGap: fLG });
  doc.font(R).fillColor('#555555');
  if (user.taxNumber)     doc.text(user.taxNumber, fCol3, doc.y, { width: fColW, lineGap: fLG });
  if (user.taxOfficeName) {
    doc.y += 3;
    doc.font(B).fillColor('#333333').text(s.taxOffice, fCol3, doc.y, { width: fColW, lineGap: fLG });
    doc.font(R).fillColor('#555555').text(user.taxOfficeName, fCol3, doc.y, { width: fColW, lineGap: fLG });
  }

  doc.end();
  return doc;
}
