// ── Calendar Dispatch Board — Shared Types & Config ──────────────────────────

import { CircleAlert, Clock, CalendarRange, Shuffle, type LucideIcon } from 'lucide-react';

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface CalendarOrder {
  id: string;
  client_name: string;
  client_phone: string;
  service_names: string;
  scheduled_date: string;
  scheduled_time_start: string;
  scheduled_time_end: string;
  status: string;
  priority: string;
  address: string;
  total_price: number;
  employee_id: string | null;
  employee_name: string | null;
  employee_color: string;
  // scheduling fields (migration 012)
  scheduling_type: SchedulingType;
  time_window_start: string | null;
  time_window_end: string | null;
  flexibility_minutes: number;
  auto_assigned: boolean;
  estimated_arrival: string | null;
  source: string | null;
}

export interface EmployeeCol {
  id: string;
  name: string;
  color: string;
  region: string;
}

export interface WorkScheduleBlock {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_night_shift: boolean;
}

export interface ClientOption {
  id: string;
  name: string;
  phone: string;
  address: string;
  city: string;
}

export interface ServiceOption {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

export type SchedulingType = 'asap' | 'fixed_time' | 'time_window' | 'flexible';
export type CalendarView = 'team' | 'timeline' | 'week' | 'month';

// ── Constants ────────────────────────────────────────────────────────────────

export const HOURS = Array.from({ length: 16 }, (_, i) => {
  const h = i + 6;
  return `${h.toString().padStart(2, '0')}:00`;
});
export const GRID_START_HOUR = 6;
export const ROW_H = 64; // Default — overridden by density preset
export const DAYS_PL = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz'];

// ── Density Presets ─────────────────────────────────────────────────────────
export type DensityLevel = 'compact' | 'normal' | 'comfortable';

export const DENSITY_CONFIG: Record<DensityLevel, { label: string; rowHeight: number; icon: string }> = {
  compact:     { label: 'Kompaktowy', rowHeight: 48, icon: '▬' },
  normal:      { label: 'Normalny',   rowHeight: 64, icon: '▭' },
  comfortable: { label: 'Wygodny',    rowHeight: 80, icon: '▯' },
};

// ── Status Config ────────────────────────────────────────────────────────────

export const statusConfig: Record<string, {
  bg: string;
  bgLight: string;
  border: string;
  label: string;
  dot: string;
  text: string;
}> = {
  new:         { bg: 'bg-blue-500',    bgLight: 'bg-blue-50',    border: 'border-l-blue-500',    label: 'Nowe',         dot: 'bg-blue-500',    text: 'text-blue-700' },
  assigned:    { bg: 'bg-amber-500',   bgLight: 'bg-amber-50',   border: 'border-l-amber-500',   label: 'Przydzielone', dot: 'bg-amber-500',   text: 'text-amber-700' },
  in_progress: { bg: 'bg-violet-500',  bgLight: 'bg-violet-50',  border: 'border-l-violet-500',  label: 'W trakcie',    dot: 'bg-violet-500',  text: 'text-violet-700' },
  in_transit:  { bg: 'bg-indigo-500',  bgLight: 'bg-indigo-50',  border: 'border-l-indigo-500',  label: 'W drodze',     dot: 'bg-indigo-500',  text: 'text-indigo-700' },
  completed:   { bg: 'bg-emerald-500', bgLight: 'bg-emerald-50', border: 'border-l-emerald-500', label: 'Ukończone',    dot: 'bg-emerald-500', text: 'text-emerald-700' },
  cancelled:   { bg: 'bg-gray-400',    bgLight: 'bg-gray-50',    border: 'border-l-gray-400',    label: 'Anulowane',    dot: 'bg-gray-400',    text: 'text-gray-500' },
};

// ── Scheduling Type Config ───────────────────────────────────────────────────

export interface SchedulingTypeOption {
  type: SchedulingType;
  label: string;
  shortLabel: string;
  Icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor: string;
  desc: string;
}

export const schedulingTypeConfig: Record<SchedulingType, SchedulingTypeOption> = {
  asap: {
    type: 'asap',
    label: 'Na już (ASAP)',
    shortLabel: 'ASAP',
    Icon: CircleAlert,
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    desc: 'Dzisiaj, jak najszybciej',
  },
  fixed_time: {
    type: 'fixed_time',
    label: 'Konkretna godzina',
    shortLabel: 'Stała',
    Icon: Clock,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    desc: 'Dokładny czas ±tolerancja',
  },
  time_window: {
    type: 'time_window',
    label: 'Okno czasowe',
    shortLabel: 'Okno',
    Icon: CalendarRange,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    desc: 'Klient akceptuje przedział',
  },
  flexible: {
    type: 'flexible',
    label: 'Elastyczne',
    shortLabel: 'Flex',
    Icon: Shuffle,
    color: 'text-violet-500',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
    desc: 'System dopasuje optymalnie',
  },
};

export const SCHEDULING_TYPE_OPTIONS = Object.values(schedulingTypeConfig);

// ── Time Window Presets ──────────────────────────────────────────────────────

export const WINDOW_PRESETS: Record<string, { label: string; start: string; end: string }> = {
  morning:   { label: 'Rano (8–12)',       start: '08:00', end: '12:00' },
  afternoon: { label: 'Popołudnie (12–16)', start: '12:00', end: '16:00' },
  evening:   { label: 'Wieczór (16–20)',   start: '16:00', end: '20:00' },
};

export const FLEXIBILITY_OPTIONS = [0, 15, 30, 60] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse "HH:MM" to fractional hours */
export function timeToHours(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h + (m || 0) / 60;
}

/** Duration between two HH:MM strings in fractional hours */
export function getDuration(start: string, end: string): number {
  return Math.max(timeToHours(end) - timeToHours(start), 0.33);
}

/** Format "HH:MM:SS" or "HH:MM" to "HH:MM" */
export function formatTime(t: string | null | undefined): string {
  if (!t) return '';
  return t.slice(0, 5);
}

/** Today as YYYY-MM-DD */
export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ── Overlap layout algorithm (CARJOY-style side-by-side) ─────────────────────

export interface LayoutSlot {
  order: CalendarOrder;
  columnIndex: number;
  totalColumns: number;
}

/** Check if an order is a time_window background range */
function isWindowRange(event: CalendarOrder): boolean {
  return event.scheduling_type === 'time_window' && !!event.time_window_start && !!event.time_window_end;
}

/**
 * Split orders into two layers:
 * - Layer 2: time_window ranges (rendered full-width as background)
 * - Layer 3: booking cards (side-by-side overlap layout)
 */
export function splitOrderLayers(events: CalendarOrder[]): {
  windowRanges: CalendarOrder[];
  bookingSlots: LayoutSlot[];
} {
  const windowRanges: CalendarOrder[] = [];
  const bookings: CalendarOrder[] = [];

  for (const event of events) {
    if (isWindowRange(event)) {
      windowRanges.push(event);
    } else {
      bookings.push(event);
    }
  }

  return {
    windowRanges,
    bookingSlots: computeOverlapLayout(bookings),
  };
}

/**
 * Compute side-by-side layout for BOOKING cards only.
 * Time window orders are excluded — they render as background ranges.
 */
export function computeOverlapLayout(events: CalendarOrder[]): LayoutSlot[] {
  if (events.length === 0) return [];

  // Sort by start time, then by duration (longer first for better column packing)
  const sorted = [...events].sort((a, b) => {
    const aStart = timeToHours(a.scheduled_time_start);
    const bStart = timeToHours(b.scheduled_time_start);
    if (aStart !== bStart) return aStart - bStart;
    const aDur = timeToHours(a.scheduled_time_end) - aStart;
    const bDur = timeToHours(b.scheduled_time_end) - bStart;
    return bDur - aDur; // longer first
  });

  // Track column assignments
  const columns: { endHour: number }[] = [];
  const layoutMap = new Map<string, { columnIndex: number }>();

  for (const event of sorted) {
    const startH = timeToHours(event.scheduled_time_start);
    const endH = timeToHours(event.scheduled_time_end);

    // Find the first column that's free
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      if (columns[col].endHour <= startH) {
        columns[col].endHour = endH;
        layoutMap.set(event.id, { columnIndex: col });
        placed = true;
        break;
      }
    }
    if (!placed) {
      layoutMap.set(event.id, { columnIndex: columns.length });
      columns.push({ endHour: endH });
    }
  }

  // Compute totalColumns per overlapping cluster
  const result: LayoutSlot[] = [];
  for (const event of sorted) {
    const startH = timeToHours(event.scheduled_time_start);
    const endH = timeToHours(event.scheduled_time_end);
    const info = layoutMap.get(event.id)!;

    let maxCol = info.columnIndex;
    for (const other of sorted) {
      if (other.id === event.id) continue;
      const oStart = timeToHours(other.scheduled_time_start);
      const oEnd = timeToHours(other.scheduled_time_end);
      if (oStart < endH && oEnd > startH) {
        maxCol = Math.max(maxCol, layoutMap.get(other.id)!.columnIndex);
      }
    }

    result.push({
      order: event,
      columnIndex: info.columnIndex,
      totalColumns: maxCol + 1,
    });
  }

  return result;
}
