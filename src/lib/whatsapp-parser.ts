/**
 * WhatsApp Message Parser
 * Supports two formats:
 *
 * 1. Structured (legacy):
 *    Name: Ravi Kumar
 *    Phone: 9926460599
 *    Date: 18-03-2026
 *    Time: 18:50
 *
 * 2. Free-form (new):
 *    book ravi kumar 9926460599 7:30 PM 18 mar
 *    book ravi kumar 9926460599 12 PM today
 *    book ravi kumar 9926460599 730 PM tomorrow
 *    (keyword is configurable — default "book")
 */

export interface ParsedAppointment {
  name: string;
  phone: string;
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM (24-hour)
  service?: string;
  notes?: string;
}

export interface ParsingResult {
  success: boolean;
  data?: ParsedAppointment;
  error?: string;
}

export interface ExtractedComponents {
  name: string | null;
  phone: string | null;
  date: string | null;
  time: string | null;
  service?: string | null;
  notes?: string | null;
}

// ─── Month name map ───────────────────────────────────────────────────────────
const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function padTwo(n: number): string {
  return String(n).padStart(2, '0');
}

function toISODate(day: number, month: number, year: number): string | null {
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${year}-${padTwo(month)}-${padTwo(day)}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`;
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`;
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

/**
 * Try to parse a date token or pair of tokens (e.g. "18 mar", "18-03-2026", "today")
 * Returns YYYY-MM-DD or null.
 */
function tryParseDate(token: string, nextToken?: string): { date: string; consumed: number } | null {
  const t = token.toLowerCase().trim();

  if (t === 'today') return { date: todayISO(), consumed: 1 };
  if (t === 'tomorrow') return { date: tomorrowISO(), consumed: 1 };

  // DD-MM-YYYY or DD/MM/YYYY
  let m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const iso = toISODate(+m[1], +m[2], +m[3]);
    if (iso) return { date: iso, consumed: 1 };
  }

  // YYYY-MM-DD
  m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const iso = toISODate(+m[3], +m[2], +m[1]);
    if (iso) return { date: iso, consumed: 1 };
  }

  // DD-MMM-YYYY  e.g. 18-mar-2026
  m = t.match(/^(\d{1,2})-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*-(\d{4})$/i);
  if (m) {
    const month = MONTH_MAP[m[2].toLowerCase()];
    const iso = toISODate(+m[1], month, +m[3]);
    if (iso) return { date: iso, consumed: 1 };
  }

  // "18 mar" or "18 march" (two tokens, no year → current or next year)
  if (nextToken) {
    const dayNum = parseInt(t, 10);
    const monthNum = MONTH_MAP[nextToken.toLowerCase()];
    if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31 && monthNum) {
      const now = new Date();
      let year = now.getFullYear();
      const candidate = new Date(year, monthNum - 1, dayNum);
      // If the date has already passed this year, use next year
      if (candidate < now) year += 1;
      const iso = toISODate(dayNum, monthNum, year);
      if (iso) return { date: iso, consumed: 2 };
    }
  }

  return null;
}

// ─── Time parsing ─────────────────────────────────────────────────────────────

/**
 * Try to parse a time from one or two tokens.
 * Handles: "7:30", "730", "7", "12" combined with optional next token "PM"/"AM"
 * Returns HH:MM (24h) or null.
 */
function tryParseTime(token: string, nextToken?: string): { time: string; consumed: number } | null {
  const t = token.toLowerCase().trim();

  // Combine with AM/PM suffix if next token is am/pm
  const suffix = nextToken && /^(am|pm)$/i.test(nextToken) ? nextToken.toLowerCase() : null;

  // HH:MM with optional AM/PM inline e.g. "7:30pm" or "7:30 PM"
  let m = t.match(/^(\d{1,2}):(\d{2})(am|pm)?$/i);
  if (m) {
    let h = +m[1], min = +m[2];
    const period = (m[3] || suffix || '').toLowerCase();
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return { time: `${padTwo(h)}:${padTwo(min)}`, consumed: suffix && !m[3] ? 2 : 1 };
    }
  }

  // "730" or "1230" → 7:30 or 12:30
  m = t.match(/^(\d{3,4})$/);
  if (m) {
    const raw = m[1];
    let h: number, min: number;
    if (raw.length === 3) { h = +raw[0]; min = +raw.slice(1); }
    else { h = +raw.slice(0, 2); min = +raw.slice(2); }
    const period = (suffix || '').toLowerCase();
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return { time: `${padTwo(h)}:${padTwo(min)}`, consumed: suffix ? 2 : 1 };
    }
  }

  // Plain hour "7 PM" or "12 pm"
  m = t.match(/^(\d{1,2})$/);
  if (m && suffix) {
    let h = +m[1];
    if (suffix === 'pm' && h !== 12) h += 12;
    if (suffix === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23) {
      return { time: `${padTwo(h)}:00`, consumed: 2 };
    }
  }

  return null;
}

// ─── Phone extraction ─────────────────────────────────────────────────────────

function extractPhoneFromTokens(tokens: string[]): { phone: string; index: number } | null {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].replace(/[\s\-]/g, '');
    // Strip country code +91 or 91 prefix
    const stripped = t.replace(/^\+?91/, '');
    if (/^\d{10}$/.test(stripped)) {
      return { phone: stripped, index: i };
    }
  }
  return null;
}

// ─── Free-form parser ─────────────────────────────────────────────────────────

function parseFreeForm(text: string, keyword: string, fallbackPhone?: string): ParsingResult {
  // Strip the keyword from the start (case-insensitive)
  const kwRegex = new RegExp(`^${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i');
  const body = text.replace(kwRegex, '').trim();

  if (!body) {
    return { success: false, error: 'Message is empty after keyword' };
  }

  // Tokenise on whitespace
  const tokens = body.split(/\s+/);

  // 1. Find phone number
  const phoneResult = extractPhoneFromTokens(tokens);
  let phone = '';
  let rest: string[] = [];
  let name = '';

  if (phoneResult) {
    phone = phoneResult.phone;
    // Name = everything before the phone token
    const nameParts = tokens.slice(0, phoneResult.index);
    name = nameParts.join(' ').trim();
    rest = tokens.slice(phoneResult.index + 1);
  } else if (fallbackPhone) {
    // No phone in text, use fallback (strip 91/country code)
    phone = fallbackPhone.replace(/\D/g, '').replace(/^91/, '');
    
    // Guess name by finding the first token that looks like a date or time
    let dateOrTimeIndex = -1;
    for (let i = 0; i < tokens.length; i++) {
      if (tryParseDate(tokens[i], tokens[i+1]) || tryParseTime(tokens[i], tokens[i+1])) {
        dateOrTimeIndex = i;
        break;
      }
    }

    if (dateOrTimeIndex === -1) {
      // No date/time found, assume the whole body is the name (unlikely to work well but fallback)
      name = body;
      rest = [];
    } else {
      const nameParts = tokens.slice(0, dateOrTimeIndex);
      name = nameParts.join(' ').trim();
      rest = tokens.slice(dateOrTimeIndex);
    }
  } else {
    return { success: false, error: 'Could not extract phone number' };
  }

  if (!name || name.length < 2) {
    return { success: false, error: 'Could not extract patient name' };
  }

  // 2. Scan remaining tokens for time and date (order can vary)
  let time: string | null = null;
  let date: string | null = null;
  let i = 0;

  while (i < rest.length) {
    const tok = rest[i];
    const next = rest[i + 1];

    // Try date first (today/tomorrow/DD-MM-YYYY/DD MMM)
    if (!date) {
      const dr = tryParseDate(tok, next);
      if (dr) { date = dr.date; i += dr.consumed; continue; }
    }

    // Try time
    if (!time) {
      const tr = tryParseTime(tok, next);
      if (tr) { time = tr.time; i += tr.consumed; continue; }
    }

    i++;
  }

  if (!time) return { success: false, error: 'Could not extract appointment time' };
  if (!date) return { success: false, error: 'Could not extract appointment date' };

  return { success: true, data: { name, phone, date, time } };
}

// ─── Structured parser (legacy) ───────────────────────────────────────────────

function parseStructured(text: string, fallbackPhone?: string): ParsingResult {
  const name = extractName(text);
  let phone = extractPhone(text);
  const date = extractDate(text);
  const time = extractTime(text);

  if (!phone && fallbackPhone) {
    phone = fallbackPhone.replace(/\D/g, '').replace(/^91/, '');
  }

  const missing: string[] = [];
  if (!name) missing.push('name');
  if (!phone) missing.push('phone');
  if (!date) missing.push('date');
  if (!time) missing.push('time');

  if (missing.length > 0) {
    return { success: false, error: `Could not extract required fields: ${missing.join(', ')}` };
  }

  return { success: true, data: { name: name!, phone: phone!, date: date!, time: time! } };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Parse a WhatsApp message with an explicit keyword.
 * Fallback phone is used if no phone number is found in the message text.
 */
export function parseWhatsAppMessageWithKeyword(message: string, keyword: string, fallbackPhone?: string): ParsingResult {
  if (!message || typeof message !== 'string') {
    return { success: false, error: 'Message is required' };
  }
  const normalized = message.trim();
  
  const kwRegex = new RegExp(`(?:^|\\s)${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i');
  
  if (kwRegex.test(normalized)) {
    const match = normalized.match(kwRegex);
    if (match) {
      const startIndex = match.index! + (match[0].startsWith(' ') ? 1 : 0);
      const textToParse = normalized.substring(startIndex);
      return parseFreeForm(textToParse, keyword, fallbackPhone);
    }
  }

  if (/bookname\s*:/i.test(normalized)) {
    const rewritten = normalized.replace(/bookname\s*:/i, 'Name:');
    return parseStructured(rewritten, fallbackPhone);
  }
  return parseStructured(normalized, fallbackPhone);
}

/**
 * Parse a WhatsApp message.
 */
export function parseWhatsAppMessage(message: string, fallbackPhone?: string): ParsingResult {
  if (!message || typeof message !== 'string') {
    return { success: false, error: 'Message is required' };
  }

  const normalized = message.trim();

  let keyword = 'book';
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('onlineAppointmentsSettings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.whatsappWebKeyword) keyword = parsed.whatsappWebKeyword.trim();
      }
    }
  } catch { /* ignore */ }

  const kwRegex = new RegExp(`(?:^|\\s)${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i');
  
  if (kwRegex.test(normalized)) {
    const match = normalized.match(kwRegex);
    if (match) {
      const startIndex = match.index! + (match[0].startsWith(' ') ? 1 : 0);
      const textToParse = normalized.substring(startIndex);
      return parseFreeForm(textToParse, keyword, fallbackPhone);
    }
  }

  if (/bookname\s*:/i.test(normalized)) {
    const rewritten = normalized.replace(/bookname\s*:/i, 'Name:');
    return parseStructured(rewritten, fallbackPhone);
  }

  return parseStructured(normalized, fallbackPhone);
}

// ─── Legacy helpers (kept for structured parsing) ─────────────────────────────

export function extractName(text: string): string | null {
  if (!text) return null;
  let match = text.match(/(?:bookname|name)\s*:\s*([a-z\s]+?)(?=\s*(?:phone|date|time|service|notes|$))/i);
  if (match) {
    const name = match[1].trim();
    if (name.length >= 2) return name;
  }
  match = text.match(/^([a-z\s]+?)(?:\s+(?:phone|date|time|service|notes|[+\d]|\d{1,2}[-/]))/i);
  if (match) {
    const name = match[1].trim();
    if (name.length >= 2 && !name.match(/^\d+$/)) return name;
  }
  return null;
}

export function extractPhone(text: string): string | null {
  if (!text) return null;
  const countryCodeRegex = /\+\d{1,3}[\s\-]?(\d{10})/g;
  let match;
  const results: string[] = [];
  while ((match = countryCodeRegex.exec(text)) !== null) results.push(match[1]);
  const standaloneRegex = /(\d{4}[\s\-]?\d{3}[\s\-]?\d{3}|\d{10})/g;
  while ((match = standaloneRegex.exec(text)) !== null) {
    const digits = match[1].replace(/[\s\-]/g, '');
    if (digits.length === 10) results.push(digits);
  }
  if (results.length === 0) return null;
  return [...new Set(results)][0];
}

export function extractDate(text: string): string | null {
  if (!text) return null;
  const { parseDate } = require('./date-time-parser');
  let match = text.match(/date\s*:\s*([^\s]+)/i);
  if (match) {
    const result = parseDate(match[1]);
    if (result.success) return result.date;
  }
  const patterns = [
    /\d{1,2}[-/]\d{1,2}[-/]\d{4}/,
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}/,
    /\d{1,2}-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-\d{4}/i,
  ];
  for (const pattern of patterns) {
    match = text.match(pattern);
    if (match) {
      const result = parseDate(match[0]);
      if (result.success) return result.date;
    }
  }
  return null;
}

export function extractTime(text: string): string | null {
  if (!text) return null;
  const { parseTime } = require('./date-time-parser');
  let match = text.match(/time\s*:\s*([^\s]+(?:\s+(?:am|pm))?)/i);
  if (match) {
    const result = parseTime(match[1]);
    if (result.success) return result.time;
  }
  const patterns = [/\d{1,2}:\d{2}\s*(?:am|pm)/i, /\d{1,2}:\d{2}/];
  for (const pattern of patterns) {
    match = text.match(pattern);
    if (match) {
      const result = parseTime(match[0]);
      if (result.success) return result.time;
    }
  }
  return null;
}

export function normalizeMessage(message: string): string {
  if (!message) return '';
  let normalized = message.toLowerCase();
  normalized = normalized.replace(/[^\w\s\-:.,@+()]/gu, '');
  normalized = normalized.replace(/\s+/g, ' ');
  normalized = normalized.replace(/\n+/g, ' ');
  return normalized.trim();
}
