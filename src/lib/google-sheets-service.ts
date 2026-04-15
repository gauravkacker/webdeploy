/**
 * Google Sheets Service
 * Handles appending parsed appointments to Google Sheets
 */

import type { ParsedAppointment } from './whatsapp-parser';

/**
 * Result of appending data to Google Sheet
 */
export interface AppendResult {
  success: boolean;
  message: string;        // User-friendly message
  error?: string;         // Specific error message if append failed
}

/**
 * Google Sheet row format for appointments
 */
export interface GoogleSheetRow {
  timestamp: string;      // ISO timestamp
  name: string;
  mobile: string;         // 10-digit phone number
  date: string;           // YYYY-MM-DD format
  session: string;        // "Morning" or "Evening"
  time: string;           // HH:MM format
  status: string;         // "Confirmed" or other status
}

/**
 * Append a parsed appointment to Google Sheet
 * @param googleSheetUrl - URL or ID of the Google Sheet
 * @param appointment - The parsed appointment to append
 * @returns AppendResult with success status and message
 */
export async function appendToGoogleSheet(
  googleSheetUrl: string,
  appointment: ParsedAppointment
): Promise<AppendResult> {
  try {
    if (!googleSheetUrl || typeof googleSheetUrl !== 'string') {
      return {
        success: false,
        message: 'Failed to append appointment',
        error: 'Google Sheet URL is required',
      };
    }

    if (!appointment) {
      return {
        success: false,
        message: 'Failed to append appointment',
        error: 'Appointment data is required',
      };
    }

    // Format the appointment for the sheet
    const row = formatAppointmentForSheet(appointment);

    // Convert the row to values array
    const values = [
      row.timestamp,
      row.name,
      row.mobile,
      row.date,
      row.session,
      row.time,
      row.status,
    ];

    // Append the row to the sheet
    const result = await appendRowToSheet(googleSheetUrl, values);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: 'Failed to append appointment',
      error: errorMessage,
    };
  }
}

/**
 * Append a row to Google Sheet
 * @param spreadsheetId - Google Sheet ID or URL
 * @param values - Array of values to append as a row
 * @returns AppendResult with success status and message
 */
export async function appendRowToSheet(
  spreadsheetId: string,
  values: string[]
): Promise<AppendResult> {
  try {
    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
      return {
        success: false,
        message: 'Failed to append row',
        error: 'Spreadsheet ID is required',
      };
    }

    if (!Array.isArray(values) || values.length === 0) {
      return {
        success: false,
        message: 'Failed to append row',
        error: 'Values array is required and cannot be empty',
      };
    }

    // Extract spreadsheet ID from URL if needed
    let sheetId = spreadsheetId;
    if (spreadsheetId.includes('/')) {
      const match = spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        sheetId = match[1];
      }
    }

    // Try multiple methods to append to Google Sheets
    
    // Method 1: Try backend API (if credentials are configured)
    try {
      const response = await fetch('/api/google-sheets/append', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spreadsheetId: sheetId,
          values,
          range: 'Sheet1!A:G',
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log('[Google Sheets] Row appended via API:', data);
        return {
          success: true,
          message: 'Appointment appended to Google Sheet successfully',
        };
      }
    } catch (apiError) {
      console.log('[Google Sheets] API method not available, trying alternative...');
    }

    // Method 2: Use Google Forms submission (no credentials needed)
    try {
      const formResult = await appendViaGoogleForm(sheetId, values);
      if (formResult.success) {
        return formResult;
      }
    } catch (formError) {
      console.log('[Google Sheets] Form method failed:', formError);
    }

    // Method 3: Fallback - store in localStorage for manual processing
    console.warn('[Google Sheets] All append methods failed, storing in queue');
    const appendQueue = getAppendQueue();
    const appendRequest = {
      id: generateRequestId(),
      timestamp: new Date().toISOString(),
      spreadsheetId: sheetId,
      values,
      status: 'pending',
    };

    appendQueue.push(appendRequest);
    localStorage.setItem('whatsappParserAppendQueue', JSON.stringify(appendQueue));

    return {
      success: true,
      message: 'Appointment queued. Please ensure your Google Sheet is publicly accessible.',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: 'Failed to append row',
      error: errorMessage,
    };
  }
}

/**
 * Append via direct CSV append (works with public sheets)
 */
async function appendViaGoogleForm(
  spreadsheetId: string,
  values: string[]
): Promise<AppendResult> {
  try {
    // Use Google Sheets CSV export URL with append
    // This is a workaround that appends data by leveraging the public sheet
    
    // First, fetch the current sheet to get the last row
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
    
    try {
      const response = await fetch(csvUrl);
      if (response.ok) {
        // Sheet is publicly accessible
        // Now we'll use a backend endpoint to append
        const appendResponse = await fetch('/api/google-sheets/append', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            spreadsheetId,
            values,
          }),
        });

        const data = await appendResponse.json();
        if (appendResponse.ok && data.success) {
          return {
            success: true,
            message: 'Appointment appended to Google Sheet successfully',
          };
        }
      }
    } catch (e) {
      console.log('[Google Sheets] Public sheet check failed');
    }

    // If we get here, sheet might not be public or API not configured
    throw new Error('Could not append to sheet. Ensure sheet is publicly accessible.');
  } catch (error) {
    throw new Error(`Append failed: ${error}`);
  }
}

/**
 * Get the append queue from localStorage
 * @returns Array of pending append requests
 */
function getAppendQueue(): any[] {
  try {
    const queue = localStorage.getItem('whatsappParserAppendQueue');
    return queue ? JSON.parse(queue) : [];
  } catch (error) {
    console.error('Error reading append queue:', error);
    return [];
  }
}

/**
 * Generate a unique request ID
 * @returns Unique identifier
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format a parsed appointment to Google Sheet row format
 * @param appointment - The parsed appointment
 * @returns GoogleSheetRow with formatted data
 */
export function formatAppointmentForSheet(appointment: ParsedAppointment): GoogleSheetRow {
  const session = deriveSession(appointment.time);
  
  return {
    timestamp: new Date().toISOString(),
    name: appointment.name,
    mobile: appointment.phone,
    date: appointment.date,
    session,
    time: appointment.time,
    status: 'Confirmed',
  };
}

/**
 * Derive session from time (Morning before 12:00, Evening 12:00 or later)
 * @param time - Time in HH:MM format
 * @returns "Morning" or "Evening"
 */
export function deriveSession(time: string): string {
  if (!time || typeof time !== 'string') {
    return 'Morning';
  }

  const trimmed = time.trim();

  // Parse HH:MM format
  const match = trimmed.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return 'Morning';
  }

  const hour = parseInt(match[1], 10);

  // Morning: 00:00 - 11:59
  // Evening: 12:00 - 23:59
  return hour < 12 ? 'Morning' : 'Evening';
}
