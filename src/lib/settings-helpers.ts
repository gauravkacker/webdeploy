/**
 * Settings helpers — read app settings from localStorage.
 * Following dual-mode architecture: no direct localStorage access in components.
 */

export interface OnlineAppointmentSettings {
  autoBookingEnabled: boolean;
  autoRepliesEnabled: boolean;
  notificationSoundEnabled: boolean;
  googleSheetAutoBookingEnabled?: boolean;
  [key: string]: unknown;
}

export function getOnlineAppointmentSettings(): OnlineAppointmentSettings {
  try {
    const raw = localStorage.getItem('onlineAppointmentsSettings');
    const parsed = JSON.parse(raw || '{}');
    return {
      autoBookingEnabled: true,
      autoRepliesEnabled: true,
      notificationSoundEnabled: true,
      googleSheetAutoBookingEnabled: true,
      ...parsed,
    };
  } catch {
    return {
      autoBookingEnabled: true,
      autoRepliesEnabled: true,
      notificationSoundEnabled: true,
      googleSheetAutoBookingEnabled: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Core types for the WhatsApp appointment confirmation overlay
// ---------------------------------------------------------------------------

export interface PendingAppointment {
  id: string;
  name: string;
  phone: string;
  chatId?: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  receivedAt: string; // ISO timestamp
  processed: boolean;
  rejected?: boolean;
}

export interface OverlayQueueItem extends PendingAppointment {
  registrationNumber: string | null; // null → "New Patient"
  patientId: string | null;          // null → will be created on Book
}
