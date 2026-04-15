import { parseDate, parseTime, isValidFutureDate, isValidTimeFormat } from '../lib/date-time-parser';

describe('Date Time Parser', () => {
  describe('parseDate', () => {
    describe('DD-MM-YYYY format', () => {
      it('should parse valid DD-MM-YYYY date', () => {
        const result = parseDate('15-03-2026');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2026-03-15');
      });

      it('should parse single digit day and month', () => {
        const result = parseDate('5-3-2026');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2026-03-05');
      });

      it('should reject invalid day (32)', () => {
        const result = parseDate('32-03-2026');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Date format not recognized');
      });

      it('should reject invalid month (13)', () => {
        const result = parseDate('15-13-2026');
        expect(result.success).toBe(false);
      });

      it('should reject invalid month (0)', () => {
        const result = parseDate('15-00-2026');
        expect(result.success).toBe(false);
      });

      it('should reject invalid day (0)', () => {
        const result = parseDate('00-03-2026');
        expect(result.success).toBe(false);
      });

      it('should handle February 29 on leap year', () => {
        const result = parseDate('29-02-2024');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2024-02-29');
      });

      it('should reject February 29 on non-leap year', () => {
        const result = parseDate('29-02-2025');
        expect(result.success).toBe(false);
      });

      it('should handle month boundaries - April 30', () => {
        const result = parseDate('30-04-2026');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2026-04-30');
      });

      it('should reject April 31', () => {
        const result = parseDate('31-04-2026');
        expect(result.success).toBe(false);
      });
    });

    describe('DD/MM/YYYY format', () => {
      it('should parse valid DD/MM/YYYY date', () => {
        const result = parseDate('15/03/2026');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2026-03-15');
      });

      it('should parse single digit day and month', () => {
        const result = parseDate('5/3/2026');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2026-03-05');
      });

      it('should reject invalid day (32)', () => {
        const result = parseDate('32/03/2026');
        expect(result.success).toBe(false);
      });

      it('should handle February 29 on leap year', () => {
        const result = parseDate('29/02/2024');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2024-02-29');
      });

      it('should reject February 29 on non-leap year', () => {
        const result = parseDate('29/02/2025');
        expect(result.success).toBe(false);
      });
    });

    describe('YYYY-MM-DD format', () => {
      it('should parse valid YYYY-MM-DD date', () => {
        const result = parseDate('2026-03-15');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2026-03-15');
      });

      it('should parse with single digit day and month', () => {
        const result = parseDate('2026-3-5');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2026-03-05');
      });

      it('should reject invalid day (32)', () => {
        const result = parseDate('2026-03-32');
        expect(result.success).toBe(false);
      });

      it('should handle February 29 on leap year', () => {
        const result = parseDate('2024-02-29');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2024-02-29');
      });

      it('should reject February 29 on non-leap year', () => {
        const result = parseDate('2025-02-29');
        expect(result.success).toBe(false);
      });
    });

    describe('DD-MMM-YYYY format', () => {
      it('should parse valid DD-MMM-YYYY date with uppercase month', () => {
        const result = parseDate('15-Mar-2026');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2026-03-15');
      });

      it('should parse valid DD-MMM-YYYY date with lowercase month', () => {
        const result = parseDate('15-mar-2026');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2026-03-15');
      });

      it('should parse all months correctly', () => {
        const months = [
          { abbr: 'Jan', month: '01' },
          { abbr: 'Feb', month: '02' },
          { abbr: 'Mar', month: '03' },
          { abbr: 'Apr', month: '04' },
          { abbr: 'May', month: '05' },
          { abbr: 'Jun', month: '06' },
          { abbr: 'Jul', month: '07' },
          { abbr: 'Aug', month: '08' },
          { abbr: 'Sep', month: '09' },
          { abbr: 'Oct', month: '10' },
          { abbr: 'Nov', month: '11' },
          { abbr: 'Dec', month: '12' },
        ];

        months.forEach(({ abbr, month }) => {
          const result = parseDate(`15-${abbr}-2026`);
          expect(result.success).toBe(true);
          expect(result.date).toBe(`2026-${month}-15`);
        });
      });

      it('should reject invalid month abbreviation', () => {
        const result = parseDate('15-Xyz-2026');
        expect(result.success).toBe(false);
      });

      it('should handle February 29 on leap year', () => {
        const result = parseDate('29-Feb-2024');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2024-02-29');
      });

      it('should reject February 29 on non-leap year', () => {
        const result = parseDate('29-Feb-2025');
        expect(result.success).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should reject empty string', () => {
        const result = parseDate('');
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject null', () => {
        const result = parseDate(null as any);
        expect(result.success).toBe(false);
      });

      it('should reject undefined', () => {
        const result = parseDate(undefined as any);
        expect(result.success).toBe(false);
      });

      it('should reject non-string input', () => {
        const result = parseDate(123 as any);
        expect(result.success).toBe(false);
      });

      it('should handle whitespace around date', () => {
        const result = parseDate('  15-03-2026  ');
        expect(result.success).toBe(true);
        expect(result.date).toBe('2026-03-15');
      });

      it('should reject invalid format', () => {
        const result = parseDate('2026/03/15');
        expect(result.success).toBe(false);
      });

      it('should reject text that is not a date', () => {
        const result = parseDate('hello world');
        expect(result.success).toBe(false);
      });

      it('should reject partial dates', () => {
        const result = parseDate('15-03');
        expect(result.success).toBe(false);
      });

      it('should reject dates with extra characters', () => {
        const result = parseDate('15-03-2026 extra');
        expect(result.success).toBe(false);
      });
    });
  });

  describe('parseTime', () => {
    describe('HH:MM format', () => {
      it('should parse valid HH:MM time', () => {
        const result = parseTime('14:30');
        expect(result.success).toBe(true);
        expect(result.time).toBe('14:30');
      });

      it('should parse midnight', () => {
        const result = parseTime('00:00');
        expect(result.success).toBe(true);
        expect(result.time).toBe('00:00');
      });

      it('should parse 23:59', () => {
        const result = parseTime('23:59');
        expect(result.success).toBe(true);
        expect(result.time).toBe('23:59');
      });

      it('should parse single digit hour', () => {
        const result = parseTime('2:30');
        expect(result.success).toBe(true);
        expect(result.time).toBe('02:30');
      });

      it('should reject invalid hour (24)', () => {
        const result = parseTime('24:00');
        expect(result.success).toBe(false);
      });

      it('should reject invalid minute (60)', () => {
        const result = parseTime('14:60');
        expect(result.success).toBe(false);
      });

      it('should reject negative hour', () => {
        const result = parseTime('-1:30');
        expect(result.success).toBe(false);
      });

      it('should reject negative minute', () => {
        const result = parseTime('14:-30');
        expect(result.success).toBe(false);
      });
    });

    describe('HH:MM AM/PM format', () => {
      it('should parse 2:30 PM', () => {
        const result = parseTime('2:30 PM');
        expect(result.success).toBe(true);
        expect(result.time).toBe('14:30');
      });

      it('should parse 2:30 AM', () => {
        const result = parseTime('2:30 AM');
        expect(result.success).toBe(true);
        expect(result.time).toBe('02:30');
      });

      it('should parse 12:00 PM (noon)', () => {
        const result = parseTime('12:00 PM');
        expect(result.success).toBe(true);
        expect(result.time).toBe('12:00');
      });

      it('should parse 12:00 AM (midnight)', () => {
        const result = parseTime('12:00 AM');
        expect(result.success).toBe(true);
        expect(result.time).toBe('00:00');
      });

      it('should parse 12:30 PM', () => {
        const result = parseTime('12:30 PM');
        expect(result.success).toBe(true);
        expect(result.time).toBe('12:30');
      });

      it('should parse 12:30 AM', () => {
        const result = parseTime('12:30 AM');
        expect(result.success).toBe(true);
        expect(result.time).toBe('00:30');
      });

      it('should parse 11:59 PM', () => {
        const result = parseTime('11:59 PM');
        expect(result.success).toBe(true);
        expect(result.time).toBe('23:59');
      });

      it('should parse 1:00 AM', () => {
        const result = parseTime('1:00 AM');
        expect(result.success).toBe(true);
        expect(result.time).toBe('01:00');
      });

      it('should parse lowercase am/pm', () => {
        const result = parseTime('2:30 pm');
        expect(result.success).toBe(true);
        expect(result.time).toBe('14:30');
      });

      it('should parse mixed case am/pm', () => {
        const result = parseTime('2:30 Pm');
        expect(result.success).toBe(true);
        expect(result.time).toBe('14:30');
      });

      it('should reject hour 0 in 12-hour format', () => {
        const result = parseTime('0:30 PM');
        expect(result.success).toBe(false);
      });

      it('should reject hour 13 in 12-hour format', () => {
        const result = parseTime('13:30 PM');
        expect(result.success).toBe(false);
      });

      it('should reject invalid minute in AM/PM format', () => {
        const result = parseTime('2:60 PM');
        expect(result.success).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should reject empty string', () => {
        const result = parseTime('');
        expect(result.success).toBe(false);
      });

      it('should reject null', () => {
        const result = parseTime(null as any);
        expect(result.success).toBe(false);
      });

      it('should reject undefined', () => {
        const result = parseTime(undefined as any);
        expect(result.success).toBe(false);
      });

      it('should reject non-string input', () => {
        const result = parseTime(123 as any);
        expect(result.success).toBe(false);
      });

      it('should handle whitespace around time', () => {
        const result = parseTime('  14:30  ');
        expect(result.success).toBe(true);
        expect(result.time).toBe('14:30');
      });

      it('should reject invalid format', () => {
        const result = parseTime('14-30');
        expect(result.success).toBe(false);
      });

      it('should reject text that is not a time', () => {
        const result = parseTime('hello world');
        expect(result.success).toBe(false);
      });

      it('should reject time with extra characters', () => {
        const result = parseTime('14:30 extra');
        expect(result.success).toBe(false);
      });

      it('should reject single digit minute', () => {
        const result = parseTime('14:5');
        expect(result.success).toBe(false);
      });
    });
  });

  describe('isValidFutureDate', () => {
    it('should accept today', () => {
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(isValidFutureDate(dateStr)).toBe(true);
    });

    it('should accept tomorrow', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
      expect(isValidFutureDate(dateStr)).toBe(true);
    });

    it('should accept future date', () => {
      expect(isValidFutureDate('2026-03-15')).toBe(true);
    });

    it('should reject yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      expect(isValidFutureDate(dateStr)).toBe(false);
    });

    it('should reject past date', () => {
      expect(isValidFutureDate('2020-03-15')).toBe(false);
    });

    it('should reject invalid date format', () => {
      expect(isValidFutureDate('15-03-2026')).toBe(false);
    });

    it('should reject invalid date', () => {
      expect(isValidFutureDate('2026-02-29')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidFutureDate('')).toBe(false);
    });

    it('should reject null', () => {
      expect(isValidFutureDate(null as any)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isValidFutureDate(undefined as any)).toBe(false);
    });

    it('should reject non-string input', () => {
      expect(isValidFutureDate(123 as any)).toBe(false);
    });

    it('should reject invalid month', () => {
      expect(isValidFutureDate('2026-13-15')).toBe(false);
    });

    it('should reject invalid day', () => {
      expect(isValidFutureDate('2026-03-32')).toBe(false);
    });
  });

  describe('isValidTimeFormat', () => {
    it('should accept valid time 14:30', () => {
      expect(isValidTimeFormat('14:30')).toBe(true);
    });

    it('should accept midnight 00:00', () => {
      expect(isValidTimeFormat('00:00')).toBe(true);
    });

    it('should accept 23:59', () => {
      expect(isValidTimeFormat('23:59')).toBe(true);
    });

    it('should reject hour 24', () => {
      expect(isValidTimeFormat('24:00')).toBe(false);
    });

    it('should reject minute 60', () => {
      expect(isValidTimeFormat('14:60')).toBe(false);
    });

    it('should reject single digit hour', () => {
      expect(isValidTimeFormat('2:30')).toBe(false);
    });

    it('should reject single digit minute', () => {
      expect(isValidTimeFormat('14:5')).toBe(false);
    });

    it('should reject invalid format', () => {
      expect(isValidTimeFormat('14-30')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidTimeFormat('')).toBe(false);
    });

    it('should reject null', () => {
      expect(isValidTimeFormat(null as any)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isValidTimeFormat(undefined as any)).toBe(false);
    });

    it('should reject non-string input', () => {
      expect(isValidTimeFormat(123 as any)).toBe(false);
    });

    it('should reject time with AM/PM', () => {
      expect(isValidTimeFormat('2:30 PM')).toBe(false);
    });

    it('should reject text', () => {
      expect(isValidTimeFormat('hello')).toBe(false);
    });
  });
});
