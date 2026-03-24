/**
 * POST /api/planner/suggest-insert
 *
 * Smart worker suggestion for dispatchers.
 * Delegates to the shared autoAssignWorker engine in src/lib/auto-assign.ts.
 *
 * Body: { order_id: string, date?: string }
 * Returns top 5 suggestions sorted by composite score.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { autoAssignWorker } from '@/lib/auto-assign';
import { checkAuth } from '@/lib/api/auth-guard';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { order_id, date } = body;

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    // ── Fetch the target order with client coords ───────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, scheduled_date, scheduled_time_start, scheduling_type, time_window_start, time_window_end, priority, services, client:clients(lat, lng)')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderClient = (order as any).client;
    if (!orderClient?.lat || !orderClient?.lng) {
      return NextResponse.json(
        { error: 'Zlecenie nie ma współrzędnych GPS. Sprawdź adres klienta.', suggestions: [] },
        { status: 422 },
      );
    }

    const targetDate = date || order.scheduled_date || new Date().toISOString().split('T')[0];

    // Calculate total service duration from order services
    const services = (order as any).services as { service_id: string; duration_minutes?: number; quantity?: number }[] | null;
    const totalDuration = (services ?? []).reduce((sum: number, s: any) => {
      return sum + (s.duration_minutes || 60) * (s.quantity || 1);
    }, 0) || 60;

    // ── Delegate to shared engine ───────────────────────────────────────────
    const results = await autoAssignWorker({
      order_lat: orderClient.lat,
      order_lng: orderClient.lng,
      scheduled_date: targetDate,
      scheduling_type: (order as any).scheduling_type || 'time_window',
      time_window_start: (order as any).time_window_start,
      time_window_end: (order as any).time_window_end,
      scheduled_time: (order as any).scheduled_time_start,
      priority: (order as any).priority || 'normal',
      service_duration_minutes: totalDuration,
      exclude_order_id: order_id,
    });

    // Map to the legacy response shape expected by existing consumers
    const suggestions = results.map(r => ({
      employee_id: r.employee_id,
      employee_name: r.employee_name,
      plate: r.plate_number,
      current_orders: r.current_orders,
      insertion_index: r.insertion_index,
      extra_km: r.extra_km,
      gps_distance_km: r.gps_distance_km,
      gps_status: r.gps_status,
      gps_speed: r.gps_speed,
      has_skills: r.has_skills,
      is_driving: r.is_driving,
      is_nearby: r.is_nearby,
      travel_minutes: r.travel_minutes,
      distance_km: r.distance_km,
      score: r.score,
      reason: r.reason,
    }));

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error('[planner/suggest-insert]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
