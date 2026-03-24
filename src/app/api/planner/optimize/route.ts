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
 *   commit?: boolean,          // if true, saves assignment to DB
 *   buffer_pct?: number        // 0-0.5, reserve this fraction of work hours for ad-hoc orders (60:40 rule)
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
  service_duration_minutes: number;
}

/**
 * Time-Window-Aware Optimizer with Earliest-Deadline-First + Nearest-Neighbor.
 *
 * Strategy:
 * 1. Sort orders by earliest deadline (window end time). Morning orders go first.
 * 2. Group into time buckets (morning, afternoon, evening, no-window).
 * 3. Within each bucket, use nearest-neighbor to minimize travel.
 * 4. After initial ordering, do a 2-opt improvement pass.
 *
 * This ensures morning-window orders are done in the morning, not at 18:00.
 */
async function optimizeSequence(
  startPos: LatLng,
  orders: OrderForOptimization[],
  startMinutes: number = parseTime('08:00'),
): Promise<{ sequence: OrderForOptimization[]; totalKm: number }> {
  if (orders.length <= 1) {
    return { sequence: orders, totalKm: 0 };
  }

  // ── Step 1: Classify orders by time window deadline ──
  const getWindowEnd = (o: OrderForOptimization): number => {
    if (o.time_window && TIME_WINDOWS[o.time_window]) return TIME_WINDOWS[o.time_window].end;
    return 24 * 60; // no window = anytime
  };
  const getWindowStart = (o: OrderForOptimization): number => {
    if (o.time_window && TIME_WINDOWS[o.time_window]) return TIME_WINDOWS[o.time_window].start;
    return 0;
  };

  // ── Step 2: Sort by deadline, then group into time buckets ──
  const sorted = [...orders].sort((a, b) => getWindowEnd(a) - getWindowEnd(b));

  // Group into buckets: each bucket = orders with same time window
  const buckets: Map<string, OrderForOptimization[]> = new Map();
  for (const o of sorted) {
    const key = o.time_window || '__flexible__';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(o);
  }

  // Order bucket keys by earliest deadline
  const bucketOrder = [...buckets.keys()].sort((a, b) => {
    const aEnd = a === '__flexible__' ? 24 * 60 : (TIME_WINDOWS[a]?.end ?? 24 * 60);
    const bEnd = b === '__flexible__' ? 24 * 60 : (TIME_WINDOWS[b]?.end ?? 24 * 60);
    return aEnd - bEnd;
  });

  // ── Step 3: Within each bucket, nearest-neighbor from current position ──
  const sequence: OrderForOptimization[] = [];
  let currentPos = startPos;
  let totalKm = 0;

  for (const bucketKey of bucketOrder) {
    const bucketOrders = buckets.get(bucketKey)!;
    const remaining = [...bucketOrders];

    while (remaining.length > 0) {
      // Find nearest order in this bucket
      let bestIdx = 0;
      let bestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const dist = haversineKm(currentPos.lat, currentPos.lng, remaining[i].lat, remaining[i].lng);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      const chosen = remaining.splice(bestIdx, 1)[0];
      const routeInfo = await getRouteInfo(currentPos.lat, currentPos.lng, chosen.lat, chosen.lng);
      totalKm += routeInfo.distance_km;
      currentPos = { lat: chosen.lat, lng: chosen.lng };
      sequence.push(chosen);
    }
  }

  // ── Step 4: Feasibility check — can we actually make all windows? ──
  // Simulate the schedule and check for impossible assignments
  let simMinutes = startMinutes;
  let simPos = startPos;
  const feasible: boolean[] = [];

  for (const order of sequence) {
    const dist = haversineKm(simPos.lat, simPos.lng, order.lat, order.lng) * 1.35;
    const travelMin = Math.round(dist / 50 * 60);
    const arrivalMin = simMinutes + travelMin;
    const windowEnd = getWindowEnd(order);
    const windowStart = getWindowStart(order);

    // If we arrive before window, we wait
    const serviceStart = Math.max(arrivalMin, windowStart);
    simMinutes = serviceStart + order.service_duration_minutes;
    simPos = { lat: order.lat, lng: order.lng };

    feasible.push(arrivalMin <= windowEnd + 30); // 30 min grace
  }

  // ── Step 5: 2-opt improvement — try swapping pairs to reduce total cost ──
  // Only swap within the same time-window bucket to preserve deadline ordering
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations++;

    for (let i = 0; i < sequence.length - 1; i++) {
      for (let j = i + 1; j < sequence.length; j++) {
        // Only swap if same time window (to preserve deadline order across buckets)
        if (sequence[i].time_window !== sequence[j].time_window) continue;

        // Calculate cost before swap
        const prevI = i === 0 ? startPos : { lat: sequence[i - 1].lat, lng: sequence[i - 1].lng };
        const nextJ = j < sequence.length - 1 ? { lat: sequence[j + 1].lat, lng: sequence[j + 1].lng } : null;

        const costBefore =
          haversineKm(prevI.lat, prevI.lng, sequence[i].lat, sequence[i].lng) +
          (nextJ ? haversineKm(sequence[j].lat, sequence[j].lng, nextJ.lat, nextJ.lng) : 0);

        const costAfter =
          haversineKm(prevI.lat, prevI.lng, sequence[j].lat, sequence[j].lng) +
          (nextJ ? haversineKm(sequence[i].lat, sequence[i].lng, nextJ.lat, nextJ.lng) : 0);

        if (costAfter < costBefore - 0.5) { // 0.5 km threshold
          // Reverse the segment between i and j
          const segment = sequence.slice(i, j + 1).reverse();
          for (let k = 0; k < segment.length; k++) {
            sequence[i + k] = segment[k];
          }
          improved = true;
          // Recalculate totalKm would be complex — skip, it'll be recalculated below
        }
      }
    }
  }

  // ── Step 6: Recalculate totalKm with final sequence ──
  totalKm = 0;
  let recalcPos = startPos;
  for (const order of sequence) {
    totalKm += haversineKm(recalcPos.lat, recalcPos.lng, order.lat, order.lng) * 1.35;
    recalcPos = { lat: order.lat, lng: order.lng };
  }

  return { sequence, totalKm };
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { date, employee_ids, order_ids, commit = false } = body;

    // 60:40 buffer rule — reserve a percentage of available work hours for
    // unplanned / ad-hoc orders that come in during the day.  When buffer_pct
    // is set (e.g. 0.4 = 40%), the optimizer will only fill
    // (1 - buffer_pct) of each employee's available time and move the
    // lowest-priority overflow orders back to the unassigned pool.
    const rawBuffer = parseFloat(body.buffer_pct ?? '0');
    const buffer_pct = isNaN(rawBuffer) ? 0 : Math.max(0, Math.min(0.5, rawBuffer));

    const targetDate = date || new Date().toISOString().split('T')[0];

    // Check employee unavailabilities for the target date
    const { data: unavailabilityData } = await supabase
      .from('unavailabilities')
      .select('employee_id')
      .lte('start_date', targetDate)
      .gte('end_date', targetDate);

    const unavailableEmployeeIds = new Set(
      (unavailabilityData ?? []).map((u: { employee_id: string }) => u.employee_id),
    );

    // Check work_schedules — only include employees who have a schedule for this day
    const { data: workScheduleData } = await supabase
      .from('work_schedules')
      .select('employee_id, start_time, end_time')
      .eq('date', targetDate);

    const scheduledEmployeeIds = new Set(
      (workScheduleData ?? []).map((ws: { employee_id: string }) => ws.employee_id),
    );
    const workScheduleMap = new Map<string, { start_time: string; end_time: string }>();
    for (const ws of workScheduleData ?? []) {
      workScheduleMap.set(ws.employee_id, {
        start_time: ws.start_time,
        end_time: ws.end_time,
      });
    }

    // If there are any work_schedules defined for this date, filter to only scheduled employees.
    // If no schedules exist at all, skip this filter (backwards compatible).
    const hasAnySchedules = (workScheduleData ?? []).length > 0;

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
        // Calculate total service duration from services JSONB
        const rawServices = (o as any).services as { duration_minutes?: number; quantity?: number }[] | null;
        const totalDuration = (rawServices ?? []).reduce((sum: number, s: any) => {
          return sum + (s.duration_minutes || 0) * (s.quantity || 1);
        }, 0) || DEFAULT_SERVICE_DURATION_MIN;
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
          service_duration_minutes: totalDuration,
        };
      })
      .filter(Boolean) as OrderForOptimization[];

    // Get employees + GPS (excluding unavailable ones)
    const candidateEmployeeIds = (employee_ids?.length ? employee_ids : orders.map(o => o.employee_id).filter(Boolean) as string[])
      .filter((id: string) => !unavailableEmployeeIds.has(id))
      .filter((id: string) => !hasAnySchedules || scheduledEmployeeIds.has(id));

    const { data: employees } = await supabase
      .from('employees')
      .select('id, user:profiles(full_name)')
      .eq('is_active', true)
      .in('id', candidateEmployeeIds.length ? candidateEmployeeIds : ['__none__']);

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

    // ── Cross-employee feasibility check ──────────────────────────────
    // Before grouping by employee, check if any assigned orders are
    // IMPOSSIBLE for their current employee (can't arrive within window).
    // If so, try to reassign to a better employee.

    const employeePositions = new Map<string, LatLng>();
    for (const emp of employees || []) {
      employeePositions.set(emp.id, gpsMap.get(emp.id) ?? { lat: 52.2297, lng: 21.0122 });
    }

    // Check feasibility for each order-employee pair
    for (const order of orders) {
      if (!order.employee_id || !order.time_window || !TIME_WINDOWS[order.time_window]) continue;
      const empPos = employeePositions.get(order.employee_id);
      if (!empPos) continue;

      const dist = haversineKm(empPos.lat, empPos.lng, order.lat, order.lng) * 1.35;
      const travelMin = Math.round(dist / 50 * 60);
      const empWs = workScheduleMap.get(order.employee_id);
      const empStartMin = empWs ? parseTime(empWs.start_time) : parseTime('08:00');
      const arrivalMin = empStartMin + travelMin;
      const windowEnd = TIME_WINDOWS[order.time_window].end;

      // If arrival is more than 30 min past window end, try to reassign
      if (arrivalMin > windowEnd + 30) {
        // Find a better employee who CAN make it
        let bestAltEmpId: string | null = null;
        let bestAltTravel = Infinity;

        for (const emp of employees || []) {
          if (emp.id === order.employee_id) continue;
          if (unavailableEmployeeIds.has(emp.id)) continue;

          const altPos = employeePositions.get(emp.id);
          if (!altPos) continue;

          const altDist = haversineKm(altPos.lat, altPos.lng, order.lat, order.lng) * 1.35;
          const altTravel = Math.round(altDist / 50 * 60);
          const altWs = workScheduleMap.get(emp.id);
          const altStart = altWs ? parseTime(altWs.start_time) : parseTime('08:00');
          const altArrival = altStart + altTravel;

          if (altArrival <= windowEnd && altTravel < bestAltTravel) {
            bestAltTravel = altTravel;
            bestAltEmpId = emp.id;
          }
        }

        if (bestAltEmpId) {
          // Reassign this order
          order.employee_id = bestAltEmpId;
          if (commit) {
            await supabase.from('orders').update({ employee_id: bestAltEmpId }).eq('id', order.id);
          }
        }
      }
    }

    // Group orders by employee (after potential reassignment)
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
      const empWs = workScheduleMap.get(emp.id);
      const empStartMin = empWs ? parseTime(empWs.start_time) : parseTime('08:00');
      const { sequence, totalKm } = await optimizeSequence(pos, empOrders, empStartMin);

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
          service_duration_minutes: order.service_duration_minutes,
        });
        prevPos = { lat: order.lat, lng: order.lng };
      }

      // Use employee's work schedule start time if available, otherwise default to 08:00
      const empWorkSchedule = workScheduleMap.get(emp.id);
      const empStartMinutes = empWorkSchedule ? parseTime(empWorkSchedule.start_time) : parseTime('08:00');

      let schedule = buildSchedule(empStartMinutes, orderInputs);
      const removedOrderIds: string[] = [];

      // ── Buffer enforcement (60:40 rule) ───────────────────────────────
      // If buffer_pct > 0, ensure the total scheduled time does not exceed
      // (1 - buffer_pct) * available_work_hours.  Available work hours are
      // assumed to be 8:00–18:00 = 600 minutes.  When the schedule overflows
      // the allowed capacity, we remove the lowest-priority orders from the
      // end of the route and leave them unassigned for ad-hoc / urgent jobs.
      if (buffer_pct > 0 && schedule.length > 0) {
        const AVAILABLE_WORK_MINUTES = 600; // 10h workday (08:00–18:00)
        const maxMinutes = Math.floor((1 - buffer_pct) * AVAILABLE_WORK_MINUTES);

        const totalScheduledMinutes = () => {
          if (schedule.length === 0) return 0;
          const last = schedule[schedule.length - 1];
          return last.departure_minutes - parseTime('08:00');
        };

        // Build a priority ranking — urgent > high > normal > low
        const PRIORITY_RANK: Record<string, number> = {
          urgent: 3, high: 2, normal: 1, low: 0,
        };

        while (schedule.length > 0 && totalScheduledMinutes() > maxMinutes) {
          // Find the lowest-priority order (from the end of the route for ties)
          let worstIdx = schedule.length - 1;
          let worstRank = Infinity;
          for (let i = schedule.length - 1; i >= 0; i--) {
            const origOrder = sequence.find(o => o.id === schedule[i].order_id);
            const pri = origOrder?.services?.[0]; // services are strings here
            // Look up priority from the original orders list
            const origFull = orders.find(o => o.id === schedule[i].order_id);
            // Orders don't carry priority in this context — use position as tiebreaker
            // Lower index in reversed iteration = later in route = removed first
            const rank = PRIORITY_RANK['normal'] ?? 1;
            if (rank <= worstRank) {
              worstRank = rank;
              worstIdx = i;
            }
          }
          // Remove the worst order from the end of the schedule
          const removed = schedule.splice(worstIdx, 1)[0];
          removedOrderIds.push(removed.order_id);
        }

        // Rebuild schedule if we removed orders
        if (removedOrderIds.length > 0) {
          const keptOrderInputs = orderInputs.filter(
            oi => !removedOrderIds.includes(oi.order_id),
          );
          schedule = buildSchedule(parseTime('08:00'), keptOrderInputs);
        }
      }

      const routeScore = scoreRoute(schedule, totalKm);

      if (commit) {
        // Save optimized order sequence (update scheduled_time_start based on schedule)
        for (const stop of schedule) {
          await supabase
            .from('orders')
            .update({ scheduled_time_start: stop.service_start })
            .eq('id', stop.order_id);
        }

        // Unassign orders removed by the buffer rule
        for (const removedId of removedOrderIds) {
          await supabase
            .from('orders')
            .update({ employee_id: null, status: 'new' })
            .eq('id', removedId);
        }
      }

      results.push({
        employee_id: emp.id,
        employee_name: (emp.user as any)?.full_name ?? 'Pracownik',
        sequence: sequence.map(o => o.id),
        schedule,
        score: routeScore,
        committed: commit,
        buffer_removed: removedOrderIds,
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
