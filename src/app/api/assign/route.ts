import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm, insertionCostKm } from '@/lib/geo';
import { getRouteInfo, geoScoreFromKm } from '@/lib/here-routing';

// POST /api/assign - Auto-assign unassigned orders to best available employees
// Algorithm: HERE real road distance (+ traffic ETA) + region match + route insertion + workload
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { date, strategy } = body; // strategy: 'balance' | 'minimize'

    const targetDate = date || new Date().toISOString().split('T')[0];

    // Get unassigned orders — include client coordinates for geo-scoring
    const { data: unassigned } = await supabase
      .from('orders')
      .select('id, region_id, scheduled_date, scheduled_time_start, scheduled_time_end, services, client:clients(lat, lng)')
      .eq('scheduled_date', targetDate)
      .eq('status', 'new')
      .is('employee_id', null);

    if (!unassigned || unassigned.length === 0) {
      return NextResponse.json({ message: 'No unassigned orders', assigned: 0 });
    }

    // Get active employees (with skills for matching)
    const { data: employees } = await supabase
      .from('employees')
      .select('id, region_id, skills, hourly_rate, working_hours')
      .eq('is_active', true);

    // Get required skills per order
    const orderIdsForSkills = (unassigned || []).map(o => o.id);
    const { data: ordersWithSkills } = await supabase
      .from('orders')
      .select('id, required_skills')
      .in('id', orderIdsForSkills);
    const orderSkillsMap = new Map<string, string[]>();
    for (const o of ordersWithSkills || []) {
      orderSkillsMap.set(o.id, (o as any).required_skills ?? []);
    }

    if (!employees || employees.length === 0) {
      return NextResponse.json({ error: 'No active employees available' }, { status: 400 });
    }

    // ── GPS positions: employee → latest known location ───────────────
    const { data: vehicleAssignments } = await supabase
      .from('vehicle_assignments')
      .select('employee_id, vehicle_id')
      .eq('is_active', true);

    const vehicleToEmployee = new Map<string, string>();
    for (const a of (vehicleAssignments || [])) {
      if (a.vehicle_id && a.employee_id) vehicleToEmployee.set(a.vehicle_id, a.employee_id);
    }

    const { data: recentPositions } = await supabase
      .from('employee_locations')
      .select('employee_id, vehicle_id, lat, lng, timestamp')
      .order('timestamp', { ascending: false })
      .limit(200);

    const gpsMap = new Map<string, { lat: number; lng: number }>();
    const seenKeys = new Set<string>();
    for (const pos of (recentPositions || [])) {
      if (pos.employee_id && !seenKeys.has('e:' + pos.employee_id) && pos.lat && pos.lng) {
        seenKeys.add('e:' + pos.employee_id);
        gpsMap.set(pos.employee_id, { lat: pos.lat, lng: pos.lng });
      }
      if (pos.vehicle_id && !seenKeys.has('v:' + pos.vehicle_id) && pos.lat && pos.lng) {
        seenKeys.add('v:' + pos.vehicle_id);
        const empId = vehicleToEmployee.get(pos.vehicle_id);
        if (empId && !gpsMap.has(empId)) {
          gpsMap.set(empId, { lat: pos.lat, lng: pos.lng });
        }
      }
    }

    // ── Today's existing orders: workload + schedule + waypoints ──────
    const { data: existingOrders } = await supabase
      .from('orders')
      .select('employee_id, scheduled_time_start, scheduled_time_end, client:clients(lat, lng)')
      .eq('scheduled_date', targetDate)
      .not('employee_id', 'is', null)
      .not('status', 'eq', 'cancelled')
      .order('scheduled_time_start', { ascending: true });

    const workloadMap = new Map<string, number>();
    const scheduleMap = new Map<string, { start: string; end: string }[]>();
    const waypointsMap = new Map<string, { lat: number; lng: number }[]>();

    for (const order of (existingOrders || [])) {
      if (!order.employee_id) continue;
      workloadMap.set(order.employee_id, (workloadMap.get(order.employee_id) || 0) + 1);
      const sched = scheduleMap.get(order.employee_id) || [];
      sched.push({ start: order.scheduled_time_start, end: order.scheduled_time_end });
      scheduleMap.set(order.employee_id, sched);
      const c = (order as any).client;
      if (c?.lat && c?.lng) {
        const wps = waypointsMap.get(order.employee_id) || [];
        wps.push({ lat: c.lat, lng: c.lng });
        waypointsMap.set(order.employee_id, wps);
      }
    }

    // ── Pre-fetch HERE distances: all (employee GPS → order location) pairs ──
    // Collect unique pairs to batch-resolve before scoring loop
    type RouteCacheKey = string;
    const routeCache = new Map<RouteCacheKey, { distance_km: number; duration_minutes: number }>();

    const fetchPairs: { empId: string; orderIdx: number; empLat: number; empLng: number; orderLat: number; orderLng: number }[] = [];
    for (const [i, order] of unassigned.entries()) {
      const orderClient = (order as any).client;
      const oLat: number | null = orderClient?.lat ?? null;
      const oLng: number | null = orderClient?.lng ?? null;
      if (oLat === null || oLng === null) continue;
      for (const emp of employees) {
        const empPos = gpsMap.get(emp.id);
        if (!empPos) continue;
        fetchPairs.push({ empId: emp.id, orderIdx: i, empLat: empPos.lat, empLng: empPos.lng, orderLat: oLat, orderLng: oLng });
      }
    }

    // Fetch all in parallel (HERE cache prevents duplicate requests)
    await Promise.all(
      fetchPairs.map(async p => {
        const key: RouteCacheKey = `${p.empId}-${p.orderIdx}`;
        const info = await getRouteInfo(p.empLat, p.empLng, p.orderLat, p.orderLng);
        routeCache.set(key, { distance_km: info.distance_km, duration_minutes: info.duration_minutes });
      }),
    );

    // ── Scoring loop ──────────────────────────────────────────────────
    let assigned = 0;
    const results: { order_id: string; employee_id: string; distance_km?: number; eta_minutes?: number; score: number; routing: string }[] = [];

    for (const [orderIdx, order] of unassigned.entries()) {
      const orderClient = (order as any).client;
      const orderLat: number | null = orderClient?.lat ?? null;
      const orderLng: number | null = orderClient?.lng ?? null;

      let bestEmployee: string | null = null;
      let bestScore = -Infinity;
      let bestDistKm: number | undefined;
      let bestEta: number | undefined;
      let bestRouting: string = 'none';

      for (const emp of employees) {
        let score = 0;

        // ── Skills matching ───────────────────────────────────────────
        // +20 pts all skills match, -50 if missing required skill
        const requiredSkills: string[] = orderSkillsMap.get(order.id) ?? [];
        const empSkills: string[] = (emp as any).skills ?? [];
        if (requiredSkills.length > 0) {
          const hasAll = requiredSkills.every(s => empSkills.includes(s));
          const hasNone = !requiredSkills.some(s => empSkills.includes(s));
          if (hasAll) {
            score += 20;
          } else if (hasNone) {
            score -= 50; // heavily discourage assigning without required skills
          }
          // partial match — no bonus/penalty
        }

        // ── Region match (+5, tiebreaker only) ───────────────────────
        // Mały bonus — dystans GPS ma zawsze wiekszy priorytet niz region.
        // Przy starej wartosci +10 bus z Poznania wygrywał z busem z Łodzi
        // o zlecenie z Warszawy, bo obydwa miały 0 pkt geo (progi były za małe).
        if (order.region_id && emp.region_id === order.region_id) score += 5;

        // ── Geo scoring: real road distance from GPS to order ─────────
        if (orderLat !== null && orderLng !== null) {
          const empPos = gpsMap.get(emp.id);
          if (empPos) {
            const cacheKey: RouteCacheKey = `${emp.id}-${orderIdx}`;
            const cached = routeCache.get(cacheKey);
            const distKm = cached?.distance_km ?? haversineKm(empPos.lat, empPos.lng, orderLat, orderLng) * 1.35;

            score += geoScoreFromKm(distKm);

            // Route insertion cost: how much extra km does this order add? (+0-15)
            const waypoints = waypointsMap.get(emp.id) || [];
            if (waypoints.length > 0) {
              const insertCost = insertionCostKm(
                [empPos, ...waypoints],
                { lat: orderLat, lng: orderLng },
              );
              score += Math.max(0, 15 - Math.round(insertCost * 1.35 * 2));
            }

            if (cached && (bestEmployee === null || distKm < (bestDistKm ?? Infinity))) {
              bestDistKm = cached.distance_km;
              bestEta = cached.duration_minutes;
              bestRouting = 'here';
            } else if (!cached) {
              bestDistKm = Math.round(distKm * 10) / 10;
              bestEta = undefined;
              bestRouting = 'haversine';
            }
          }
        }

        // ── Workload balance ──────────────────────────────────────────
        const currentLoad = workloadMap.get(emp.id) || 0;
        if (strategy === 'minimize') {
          score += currentLoad * 2;
        } else {
          score -= currentLoad * 3;
        }

        // ── Time conflict (heavy penalty) ─────────────────────────────
        const empSchedule = scheduleMap.get(emp.id) || [];
        const hasConflict = empSchedule.some(
          s => order.scheduled_time_start < s.end && order.scheduled_time_end > s.start,
        );
        if (hasConflict) score -= 100;

        if (score > bestScore) {
          bestScore = score;
          bestEmployee = emp.id;

          if (orderLat !== null && orderLng !== null) {
            const cacheKey: RouteCacheKey = `${emp.id}-${orderIdx}`;
            const cached = routeCache.get(cacheKey);
            if (cached) {
              bestDistKm = cached.distance_km;
              bestEta = cached.duration_minutes;
              bestRouting = 'here';
            } else {
              const empPos = gpsMap.get(emp.id);
              if (empPos) {
                bestDistKm = Math.round(haversineKm(empPos.lat, empPos.lng, orderLat, orderLng) * 1.35 * 10) / 10;
                bestEta = undefined;
                bestRouting = 'haversine';
              }
            }
          }
        }
      }

      if (bestEmployee && bestScore > -50) {
        await supabase.from('orders').update({
          employee_id: bestEmployee,
          status: 'assigned',
        }).eq('id', order.id);

        workloadMap.set(bestEmployee, (workloadMap.get(bestEmployee) || 0) + 1);
        const sched = scheduleMap.get(bestEmployee) || [];
        sched.push({ start: order.scheduled_time_start, end: order.scheduled_time_end });
        scheduleMap.set(bestEmployee, sched);
        if (orderLat && orderLng) {
          const wps = waypointsMap.get(bestEmployee) || [];
          wps.push({ lat: orderLat, lng: orderLng });
          waypointsMap.set(bestEmployee, wps);
        }

        results.push({
          order_id: order.id,
          employee_id: bestEmployee,
          distance_km: bestDistKm,
          eta_minutes: bestEta,
          score: Math.round(bestScore),
          routing: bestRouting,
        });
        assigned++;
      }
    }

    return NextResponse.json({
      assigned,
      total_unassigned: unassigned.length,
      strategy: strategy || 'balance',
      results,
    });
  } catch (err) {
    console.error('[assign]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
