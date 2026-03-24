/**
 * POST /api/planner/insert
 *
 * Insert an order into an employee's route at the optimal position.
 *
 * Body: { order_id: string, employee_id: string, date?: string }
 *
 * - Finds the best insertion index using findBestInsertion
 * - Computes scheduled_time_start based on surrounding orders
 * - Updates the order in Supabase with employee_id, status, and time
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { findBestInsertion, haversineKm } from '@/lib/geo';
import { checkAuth } from '@/lib/api/auth-guard';
import { fireNotification, buildNotificationContext } from '@/lib/notification-dispatcher';

const DEFAULT_START_TIME = '08:00';
const DEFAULT_DURATION_MIN = 45;
const TRAVEL_BUFFER_MIN = 30;

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
      .select('id, scheduled_date, time_window, client:clients(lat, lng)')
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
      .select('id, scheduled_time_start, time_window, services, client:clients(lat, lng)')
      .eq('scheduled_date', targetDate)
      .eq('employee_id', employee_id)
      .not('status', 'eq', 'cancelled')
      .neq('id', order_id)
      .order('scheduled_time_start', { ascending: true });

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

    // Fire assignment notification (fire-and-forget)
    buildNotificationContext(order_id).then(ctx => fireNotification('order_assigned', ctx)).catch(() => {});

    return NextResponse.json({
      success: true,
      insertion_index: insertionIndex,
      extra_km: extraKm,
      scheduled_time_start: scheduledTimeStart,
      order_id,
      employee_id,
    });
  } catch (err) {
    console.error('[planner/insert]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
