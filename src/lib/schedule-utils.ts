/**
 * Schedule utilities for the new shift model (start_at + duration_minutes).
 * End time is NEVER stored — always computed.
 */

/** Format minutes as HH:MM */
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Parse HH:MM to minutes since midnight */
export function parseTime(hhmm: string): number {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Get the start of a day as Date (local TZ) */
function startOfDay(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

/** Get the end of a day as Date (local TZ) */
function endOfDay(dateStr: string): Date {
  return new Date(dateStr + 'T23:59:59');
}

/** Format Date to YYYY-MM-DD */
export function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * For a given shift (start_at + duration_minutes), return the effective
 * start and end HH:MM for a specific date. Returns null if the shift
 * doesn't cover that date at all.
 */
export function getShiftTimesForDate(
  startAt: string | Date,
  durationMinutes: number,
  targetDate: string,
): { start: string; end: string } | null {
  const shiftStart = new Date(startAt);
  const shiftEnd = new Date(shiftStart.getTime() + durationMinutes * 60_000);
  const dayStart = startOfDay(targetDate);
  const dayEnd = endOfDay(targetDate);

  // No overlap
  if (shiftEnd <= dayStart || shiftStart > dayEnd) return null;

  // Effective start on this day
  const effectiveStart = shiftStart > dayStart ? shiftStart : dayStart;
  // Effective end on this day
  const effectiveEnd = shiftEnd < dayEnd ? shiftEnd : dayEnd;

  const startMinutes = effectiveStart.getHours() * 60 + effectiveStart.getMinutes();
  const endMinutes = effectiveEnd.getHours() * 60 + effectiveEnd.getMinutes();

  // If shift ends exactly at midnight (00:00 next day), show as 23:59
  const endStr = endMinutes === 0 && effectiveEnd.getTime() === dayEnd.getTime() + 1000
    ? '23:59'
    : formatTime(endMinutes || (effectiveEnd > dayEnd ? 1439 : endMinutes));

  return {
    start: formatTime(startMinutes),
    end: endMinutes === 0 && effectiveEnd >= dayEnd ? '23:59' : formatTime(endMinutes),
  };
}

/**
 * Get all dates that a shift covers (as YYYY-MM-DD strings).
 */
export function getShiftDays(startAt: string | Date, durationMinutes: number): string[] {
  const start = new Date(startAt);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const days: string[] = [];

  const current = new Date(start);
  current.setHours(0, 0, 0, 0); // start of first day

  while (current < end) {
    days.push(toDateStr(current));
    current.setDate(current.getDate() + 1);
  }

  return days;
}

/**
 * Check if a shift overlaps with a given date range.
 */
export function shiftOverlapsRange(
  startAt: string | Date,
  durationMinutes: number,
  rangeFrom: string,
  rangeTo: string,
): boolean {
  const shiftStart = new Date(startAt);
  const shiftEnd = new Date(shiftStart.getTime() + durationMinutes * 60_000);
  const from = startOfDay(rangeFrom);
  const to = endOfDay(rangeTo);

  return shiftStart <= to && shiftEnd >= from;
}

/**
 * Compute end_at from start_at + duration_minutes.
 */
export function computeEndAt(startAt: string | Date, durationMinutes: number): Date {
  const start = new Date(startAt);
  return new Date(start.getTime() + durationMinutes * 60_000);
}

/**
 * Format a shift for display: "26.03 07:00 → 28.03 07:00 (48h)"
 */
export function formatShiftRange(startAt: string | Date, durationMinutes: number): string {
  const start = new Date(startAt);
  const end = computeEndAt(start, durationMinutes);
  const hours = Math.round(durationMinutes / 60);

  const fmtDate = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  const fmtTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  return `${fmtDate(start)} ${fmtTime(start)} → ${fmtDate(end)} ${fmtTime(end)} (${hours}h)`;
}
