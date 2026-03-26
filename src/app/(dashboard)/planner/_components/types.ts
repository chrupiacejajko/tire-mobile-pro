// ── Planner — Shared Types & Config ──────────────────────────────────────────

import type { DispatchOrderBase } from '@/lib/types/dispatch-order';

// ── Data interfaces ─────────────────────────────────────────────────────────

/** Lightweight subset of DispatchOrderBase for unassigned orders in the planner */
export interface UnassignedOrder extends Pick<
  DispatchOrderBase,
  'id' | 'status' | 'priority' | 'address' | 'lat' | 'lng' | 'client_name'
> {
  scheduling_type: string | null;
  scheduled_time_start: string | null;
  time_window: string | null;
  services: string[];
}

export interface Stop {
  order_id: string;
  sequence: number;
  client_name: string;
  address: string;
  lat: number;
  lng: number;
  services: string[];
  time_window: string | null;
  time_window_label: string | null;
  time_window_color: string | null;
  time_window_status: 'ok' | 'tight' | 'late' | 'early_wait' | 'no_window';
  travel_minutes: number;
  arrival_time: string;
  wait_minutes: number;
  service_start: string;
  service_duration_minutes: number;
  departure_time: string;
  delay_minutes: number;
  flexibility_minutes: number;
  order_status: string;
  scheduled_time_start?: string | null;
}

export interface RouteScore {
  score: number;
  on_time: number;
  tight: number;
  late: number;
  total_km: number;
  total_duration_min: number;
  finish_time: string;
}

export interface EmployeeRoute {
  employee_id: string;
  employee_name: string;
  plate: string | null;
  current_position: { lat: number; lng: number; status: string | null } | null;
  schedule: Stop[];
  total_orders: number;
  total_km: number;
  score: RouteScore;
  google_maps_url: string | null;
  start_time: string;
}

export interface PlannerData {
  date: string;
  routes: EmployeeRoute[];
  unassigned: UnassignedOrder[];
  summary: {
    total_orders: number;
    assigned: number;
    unassigned: number;
    active_employees: number;
  };
}

// ── Gantt-specific types ────────────────────────────────────────────────────

export interface GanttDragState {
  orderId: string;
  employeeId: string;
  startX: number;
  startY: number;
  origLeft: number;
  origRow: string;
  isUnassigned?: boolean;
  blockWidth?: number;  // px width of the dragged block — used for ghost preview
}

export interface GanttContextMenu {
  x: number;
  y: number;
  orderId: string;
  employeeId: string;
  showAssignSub?: boolean;
}

export interface GanttTooltip {
  x: number;
  y: number;
  stop: Stop;
  employeeName: string;
}

// ── Status styling ──────────────────────────────────────────────────────────

export const STATUS_STYLES: Record<string, {
  bg: string;
  border: string;
  dot: string;
  text: string;
  label: string;
}> = {
  ok:         { bg: 'bg-emerald-50',  border: 'border-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Na czas' },
  early_wait: { bg: 'bg-blue-50',     border: 'border-blue-200',   dot: 'bg-blue-400',    text: 'text-blue-700',    label: 'Czeka' },
  tight:      { bg: 'bg-amber-50',    border: 'border-amber-200',  dot: 'bg-amber-500',   text: 'text-amber-700',   label: 'Ciasno' },
  late:       { bg: 'bg-red-50',      border: 'border-red-200',    dot: 'bg-red-500',     text: 'text-red-700',     label: 'Za późno' },
  no_window:  { bg: 'bg-gray-50',     border: 'border-gray-200',   dot: 'bg-gray-400',    text: 'text-gray-600',    label: 'Brak okna' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}
