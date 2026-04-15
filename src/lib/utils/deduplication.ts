/**
 * Deduplication utility for patient records
 * Removes duplicate patient records by ID, keeping only the first occurrence
 */

export interface PatientRecord {
  id: string;
  [key: string]: any;
}

/**
 * Deduplicates an array of patient records by ID
 * Keeps only the first occurrence of each patient ID
 * Maintains insertion order
 *
 * @param patients - Array of patient records that may contain duplicates
 * @returns Deduplicated array with unique patient IDs
 *
 * @example
 * const results = [
 *   { id: "p1", firstName: "John" },
 *   { id: "p1", firstName: "John" }, // duplicate
 *   { id: "p2", firstName: "Jane" }
 * ];
 * const deduped = deduplicatePatients(results);
 * // Returns: [{ id: "p1", firstName: "John" }, { id: "p2", firstName: "Jane" }]
 */
export function deduplicatePatients<T extends PatientRecord>(patients: T[]): T[] {
  if (!patients || patients.length === 0) {
    return [];
  }

  const seenIds = new Set<string>();
  const deduplicated: T[] = [];

  for (const patient of patients) {
    // Handle null/undefined IDs gracefully
    if (!patient.id) {
      deduplicated.push(patient);
      continue;
    }

    // Keep only first occurrence of each ID
    if (!seenIds.has(patient.id)) {
      seenIds.add(patient.id);
      deduplicated.push(patient);
    }
  }

  return deduplicated;
}
