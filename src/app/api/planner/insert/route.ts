/**
 * POST /api/planner/insert
 *
 * Insert an order into an employee's route at the optimal position.
 *
 * Body: { order_id: string, employee_id: string, date?: string }
 *
 * - Finds the best insertion index using findBestInsertion
 * - Computes scheduled_time_start based on surrounding orders
 * - Checks feasibility: late orders, tight windows, schedule overflow
 * - Saves snapshot for undo
 * - Updates the order in Supabase with employee_id, status, and time
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { findBestInsertion, haversineKm } from '@/lib/geo';
import { checkAuth } from '@/lib/api/auth-guard';
import { fireNotification, buildNotificationContext } from '@/lib/notification-dispatcher';
import { buildSchedule, scoreRoute, parseTime, formatTime, DEFAULT_SERVICE_DURATION_MIN, TIME_WINDOWS } from '@/lib/planner';
import type { OrderInput } from '@/lib/planner';
import crypto from 'crypto';

const DEFAULT_START_TIME = '08:00';
const DEFAULT_DURATION_MIN = 45;
const TRAVEL_BUFFER_MIN = 30;
const DEFAULT_WORK_END = '18:00';

interface CausesLateEntry {
  order_id: string;
  client_name: string;
  delay_minutes: number;
}

interface SnapshotEntry {
  order_id: string;
  employee_id: string | null;
  status: string;
  scheduled_time_start: string | null;
  scheduled_date: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { order_id, employee_id, date } = body;

    if (!order_id || !employee_id) {
      return NextResponse.json(
        { error: 'order_id and employee_id are required' },
        { status: 400 },
      );
    }

    // ── Fetch the target order with client coords ───────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, scheduled_date, scheduled_time_start, status, time_window, time_window_start, time_window_end, services, client:clients(lat, lng, name)')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderClient = (order as any).client;
    if (!orderClient?.lat || !orderClient?.lng) {
      return NextResponse.json(
        { error: 'Order client has no coordinates' },
        { status: 422 },
      );
    }

    const targetDate = date || order.scheduled_date || new Date().toISOString().split('T')[0];

    // ── Fetch existing orders for this employee on the date ─────────────────
    const { data: existingOrders } = await supabase
      .from('orders')
      .select('id, scheduled_time_start, status, time_window, time_window_start, time_window_end, services, client:clients(lat, lng, name)')
      .eq('scheduled_date', targetDate)
      .eq('employee_id', employee_id)
      .not('status', 'eq', 'cancelled')
      .neq('id', order_id)
      .order('scheduled_time_start', { ascending: true });

    // ── Fetch work schedule for end time ────────────────────────────────────
    const { data: workSchedule } = await supabase
      .from('work_schedules')
      .select('start_time, end_time')
      .eq('date', targetDate)
      .eq('employee_id', employee_id)
      .maybeSingle();

    const workStartMin = parseTime((workSchedule as any)?.start_time ?? DEFAULT_START_TIME);
    const workEndMin = parseTime((workSchedule as any)?.end_time ?? DEFAULT_WORK_END);

    const sortedOrders = (existingOrders || []).filter((o) => {
      const c = (o as any).client;
      return c?.lat && c?.lng;
    });

    // ── Build waypoints from existing orders ────────────────────────────────
    const waypoints = sortedOrders.map((o) => {
      const c = (o as any).client;
      return { lat: c.lat as number, lng: c.lng as number };
    });

    const newPoint = { lat: orderClient.lat as number, lng: orderClient.lng as number };

    // ── Find optimal insertion position ─────────────────────────────────────
    const { index: insertionIndex, costKm: extraKm } = findBestInsertion(waypoints, newPoint);

    // ── Compute scheduled_time_start ────────────────────────────────────────
    let scheduledMinutes: number;

    if (sortedOrders.length === 0) {
      // Empty route — use time_window start or default
      const timeWindow = (order as any).time_window as string | null;
      if (timeWindow === 'morning') {
        scheduledMinutes = parseTime('08:00');
      } else if (timeWindow === 'afternoon') {
        scheduledMinutes = parseTime('12:00');
      } else if (timeWindow === 'evening') {
        scheduledMinutes = parseTime('16:00');
      } else {
        scheduledMinutes = parseTime(DEFAULT_START_TIME);
      }
    } else if (insertionIndex === 0) {
      // Insert before first order
      const firstTime = sortedOrders[0].scheduled_time_start;
      if (firstTime) {
        const firstMinutes = parseTime(firstTime.slice(0, 5));
        scheduledMinutes = Math.max(
          parseTime(DEFAULT_START_TIME),
          firstMinutes - DEFAULT_DURATION_MIN - TRAVEL_BUFFER_MIN,
        );
      } else {
        scheduledMinutes = parseTime(DEFAULT_START_TIME);
      }
    } else if (insertionIndex >= sortedOrders.length) {
      // Append after last order
      const lastOrder = sortedOrders[sortedOrders.length - 1];
      const lastTime = lastOrder.scheduled_time_start;
      if (lastTime) {
        scheduledMinutes = parseTime(lastTime.slice(0, 5)) + DEFAULT_DURATION_MIN + TRAVEL_BUFFER_MIN;
      } else {
        scheduledMinutes = parseTime(DEFAULT_START_TIME) + sortedOrders.length * (DEFAULT_DURATION_MIN + TRAVEL_BUFFER_MIN);
      }
    } else {
      // Insert between two orders — midpoint
      const prevOrder = sortedOrders[insertionIndex - 1];
      const nextOrder = sortedOrders[insertionIndex];
      const prevTime = prevOrder.scheduled_time_start
        ? parseTime(prevOrder.scheduled_time_start.slice(0, 5))
        : parseTime(DEFAULT_START_TIME);
      const nextTime = nextOrder.scheduled_time_start
        ? parseTime(nextOrder.scheduled_time_start.slice(0, 5))
        : prevTime + DEFAULT_DURATION_MIN + TRAVEL_BUFFER_MIN;
      scheduledMinutes = Math.round((prevTime + nextTime) / 2);
    }

    const scheduledTimeStart = formatTime(scheduledMinutes);

    // ── Feasibility simulation ───────────────────────────────────────────────
    // Simulate the full schedule with the new order inserted to detect
    // whether any subsequent orders become late or schedule overflows.

    // Calculate service duration for the new order
    const rawServices = (order as any).services as { duration_minutes?: number; quantity?: number }[] | null;
    const newOrderDuration = (rawServices ?? []).reduce((sum: number, s: any) => {
      return sum + (s.duration_minutes || 0) * (s.quantity || 1);
    }, 0) || DEFAULT_SERVICE_DURATION_MIN;

    // Build OrderInput array for simulation (with new order inserted)
    const allOrdersForSim = [
      ...sortedOrders.slice(0, insertionIndex),
      {
        id: order_id,
        scheduled_time_start: scheduledTimeStart,
        status: 'assigned',
        time_window: (order as any).time_window,
        time_window_start: (order as any).time_window_start ?? null,
        time_window_end: (order as any).time_window_end ?? null,
        services: (order as any).services ?? [],
        client: { lat: orderClient.lat, lng: orderClient.lng, name: orderClient.name ?? 'Klient' },
      },
      ...sortedOrders.slice(insertionIndex),
    ];

    // Build a simulated schedule to score before/after
    // Score "before" (without new order)
    let prevLat = 52.2297, prevLng = 21.0122; // Warsaw default — we don't have GPS here
    const beforeInputs: OrderInput[] = sortedOrders.map((o) => {
      const c = (o as any).client;
      const km = haversineKm(prevLat, prevLng, c.lat, c.lng) * 1.35;
      prevLat = c.lat; prevLng = c.lng;
      const rawSvc = (o as any).services as { duration_minutes?: number; quantity?: number }[] | null;
      const dur = (rawSvc ?? []).reduce((s: number, sv: any) => s + (sv.duration_minutes || 0) * (sv.quantity || 1), 0) || DEFAULT_SERVICE_DURATION_MIN;
      return {
        order_id: o.id,
        lat: c.lat, lng: c.lng,
        client_name: c.name ?? 'Klient',
        address: '',
        time_window: (o as any).time_window,
        time_window_start: (o as any).time_window_start ?? null,
        time_window_end: (o as any).time_window_end ?? null,
        scheduled_time_start: o.scheduled_time_start,
        services: (o as any).services ?? [],
        travel_from_prev_minutes: Math.round(km / 50 * 60),
        service_duration_minutes: dur,
      };
    });

    prevLat = 52.2297; prevLng = 21.0122;
    const afterInputs: OrderInput[] = allOrdersForSim.map((o) => {
      const c = (o as any).client;
      const km = haversineKm(prevLat, prevLng, c.lat, c.lng) * 1.35;
      prevLat = c.lat; prevLng = c.lng;
      const rawSvc = (o as any).services as { duration_minutes?: number; quantity?: number }[] | null;
      const dur = (rawSvc ?? []).reduce((s: number, sv: any) => s + (sv.duration_minutes || 0) * (sv.quantity || 1), 0) || DEFAULT_SERVICE_DURATION_MIN;
      return {
        order_id: (o as any).id,
        lat: c.lat, lng: c.lng,
        client_name: c.name ?? 'Klient',
        address: '',
        time_window: (o as any).time_window,
        time_window_start: (o as any).time_window_start ?? null,
        time_window_end: (o as any).time_window_end ?? null,
        scheduled_time_start: (o as any).scheduled_time_start,
        services: (o as any).services ?? [],
        travel_from_prev_minutes: Math.round(km / 50 * 60),
        service_duration_minutes: dur,
      };
    });

    const beforeSchedule = buildSchedule(workStartMin, beforeInputs);
    const afterSchedule = buildSchedule(workStartMin, afterInputs);

    const beforeKm = beforeInputs.reduce((s, i) => s + i.travel_from_prev_minutes * 50 / 60, 0);
    const afterKm = afterInputs.reduce((s, i) => s + i.travel_from_prev_minutes * 50 / 60, 0);
    const scoreBefore = scoreRoute(beforeSchedule, beforeKm);
    const scoreAfter = scoreRoute(afterSchedule, afterKm);

    // Detect which orders became late due to insertion
    const beforeLateMap = new Map(beforeSchedule.map(s => [s.order_id, s.delay_minutes]));
    const causesLate: CausesLateEntry[] = [];
    for (const stop of afterSchedule) {
      if (stop.order_id === order_id) continue; // new order itself
      const prevDelay = beforeLateMap.get(stop.order_id) ?? 0;
      if (stop.delay_minutes > prevDelay && stop.delay_minutes > 0) {
        causesLate.push({
          order_id: stop.order_id,
          client_name: stop.client_name,
          delay_minutes: stop.delay_minutes,
        });
      }
    }

    // Check if last stop exceeds work schedule end time
    const lastStop = afterSchedule[afterSchedule.length - 1];
    const exceedsSchedule = lastStop ? lastStop.departure_minutes > workEndMin : false;

    // Tight window: new order itself has tight status
    const newOrderStop = afterSchedule.find(s => s.order_id === order_id);
    const tightWindow = newOrderStop?.time_window_status === 'tight' || newOrderStop?.time_window_status === 'late';

    // Build human-readable reason for position choice
    let reason: string;
    if (sortedOrders.length === 0) {
      reason = 'Pierwsza trasa tego dnia';
    } else if (insertionIndex === 0) {
      reason = `Najkrótsza trasa — przed pkt #1 (+${Math.round(extraKm * 10) / 10} km)`;
    } else if (insertionIndex >= sortedOrders.length) {
      reason = `Najkrótsza trasa — po pkt #${sortedOrders.length} (+${Math.round(extraKm * 10) / 10} km)`;
    } else {
      reason = `Najkrótsza trasa od pkt #${insertionIndex} (+${Math.round(extraKm * 10) / 10} km)`;
    }

    // ── Save snapshot BEFORE committing ─────────────────────────────────────
    const snapshotEntries: SnapshotEntry[] = [
      {
        order_id: order.id,
        employee_id: (order as any).employee_id ?? null,
        status: (order as any).status ?? 'new',
        scheduled_time_start: order.scheduled_time_start ?? null,
        scheduled_date: order.scheduled_date ?? null,
      },
    ];

    const undoToken = crypto.randomBytes(16).toString('hex');
    const undoExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // ── Update the order in Supabase ────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        employee_id,
        status: 'assigned',
        scheduled_time_start: scheduledTimeStart,
        scheduled_date: targetDate,
      })
      .eq('id', order_id);

    if (updateError) {
      console.error('[planner/insert] Update failed:', updateError);
      return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }

    // Save snapshot after successful commit
    try {
      await supabase.from('planner_snapshots').insert({
        token: undoToken,
        date: targetDate,
        snapshot: snapshotEntries,
        action_type: 'insert',
        created_by: (auth as any).user?.id ?? null,
        expires_at: undoExpiresAt,
      });
    } catch (snapshotErr) {
      // Non-fatal
      console.error('[planner/insert] Failed to save snapshot:', snapshotErr);
    }

    // Fire assignment notification (fire-and-forget)
    buildNotificationContext(order_id).then(ctx => fireNotification('order_assigned', ctx)).catch(() => {});

    const status: 'success' | 'warning' = (causesLate.length > 0 || tightWindow || exceedsSchedule) ? 'warning' : 'success';

    let message: string;
    if (status === 'warning') {
      const parts: string[] = [];
      if (causesLate.length > 0) parts.push(`${causesLate.length} zleceń może się spóźnić`);
      if (tightWindow) parts.push('ciasne okno czasowe');
      if (exceedsSchedule) parts.push('przekroczenie czasu pracy');
      message = `Wstawiono, ale: ${parts.join(', ')}`;
    } else {
      message = `Wstawiono na pozycję #${insertionIndex + 1}`;
    }

    return NextResponse.json({
      status,
      message,
      success: true,
      insertion_index: insertionIndex,
      extra_km: Math.round(extraKm * 10) / 10,
      scheduled_time_start: scheduledTimeStart,
      order_id,
      employee_id,
      score_before: scoreBefore.score,
      score_after: scoreAfter.score,
      causes_late: causesLate,
      tight_window: tightWindow,
      exceeds_schedule: exceedsSchedule,
      reason,
      undo_token: undoToken,
      undo_expires_at: undoExpiresAt,
    });
  } catch (err) {
    console.error('[planner/insert]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
