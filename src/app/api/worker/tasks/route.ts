/**
 * GET /api/worker/tasks?date=2026-03-23&employee_id=xxx
 *
 * Returns today's tasks for a field worker, sorted by optimized sequence.
 * Includes navigation URLs and distance to each task from current GPS.
 *
 * Auth: worker JWT — employee_id is validated against the caller's JWT.
 *       Admin may pass any employee_id.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm } from '@/lib/geo';
import { buildGoogleMapsUrl } from '@/lib/planner';
import { checkAuth } from '@/lib/api/auth-guard';
import { assertEmployeeOwnership } from '@/lib/api/resolve-employee';

export async function GET(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'worker']);
  if (!auth.ok) return auth.response;

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const requestedEmployeeId = searchParams.get('employee_id');

  if (!requestedEmployeeId) {
    return NextResponse.json({ error: 'employee_id required' }, { status: 400 });
  }

  // DEV: admin preview mode — return demo tasks
  if (process.env.NODE_ENV !== 'production' && requestedEmployeeId === 'demo-admin-preview') {
    const demoTasks = [
      { id: 'demo-1', status: 'assigned', priority: 'normal', client_name: 'Marek Nowak', address: 'ul. Mickiewicza 15, Łódź', lat: 51.76, lng: 19.46, scheduled_time_start: '09:00', time_window: 'morning', flexibility_minutes: 30, services: [{ name: 'Wymiana opon', price: 199 }], distance_km: 4.2, navigate_url: 'https://maps.google.com', source: 'dispatcher', internal_task_type: null, is_paid_time: true },
      { id: 'demo-2', status: 'assigned', priority: 'high', client_name: 'Anna Wiśniewska', address: 'ul. Piotrkowska 120, Łódź', lat: 51.77, lng: 19.45, scheduled_time_start: '10:30', time_window: 'morning', flexibility_minutes: 60, services: [{ name: 'Wymiana opon', price: 199 }, { name: 'Wyważanie', price: 80 }], distance_km: 7.1, navigate_url: 'https://maps.google.com', source: 'dispatcher', internal_task_type: null, is_paid_time: true },
      { id: 'demo-3', status: 'assigned', priority: 'normal', client_name: 'Tomasz Zieliński', address: 'ul. Narutowicza 68, Łódź', lat: 51.75, lng: 19.47, scheduled_time_start: '12:00', time_window: 'afternoon', flexibility_minutes: 90, services: [{ name: 'Serwis opon ciężarowych', price: 450 }], distance_km: 3.5, navigate_url: 'https://maps.google.com', source: 'dispatcher', internal_task_type: null, is_paid_time: true },
      { id: 'demo-4', status: 'assigned', priority: 'normal', client_name: '', address: 'Hurtownia InterCars, ul. Strykowska 15, Łódź', lat: 51.80, lng: 19.43, scheduled_time_start: '14:00', time_window: null, flexibility_minutes: 120, services: [{ name: 'Odbiór opon' }], distance_km: 8.3, navigate_url: 'https://maps.google.com', source: 'internal', internal_task_type: 'pickup', is_paid_time: true },
      { id: 'demo-5', status: 'assigned', priority: 'normal', client_name: 'Piotr Grabowski', address: 'ul. Łąkowa 5, Łódź', lat: 51.74, lng: 19.48, scheduled_time_start: '15:30', time_window: 'afternoon', flexibility_minutes: 60, services: [{ name: 'Wymiana opon', price: 199 }], distance_km: 5.0, navigate_url: 'https://maps.google.com', source: 'dispatcher', internal_task_type: null, is_paid_time: true },
      { id: 'demo-6', status: 'assigned', priority: 'normal', client_name: 'Katarzyna Kowalczyk', address: 'ul. Rewolucji 1905r 40, Łódź', lat: 51.78, lng: 19.44, scheduled_time_start: '17:00', time_window: 'evening', flexibility_minutes: 30, services: [{ name: 'Wymiana opon', price: 199 }, { name: 'Geometria', price: 150 }], distance_km: 6.2, navigate_url: 'https://maps.google.com', source: 'dispatcher', internal_task_type: null, is_paid_time: true },
    ];
    return NextResponse.json({
      date, employee_id: requestedEmployeeId,
      tasks: demoTasks,
      stats: { total: 6, completed: 0, remaining: 6, progress_pct: 0 },
      next_task_id: 'demo-1',
    });
  }

  // Ownership check: worker can only view their own tasks
  const ownership = await assertEmployeeOwnership(auth.userId, auth.role, requestedEmployeeId);
  if (!ownership.ok) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'NOT_YOUR_EMPLOYEE_ID' },
      { status: 403 }
    );
  }

  const employeeId = requestedEmployeeId;

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
