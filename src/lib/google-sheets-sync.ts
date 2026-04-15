/**
 * Google Sheets Sync Service
 * Handles fetching and syncing appointments from Google Sheets
 */

import { appointmentDb, patientDb, slotDb } from './db/database';

export interface GoogleSheetRow {
  timestamp: string;
  name: string;
  mobile: string;
  date: string;
  session: string;
  time: string;
  status: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  appointmentsCreated: number;
  appointmentsSkipped: number;
  errors: string[];
}

/**
 * Convert Google Sheet URL to CSV export URL
 * Fetches from the "appointments" sheet (case-insensitive)
 */
export function convertToCSVUrl(googleSheetUrl: string): string {
  try {
    const url = new URL(googleSheetUrl);
    const spreadsheetId = url.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
    
    if (!spreadsheetId) {
      throw new Error('Invalid Google Sheet URL');
    }
    
    // Fetch metadata to find the "appointments" sheet gid
    // For now, we'll use a common approach: fetch the sheet and parse it
    // The "appointments" sheet is typically not gid=0, so we need to discover it
    // We'll return a URL that will be processed to find the correct sheet
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  } catch (error) {
    console.error('Error converting Google Sheet URL:', error);
    throw error;
  }
}

/**
 * Get CSV export URL for the appointments sheet
 * Tries multiple sheet IDs to find the "appointments" sheet
 */
function getAppointmentsSheetCsvUrl(googleSheetUrl: string): string {
  try {
    const url = new URL(googleSheetUrl);
    const spreadsheetId = url.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
    
    if (!spreadsheetId) {
      throw new Error('Invalid Google Sheet URL');
    }
    
    // Try gid=1 first (second sheet is often the appointments sheet)
    // If that doesn't work, the sync function will try other gids
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=1`;
  } catch (error) {
    console.error('Error getting appointments sheet CSV URL:', error);
    throw error;
  }
}

/**
 * Parse CSV data from Google Sheets
 * Timestamp is optional and does not affect appointment booking
 */
export function parseGoogleSheetCSV(csvData: string): GoogleSheetRow[] {
  const lines = csvData.trim().split('\n');
  if (lines.length < 2) {
    console.error('[Google Sheets] CSV has no data rows. Lines:', lines.length);
    console.error('[Google Sheets] CSV content:', csvData.substring(0, 500));
    return [];
  }

  // Parse header - handle both comma and space-separated values
  let headerLine = lines[0];
  console.log('[Google Sheets] Raw header line:', headerLine);
  
  // Split by comma and remove quotes
  const headers = headerLine.split(',').map(h => {
    // Remove surrounding quotes and trim
    let cleaned = h.trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1);
    }
    return cleaned.toLowerCase();
  });
  
  console.log('[Google Sheets] Parsed headers:', headers);
  console.log('[Google Sheets] Header count:', headers.length);
  
  const timestampIdx = headers.indexOf('timestamp'); // Optional
  const nameIdx = headers.indexOf('name');
  const mobileIdx = headers.indexOf('mobile');
  const dateIdx = headers.indexOf('date');
  const sessionIdx = headers.indexOf('session');
  const timeIdx = headers.indexOf('time');
  const statusIdx = headers.indexOf('status');

  console.log('[Google Sheets] Column indices:', {
    timestamp: timestampIdx, name: nameIdx, mobile: mobileIdx, 
    date: dateIdx, session: sessionIdx, time: timeIdx, status: statusIdx
  });

  // If we can't find required columns, log all headers for debugging
  if (nameIdx === -1 || mobileIdx === -1 || dateIdx === -1 || sessionIdx === -1 || timeIdx === -1 || statusIdx === -1) {
    console.error('[Google Sheets] Missing required columns. All headers:', headers);
    console.error('[Google Sheets] First 5 lines of CSV:');
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      console.error(`  Line ${i}:`, lines[i].substring(0, 100));
    }
    throw new Error('Missing required columns in Google Sheet. Required: Name, Mobile, Date, Session, Time, Status');
  }

  const rows: GoogleSheetRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parsing (handles basic cases)
    const values = parseCSVLine(line);
    
    // Check if we have all required fields (timestamp is optional)
    if (values.length > Math.max(nameIdx, mobileIdx, dateIdx, sessionIdx, timeIdx, statusIdx)) {
      rows.push({
        timestamp: timestampIdx >= 0 && values[timestampIdx] ? values[timestampIdx] : '', // Optional, can be empty
        name: values[nameIdx],
        mobile: values[mobileIdx],
        date: values[dateIdx],
        session: values[sessionIdx],
        time: values[timeIdx],
        status: values[statusIdx],
      });
    }
  }

  return rows;
}

/**
 * Parse a single CSV line (handles quoted values)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  
  // Remove surrounding quotes from each value
  return result.map(val => {
    if (val.startsWith('"') && val.endsWith('"')) {
      return val.slice(1, -1);
    }
    return val;
  });
}

/**
 * Strip titles from name (Mr, Mrs, Dr, Miss, Ms, Smt, etc.)
 */
function stripTitles(name: string): string {
  // Common titles to remove
  const titles = ['mr', 'mrs', 'ms', 'miss', 'dr', 'smt', 'shri', 'shrimati', 'prof', 'prof.', 'dr.'];
  
  let cleanName = name.toLowerCase().trim();
  
  // Remove titles from the beginning
  for (const title of titles) {
    const titlePattern = new RegExp(`^${title}\\s+`, 'i');
    cleanName = cleanName.replace(titlePattern, '');
  }
  
  return cleanName.trim();
}

/**
 * Find patient by name and mobile number
 * Strips titles (Mr, Mrs, Dr, Miss, Ms, Smt, etc.) from names before matching
 */
function findPatientByNameAndMobile(name: string, mobile: string): any {
  const allPatients = patientDb.getAll() as any[];
  
  // Strip titles from sheet name
  const cleanSheetName = stripTitles(name);
  
  return allPatients.find(patient => {
    // Build patient full name and strip titles
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    const cleanPatientName = stripTitles(fullName);
    
    // Normalize mobile numbers (remove all non-digits)
    const patientMobile = patient.mobileNumber?.replace(/\D/g, '') || '';
    const sheetMobile = mobile.replace(/\D/g, '');
    
    // Match on cleaned names and mobile
    const nameMatch = cleanPatientName === cleanSheetName;
    const mobileMatch = patientMobile === sheetMobile;
    
    if (nameMatch && mobileMatch) {
      console.log(`[Google Sheets Sync] Name match: "${name}" -> "${cleanSheetName}" matched with "${fullName}" -> "${cleanPatientName}"`);
      return true;
    }
    
    return false;
  });
}

/**
 * Find slot by session name (morning/evening)
 * Matches "MORNING" or "EVENING" from sheet to "Morning (09:00 - 12:00)" format in system
 */
function findSlotBySession(sessionName: string): any {
  const allSlots = slotDb.getActive() as any[];
  const normalizedSession = sessionName.toLowerCase().trim();
  
  // Try exact match first (case-insensitive)
  let match = allSlots.find(slot => 
    slot.name.toLowerCase().includes(normalizedSession)
  );
  
  if (match) return match;
  
  // If no exact match, try partial matching for common patterns
  // "MORNING" matches "Morning (09:00 - 12:00)"
  // "EVENING" matches "Evening (14:00 - 18:00)"
  if (normalizedSession === 'morning') {
    match = allSlots.find(slot => 
      slot.name.toLowerCase().startsWith('morning')
    );
  } else if (normalizedSession === 'evening') {
    match = allSlots.find(slot => 
      slot.name.toLowerCase().startsWith('evening')
    );
  }
  
  return match || null;
}

/**
 * Parse date string (handles various formats)
 * Returns date at local midnight to avoid timezone issues
 */
function parseDate(dateStr: string): Date | null {
  try {
    // Handle YYYY-MM-DD format specifically
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day, 0, 0, 0, 0);
      return date;
    }
    
    // Handle DD-MM-YYYY format (e.g., 13-03-2026)
    if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
      const [day, month, year] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day, 0, 0, 0, 0);
      return date;
    }
    
    // Handle DD/MM/YYYY format (e.g., 13/03/2026)
    if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const [day, month, year] = dateStr.split('/').map(Number);
      const date = new Date(year, month - 1, day, 0, 0, 0, 0);
      return date;
    }
    
    // Try other common formats: MM/DD/YYYY
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      // Reset to local midnight to avoid timezone issues
      date.setHours(0, 0, 0, 0);
      return date;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse time string (handles various formats)
 */
function parseTime(timeStr: string): string | null {
  try {
    // Try to extract HH:MM format
    const match = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      
      if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Sync appointments from Google Sheet
 * 
 * DEDUPLICATION STRATEGY:
 * - Checks for existing appointments before creating new ones
 * - Matches on: Patient ID + Date + Time + Slot ID
 * - If appointment already exists, it is skipped (not re-booked)
 * - Prevents duplicate bookings even on repeated syncs
 * - Logs duplicate prevention for audit trail
 */
export async function syncAppointmentsFromGoogleSheet(googleSheetUrl: string): Promise<SyncResult> {
  const errors: string[] = [];
  let appointmentsCreated = 0;
  let appointmentsSkipped = 0;

  try {
    const url = new URL(googleSheetUrl);
    const spreadsheetId = url.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
    
    if (!spreadsheetId) {
      throw new Error('Invalid Google Sheet URL');
    }

    // Extract gid from URL if provided (e.g., ?gid=205049834 or #gid=205049834)
    let urlGid: number | null = null;
    const gidMatch = googleSheetUrl.match(/[?#]gid=(\d+)/);
    if (gidMatch) {
      urlGid = parseInt(gidMatch[1], 10);
      console.log(`[Google Sheets Sync] Found gid in URL: ${urlGid}`);
    }

    // Build list of sheet IDs to try
    // Priority: URL gid first, then known appointments sheet gid, then search range
    const sheetIds: number[] = [];
    if (urlGid !== null) {
      sheetIds.push(urlGid);
    }
    sheetIds.push(205049834); // Known appointments sheet gid
    sheetIds.push(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10); // Search range
    
    // Remove duplicates
    const uniqueSheetIds = Array.from(new Set(sheetIds));

    let csvData = '';
    let foundCorrectSheet = false;
    const sheetsChecked: string[] = [];

    for (const gid of uniqueSheetIds) {
      try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
        console.log(`[Google Sheets Sync] Trying sheet gid=${gid}`);

        const response = await fetch(csvUrl);
        if (!response.ok) {
          continue;
        }

        const data = await response.text();
        if (!data || data.length === 0) {
          continue;
        }
        
        // Get first line to see what sheet this is
        const firstLine = data.split('\n')[0];
        sheetsChecked.push(`gid=${gid}: ${firstLine.substring(0, 50)}`);
        
        // Check if this sheet has the required columns (case-insensitive)
        const lowerData = data.toLowerCase();
        if (lowerData.includes('name') && lowerData.includes('mobile') && lowerData.includes('date') && 
            lowerData.includes('session') && lowerData.includes('time') && lowerData.includes('status')) {
          csvData = data;
          foundCorrectSheet = true;
          console.log(`[Google Sheets Sync] Found appointments sheet at gid=${gid}`);
          break;
        }
      } catch (e) {
        console.log(`[Google Sheets Sync] Error checking gid=${gid}:`, e);
      }
    }

    if (!foundCorrectSheet) {
      // Only log detailed error if we actually checked sheets
      if (sheetsChecked.length > 0) {
        console.error('[Google Sheets Sync] Sheets checked:', sheetsChecked);
      }
      throw new Error('Could not find appointments sheet with required columns (Name, Mobile, Date, Session, Time, Status). Make sure your sheet has columns: Name, Mobile, Date, Session, Time, Status');
    }

    console.log('[Google Sheets Sync] Received CSV data, length:', csvData.length);
    
    // Check if we got HTML error page instead of CSV
    if (csvData.includes('<!DOCTYPE') || csvData.includes('<html')) {
      throw new Error('Received HTML instead of CSV. The sheet URL may be invalid or not publicly accessible.');
    }

    let rows: GoogleSheetRow[] = [];
    
    try {
      rows = parseGoogleSheetCSV(csvData);
      console.log('[Google Sheets Sync] Parsed rows:', rows.length);
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : 'CSV parsing failed';
      console.error('[Google Sheets Sync] Parse error:', errorMsg);
      throw new Error(errorMsg);
    }

    if (rows.length === 0) {
      return {
        success: true,
        message: 'No appointments found in Google Sheet',
        appointmentsCreated: 0,
        appointmentsSkipped: 0,
        errors: [],
      };
    }

    // Get settings to check if auto-booking is enabled
    let autoBookingEnabled = true;
    if (typeof window !== 'undefined') {
      try {
        const settings = JSON.parse(localStorage.getItem('onlineAppointmentsSettings') || '{}');
        autoBookingEnabled = settings.googleSheetAutoBookingEnabled !== false;
      } catch {
        autoBookingEnabled = true;
      }
    }

    // Import pending appointments utility if auto-booking is disabled
    let addPendingAppointment: ((apt: any) => void) | null = null;
    if (!autoBookingEnabled && typeof window !== 'undefined') {
      try {
        const { addPendingAppointment: addPending } = await import('./google-sheets-pending');
        addPendingAppointment = addPending;
      } catch (e) {
        console.warn('[Google Sheets Sync] Could not import pending appointments utility:', e);
      }
    }

    // Process each row
    for (const row of rows) {
      try {
        console.log(`[Google Sheets Sync] Processing row: ${row.name}, Status: ${row.status}`);
        
        // Only process confirmed appointments
        if (row.status.toLowerCase() !== 'confirmed') {
          console.log(`[Google Sheets Sync] Skipped non-confirmed status: ${row.status}`);
          appointmentsSkipped++;
          continue;
        }

        // Parse date and time first to check if it's today or future
        const appointmentDate = parseDate(row.date);
        console.log(`[Google Sheets Sync] Parsed date: ${row.date} -> ${appointmentDate?.toDateString()}`);
        
        if (!appointmentDate) {
          errors.push(`Invalid date format: ${row.date}`);
          appointmentsSkipped++;
          continue;
        }

        // Skip past dates - only process today and future dates
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to start of today (local time)
        
        console.log(`[Google Sheets Sync] Date comparison: appointment=${appointmentDate.toDateString()}, today=${today.toDateString()}`);
        
        if (appointmentDate < today) {
          // Skip past date
          console.log(`[Google Sheets Sync] Skipped past date: ${row.name} on ${appointmentDate.toDateString()}`);
          appointmentsSkipped++;
          continue;
        }

        const appointmentTime = parseTime(row.time);
        console.log(`[Google Sheets Sync] Parsed time: ${row.time} -> ${appointmentTime}`);
        
        if (!appointmentTime) {
          errors.push(`Invalid time format: ${row.time}`);
          appointmentsSkipped++;
          continue;
        }

        // If auto-booking is disabled, create pending appointment instead
        if (!autoBookingEnabled && addPendingAppointment) {
          try {
            const dateStr = `${appointmentDate.getFullYear()}-${String(appointmentDate.getMonth() + 1).padStart(2, '0')}-${String(appointmentDate.getDate()).padStart(2, '0')}`;
            addPendingAppointment({
              name: row.name,
              phone: row.mobile,
              date: dateStr,
              time: appointmentTime,
              session: row.session,
            });
            appointmentsCreated++;
            console.log(`[Google Sheets Sync] ✓ Created pending appointment: ${row.name}`);
            continue;
          } catch (e) {
            console.error(`[Google Sheets Sync] Error creating pending appointment:`, e);
            errors.push(`Failed to create pending appointment for ${row.name}`);
            appointmentsSkipped++;
            continue;
          }
        }

        // Auto-booking enabled: create appointment directly
        // Find patient
        const patient = findPatientByNameAndMobile(row.name, row.mobile);
        console.log(`[Google Sheets Sync] Patient lookup: ${row.name} (${row.mobile}) -> ${patient ? patient.id : 'NOT FOUND'}`);
        
        if (!patient) {
          errors.push(`Patient not found: ${row.name} (${row.mobile})`);
          appointmentsSkipped++;
          continue;
        }

        // Find slot
        const slot = findSlotBySession(row.session);
        console.log(`[Google Sheets Sync] Slot lookup: ${row.session} -> ${slot ? slot.name : 'NOT FOUND'}`);
        
        if (!slot) {
          errors.push(`Slot not found for session: ${row.session}`);
          appointmentsSkipped++;
          continue;
        }

        // Check if appointment already exists (comprehensive deduplication)
        const allAppointments = appointmentDb.getAll() as any[];
        const existingAppointment = allAppointments.find(apt => {
          // Match by: patient ID + date + time + slot ID
          const dateMatch = new Date(apt.appointmentDate).toDateString() === appointmentDate.toDateString();
          const timeMatch = apt.appointmentTime === appointmentTime;
          const patientMatch = apt.patientId === patient.id;
          const slotMatch = apt.slotId === slot.id;
          
          return patientMatch && dateMatch && timeMatch && slotMatch;
        });

        if (existingAppointment) {
          // Appointment already exists - skip to prevent duplicate
          console.log(`[Google Sheets Sync] Duplicate prevented: ${patient.firstName} ${patient.lastName} on ${appointmentDate.toDateString()} at ${appointmentTime}`);
          appointmentsSkipped++;
          continue;
        }

        // Get next available token number for this slot
        const allAppointmentsForSlot = appointmentDb.getBySlot(appointmentDate, slot.id) as any[];
        const maxTokenNumber = allAppointmentsForSlot.length > 0
          ? Math.max(...allAppointmentsForSlot.map((apt: any) => apt.tokenNumber || 0))
          : 0;
        const nextTokenNumber = maxTokenNumber + 1;
        
        // Create appointment
        // Note: Timestamp is optional and does not affect appointment creation
        // Online appointments are always: type='follow-up', feeStatus='free-follow-up', isOnlineAppointment=true
        const appointmentData = {
          patientId: patient.id,
          appointmentDate: appointmentDate,
          appointmentTime: appointmentTime,
          duration: 30, // Default duration
          slotId: slot.id,
          slotName: slot.name,
          tokenNumber: nextTokenNumber, // Assign next available token number
          type: 'Free Follow Up', // Online appointments are always free follow up
          status: 'scheduled',
          visitMode: 'in-person',
          priority: 'normal', // Online appointments have normal priority
          feeAmount: 0,
          feeType: 'Free Follow Up',
          feeStatus: 'paid', // Online appointments are always free follow up
          isOnlineAppointment: true, // Flag for online appointment
          notes: `Synced from Google Sheet on ${new Date().toLocaleString()}`,
        };
        
        console.log(`[Google Sheets Sync] Creating appointment with data:`, appointmentData);
        
        const newAppointment = appointmentDb.create(appointmentData);

        if (newAppointment) {
          appointmentsCreated++;
          console.log(`[Google Sheets Sync] ✓ Successfully created appointment:`, newAppointment);
          console.log(`[Google Sheets Sync] Appointment ID: ${newAppointment.id}`);
          console.log(`[Google Sheets Sync] Patient: ${patient.firstName} ${patient.lastName}`);
          console.log(`[Google Sheets Sync] Date: ${appointmentDate.toDateString()}`);
          console.log(`[Google Sheets Sync] Time: ${appointmentTime}`);
          console.log(`[Google Sheets Sync] Slot: ${slot.name}`);
        } else {
          console.error(`[Google Sheets Sync] ✗ Failed to create appointment for ${patient.firstName} ${patient.lastName}`);
          errors.push(`Failed to create appointment for ${patient.firstName} ${patient.lastName}`);
          appointmentsSkipped++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Google Sheets Sync] Error processing row for ${row.name}:`, errorMsg);
        errors.push(`Error processing row: ${errorMsg}`);
        appointmentsSkipped++;
      }
    }

    return {
      success: true,
      message: `Synced ${appointmentsCreated} appointments from Google Sheet`,
      appointmentsCreated,
      appointmentsSkipped,
      errors,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Google Sheets Sync] Error:', errorMsg);
    
    return {
      success: false,
      message: `Failed to sync appointments: ${errorMsg}`,
      appointmentsCreated: 0,
      appointmentsSkipped: 0,
      errors: [errorMsg],
    };
  } finally {
    // Always update last sync time in localStorage after sync attempt
    if (typeof window !== 'undefined') {
      const timestamp = new Date().toLocaleString();
      const saved = localStorage.getItem("onlineAppointmentsSettings");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          parsed.lastSyncTime = timestamp;
          localStorage.setItem("onlineAppointmentsSettings", JSON.stringify(parsed));
          console.log(`[Google Sheets Sync] Updated lastSyncTime in localStorage: ${timestamp}`);
        } catch (e) {
          console.error('[Google Sheets Sync] Error updating lastSyncTime:', e);
        }
      }
    }
  }
}

/**
 * Start polling for Google Sheet updates
 */
export function startGoogleSheetPolling(googleSheetUrl: string, intervalMinutes: number = 5): NodeJS.Timeout {
  // Initial sync
  syncAppointmentsFromGoogleSheet(googleSheetUrl).catch(error => {
    console.error('[Google Sheets Sync] Initial sync failed:', error);
  });

  // Set up polling
  const intervalMs = intervalMinutes * 60 * 1000;
  const timerId = setInterval(() => {
    syncAppointmentsFromGoogleSheet(googleSheetUrl).catch(error => {
      console.error('[Google Sheets Sync] Polling sync failed:', error);
    });
  }, intervalMs);

  return timerId;
}

/**
 * Stop polling for Google Sheet updates
 */
export function stopGoogleSheetPolling(timerId: NodeJS.Timeout): void {
  clearInterval(timerId);
}
