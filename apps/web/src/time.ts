/**
 * Parsing what Postgres sends.
 *
 * It returns "2026-04-19 17:00:00+00", which is not ISO 8601 twice over: a space
 * where the T belongs, and an offset with only its hours. `new Date` takes that
 * and returns Invalid Date rather than throwing, so the failure arrives later as
 * NaN coordinates in a chart path, which looks like a charting bug and is not.
 *
 * This shipped once. It has a test now.
 */
export function parseTimestamp(value: string): Date {
  return new Date(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
}
