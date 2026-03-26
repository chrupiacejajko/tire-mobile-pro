'use client';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WorkSchedule {
  id: string;
  employee_id: string;
  start_at: string;            // ISO timestamp
  duration_minutes: number;
  end_at: string;              // ISO timestamp (generated column)
  notes: string | null;
  vehicle_id: string | null;
  region_id: string | null;
  vehicle_plate: string | null;
  region_name: string | null;
  region_color: string | null;
  // Location fields (optional)
  location_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
}

/** Slice of a shift for one specific day on the Gantt */
export interface DayShiftSlice {
  shift: WorkSchedule;
  dayStart: string;      // HH:MM effective start on this day
  dayEnd: string;        // HH:MM effective end on this day
  isFirstDay: boolean;
  isLastDay: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export const FALLBACK_COLOR = '#3b82f6';

/** Convert hex + alpha to rgba string */
export function hexAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function parseTimeToMinutes(t: string): number {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + (m || 0);
}
