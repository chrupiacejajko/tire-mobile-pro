/**
 * POST /api/planner/suggest-insert
 *
 * Smart worker suggestion for dispatchers.
 *
 * PRIMARY ranking factor: Real-time GPS distance to the order.
 * The worker who is PHYSICALLY CLOSEST right now ranks first.
 *
 * Secondary factors:
 * - Route insertion cost (how many extra km added to their day)
 * - Skills match
 * - Current workload (fewer orders = better)
 * - Priority handling (urgent orders skip workload balancing)
 *
 * Body: { order_id: string, date?: string }
 * Returns top 5 suggestions sorted by composite score.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { findBestInsertion, haversineKm } from '@/lib/geo';

export async function POST(request: NextRequest) {
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
      .select('id, scheduled_date, priority, client:clients(lat, lng)')
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

    const orderPoint = { lat: orderClient.lat as number, lng: orderClient.lng as number };
    const targetDate = date || order.scheduled_date || new Date().toISOString().split('T')[0];
    const requiredSkills: string[] = [];
    const isUrgent = order.priority === 'urgent' || order.priority === 'high';

    // ── Fetch all active employees ──────────────────────────────────────────
    const { data: employees } = await supabase
      .from('employees')
      .select('id, skills, user:profiles(full_name)')
      .eq('is_active', true);

    if (!employees?.length) {
      return NextResponse.json({ suggestions: [] });
    }

    const empIds = employees.map((e) => e.id);

    // ── Check unavailabilities ──────────────────────────────────────────────
    const { data: unavailabilities } = await supabase
      .from('unavailabilities')
      .select('employee_id')
      .lte('start_date', targetDate)
      .gte('end_date', targetDate);

    const unavailableIds = new Set((unavailabilities ?? []).map(u => u.employee_id));

    // ── Vehicle plates ──────────────────────────────────────────────────────
    const { data: vehicleAssignments } = await supabase
      .from('vehicle_assignments')
      .select('employee_id, vehicle:vehicles(plate_number)')
      .eq('is_active', true)
      .in('employee_id', empIds);

    const employeeToPlate = new Map<string, string>();
    for (const a of vehicleAssignments || []) {
      if (a.employee_id) {
        const plate = (a.vehicle as any)?.plate_number;
        if (plate) employeeToPlate.set(a.employee_id, plate);
      }
    }

    // ── Fetch all orders for the date (assigned to any employee) ────────────
    const { data: dayOrders } = await supabase
      .from('orders')
      .select('id, employee_id, scheduled_time_start, client:clients(lat, lng)')
      .eq('scheduled_date', targetDate)
      .not('status', 'eq', 'cancelled')
      .not('employee_id', 'is', null)
      .neq('id', order_id)
      .order('scheduled_time_start', { ascending: true });

    // Group orders by employee
    const ordersByEmployee = new Map<string, { lat: number; lng: number }[]>();
    const orderCountByEmployee = new Map<string, number>();
    for (const o of dayOrders || []) {
      if (!o.employee_id) continue;
      const c = (o as any).client;
      if (!c?.lat || !c?.lng) continue;
      const list = ordersByEmployee.get(o.employee_id) || [];
      list.push({ lat: c.lat, lng: c.lng });
      ordersByEmployee.set(o.employee_id, list);
      orderCountByEmployee.set(o.employee_id, (orderCountByEmployee.get(o.employee_id) || 0) + 1);
    }

    // ── Latest GPS positions (CRITICAL — this is the #1 ranking factor) ─────
    const { data: recentPositions } = await supabase
      .from('employee_locations')
      .select('employee_id, lat, lng, speed, status, timestamp')
      .in('employee_id', empIds)
      .order('timestamp', { ascending: false })
      .limit(empIds.length * 3); // Get a few per employee to find the latest

    const gpsMap = new Map<string, { lat: number; lng: number; speed: number | null; status: string | null; timestamp: string }>();
    for (const pos of recentPositions || []) {
      if (pos.employee_id && !gpsMap.has(pos.employee_id) && pos.lat && pos.lng) {
        gpsMap.set(pos.employee_id, {
          lat: pos.lat,
          lng: pos.lng,
          speed: pos.speed,
          status: pos.status,
          timestamp: pos.timestamp,
        });
      }
    }

    // ── Score each employee ─────────────────────────────────────────────────
    interface Suggestion {
      employee_id: string;
      employee_name: string;
      plate: string | null;
      current_orders: number;
      insertion_index: number;
      extra_km: number;
      gps_distance_km: number | null;
      gps_status: string | null;
      gps_speed: number | null;
      has_skills: boolean;
      is_driving: boolean;
      is_nearby: boolean;
      score: number;
    }

    const scored: Suggestion[] = [];

    for (const emp of employees) {
      // Skip unavailable employees
      if (unavailableIds.has(emp.id)) continue;

      const waypoints = ordersByEmployee.get(emp.id) || [];
      const currentOrders = orderCountByEmployee.get(emp.id) || 0;
      const gpsData = gpsMap.get(emp.id);

      const hasSkills =
        requiredSkills.length === 0 ||
        requiredSkills.every((s) => (emp.skills ?? []).includes(s));

      // ── GPS distance (primary factor) ─────────────────────────
      let gpsDistanceKm: number | null = null;
      if (gpsData) {
        gpsDistanceKm = Math.round(haversineKm(gpsData.lat, gpsData.lng, orderPoint.lat, orderPoint.lng) * 10) / 10;
      }

      // ── Route insertion cost ──────────────────────────────────
      let insertionIndex: number;
      let extraKm: number;

      if (waypoints.length === 0) {
        insertionIndex = 0;
        extraKm = gpsDistanceKm ?? 999;
      } else {
        const result = findBestInsertion(waypoints, orderPoint);
        insertionIndex = result.index;
        extraKm = result.costKm;
      }

      // ── Composite score (lower = better) ──────────────────────
      // GPS distance is the #1 factor — who is closest RIGHT NOW
      const gpsScore = gpsDistanceKm !== null ? gpsDistanceKm * 3 : 500; // heavy weight on proximity
      const routeScore = extraKm * 1; // secondary: route efficiency
      const skillPenalty = hasSkills ? 0 : 300; // big penalty for missing skills
      const workloadPenalty = isUrgent ? 0 : currentOrders * 5; // for urgent, ignore workload

      // Bonus for workers who are currently driving (they can reroute easily)
      const drivingBonus = gpsData?.status === 'driving' ? -10 : 0;

      const score = gpsScore + routeScore + skillPenalty + workloadPenalty + drivingBonus;

      const isDriving = gpsData?.status === 'driving' || (gpsData?.speed ?? 0) > 5;
      const isNearby = gpsDistanceKm !== null && gpsDistanceKm < 20;

      scored.push({
        employee_id: emp.id,
        employee_name: (emp as any).user?.full_name ?? 'Pracownik',
        plate: employeeToPlate.get(emp.id) ?? null,
        current_orders: currentOrders,
        insertion_index: insertionIndex,
        extra_km: extraKm,
        gps_distance_km: gpsDistanceKm,
        gps_status: gpsData?.status ?? null,
        gps_speed: gpsData?.speed ?? null,
        has_skills: hasSkills,
        is_driving: isDriving,
        is_nearby: isNearby,
        score,
      });
    }

    scored.sort((a, b) => a.score - b.score);

    // Return top 5
    const suggestions = scored.slice(0, 5).map(({ score: _score, ...rest }) => rest);

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error('[planner/suggest-insert]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
