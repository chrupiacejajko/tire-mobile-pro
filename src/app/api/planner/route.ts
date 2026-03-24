/**
 * GET /api/planner?date=2026-03-23
 *
 * Returns full logistics view for the day:
 * - All employees with their GPS positions
 * - All orders (assigned + unassigned) with client coords
 * - Per-employee schedule with arrival times, time window status
 * - Google Maps links for each route
 * - Route scores
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getRouteInfo } from '@/lib/here-routing';
import { checkAuth } from '@/lib/api/auth-guard';
import {
  buildSchedule,
  buildGoogleMapsUrlDriving,
  scoreRoute,
  parseTime,
  DEFAULT_SERVICE_DURATION_MIN,
  type OrderInput,
  type LatLng,
} from '@/lib/planner';

export async function GET(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  // ── Employees ─────────────────────────────────────────────────────────────
  const { data: employees } = await supabase
    .from('employees')
    .select('id, region_id, user:profiles(full_name)')
    .eq('is_active', true);

  if (!employees?.length) return NextResponse.json({ routes: [], unassigned: [], date });

  // ── Vehicle assignments ────────────────────────────────────────────────────
  const { data: vehicleAssignments } = await supabase
    .from('vehicle_assignments')
    .select('employee_id, vehicle_id, vehicle:vehicles(plate_number)')
    .eq('is_active', true);

  const vehicleToEmployee = new Map<string, string>();
  const employeeToPlate = new Map<string, string>();
  for (const a of vehicleAssignments || []) {
    if (a.vehicle_id && a.employee_id) {
      vehicleToEmployee.set(a.vehicle_id, a.employee_id);
      const plate = (a.vehicle as any)?.plate_number;
      if (plate) employeeToPlate.set(a.employee_id, plate);
    }
  }

  // ── Latest GPS positions ───────────────────────────────────────────────────
  const { data: recentPositions } = await supabase
    .from('employee_locations')
    .select('employee_id, vehicle_id, lat, lng, speed, status, timestamp')
    .order('timestamp', { ascending: false })
    .limit(300);

  const gpsMap = new Map<string, LatLng & { status: string | null; timestamp: string }>();
  const seenKeys = new Set<string>();
  for (const pos of recentPositions || []) {
    if (pos.employee_id && !seenKeys.has('e:' + pos.employee_id) && pos.lat && pos.lng) {
      seenKeys.add('e:' + pos.employee_id);
      gpsMap.set(pos.employee_id, { lat: pos.lat, lng: pos.lng, status: pos.status, timestamp: pos.timestamp });
    }
    if (pos.vehicle_id && !seenKeys.has('v:' + pos.vehicle_id) && pos.lat && pos.lng) {
      seenKeys.add('v:' + pos.vehicle_id);
      const empId = vehicleToEmployee.get(pos.vehicle_id);
      if (empId && !gpsMap.has(empId)) {
        gpsMap.set(empId, { lat: pos.lat, lng: pos.lng, status: pos.status, timestamp: pos.timestamp });
      }
    }
  }

  // ── Today's orders ─────────────────────────────────────────────────────────
  const { data: allOrders } = await supabase
    .from('orders')
    .select('id, employee_id, status, priority, scheduled_time_start, scheduled_time_end, time_window, services, client:clients(id, name, lat, lng, address, city)')
    .eq('scheduled_date', date)
    .not('status', 'eq', 'cancelled')
    .order('scheduled_time_start', { ascending: true });

  const assignedOrders = (allOrders || []).filter(o => o.employee_id !== null);
  const unassignedOrders = (allOrders || []).filter(o => o.employee_id === null);

  // ── Build routes per employee ──────────────────────────────────────────────
  const routes = await Promise.all(
    employees.map(async (emp) => {
      const pos = gpsMap.get(emp.id);
      const orders = assignedOrders.filter(o => o.employee_id === emp.id);

      // Always include all active employees so dispatchers can assign orders to them.
      // (Previously: skipped employees with no orders and no GPS — that hid 3 workers.)
      const startPos: LatLng = pos ?? { lat: 52.2297, lng: 21.0122 }; // Warsaw default
      const startMinutes = parseTime('08:00');

      // Build OrderInput list with HERE travel times
      const orderInputs: OrderInput[] = [];
      let prevPos: LatLng = startPos;
      let prevDeparture = startMinutes;

      for (const order of orders) {
        const c = (order as any).client;
        if (!c?.lat || !c?.lng) continue;
        const dest: LatLng = { lat: c.lat, lng: c.lng };

        const routeInfo = await getRouteInfo(prevPos.lat, prevPos.lng, dest.lat, dest.lng);

        // Calculate total service duration from services JSONB
        const rawServices = (order as any).services as { duration_minutes?: number; quantity?: number }[] | null;
        const serviceDuration = (rawServices ?? []).reduce((sum: number, s: any) => {
          return sum + (s.duration_minutes || 0) * (s.quantity || 1);
        }, 0) || DEFAULT_SERVICE_DURATION_MIN;

        orderInputs.push({
          order_id: order.id,
          lat: c.lat,
          lng: c.lng,
          client_name: c.name ?? 'Klient',
          address: [c.address, c.city].filter(Boolean).join(', '),
          time_window: (order as any).time_window ?? null,
          scheduled_time_start: order.scheduled_time_start,
          services: (order as any).services ?? [],
          travel_from_prev_minutes: routeInfo.duration_minutes,
          service_duration_minutes: serviceDuration,
        });

        prevPos = dest;
        prevDeparture += routeInfo.duration_minutes + serviceDuration;
      }

      const schedule = buildSchedule(startMinutes, orderInputs);
      const totalKm = orderInputs.reduce((sum, _, i) => {
        // We'll do a separate pass for km — for now approximate
        return sum;
      }, 0);

      // Google Maps URL
      const stops: LatLng[] = orderInputs.map(o => ({ lat: o.lat, lng: o.lng }));
      const googleMapsUrl = stops.length > 0
        ? buildGoogleMapsUrlDriving(startPos, stops)
        : null;

      // Compute total km from schedule travel times (use 50km/h avg for now if no cached km)
      const totalTravelMin = schedule.reduce((s, st) => s + st.travel_minutes, 0);
      const estimatedKm = Math.round(totalTravelMin * 50 / 60 * 10) / 10;

      const routeScore = scoreRoute(schedule, estimatedKm);

      return {
        employee_id: emp.id,
        employee_name: (emp.user as any)?.full_name ?? 'Pracownik',
        plate: employeeToPlate.get(emp.id) ?? null,
        current_position: pos ?? null,
        schedule,
        total_orders: orders.length,
        total_km: estimatedKm,
        score: routeScore,
        google_maps_url: googleMapsUrl,
        start_time: '08:00',
      };
    }),
  );

  const validRoutes = routes.filter(Boolean);

  // ── Unassigned orders summary ──────────────────────────────────────────────
  const unassignedSummary = unassignedOrders.map(o => {
    const c = (o as any).client;
    return {
      id: o.id,
      status: o.status,
      priority: (o as any).priority,
      scheduled_time_start: o.scheduled_time_start,
      time_window: (o as any).time_window ?? null,
      services: (o as any).services ?? [],
      client_name: c?.name ?? 'Klient',
      address: [c?.address, c?.city].filter(Boolean).join(', '),
      lat: c?.lat ?? null,
      lng: c?.lng ?? null,
    };
  });

  return NextResponse.json({
    date,
    routes: validRoutes,
    unassigned: unassignedSummary,
    summary: {
      total_orders: allOrders?.length ?? 0,
      assigned: assignedOrders.length,
      unassigned: unassignedOrders.length,
      active_employees: validRoutes.length,
    },
  });
}
