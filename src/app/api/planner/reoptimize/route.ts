/**
 * POST /api/planner/reoptimize
 *
 * Re-optimizes routes using nearest-neighbor from GPS positions.
 *
 * Modes:
 *   1. Single employee: { employee_id: string, date?: string, keep_locked?: boolean }
 *   2. Cascade (all employees): { date: string, cascade: true }
 *      — reoptimizes ALL employees with orders on that date
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm, etaMinutes, totalRouteKm } from '@/lib/geo';
import { checkAuth } from '@/lib/api/auth-guard';
import { buildSchedule, scoreRoute, formatTime, parseTime } from '@/lib/planner';
import type { OrderInput } from '@/lib/planner';

// ── Single-employee reoptimize logic (extracted for reuse) ────────────────────

async function reoptimizeSingleEmployee(
  supabase: ReturnType<typeof getAdminClient>,
  employeeId: string,
  targetDate: string,
  keepLocked?: boolean,
): Promise<{ success: boolean; employee_id: string; date: string; total_orders: number; total_km: number; score: any; schedule: any[] } | { error: string; status: number }> {
  // ── Fetch employee ──
  const { data: employee } = await supabase
    .from('employees')
    .select('id, user:profiles(full_name)')
    .eq('id', employeeId)
    .single();

  if (!employee) {
    return { error: 'Employee not found', status: 404 };
  }

  // ── Get GPS position ──
  let startLat: number | null = null;
  let startLng: number | null = null;

  const { data: gpsData } = await supabase
    .from('employee_gps')
    .select('lat, lng')
    .eq('employee_id', employeeId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (gpsData?.lat && gpsData?.lng) {
    startLat = gpsData.lat;
    startLng = gpsData.lng;
  }

  if (!startLat) {
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('lat, lng')
      .eq('employee_id', employeeId)
      .maybeSingle();

    if (vehicle?.lat && vehicle?.lng) {
      startLat = vehicle.lat;
      startLng = vehicle.lng;
    }
  }

  if (!startLat || !startLng) {
    startLat = 52.2297;
    startLng = 21.0122;
  }

  // ── Fetch orders ──
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select(`
      id, scheduled_time_start, time_window, services, status, address,
      client:clients(name, lat, lng, address)
    `)
    .eq('scheduled_date', targetDate)
    .eq('employee_id', employeeId)
    .not('status', 'in', '("cancelled","completed")')
    .order('scheduled_time_start', { ascending: true });

  if (ordersError) {
    return { error: ordersError.message, status: 500 };
  }

  if (!orders || orders.length === 0) {
    return {
      success: true,
      employee_id: employeeId,
      date: targetDate,
      total_orders: 0,
      total_km: 0,
      score: { score: 100, on_time: 0, tight: 0, late: 0, total_km: 0, total_duration_min: 0, finish_time: '--:--' },
      schedule: [],
    };
  }

  // ── Separate locked from flexible ──
  const locked: typeof orders = [];
  const flexible: typeof orders = [];

  for (const order of orders) {
    const client = order.client as any;
    if (!client?.lat || !client?.lng) continue;

    if (keepLocked && order.status === 'in_progress') {
      locked.push(order);
    } else {
      flexible.push(order);
    }
  }

  // ── Nearest-neighbor optimization ──
  const optimized: typeof orders = [...locked];
  const remaining = [...flexible];
  let currentLat = startLat;
  let currentLng = startLng;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const client = remaining[i].client as any;
      const dist = haversineKm(currentLat, currentLng, client.lat, client.lng);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    const next = remaining.splice(bestIdx, 1)[0];
    const nextClient = next.client as any;
    optimized.push(next);
    currentLat = nextClient.lat;
    currentLng = nextClient.lng;
  }

  // ── Build schedule ──
  let prevLat = startLat;
  let prevLng = startLng;

  const orderInputs: OrderInput[] = optimized.map(order => {
    const client = order.client as any;
    const travelMin = etaMinutes(haversineKm(prevLat, prevLng, client.lat, client.lng));
    prevLat = client.lat;
    prevLng = client.lng;

    const serviceNames = (order.services as any[])?.map((s: any) =>
      typeof s === 'string' ? s : s?.name || ''
    ) || [];

    return {
      order_id: order.id,
      lat: client.lat,
      lng: client.lng,
      client_name: client.name || '',
      address: order.address || client.address || '',
      time_window: order.time_window,
      time_window_start: (order as any).time_window_start ?? null,
      time_window_end: (order as any).time_window_end ?? null,
      scheduled_time_start: order.scheduled_time_start,
      services: serviceNames,
      travel_from_prev_minutes: travelMin,
    };
  });

  const startMinutes = parseTime('08:00');
  const schedule = buildSchedule(startMinutes, orderInputs);

  // ── Calculate total km ──
  const waypoints = [
    { lat: startLat, lng: startLng },
    ...optimized.map(o => {
      const c = o.client as any;
      return { lat: c.lat as number, lng: c.lng as number };
    }),
  ];
  const totalKm = totalRouteKm(waypoints);
  const score = scoreRoute(schedule, totalKm);

  // ── Update scheduled_time_start for each order ──
  const updates = schedule.map((stop, i) => ({
    id: stop.order_id,
    scheduled_time_start: stop.service_start,
  }));

  for (const upd of updates) {
    await supabase
      .from('orders')
      .update({ scheduled_time_start: upd.scheduled_time_start })
      .eq('id', upd.id);
  }

  return {
    success: true,
    employee_id: employeeId,
    date: targetDate,
    total_orders: schedule.length,
    total_km: Math.round(totalKm * 10) / 10,
    score,
    schedule,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { employee_id, date, keep_locked, cascade } = body;

    // ── Cascade mode: reoptimize ALL employees for a date ─────────────
    if (cascade && date) {
      const targetDate = date;

      // Find all distinct employees with orders on this date
      const { data: employeeRows, error: empError } = await supabase
        .from('orders')
        .select('employee_id')
        .eq('scheduled_date', targetDate)
        .not('status', 'in', '("cancelled","completed")')
        .not('employee_id', 'is', null);

      if (empError) {
        return NextResponse.json({ error: empError.message }, { status: 500 });
      }

      const uniqueIds = [...new Set((employeeRows || []).map(r => r.employee_id as string))];

      if (uniqueIds.length === 0) {
        return NextResponse.json({
          success: true,
          cascade: true,
          date: targetDate,
          results: [],
          message: 'No employees with orders on this date',
        });
      }

      // Reoptimize each employee (skip the triggering employee if provided)
      const results: any[] = [];
      for (const empId of uniqueIds) {
        // If called from task completion, skip the employee that was just reoptimized
        if (employee_id && empId === employee_id) continue;

        const result = await reoptimizeSingleEmployee(supabase, empId, targetDate, keep_locked);
        results.push(result);
      }

      return NextResponse.json({
        success: true,
        cascade: true,
        date: targetDate,
        employees_reoptimized: results.length,
        results,
      });
    }

    // ── Single employee mode ──────────────────────────────────────────
    if (!employee_id) {
      return NextResponse.json({ error: 'employee_id is required (or use cascade: true with date)' }, { status: 400 });
    }

    const targetDate = date || new Date().toISOString().split('T')[0];

    const result = await reoptimizeSingleEmployee(supabase, employee_id, targetDate, keep_locked);

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[planner/reoptimize]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
