/**
 * POST /api/planner/reoptimize
 *
 * Re-optimizes the route for ONE employee without touching others.
 * Uses nearest-neighbor from the employee's current GPS position.
 *
 * Body: { employee_id: string, date?: string, keep_locked?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm, etaMinutes, totalRouteKm } from '@/lib/geo';
import { checkAuth } from '@/lib/api/auth-guard';
import { buildSchedule, scoreRoute, formatTime, parseTime } from '@/lib/planner';
import type { OrderInput } from '@/lib/planner';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { employee_id, date, keep_locked } = body;

    if (!employee_id) {
      return NextResponse.json({ error: 'employee_id is required' }, { status: 400 });
    }

    const targetDate = date || new Date().toISOString().split('T')[0];

    // ── Fetch employee's current GPS position ──────────────────────────
    const { data: employee } = await supabase
      .from('employees')
      .select('id, user:profiles(full_name)')
      .eq('id', employee_id)
      .single();

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Try to get GPS position from employee_gps or vehicles
    let startLat: number | null = null;
    let startLng: number | null = null;

    const { data: gpsData } = await supabase
      .from('employee_gps')
      .select('lat, lng')
      .eq('employee_id', employee_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gpsData?.lat && gpsData?.lng) {
      startLat = gpsData.lat;
      startLng = gpsData.lng;
    }

    // Fallback: try vehicle GPS
    if (!startLat) {
      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('lat, lng')
        .eq('employee_id', employee_id)
        .maybeSingle();

      if (vehicle?.lat && vehicle?.lng) {
        startLat = vehicle.lat;
        startLng = vehicle.lng;
      }
    }

    // Default fallback: Warsaw center
    if (!startLat || !startLng) {
      startLat = 52.2297;
      startLng = 21.0122;
    }

    // ── Fetch all orders for this employee on the date ──────────────────
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id, scheduled_time_start, time_window, services, status, address,
        client:clients(name, lat, lng, address)
      `)
      .eq('scheduled_date', targetDate)
      .eq('employee_id', employee_id)
      .not('status', 'in', '("cancelled","completed")')
      .order('scheduled_time_start', { ascending: true });

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No orders to reoptimize',
        schedule: [],
      });
    }

    // ── Separate locked from flexible ──────────────────────────────────
    // Locked: orders that are in_progress or have a fixed appointment
    const locked: typeof orders = [];
    const flexible: typeof orders = [];

    for (const order of orders) {
      const client = order.client as any;
      if (!client?.lat || !client?.lng) continue; // skip orders without coords

      if (keep_locked && order.status === 'in_progress') {
        locked.push(order);
      } else {
        flexible.push(order);
      }
    }

    // ── Nearest-neighbor optimization on flexible orders ───────────────
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

    // ── Build schedule ─────────────────────────────────────────────────
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
        scheduled_time_start: order.scheduled_time_start,
        services: serviceNames,
        travel_from_prev_minutes: travelMin,
      };
    });

    const startMinutes = parseTime('08:00');
    const schedule = buildSchedule(startMinutes, orderInputs);

    // ── Calculate total km ─────────────────────────────────────────────
    const waypoints = [
      { lat: startLat, lng: startLng },
      ...optimized.map(o => {
        const c = o.client as any;
        return { lat: c.lat as number, lng: c.lng as number };
      }),
    ];
    const totalKm = totalRouteKm(waypoints);
    const score = scoreRoute(schedule, totalKm);

    // ── Update scheduled_time_start for each order ─────────────────────
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

    return NextResponse.json({
      success: true,
      employee_id,
      date: targetDate,
      total_orders: schedule.length,
      total_km: Math.round(totalKm * 10) / 10,
      score,
      schedule,
    });
  } catch (err) {
    console.error('[planner/reoptimize]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
