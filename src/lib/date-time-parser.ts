/**
 * Date and Time Parser
 * Parses multiple date and time formats
 */

/**
 * Result of parsing a date
 */
export interface DateParseResult {
  success: boolean;
  date?: string;          // YYYY-MM-DD format
  error?: string;         // Specific error message if parsing failed
}

/**
 * Result of parsing a time
 */
export interface TimeParseResult {
  success: boolean;
  time?: string;          // HH:MM format (24-hour)
  error?: string;         // Specific error message if parsing failed
}

/**
 * Supported date formats
 */
export enum DateFormat {
  DD_MM_YYYY = 'DD-MM-YYYY',      // 15-03-2026
  DD_SLASH_MM_SLASH_YYYY = 'DD/MM/YYYY',  // 15/03/2026
  YYYY_MM_DD = 'YYYY-MM-DD',      // 2026-03-15
  DD_MMM_YYYY = 'DD-MMM-YYYY',    // 15-Mar-2026
}

/**
 * Supported time formats
 */
export enum TimeFormat {
  HH_MM = 'HH:MM',                // 14:30
  H_MM = 'H:MM',                  // 2:30
  HH_MM_AMPM = 'HH:MM AM/PM',     // 2:30 PM
  H_MM_AMPM = 'H:MM AM/PM',       // 2:30 PM
}

/**
 * Parse a date string in any supported format
 * @param dateStr - Date string to parse
 * @returns DateParseResult with date in YYYY-MM-DD format or error
 */
export function parseDate(dateStr: string): DateParseResult {
  if (!dateStr || typeof dateStr !== 'string') {
    return {
      success: false,
      error: 'Date string is required',
    };
  }

  const trimmed = dateStr.trim();

  // Try DD-MM-YYYY format (e.g., 15-03-2026)
  let match = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    const date = parseAndValidateDate(parseInt(day), parseInt(month), parseInt(year));
    if (date) {
      return {
        success: true,
        date: formatDateToISO(date),
      };
    }
  }

  // Try DD/MM/YYYY format (e.g., 15/03/2026)
  match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    const date = parseAndValidateDate(parseInt(day), parseInt(month), parseInt(year));
    if (date) {
      return {
        success: true,
        date: formatDateToISO(date),
      };
    }
  }

  // Try YYYY-MM-DD format (e.g., 2026-03-15)
  match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    const date = parseAndValidateDate(parseInt(day), parseInt(month), parseInt(year));
    if (date) {
      return {
        success: true,
        date: formatDateToISO(date),
      };
    }
  }

  // Try DD-MMM-YYYY format (e.g., 15-Mar-2026)
  match = trimmed.match(/^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-(\d{4})$/i);
  if (match) {
    const [, day, monthStr, year] = match;
    const monthMap: { [key: string]: number } = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const month = monthMap[monthStr.toLowerCase()];
    const date = parseAndValidateDate(parseInt(day), month, parseInt(year));
    if (date) {
      return {
        success: true,
        date: formatDateToISO(date),
      };
    }
  }

  return {
    success: false,
    error: 'Date format not recognized. Use DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, or DD-MMM-YYYY',
  };
}

/**
 * Helper function to parse and validate a date
 * @param day - Day of month (1-31)
 * @param month - Month (1-12)
 * @param year - Year (4 digits)
 * @returns Date object if valid, null otherwise
 */
function parseAndValidateDate(day: number, month: number, year: number): Date | null {
  // Validate ranges
  if (month < 1 || month > 12) {
    return null;
  }

  if (day < 1 || day > 31) {
    return null;
  }

  // Create date object
  const date = new Date(year, month - 1, day);

  // Validate that the date is actually valid (handles leap years, month boundaries, etc.)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

/**
 * Helper function to format a Date object to YYYY-MM-DD string
 * @param date - Date object to format
 * @returns Date string in YYYY-MM-DD format
 */
function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a time string in any supported format
 * @param timeStr - Time string to parse
 * @returns TimeParseResult with time in HH:MM format or error
 */
export function parseTime(timeStr: string): TimeParseResult {
  if (!timeStr || typeof timeStr !== 'string') {
    return {
      success: false,
      error: 'Time string is required',
    };
  }

  const trimmed = timeStr.trim();

  // Try HH:MM format (e.g., 14:30)
  let match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, hourStr, minuteStr] = match;
    const hour = parseInt(hourStr);
    const minute = parseInt(minuteStr);

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return {
        success: true,
        time: `${String(hour).padStart(2, '0')}:${minuteStr}`,
      };
    }
  }

  // Try H:MM format (e.g., 2:30) - single digit hour
  match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, hourStr, minuteStr] = match;
    const hour = parseInt(hourStr);
    const minute = parseInt(minuteStr);

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return {
        success: true,
        time: `${String(hour).padStart(2, '0')}:${minuteStr}`,
      };
    }
  }

  // Try HH:MM AM/PM format (e.g., 2:30 PM or 02:30 PM)
  match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/i);
  if (match) {
    const [, hourStr, minuteStr, period] = match;
    let hour = parseInt(hourStr);
    const minute = parseInt(minuteStr);

    if (minute < 0 || minute > 59) {
      return {
        success: false,
        error: 'Invalid time format. Minutes must be 00-59',
      };
    }

    // Convert 12-hour to 24-hour format
    const isPM = period.toUpperCase() === 'PM';
    if (hour < 1 || hour > 12) {
      return {
        success: false,
        error: 'Invalid time format. Hours in 12-hour format must be 1-12',
      };
    }

    if (isPM && hour !== 12) {
      hour += 12;
    } else if (!isPM && hour === 12) {
      hour = 0;
    }

    return {
      success: true,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
  }

  return {
    success: false,
    error: 'Time format not recognized. Use HH:MM, H:MM, or HH:MM AM/PM',
  };
}

/**
 * Check if a date is valid and not in the past
 * @param date - Date in YYYY-MM-DD format
 * @returns true if date is today or in the future
 */
export function isValidFutureDate(date: string): boolean {
  if (!date || typeof date !== 'string') {
    return false;
  }

  // Validate format is YYYY-MM-DD
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return false;
  }

  const [, yearStr, monthStr, dayStr] = match;
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const day = parseInt(dayStr);

  // Validate date is actually valid
  const dateObj = parseAndValidateDate(day, month, year);
  if (!dateObj) {
    return false;
  }

  // Get today's date at midnight
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check if date is today or in the future
  return dateObj >= today;
}

/**
 * Check if a time is in valid HH:MM format
 * @param time - Time in HH:MM format
 * @returns true if time is valid (00:00-23:59)
 */
export function isValidTimeFormat(time: string): boolean {
  if (!time || typeof time !== 'string') {
    return false;
  }

  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return false;
  }

  const [, hourStr, minuteStr] = match;
  const hour = parseInt(hourStr);
  const minute = parseInt(minuteStr);

  // Validate ranges
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}
