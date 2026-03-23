/**
 * POST /api/planner/optimize
 *
 * Auto-optimizes order sequence for one or multiple employees.
 * Uses nearest-neighbor + time-window penalty heuristic.
 *
 * Body:
 * {
 *   date: string,
 *   employee_ids?: string[],   // limit to specific employees (optional)
 *   order_ids?: string[],      // specific orders to re-sequence (optional)
 *   commit?: boolean           // if true, saves assignment to DB
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getRouteInfo } from '@/lib/here-routing';
import {
  buildSchedule,
  scoreRoute,
  parseTime,
  DEFAULT_SERVICE_DURATION_MIN,
  TIME_WINDOWS,
  type OrderInput,
  type LatLng,
} from '@/lib/planner';
import { haversineKm } from '@/lib/geo';

interface OrderForOptimization {
  id: string;
  employee_id: string | null;
  lat: number;
  lng: number;
  client_name: string;
  address: string;
  time_window: string | null;
  scheduled_time_start: string | null;
  services: string[];
}

/**
 * Greedy nearest-neighbor insertion that respects time windows.
 * At each step, picks the order that has the best score:
 *   score = -travel_time - time_window_penalty
 */
async function optimizeSequence(
  startPos: LatLng,
  orders: OrderForOptimization[],
): Promise<{ sequence: OrderForOptimization[]; totalKm: number }> {
  if (orders.length <= 1) {
    return { sequence: orders, totalKm: 0 };
  }

  const remaining = [...orders];
  const sequence: OrderForOptimization[] = [];
  let currentPos = startPos;
  let currentMinutes = parseTime('08:00');
  let totalKm = 0;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestCost = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const order = remaining[i];
      const dist = haversineKm(currentPos.lat, currentPos.lng, order.lat, order.lng) * 1.35;
      const travelMin = Math.round(dist / 50 * 60); // 50km/h estimate for sorting
      const arrivalMin = currentMinutes + travelMin;

      // Time window penalty
      let penalty = 0;
      if (order.time_window && TIME_WINDOWS[order.time_window]) {
        const { start, end } = TIME_WINDOWS[order.time_window];
        if (arrivalMin > end) {
          penalty = (arrivalMin - end) * 3; // heavy penalty for being late
        } else if (arrivalMin + DEFAULT_SERVICE_DURATION_MIN > end) {
          penalty = 50; // moderate penalty for tight
        }
        if (arrivalMin < start) {
          penalty += (start - arrivalMin) * 0.5; // small penalty for waiting
        }
      }

      const cost = dist * 2 + penalty;
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    const routeInfo = await getRouteInfo(currentPos.lat, currentPos.lng, chosen.lat, chosen.lng);
    totalKm += routeInfo.distance_km;
    currentMinutes += routeInfo.duration_minutes + DEFAULT_SERVICE_DURATION_MIN;
    currentPos = { lat: chosen.lat, lng: chosen.lng };
    sequence.push(chosen);
  }

  return { sequence, totalKm };
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { date, employee_ids, order_ids, commit = false } = body;

    const targetDate = date || new Date().toISOString().split('T')[0];

    // Get orders
    let ordersQuery = supabase
      .from('orders')
      .select('id, employee_id, scheduled_time_start, time_window, services, client:clients(name, lat, lng, address, city)')
      .eq('scheduled_date', targetDate)
      .not('status', 'eq', 'cancelled');

    if (order_ids?.length) {
      ordersQuery = ordersQuery.in('id', order_ids);
    }

    const { data: ordersRaw } = await ordersQuery;
    if (!ordersRaw?.length) {
      return NextResponse.json({ message: 'No orders found', optimized: [] });
    }

    // Prepare order objects with coords
    const orders: OrderForOptimization[] = ordersRaw
      .map(o => {
        const c = (o as any).client;
        if (!c?.lat || !c?.lng) return null;
        return {
          id: o.id,
          employee_id: o.employee_id,
          lat: c.lat,
          lng: c.lng,
          client_name: c.name ?? 'Klient',
          address: [c.address, c.city].filter(Boolean).join(', '),
          time_window: (o as any).time_window ?? null,
          scheduled_time_start: o.scheduled_time_start,
          services: (o as any).services ?? [],
        };
      })
      .filter(Boolean) as OrderForOptimization[];

    // Get employees + GPS
    const { data: employees } = await supabase
      .from('employees')
      .select('id, user:profiles(full_name)')
      .eq('is_active', true)
      .in('id', employee_ids?.length ? employee_ids : orders.map(o => o.employee_id).filter(Boolean) as string[]);

    const { data: vehicleAssignments } = await supabase
      .from('vehicle_assignments')
      .select('employee_id, vehicle_id')
      .eq('is_active', true);
    const vehicleToEmployee = new Map<string, string>();
    for (const a of vehicleAssignments || []) {
      if (a.vehicle_id && a.employee_id) vehicleToEmployee.set(a.vehicle_id, a.employee_id);
    }

    const { data: recentPositions } = await supabase
      .from('employee_locations')
      .select('employee_id, vehicle_id, lat, lng')
      .order('timestamp', { ascending: false })
      .limit(200);
    const gpsMap = new Map<string, LatLng>();
    const seenKeys = new Set<string>();
    for (const pos of recentPositions || []) {
      if (pos.employee_id && !seenKeys.has('e:' + pos.employee_id) && pos.lat && pos.lng) {
        seenKeys.add('e:' + pos.employee_id);
        gpsMap.set(pos.employee_id, { lat: pos.lat, lng: pos.lng });
      }
      if (pos.vehicle_id && !seenKeys.has('v:' + pos.vehicle_id) && pos.lat && pos.lng) {
        seenKeys.add('v:' + pos.vehicle_id);
        const empId = vehicleToEmployee.get(pos.vehicle_id);
        if (empId && !gpsMap.has(empId)) gpsMap.set(empId, { lat: pos.lat, lng: pos.lng });
      }
    }

    // Group orders by employee
    const ordersByEmployee = new Map<string, OrderForOptimization[]>();
    for (const order of orders) {
      if (!order.employee_id) continue;
      const list = ordersByEmployee.get(order.employee_id) || [];
      list.push(order);
      ordersByEmployee.set(order.employee_id, list);
    }

    const results = [];

    for (const emp of employees || []) {
      const empOrders = ordersByEmployee.get(emp.id) || [];
      if (!empOrders.length) continue;

      const pos = gpsMap.get(emp.id) ?? { lat: 52.2297, lng: 21.0122 };
      const { sequence, totalKm } = await optimizeSequence(pos, empOrders);

      // Build schedule for optimized sequence
      let prevPos: LatLng = pos;
      const orderInputs: OrderInput[] = [];
      for (const order of sequence) {
        const routeInfo = await getRouteInfo(prevPos.lat, prevPos.lng, order.lat, order.lng);
        orderInputs.push({
          order_id: order.id,
          lat: order.lat,
          lng: order.lng,
          client_name: order.client_name,
          address: order.address,
          time_window: order.time_window,
          scheduled_time_start: order.scheduled_time_start,
          services: order.services,
          travel_from_prev_minutes: routeInfo.duration_minutes,
        });
        prevPos = { lat: order.lat, lng: order.lng };
      }

      const schedule = buildSchedule(parseTime('08:00'), orderInputs);
      const routeScore = scoreRoute(schedule, totalKm);

      if (commit) {
        // Save optimized order sequence (update scheduled_time_start based on schedule)
        for (const stop of schedule) {
          await supabase
            .from('orders')
            .update({ scheduled_time_start: stop.service_start })
            .eq('id', stop.order_id);
        }
      }

      results.push({
        employee_id: emp.id,
        employee_name: (emp.user as any)?.full_name ?? 'Pracownik',
        sequence: sequence.map(o => o.id),
        schedule,
        score: routeScore,
        committed: commit,
      });
    }

    return NextResponse.json({
      optimized: results.length,
      results,
      committed: commit,
    });
  } catch (err) {
    console.error('[planner/optimize]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
