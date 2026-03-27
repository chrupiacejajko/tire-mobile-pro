/**
 * GET /api/orders/suggest-employees?order_id=...
 *
 * Returns active employees ranked by:
 *  - Skills match (required_skills on order vs employee.skills)
 *  - Workload on that day (fewer orders = better)
 *  - Proximity: distance from order's client coords to employee's
 *    nearest existing order that day OR latest GPS ping
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm } from '@/lib/geo';

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const orderId = new URL(request.url).searchParams.get('order_id');
  if (!orderId) return NextResponse.json({ error: 'order_id required' }, { status: 400 });

  // ── Load order + its client coords ──────────────────────────────────────
  const { data: order } = await supabase
    .from('orders')
    .select('id, scheduled_date, address, required_skills, client:clients(lat, lng)')
    .eq('id', orderId)
    .single();

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const orderLat: number | null = (order as any).client?.lat ?? null;
  const orderLng: number | null = (order as any).client?.lng ?? null;

  // ── Load active employees with name ─────────────────────────────────────
  const { data: employees } = await supabase
    .from('employees')
    .select('id, vehicle_info, user:profiles(full_name), employee_skills(skill:skills(name))')
    .eq('is_active', true);

  if (!employees?.length) return NextResponse.json({ suggestions: [] });

  // Build skill name arrays from junction table
  const empSkillsMap = new Map<string, string[]>();
  for (const emp of employees) {
    const names = ((emp as any).employee_skills ?? [])
      .map((es: any) => es.skill?.name)
      .filter(Boolean) as string[];
    empSkillsMap.set(emp.id, names);
  }

  const empIds = employees.map((e) => e.id);

  // ── Load orders for that day ─────────────────────────────────────────────
  const { data: dayOrders } = await supabase
    .from('orders')
    .select(
      'id, employee_id, address, scheduled_time_start, scheduled_time_end, client:clients(lat, lng, name)'
    )
    .eq('scheduled_date', order.scheduled_date)
    .not('status', 'eq', 'cancelled')
    .not('employee_id', 'is', null)
    .neq('id', orderId);

  // ── Latest GPS positions ─────────────────────────────────────────────────
  const { data: allLocs } = await supabase
    .from('employee_locations')
    .select('employee_id, lat, lng, status, timestamp')
    .in('employee_id', empIds)
    .order('timestamp', { ascending: false });

  // Keep only latest ping per employee
  const latestLoc = new Map<string, { lat: number; lng: number; status: string }>();
  for (const loc of allLocs ?? []) {
    if (!latestLoc.has(loc.employee_id)) latestLoc.set(loc.employee_id, loc);
  }

  // ── Score each employee ──────────────────────────────────────────────────
  const requiredSkills: string[] = (order as any).required_skills ?? [];

  const scored = employees.map((emp) => {
    const myOrders = (dayOrders ?? []).filter((o) => o.employee_id === emp.id);
    const orderCount = myOrders.length;

    // Skills match
    const empSkills = empSkillsMap.get(emp.id) ?? [];
    const skillsMatch =
      requiredSkills.length === 0 ||
      requiredSkills.every((s) => empSkills.includes(s));

    // Proximity: find nearest existing job OR use GPS
    let distKm: number | null = null;
    let nearestJob: { address: string; time: string; client: string | null } | null = null;

    if (orderLat !== null && orderLng !== null) {
      // 1) Check GPS ping
      const gps = latestLoc.get(emp.id);
      if (gps) distKm = haversineKm(orderLat, orderLng, gps.lat, gps.lng);

      // 2) Check all day orders for closer proximity
      for (const o of myOrders) {
        const c = (o as any).client;
        if (c?.lat && c?.lng) {
          const d = haversineKm(orderLat, orderLng, c.lat, c.lng);
          if (distKm === null || d < distKm) {
            distKm = d;
            nearestJob = {
              address: o.address,
              time: o.scheduled_time_start?.slice(0, 5) ?? '',
              client: c.name ?? null,
            };
          }
        }
      }
    }

    // All day order addresses for route planning
    const dayRoute = myOrders
      .sort((a, b) => (a.scheduled_time_start > b.scheduled_time_start ? 1 : -1))
      .map((o) => ({
        id: o.id,
        address: o.address,
        time: o.scheduled_time_start?.slice(0, 5) ?? '',
        client: (o as any).client?.name ?? null,
      }));

    // Score: lower = better (assigned first)
    const score =
      (skillsMatch ? 0 : 200) +
      orderCount * 15 +
      (distKm !== null ? Math.min(distKm, 100) : 50);

    const gpsInfo = latestLoc.get(emp.id);

    return {
      id: emp.id,
      name: (emp as any).user?.full_name ?? 'Pracownik',
      vehicle_info: emp.vehicle_info ?? null,
      order_count: orderCount,
      dist_km: distKm !== null ? Math.round(distKm * 10) / 10 : null,
      skills_match: skillsMatch,
      nearest_job: nearestJob,
      day_route: dayRoute,
      is_online: gpsInfo ? ['online', 'driving', 'working'].includes(gpsInfo.status) : false,
      gps_status: gpsInfo?.status ?? null,
      score,
    };
  });

  scored.sort((a, b) => a.score - b.score);

  return NextResponse.json({ suggestions: scored.slice(0, 5) });
}
