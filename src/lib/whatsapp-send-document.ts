import type { DoctorPrescription } from './db/schema';

/**
 * Convert prescription data to a PDF base64 string by:
 * 1. Generating the exact same HTML the print button uses (generatePrescriptionHTML)
 * 2. Sending that HTML to the whatsapp-server /html-to-pdf endpoint (Puppeteer)
 *
 * This guarantees the WhatsApp PDF looks identical to the printed prescription.
 */
export async function generatePrescriptionPdfFromHTML(
  patient: {
    firstName: string;
    lastName: string;
    registrationNumber?: string;
    mobileNumber?: string;
    age?: number;
    sex?: string;
    address?: string;
  },
  prescriptions: DoctorPrescription[],
  visit?: {
    chiefComplaint?: string;
    diagnosis?: string;
    advice?: string;
    visitDate?: Date | string;
    nextVisit?: Date | string;
  },
  doctorName?: string
): Promise<string> {
  const { generatePrescriptionHTML } = await import('./prescription-formatter');
  const html = generatePrescriptionHTML(patient, prescriptions, visit, doctorName);

  const res = await fetch('/api/prescription/html-to-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html }),
  });

  let data: { success?: boolean; base64?: string; error?: string };
  try {
    data = await res.json();
  } catch {
    throw new Error(`html-to-pdf returned non-JSON response (status ${res.status})`);
  }

  if (!data.success || !data.base64) {
    throw new Error(data.error || 'Failed to generate PDF');
  }

  return data.base64;
}

/**
 * Send a PDF document via WhatsApp.
 * Routes through the Next.js API proxy (/api/whatsapp/send-document) so that
 * LAN clients (other PCs on the network) correctly reach the whatsapp-server
 * running on the host machine — not their own localhost.
 */
export async function sendPrescriptionViaWhatsApp(
  phone: string,
  base64: string,
  filename: string,
  caption?: string
): Promise<void> {
  const res = await fetch('/api/whatsapp/send-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, base64, filename, caption: caption ?? '' }),
  });

  let data: { success?: boolean; error?: string };
  try {
    data = await res.json();
  } catch {
    throw new Error(`WhatsApp server returned non-JSON response (status ${res.status})`);
  }

  if (!data.success) {
    throw new Error(data.error || 'Unknown error from WhatsApp server');
  }
}

/**
 * Load and merge print settings from doctorSettingsDb into a flat object
 * suitable for generatePrescriptionPdf().
 *
 * - "printSettings" key: layout, images, margins, flat toggle keys (prescriptionShow*)
 * - "prescriptionSettings" key: nested field toggles (print.patient.*, print.rxFields.*, etc.)
 *   and signatureUrl
 *
 * The nested toggles from prescriptionSettings override the flat ones from printSettings
 * so the prescription settings page is the source of truth for field visibility.
 */
export function loadPrescriptionPrintSettings(): {
  printSettings: Record<string, any>;
  signatureUrl: string | null;
} {
  let printSettings: Record<string, any> = {};
  let signatureUrl: string | null = null;

  try {
    // Dynamically import to avoid SSR issues — this runs in browser only
    const { doctorSettingsDb } = require('@/lib/db/doctor-panel');

    // 1. Load base layout/image settings
    const rawPrint = doctorSettingsDb.get('printSettings');
    if (rawPrint) printSettings = JSON.parse(rawPrint as string);

    // 2. Load prescription field toggles and signature
    const rawRx = doctorSettingsDb.get('prescriptionSettings');
    if (rawRx) {
      const rxParsed = JSON.parse(rawRx as string);
      signatureUrl = rxParsed.signatureUrl || null;

      // Map nested print toggles → flat prescriptionShow* keys
      const p = rxParsed.print || {};
      const patient = p.patient || {};
      const rx = p.rxFields || {};
      const add = p.additional || {};

      // Patient detail toggles
      if (patient.name !== undefined) printSettings.prescriptionShowName = patient.name;
      if (patient.age !== undefined) printSettings.prescriptionShowAge = patient.age;
      if (patient.sex !== undefined) printSettings.prescriptionShowSex = patient.sex;
      if (patient.visitDate !== undefined) printSettings.prescriptionShowDate = patient.visitDate;
      if (patient.regNo !== undefined) printSettings.prescriptionShowRegNo = patient.regNo;

      // Rx field toggles
      if (rx.potency !== undefined) printSettings.prescriptionShowPotency = rx.potency;
      if (rx.dosePattern !== undefined) printSettings.prescriptionShowPattern = rx.dosePattern;
      if (rx.doseForm !== undefined) printSettings.prescriptionShowDoseForm = rx.doseForm;
      if (rx.frequency !== undefined) printSettings.prescriptionShowFrequency = rx.frequency;
      if (rx.duration !== undefined) printSettings.prescriptionShowDuration = rx.duration;

      // Additional field toggles
      if (add.caseText !== undefined) printSettings.prescriptionShowChiefComplaint = add.caseText;
      if (add.nextVisit !== undefined) printSettings.prescriptionShowNextVisit = add.nextVisit;
    }
  } catch { /* use defaults */ }

  return { printSettings, signatureUrl };
}
