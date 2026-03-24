/**
 * Auto-assign engine — finds the best available worker for an order.
 *
 * Shared by:
 *   - POST /api/orders (auto-assign on creation)
 *   - POST /api/planner/suggest-insert (dispatcher "Sugeruj pracownika")
 *
 * Scoring (lower = better):
 *   1. Travel time (primary) — real road distance via HERE Routing API
 *   2. Time window fit — can the worker arrive within the requested window?
 *   3. Workload balance — fewer existing orders = better (skipped for urgent)
 *   4. Route insertion cost — how many extra km does this add to their day?
 */

import { getAdminClient } from '@/lib/supabase/admin';
import { getRouteInfo } from '@/lib/here-routing';
import { haversineKm, findBestInsertion } from '@/lib/geo';

// ── Public types ────────────────────────────────────────────────────────────

export interface AutoAssignResult {
  employee_id: string;
  employee_name: string;
  plate_number: string | null;
  travel_minutes: number;
  distance_km: number;
  score: number;
  reason: string; // "Najbliższy pracownik" | "Najlepsze wpasowanie w trasę" | "Jedyny dostępny"
  // Extra fields kept for backwards-compat with suggest-insert consumers
  current_orders: number;
  insertion_index: number;
  extra_km: number;
  gps_distance_km: number | null;
  gps_status: string | null;
  gps_speed: number | null;
  has_skills: boolean;
  is_driving: boolean;
  is_nearby: boolean;
}

export interface AutoAssignParams {
  order_lat: number;
  order_lng: number;
  scheduled_date: string;
  scheduling_type: 'asap' | 'fixed_time' | 'time_window' | 'flexible';
  time_window_start?: string | null; // HH:MM
  time_window_end?: string | null;   // HH:MM
  scheduled_time?: string | null;    // HH:MM for fixed_time
  priority: string;
  service_duration_minutes: number;
  exclude_order_id?: string; // exclude this order from day-order counts
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse "HH:MM" to minutes since midnight */
function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ── Main function ───────────────────────────────────────────────────────────

export async function autoAssignWorker(params: AutoAssignParams): Promise<AutoAssignResult[]> {
  const supabase = getAdminClient();
  const {
    order_lat, order_lng, scheduled_date,
    scheduling_type, time_window_start, time_window_end, scheduled_time,
    priority, service_duration_minutes, exclude_order_id,
  } = params;

  const isUrgent = priority === 'urgent' || priority === 'high';
  const orderPoint = { lat: order_lat, lng: order_lng };

  // ── 1. Get available employees for the date ─────────────────────────────

  const { data: employees } = await supabase
    .from('employees')
    .select('id, skills, user:profiles(full_name)')
    .eq('is_active', true);

  if (!employees?.length) return [];

  const empIds = employees.map(e => e.id);

  // Work schedules — if any exist for this date, only include scheduled employees
  const { data: workScheduleData } = await supabase
    .from('work_schedules')
    .select('employee_id, start_time, end_time')
    .eq('date', scheduled_date);

  const scheduledEmployeeIds = new Set(
    (workScheduleData ?? []).map((ws: { employee_id: string }) => ws.employee_id),
  );
  const hasAnySchedules = (workScheduleData ?? []).length > 0;

  // Unavailabilities — exclude employees who are off
  const { data: unavailabilities } = await supabase
    .from('unavailabilities')
    .select('employee_id')
    .lte('start_date', scheduled_date)
    .gte('end_date', scheduled_date);

  const unavailableIds = new Set(
    (unavailabilities ?? []).map((u: { employee_id: string }) => u.employee_id),
  );

  // ── 2. Get live GPS positions ───────────────────────────────────────────

  const gpsMap = new Map<string, { lat: number; lng: number; speed: number | null; status: string | null; timestamp: string }>();

  const { data: recentPositions } = await supabase
    .from('employee_locations')
    .select('employee_id, lat, lng, speed, status, timestamp')
    .in('employee_id', empIds)
    .order('timestamp', { ascending: false })
    .limit(500);

  for (const pos of recentPositions || []) {
    if (pos.employee_id && !gpsMap.has(pos.employee_id) && pos.lat && pos.lng) {
      gpsMap.set(pos.employee_id, {
        lat: pos.lat,
        lng: pos.lng,
        speed: pos.speed,
        status: pos.status,
        timestamp: pos.timestamp,
      });
    }
  }

  // ── 3. Get existing orders for each employee on this date ───────────────

  let dayOrdersQuery = supabase
    .from('orders')
    .select('id, employee_id, scheduled_time_start, client:clients(lat, lng)')
    .eq('scheduled_date', scheduled_date)
    .not('status', 'eq', 'cancelled')
    .not('employee_id', 'is', null)
    .order('scheduled_time_start', { ascending: true });

  if (exclude_order_id) {
    dayOrdersQuery = dayOrdersQuery.neq('id', exclude_order_id);
  }

  const { data: dayOrders } = await dayOrdersQuery;

  const ordersByEmployee = new Map<string, { lat: number; lng: number }[]>();
  const orderCountByEmployee = new Map<string, number>();

  for (const o of dayOrders || []) {
    if (!o.employee_id) continue;
    const c = (o as any).client;
    orderCountByEmployee.set(o.employee_id, (orderCountByEmployee.get(o.employee_id) || 0) + 1);
    if (!c?.lat || !c?.lng) continue;
    const list = ordersByEmployee.get(o.employee_id) || [];
    list.push({ lat: c.lat, lng: c.lng });
    ordersByEmployee.set(o.employee_id, list);
  }

  // ── 4. Vehicle plates ──────────────────────────────────────────────────

  const { data: vehicleAssignments } = await supabase
    .from('vehicle_assignments')
    .select('employee_id, vehicle:vehicles(plate_number)')
    .eq('is_active', true)
    .in('employee_id', empIds);

  const employeeToPlate = new Map<string, string>();
  for (const a of vehicleAssignments || []) {
    if (a.employee_id) {
      const plate = (a.vehicle as any)?.plate_number;
      if (plate) employeeToPlate.set(a.employee_id, plate);
    }
  }

  // ── 5. Score each employee ─────────────────────────────────────────────

  const scored: (AutoAssignResult & { _tw_score: number })[] = [];

  // Build list of eligible employees
  const eligible = employees.filter(emp => {
    if (unavailableIds.has(emp.id)) return false;
    if (hasAnySchedules && !scheduledEmployeeIds.has(emp.id)) return false;
    return true;
  });

  // Fetch route info in parallel for all employees with GPS
  const routeInfoPromises = eligible.map(async emp => {
    const gpsData = gpsMap.get(emp.id);
    if (!gpsData) return { empId: emp.id, routeInfo: null };
    const routeInfo = await getRouteInfo(gpsData.lat, gpsData.lng, order_lat, order_lng);
    return { empId: emp.id, routeInfo };
  });

  const routeInfoResults = await Promise.all(routeInfoPromises);
  const routeInfoMap = new Map(routeInfoResults.map(r => [r.empId, r.routeInfo]));

  for (const emp of eligible) {
    const gpsData = gpsMap.get(emp.id);
    const waypoints = ordersByEmployee.get(emp.id) || [];
    const currentOrders = orderCountByEmployee.get(emp.id) || 0;

    // ── a. Travel time (PRIMARY) ──────────────────────────────────────
    const routeInfo = routeInfoMap.get(emp.id);
    let travelMinutes: number;
    let distanceKm: number;
    let gpsDistanceKm: number | null = null;

    if (routeInfo) {
      travelMinutes = routeInfo.duration_minutes;
      distanceKm = routeInfo.distance_km;
      // Also compute straight-line for display
      gpsDistanceKm = gpsData
        ? Math.round(haversineKm(gpsData.lat, gpsData.lng, order_lat, order_lng) * 10) / 10
        : null;
    } else if (gpsData) {
      // No route info but have GPS — haversine fallback
      const straight = haversineKm(gpsData.lat, gpsData.lng, order_lat, order_lng);
      gpsDistanceKm = Math.round(straight * 10) / 10;
      distanceKm = Math.round(straight * 1.4 * 10) / 10; // road factor
      travelMinutes = Math.round((distanceKm / 50) * 60); // 50 km/h
    } else {
      // No GPS at all — heavy penalty
      travelMinutes = 120;
      distanceKm = 999;
      gpsDistanceKm = null;
    }

    const travel_score = travelMinutes * 3;

    // ── b. Time window fit ────────────────────────────────────────────
    let tw_score = 0;
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const arrivalMinutes = nowMinutes + travelMinutes;

    if (scheduling_type === 'fixed_time' && scheduled_time) {
      const targetMinutes = parseHHMM(scheduled_time);
      const flexWindow = 30; // 30min flexibility for fixed_time
      if (arrivalMinutes > targetMinutes + flexWindow) {
        tw_score = 9999; // Cannot arrive in time — skip
      } else {
        tw_score = 0;
      }
    } else if (scheduling_type === 'time_window' && time_window_start && time_window_end) {
      const windowStart = parseHHMM(time_window_start);
      const windowEnd = parseHHMM(time_window_end);
      if (arrivalMinutes > windowEnd) {
        tw_score = 9999; // Too late — skip
      } else if (arrivalMinutes < windowStart) {
        tw_score = (windowStart - arrivalMinutes) * 0.5; // Early — small penalty for waiting
      } else {
        tw_score = 0; // Fits perfectly
      }
    }
    // For 'asap' and 'flexible': tw_score stays 0

    // ── c. Workload balance ───────────────────────────────────────────
    const workload_score = isUrgent ? 0 : currentOrders * 8;

    // ── d. Route insertion cost ───────────────────────────────────────
    let insertionIndex: number;
    let extraKm: number;

    if (waypoints.length === 0) {
      insertionIndex = 0;
      extraKm = gpsDistanceKm ?? distanceKm;
    } else {
      const result = findBestInsertion(waypoints, orderPoint);
      insertionIndex = result.index;
      extraKm = result.costKm;
    }

    const insertion_score = extraKm * 1.5;

    // ── e. Bonus for driving workers ──────────────────────────────────
    const drivingBonus = gpsData?.status === 'driving' ? -10 : 0;

    // ── f. Final score ────────────────────────────────────────────────
    const score = travel_score + tw_score + workload_score + insertion_score + drivingBonus;

    const isDriving = gpsData?.status === 'driving' || (gpsData?.speed ?? 0) > 5;
    const isNearby = gpsDistanceKm !== null && gpsDistanceKm < 20;

    scored.push({
      employee_id: emp.id,
      employee_name: (emp as any).user?.full_name ?? 'Pracownik',
      plate_number: employeeToPlate.get(emp.id) ?? null,
      travel_minutes: travelMinutes,
      distance_km: distanceKm,
      score,
      reason: '', // filled below
      current_orders: currentOrders,
      insertion_index: insertionIndex,
      extra_km: extraKm,
      gps_distance_km: gpsDistanceKm,
      gps_status: gpsData?.status ?? null,
      gps_speed: gpsData?.speed ?? null,
      has_skills: true,
      is_driving: isDriving,
      is_nearby: isNearby,
      _tw_score: tw_score,
    });
  }

  // Filter out employees who can't make the time window
  const feasible = scored.filter(s => s._tw_score < 9999);

  // Sort by score ascending (lower = better)
  feasible.sort((a, b) => a.score - b.score);

  // Assign reasons
  for (let i = 0; i < feasible.length; i++) {
    if (feasible.length === 1) {
      feasible[i].reason = 'Jedyny dostępny';
    } else if (i === 0) {
      // Check if primarily winning on travel vs insertion
      if (feasible.length > 1 && feasible[0].extra_km < feasible[1].extra_km) {
        feasible[i].reason = 'Najlepsze wpasowanie w trasę';
      } else {
        feasible[i].reason = 'Najbliższy pracownik';
      }
    } else {
      feasible[i].reason = 'Alternatywa';
    }
  }

  // Return top 5, stripping internal fields
  return feasible.slice(0, 5).map(({ _tw_score, ...rest }) => rest);
}
