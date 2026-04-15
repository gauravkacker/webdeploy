/**
 * Google Sheets Pending Appointments Manager
 * Handles pending appointments from Google Sheets sync
 * Follows dual-mode architecture using localStorage
 */

export interface GoogleSheetPendingAppointment {
  id: string;
  name: string;
  phone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  session: string;
  source: 'google-sheet';
  receivedAt: string; // ISO timestamp
  processed: boolean;
  rejected?: boolean;
  rejectReason?: string;
}

const STORAGE_KEY = 'googleSheetPendingAppointments';

/**
 * Get all pending appointments from localStorage
 */
export function getPendingAppointments(): GoogleSheetPendingAppointment[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Add a new pending appointment
 */
export function addPendingAppointment(appointment: Omit<GoogleSheetPendingAppointment, 'id' | 'source' | 'receivedAt' | 'processed'>): GoogleSheetPendingAppointment {
  if (typeof window === 'undefined') throw new Error('Cannot add pending appointment outside browser');
  
  const pending = getPendingAppointments();
  const newAppointment: GoogleSheetPendingAppointment = {
    ...appointment,
    id: `gs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    source: 'google-sheet',
    receivedAt: new Date().toISOString(),
    processed: false,
  };
  
  pending.push(newAppointment);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  
  return newAppointment;
}

/**
 * Mark appointment as processed
 */
export function markAsProcessed(id: string): void {
  if (typeof window === 'undefined') return;
  
  const pending = getPendingAppointments();
  const appointment = pending.find(apt => apt.id === id);
  
  if (appointment) {
    appointment.processed = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  }
}

/**
 * Mark appointment as rejected
 */
export function markAsRejected(id: string, reason: string): void {
  if (typeof window === 'undefined') return;
  
  const pending = getPendingAppointments();
  const appointment = pending.find(apt => apt.id === id);
  
  if (appointment) {
    appointment.rejected = true;
    appointment.rejectReason = reason;
    appointment.processed = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  }
}

/**
 * Clear all processed/rejected appointments
 */
export function clearProcessedAppointments(): void {
  if (typeof window === 'undefined') return;
  
  const pending = getPendingAppointments();
  const active = pending.filter(apt => !apt.processed && !apt.rejected);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
}

/**
 * Get unprocessed appointments
 */
export function getUnprocessedAppointments(): GoogleSheetPendingAppointment[] {
  return getPendingAppointments().filter(apt => !apt.processed);
}
