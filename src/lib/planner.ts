/**
 * Planner utilities — schedule building, time window validation, Google Maps URL generation.
 */

// ── Time helpers ──────────────────────────────────────────────────────────────

export function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ── Time windows ──────────────────────────────────────────────────────────────

export const TIME_WINDOWS: Record<string, { label: string; start: number; end: number; color: string }> = {
  morning:   { label: '08:00–12:00', start:  8 * 60, end: 12 * 60, color: '#F59E0B' },
  afternoon: { label: '12:00–16:00', start: 12 * 60, end: 16 * 60, color: '#3B82F6' },
  evening:   { label: '16:00–20:00', start: 16 * 60, end: 20 * 60, color: '#8B5CF6' },
};

export type TimeWindowStatus = 'ok' | 'tight' | 'late' | 'early_wait' | 'no_window';

export function getTimeWindowStatus(
  arrivalMinutes: number,
  serviceDurationMinutes: number,
  windowId: string | null,
): TimeWindowStatus {
  if (!windowId || !TIME_WINDOWS[windowId]) return 'no_window';
  const { start, end } = TIME_WINDOWS[windowId];
  const serviceEnd = Math.max(arrivalMinutes, start) + serviceDurationMinutes;
  if (arrivalMinutes > end) return 'late';
  if (serviceEnd > end) return 'tight';
  if (arrivalMinutes < start) return 'early_wait';
  return 'ok';
}

// ── Google Maps URL builder ───────────────────────────────────────────────────

export interface LatLng { lat: number; lng: number }

/**
 * Builds a Google Maps Directions URL for a multi-stop route.
 * Works with up to ~23 waypoints (Google Maps limit).
 */
export function buildGoogleMapsUrl(origin: LatLng, stops: LatLng[]): string {
  if (!stops.length) return '';

  // Path-style URL: /maps/dir/lat,lng/lat,lng/...  — unlimited stops, simpler
  const all = [origin, ...stops];
  const parts = all.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`);
  return `https://www.google.com/maps/dir/${parts.join('/')}`;
}

/**
 * Builds a Google Maps URL that also sets travel mode to driving.
 */
export function buildGoogleMapsUrlDriving(origin: LatLng, stops: LatLng[]): string {
  if (!stops.length) return '';
  const dest = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1);

  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('travelmode', 'driving');
  url.searchParams.set('origin', `${origin.lat.toFixed(6)},${origin.lng.toFixed(6)}`);
  url.searchParams.set('destination', `${dest.lat.toFixed(6)},${dest.lng.toFixed(6)}`);
  if (waypoints.length > 0) {
    url.searchParams.set('waypoints', waypoints.map(w => `${w.lat.toFixed(6)},${w.lng.toFixed(6)}`).join('|'));
  }
  return url.toString();
}

// ── Schedule building ─────────────────────────────────────────────────────────

export const DEFAULT_SERVICE_DURATION_MIN = 45;

export interface OrderInput {
  order_id: string;
  lat: number;
  lng: number;
  client_name: string;
  address: string;
  time_window: string | null;   // 'morning' | 'afternoon' | 'evening' | null
  scheduled_time_start: string | null;
  services: string[];
  travel_from_prev_minutes: number;  // HERE ETA from previous stop
  service_duration_minutes?: number; // total duration of all services for this order
}

export interface ScheduledStop {
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
  time_window_status: TimeWindowStatus;
  travel_minutes: number;
  arrival_time: string;
  wait_minutes: number;
  service_start: string;
  service_duration_minutes: number;
  departure_time: string;
  departure_minutes: number;  // for chaining next stop
  delay_minutes: number;       // how many minutes late (0 if on time)
}

/**
 * Builds a full time schedule for one bus starting at startMinutes.
 * Respects time windows, calculates wait times, flags late arrivals.
 */
export function buildSchedule(
  startMinutes: number,
  orders: OrderInput[],
): ScheduledStop[] {
  let currentMinutes = startMinutes;

  return orders.map((order, i) => {
    const duration = order.service_duration_minutes || DEFAULT_SERVICE_DURATION_MIN;
    const arrivalMinutes = currentMinutes + order.travel_from_prev_minutes;
    const window = order.time_window ? TIME_WINDOWS[order.time_window] : null;

    let serviceStartMinutes = arrivalMinutes;
    let waitMinutes = 0;
    if (window && arrivalMinutes < window.start) {
      waitMinutes = window.start - arrivalMinutes;
      serviceStartMinutes = window.start;
    }

    const status = getTimeWindowStatus(arrivalMinutes, duration, order.time_window);
    const departureMinutes = serviceStartMinutes + duration;

    // How many minutes past window end?
    const delayMinutes = window ? Math.max(0, arrivalMinutes - window.end) : 0;

    currentMinutes = departureMinutes;

    return {
      order_id: order.order_id,
      sequence: i + 1,
      client_name: order.client_name,
      address: order.address,
      lat: order.lat,
      lng: order.lng,
      services: order.services,
      time_window: order.time_window,
      time_window_label: window?.label ?? null,
      time_window_color: window?.color ?? null,
      time_window_status: status,
      travel_minutes: order.travel_from_prev_minutes,
      arrival_time: formatTime(arrivalMinutes),
      wait_minutes: waitMinutes,
      service_start: formatTime(serviceStartMinutes),
      service_duration_minutes: duration,
      departure_time: formatTime(departureMinutes),
      departure_minutes: departureMinutes,
      delay_minutes: delayMinutes,
    };
  });
}

// ── Route score ───────────────────────────────────────────────────────────────

export interface RouteScore {
  score: number;           // 0–100
  on_time: number;
  tight: number;
  late: number;
  total_km: number;
  total_duration_min: number;
  finish_time: string;
}

export function scoreRoute(stops: ScheduledStop[], totalKm: number): RouteScore {
  const total = stops.length;
  const on_time = stops.filter(s => s.time_window_status === 'ok' || s.time_window_status === 'no_window' || s.time_window_status === 'early_wait').length;
  const tight   = stops.filter(s => s.time_window_status === 'tight').length;
  const late    = stops.filter(s => s.time_window_status === 'late').length;

  const score = total === 0 ? 100 : Math.round(((on_time + tight * 0.5) / total) * 100);
  const lastStop = stops[stops.length - 1];
  const totalDuration = lastStop ? lastStop.departure_minutes - (stops[0]?.departure_minutes - stops[0]?.travel_minutes - stops[0]?.service_duration_minutes) : 0;

  return {
    score,
    on_time,
    tight,
    late,
    total_km: Math.round(totalKm * 10) / 10,
    total_duration_min: totalDuration,
    finish_time: lastStop?.departure_time ?? '--:--',
  };
}
