/**
 * Prescription PDF Generator
 * Builds a PDF from prescription data using print settings (header/footer images, margins, fonts).
 * Returns a base64-encoded PDF string suitable for sending via WhatsApp.
 */

import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

export interface PrescriptionPdfData {
  patient: {
    firstName: string;
    lastName: string;
    age?: number;
    gender?: string;
    registrationNumber: string;
    mobile: string;
  };
  visitNumber?: number;
  visitDate?: Date;
  caseText?: string;
  bp?: string;
  pulse?: string;
  tempF?: string;
  weightKg?: string;
  prescriptions: Array<{
    medicine: string;
    potency?: string;
    quantity?: string;
    doseForm?: string;
    dosePattern?: string;
    frequency?: string;
    duration?: string;
    isCombination?: boolean;
    combinationName?: string;
    combinationContent?: string;
  }>;
  advice?: string;
  nextVisit?: string;
  doctorSignatureUrl?: string | null;
}

export interface PrescriptionPrintSettings {
  prescriptionHeaderImage?: string;
  prescriptionFooterImage?: string;
  prescriptionMarginLeft?: string;
  prescriptionMarginRight?: string;
  prescriptionHeaderHeight?: string;
  prescriptionFooterHeight?: string;
  prescriptionHeader?: string;
  prescriptionFooter?: string;
  prescriptionShowName?: boolean;
  prescriptionShowDate?: boolean;
  prescriptionShowRegNo?: boolean;
  prescriptionShowAge?: boolean;
  prescriptionShowSex?: boolean;
  prescriptionShowChiefComplaint?: boolean;
  prescriptionShowNextVisit?: boolean;
  prescriptionShowMedicineName?: boolean;
  prescriptionShowPotency?: boolean;
  prescriptionShowPattern?: boolean;
  prescriptionShowDoseForm?: boolean;
  prescriptionShowFrequency?: boolean;
  prescriptionShowDuration?: boolean;
}

/** Parse a CSS dimension string like "20mm" to points (1mm = 2.835pt) */
function mmToPt(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const mm = parseFloat(val);
  return isNaN(mm) ? fallback : mm * 2.835;
}

/**
 * Sanitize a string for pdf-lib WinAnsi encoding.
 * - Replaces newlines/tabs with a space
 * - Replaces bullet • with -
 * - Strips any character outside the printable Latin-1 range (0x20–0xFF)
 */
function sanitize(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\u2022/g, '-')   // bullet
    .replace(/\u2013|\u2014/g, '-') // en/em dash
    .replace(/[\u0100-\uFFFF]/g, '?') // non-latin chars
    .replace(/[^\x20-\xFF]/g, '') // strip remaining control chars
    .trim();
}

/** Fetch a data-URL image and return its bytes */
async function dataUrlToBytes(dataUrl: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  try {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = match[1];
    const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
    return { bytes, mimeType };
  } catch {
    return null;
  }
}

/** Word-wrap a single line (no newlines) to fit maxWidth */
function wordWrap(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/**
 * Split text on newlines first, then word-wrap each segment.
 * All text is sanitized before wrapping.
 */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const paragraphs = text.split(/\r?\n/);
  const result: string[] = [];
  for (const para of paragraphs) {
    const safe = sanitize(para);
    if (!safe) {
      result.push('');
    } else {
      result.push(...wordWrap(safe, font, fontSize, maxWidth));
    }
  }
  return result.length ? result : [''];
}

export async function generatePrescriptionPdf(
  data: PrescriptionPdfData,
  printSettings: PrescriptionPrintSettings
): Promise<string> {
  const pdfDoc = await PDFDocument.create();

  // A4 page
  const pageWidth = 595;
  const pageHeight = 842;

  const marginLeft = mmToPt(printSettings.prescriptionMarginLeft, 20 * 2.835);
  const marginRight = mmToPt(printSettings.prescriptionMarginRight, 20 * 2.835);
  const headerHeight = mmToPt(printSettings.prescriptionHeaderHeight, 80 * 2.835);
  const footerHeight = mmToPt(printSettings.prescriptionFooterHeight, 30 * 2.835);
  const contentWidth = pageWidth - marginLeft - marginRight;

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Embed header image
  let headerImageEmbed: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (printSettings.prescriptionHeaderImage) {
    const img = await dataUrlToBytes(printSettings.prescriptionHeaderImage);
    if (img) {
      try {
        headerImageEmbed = img.mimeType === 'image/png'
          ? await pdfDoc.embedPng(img.bytes)
          : await pdfDoc.embedJpg(img.bytes);
      } catch { /* skip */ }
    }
  }

  // Embed footer image
  let footerImageEmbed: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (printSettings.prescriptionFooterImage) {
    const img = await dataUrlToBytes(printSettings.prescriptionFooterImage);
    if (img) {
      try {
        footerImageEmbed = img.mimeType === 'image/png'
          ? await pdfDoc.embedPng(img.bytes)
          : await pdfDoc.embedJpg(img.bytes);
      } catch { /* skip */ }
    }
  }

  // Embed doctor signature
  let signatureEmbed: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (data.doctorSignatureUrl) {
    const img = await dataUrlToBytes(data.doctorSignatureUrl);
    if (img) {
      try {
        signatureEmbed = img.mimeType === 'image/png'
          ? await pdfDoc.embedPng(img.bytes)
          : await pdfDoc.embedJpg(img.bytes);
      } catch { /* skip */ }
    }
  }

  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  /**
   * Draw sanitized text at (x, y). Handles multi-line strings by splitting on \n.
   * Returns the new y position after drawing.
   */
  const drawText = (
    p: PDFPage,
    rawText: string,
    x: number,
    y: number,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; maxWidth?: number }
  ): number => {
    const font = opts.font ?? fontRegular;
    const size = opts.size ?? 10;
    const color = opts.color ?? rgb(0, 0, 0);
    const lineH = size * 1.4;

    if (opts.maxWidth) {
      const lines = wrapText(rawText, font, size, opts.maxWidth);
      for (const line of lines) {
        if (line) p.drawText(line, { x, y, size, font, color });
        y -= lineH;
      }
      return y;
    }

    // No maxWidth — still split on newlines and sanitize
    const lines = rawText.split(/\r?\n/);
    for (const line of lines) {
      const safe = sanitize(line);
      if (safe) p.drawText(safe, { x, y, size, font, color });
      y -= lineH;
    }
    return y;
  };

  // ── Header ───────────────────────────────────────────────────────────────────
  if (headerImageEmbed) {
    const dims = headerImageEmbed.scaleToFit(contentWidth, headerHeight);
    page.drawImage(headerImageEmbed, {
      x: marginLeft,
      y: pageHeight - headerHeight,
      width: dims.width,
      height: dims.height,
    });
  } else if (printSettings.prescriptionHeader) {
    drawText(page, printSettings.prescriptionHeader, marginLeft, pageHeight - 20, {
      font: fontBold, size: 12,
    });
  }

  // ── Content area ─────────────────────────────────────────────────────────────
  let y = pageHeight - headerHeight - 10;

  page.drawLine({
    start: { x: marginLeft, y },
    end: { x: pageWidth - marginRight, y },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 14;

  // Patient name + date
  const showName = printSettings.prescriptionShowName !== false;
  const showDate = printSettings.prescriptionShowDate !== false;
  const showRegNo = printSettings.prescriptionShowRegNo !== false;
  const showAge = printSettings.prescriptionShowAge !== false;
  const showSex = printSettings.prescriptionShowSex !== false;

  if (showName) {
    const name = sanitize(`${data.patient.firstName} ${data.patient.lastName}`);
    page.drawText(name, { x: marginLeft, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
  }
  if (showDate) {
    const dateStr = sanitize((data.visitDate ?? new Date()).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
    }));
    const dateText = `Date: ${dateStr}`;
    const dateW = fontRegular.widthOfTextAtSize(dateText, 9);
    page.drawText(dateText, { x: pageWidth - marginRight - dateW, y, size: 9, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  }
  y -= 13;

  // Age / sex / reg
  const subParts: string[] = [];
  if (showAge && data.patient.age) subParts.push(`${data.patient.age} yrs`);
  if (showSex && data.patient.gender) subParts.push(sanitize(data.patient.gender));
  if (showRegNo) subParts.push(`Reg: ${sanitize(data.patient.registrationNumber)}`);
  if (data.visitNumber) subParts.push(`Visit #${data.visitNumber}`);
  if (subParts.length) {
    page.drawText(subParts.join(' - '), { x: marginLeft, y, size: 9, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
    y -= 12;
  }

  // Vitals
  const vitalParts: string[] = [];
  if (data.bp) vitalParts.push(`BP: ${sanitize(data.bp)}`);
  if (data.pulse) vitalParts.push(`Pulse: ${sanitize(data.pulse)}`);
  if (data.tempF) vitalParts.push(`Temp: ${sanitize(data.tempF)}F`);
  if (data.weightKg) vitalParts.push(`Wt: ${sanitize(data.weightKg)}kg`);
  if (vitalParts.length) {
    page.drawText(vitalParts.join(' - '), { x: marginLeft, y, size: 9, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
    y -= 12;
  }

  y -= 4;
  page.drawLine({ start: { x: marginLeft, y }, end: { x: pageWidth - marginRight, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  y -= 12;

  // Case text / chief complaint
  if (printSettings.prescriptionShowChiefComplaint !== false && data.caseText) {
    page.drawText('Clinical Notes:', { x: marginLeft, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    y -= 12;
    y = drawText(page, data.caseText, marginLeft, y, { size: 9, maxWidth: contentWidth, color: rgb(0.2, 0.2, 0.2) });
    y -= 6;
  }

  // Rx heading
  page.drawText('Rx', { x: marginLeft, y, size: 13, font: fontBold, color: rgb(0, 0, 0) });
  y -= 16;

  // Table header
  const col = {
    medicine: marginLeft,
    potency: marginLeft + contentWidth * 0.38,
    dose: marginLeft + contentWidth * 0.55,
    duration: marginLeft + contentWidth * 0.78,
  };

  page.drawText('Medicine', { x: col.medicine, y, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
  if (printSettings.prescriptionShowPotency !== false)
    page.drawText('Potency', { x: col.potency, y, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText('Dose', { x: col.dose, y, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
  if (printSettings.prescriptionShowDuration !== false)
    page.drawText('Duration', { x: col.duration, y, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
  y -= 4;
  page.drawLine({ start: { x: marginLeft, y }, end: { x: pageWidth - marginRight, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  y -= 12;

  // Prescription rows
  for (let i = 0; i < data.prescriptions.length; i++) {
    const rx = data.prescriptions[i];
    if (!rx.medicine?.trim()) continue;

    const medicineName = sanitize(rx.isCombination ? (rx.combinationName || 'Combination') : rx.medicine);
    const doseParts: string[] = [];
    if (rx.quantity) doseParts.push(sanitize(rx.quantity));
    if (printSettings.prescriptionShowDoseForm !== false && rx.doseForm) doseParts.push(sanitize(rx.doseForm));
    if (printSettings.prescriptionShowPattern !== false && rx.dosePattern) doseParts.push(sanitize(rx.dosePattern));
    if (printSettings.prescriptionShowFrequency !== false && rx.frequency) doseParts.push(sanitize(rx.frequency));
    const doseText = doseParts.join(' ') || '-';
    const durationText = sanitize(rx.duration || '-');
    const potencyText = sanitize(rx.potency || '-');

    // Medicine name (may wrap)
    const medLabel = `${i + 1}. ${medicineName}`;
    const medLines = wordWrap(medLabel, fontRegular, 10, contentWidth * 0.35);
    const rowStartY = y;
    for (const line of medLines) {
      page.drawText(line, { x: col.medicine, y, size: 10, font: fontRegular, color: rgb(0, 0, 0) });
      y -= 13;
    }

    // Other columns aligned to first line of medicine
    if (printSettings.prescriptionShowPotency !== false)
      page.drawText(potencyText, { x: col.potency, y: rowStartY, size: 10, font: fontRegular, color: rgb(0, 0, 0) });
    page.drawText(doseText, { x: col.dose, y: rowStartY, size: 10, font: fontRegular, color: rgb(0, 0, 0) });
    if (printSettings.prescriptionShowDuration !== false)
      page.drawText(durationText, { x: col.duration, y: rowStartY, size: 10, font: fontRegular, color: rgb(0, 0, 0) });

    // Combination content sub-line
    if (rx.isCombination && rx.combinationContent) {
      const comboText = sanitize(`(${rx.combinationContent})`);
      page.drawText(comboText, { x: col.medicine + 8, y, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.8) });
      y -= 11;
    }

    y -= 2;
  }

  y -= 8;
  page.drawLine({ start: { x: marginLeft, y }, end: { x: pageWidth - marginRight, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  y -= 12;

  // Advice
  if (data.advice) {
    page.drawText('Advice:', { x: marginLeft, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    y -= 12;
    y = drawText(page, data.advice, marginLeft, y, { size: 9, maxWidth: contentWidth, color: rgb(0.2, 0.2, 0.2) });
    y -= 6;
  }

  // ── Footer area ───────────────────────────────────────────────────────────────
  const footerY = footerHeight;

  // Next visit
  if (printSettings.prescriptionShowNextVisit !== false && data.nextVisit) {
    try {
      const nvDate = sanitize(new Date(data.nextVisit).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: '2-digit',
      }));
      page.drawText(`Next Visit: ${nvDate}`, { x: marginLeft, y: footerY + 30, size: 9, font: fontBold, color: rgb(0, 0, 0) });
    } catch { /* invalid date — skip */ }
  }

  // Doctor signature
  if (signatureEmbed) {
    const sigDims = signatureEmbed.scaleToFit(80, 40);
    page.drawImage(signatureEmbed, {
      x: pageWidth - marginRight - sigDims.width,
      y: footerY + 10,
      width: sigDims.width,
      height: sigDims.height,
    });
  } else {
    page.drawText('Doctor Signature', { x: pageWidth - marginRight - 80, y: footerY + 10, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });
  }

  // Footer divider
  page.drawLine({
    start: { x: marginLeft, y: footerY },
    end: { x: pageWidth - marginRight, y: footerY },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Footer image or text
  if (footerImageEmbed) {
    const dims = footerImageEmbed.scaleToFit(contentWidth, footerHeight - 4);
    page.drawImage(footerImageEmbed, {
      x: marginLeft,
      y: footerY - dims.height - 2,
      width: dims.width,
      height: dims.height,
    });
  } else if (printSettings.prescriptionFooter) {
    const footerLines = printSettings.prescriptionFooter.split(/\r?\n/);
    let fy = footerY - 14;
    for (const line of footerLines) {
      const safe = sanitize(line);
      if (safe) page.drawText(safe, { x: marginLeft, y: fy, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
      fy -= 10;
    }
  }

  const pdfBytes = await pdfDoc.save();
  let binary = '';
  for (let i = 0; i < pdfBytes.length; i++) {
    binary += String.fromCharCode(pdfBytes[i]);
  }
  return btoa(binary);
}
