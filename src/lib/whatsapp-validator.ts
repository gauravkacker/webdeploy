/**
 * WhatsApp Message Validator
 * Validates extracted appointment data
 */

import type { ParsedAppointment } from './whatsapp-parser';

/**
 * Result of validating a single field
 */
export interface FieldValidationResult {
  valid: boolean;
  error?: string;         // Specific error message if validation failed
}

/**
 * Result of validating a complete parsed appointment
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];       // Array of specific error messages for each failed field
}

/**
 * Validate a complete parsed appointment
 * @param data - The parsed appointment to validate
 * @returns ValidationResult with valid flag and error messages
 */
export function validateParsedAppointment(data: ParsedAppointment): ValidationResult {
  const errors: string[] = [];

  // Validate name
  const nameValidation = validateName(data.name);
  if (!nameValidation.valid && nameValidation.error) {
    errors.push(nameValidation.error);
  }

  // Validate phone
  const phoneValidation = validatePhone(data.phone);
  if (!phoneValidation.valid && phoneValidation.error) {
    errors.push(phoneValidation.error);
  }

  // Validate date
  const dateValidation = validateDate(data.date);
  if (!dateValidation.valid && dateValidation.error) {
    errors.push(dateValidation.error);
  }

  // Validate time
  const timeValidation = validateTime(data.time);
  if (!timeValidation.valid && timeValidation.error) {
    errors.push(timeValidation.error);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate patient name
 * @param name - Patient name to validate
 * @returns FieldValidationResult with valid flag and error message
 */
export function validateName(name: string): FieldValidationResult {
  if (!name || typeof name !== 'string') {
    return {
      valid: false,
      error: 'Name is required',
    };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'Name cannot be empty',
    };
  }

  if (trimmed.length < 2) {
    return {
      valid: false,
      error: 'Name must be at least 2 characters',
    };
  }

  return {
    valid: true,
  };
}

/**
 * Validate phone number
 * @param phone - Phone number to validate (should be 10 digits)
 * @returns FieldValidationResult with valid flag and error message
 */
export function validatePhone(phone: string): FieldValidationResult {
  if (!phone || typeof phone !== 'string') {
    return {
      valid: false,
      error: 'Phone number is required',
    };
  }

  const trimmed = phone.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'Phone number cannot be empty',
    };
  }

  // Remove any formatting characters
  const digits = trimmed.replace(/[\s\-()]/g, '');

  if (digits.length !== 10) {
    return {
      valid: false,
      error: `Phone number must be exactly 10 digits (got ${digits.length})`,
    };
  }

  if (!/^\d{10}$/.test(digits)) {
    return {
      valid: false,
      error: 'Phone number must contain only digits',
    };
  }

  return {
    valid: true,
  };
}

/**
 * Validate appointment date
 * @param date - Date to validate (YYYY-MM-DD format)
 * @returns FieldValidationResult with valid flag and error message
 */
export function validateDate(date: string): FieldValidationResult {
  if (!date || typeof date !== 'string') {
    return {
      valid: false,
      error: 'Date is required',
    };
  }

  const trimmed = date.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'Date cannot be empty',
    };
  }

  // Validate format is YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Date must be in YYYY-MM-DD format',
    };
  }

  // Import isValidFutureDate from date-time-parser
  const { isValidFutureDate } = require('./date-time-parser');

  if (!isValidFutureDate(trimmed)) {
    return {
      valid: false,
      error: 'Date must be today or in the future',
    };
  }

  return {
    valid: true,
  };
}

/**
 * Validate appointment time
 * @param time - Time to validate (HH:MM format)
 * @returns FieldValidationResult with valid flag and error message
 */
export function validateTime(time: string): FieldValidationResult {
  if (!time || typeof time !== 'string') {
    return {
      valid: false,
      error: 'Time is required',
    };
  }

  const trimmed = time.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'Time cannot be empty',
    };
  }

  // Import isValidTimeFormat from date-time-parser
  const { isValidTimeFormat } = require('./date-time-parser');

  if (!isValidTimeFormat(trimmed)) {
    return {
      valid: false,
      error: 'Time must be in HH:MM format (00:00-23:59)',
    };
  }

  return {
    valid: true,
  };
}
