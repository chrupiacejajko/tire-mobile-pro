// ── Shared Base Interface for Dispatch Orders ────────────────────────────────
//
// Common fields shared across CalendarOrder, OrderRow, UnassignedOrder, etc.
// Module-specific interfaces extend this base with their own extra fields.

export interface DispatchOrderBase {
  id: string;
  client_id: string;
  client_name: string;
  employee_id: string | null;
  region_id: string | null;
  status: string;
  priority: string;
  scheduled_date: string;
  scheduled_time_start: string;
  scheduled_time_end: string;
  scheduling_type: 'asap' | 'fixed_time' | 'time_window' | 'flexible';
  flexibility_minutes: number;
  time_window_start: string | null;
  time_window_end: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  services: Array<{ service_id: string; name: string; price: number; quantity: number }>;
  notes: string | null;
  dispatcher_notes: string | null;
  source: string;
  internal_task_type: string | null;
  auto_assigned: boolean;
}
