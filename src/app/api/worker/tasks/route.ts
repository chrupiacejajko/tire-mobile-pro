/**
 * GET /api/worker/tasks?date=2026-03-23&employee_id=xxx
 *
 * Returns today's tasks for a field worker, sorted by optimized sequence.
 * Includes navigation URLs and distance to each task from current GPS.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm } from '@/lib/geo';
import { buildGoogleMapsUrl } from '@/lib/planner';

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const employeeId = searchParams.get('employee_id');

  if (!employeeId) return NextResponse.json({ error: 'employee_id required' }, { status: 400 });

  // Get today's orders for this employee
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, status, priority, scheduled_time_start, scheduled_time_end, time_window,
      description, notes, services,
      client:clients(id, name, phone, lat, lng, address, city)
    `)
    .eq('scheduled_date', date)
    .eq('employee_id', employeeId)
    .not('status', 'eq', 'cancelled')
    .order('scheduled_time_start', { ascending: true });

  // Get worker's latest GPS
  const { data: loc } = await supabase
    .from('employee_locations')
    .select('lat, lng, speed, status, timestamp')
    .eq('employee_id', employeeId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  // Get completed photo count per order
  const orderIds = (orders || []).map(o => o.id);
  const { data: photos } = orderIds.length
    ? await supabase.from('order_photos').select('order_id').in('order_id', orderIds)
    : { data: [] };
  const photoCount = new Map<string, number>();
  for (const p of photos || []) {
    photoCount.set(p.order_id, (photoCount.get(p.order_id) || 0) + 1);
  }

  const workerPos = loc ? { lat: loc.lat, lng: loc.lng } : null;

  const tasks = (orders || []).map(o => {
    const c = (o as any).client;
    const distKm = workerPos && c?.lat && c?.lng
      ? Math.round(haversineKm(workerPos.lat, workerPos.lng, c.lat, c.lng) * 10) / 10
      : null;
    const navUrl = c?.lat && c?.lng
      ? buildGoogleMapsUrl(
          workerPos ?? { lat: c.lat, lng: c.lng },
          [{ lat: c.lat, lng: c.lng }],
        )
      : null;

    return {
      id: o.id,
      status: o.status,
      priority: (o as any).priority ?? 'normal',
      scheduled_time_start: o.scheduled_time_start,
      scheduled_time_end: o.scheduled_time_end,
      time_window: (o as any).time_window,
      description: (o as any).description ?? null,
      notes: (o as any).notes ?? null,
      services: (o as any).services ?? [],
      client_name: c?.name ?? 'Klient',
      client_phone: c?.phone ?? null,
      address: [c?.address, c?.city].filter(Boolean).join(', '),
      lat: c?.lat ?? null,
      lng: c?.lng ?? null,
      distance_km: distKm,
      navigate_url: navUrl,
      photos_taken: photoCount.get(o.id) ?? 0,
    };
  });

  // Stats
  const done = tasks.filter(t => t.status === 'completed').length;
  const total = tasks.length;
  const next = tasks.find(t => t.status !== 'completed' && t.status !== 'cancelled');

  return NextResponse.json({
    date,
    employee_id: employeeId,
    current_location: workerPos,
    tasks,
    stats: {
      total,
      completed: done,
      remaining: total - done,
      progress_pct: total > 0 ? Math.round((done / total) * 100) : 0,
    },
    next_task_id: next?.id ?? null,
  });
}
