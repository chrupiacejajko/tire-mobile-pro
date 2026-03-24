/**
 * POST /api/planner/suggest-insert
 *
 * Suggest the best employees to handle an unassigned order.
 * Ranks employees by route insertion cost + distance from current GPS position.
 *
 * Body: { order_id: string, date?: string }
 *
 * Returns top 3 suggestions sorted by insertion cost ascending.
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
      .select('id, scheduled_date, required_skills, client:clients(lat, lng)')
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

    const newPoint = { lat: orderClient.lat as number, lng: orderClient.lng as number };
    const targetDate = date || order.scheduled_date || new Date().toISOString().split('T')[0];
    const requiredSkills: string[] = (order as any).required_skills ?? [];

    // ── Fetch all active employees ──────────────────────────────────────────
    const { data: employees } = await supabase
      .from('employees')
      .select('id, skills, user:profiles(full_name)')
      .eq('is_active', true);

    if (!employees?.length) {
      return NextResponse.json({ suggestions: [] });
    }

    const empIds = employees.map((e) => e.id);

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

    // ── Latest GPS positions ────────────────────────────────────────────────
    const { data: recentPositions } = await supabase
      .from('employee_locations')
      .select('employee_id, lat, lng')
      .in('employee_id', empIds)
      .order('timestamp', { ascending: false });

    const gpsMap = new Map<string, { lat: number; lng: number }>();
    for (const pos of recentPositions || []) {
      if (pos.employee_id && !gpsMap.has(pos.employee_id) && pos.lat && pos.lng) {
        gpsMap.set(pos.employee_id, { lat: pos.lat, lng: pos.lng });
      }
    }

    // ── Score each employee ─────────────────────────────────────────────────
    const scored: {
      employee_id: string;
      employee_name: string;
      plate: string | null;
      current_orders: number;
      insertion_index: number;
      extra_km: number;
      distance_from_current: number | null;
      has_skills: boolean;
      score: number;
    }[] = [];

    for (const emp of employees) {
      const waypoints = ordersByEmployee.get(emp.id) || [];
      const currentOrders = orderCountByEmployee.get(emp.id) || 0;
      const gpsPos = gpsMap.get(emp.id);

      const hasSkills =
        requiredSkills.length === 0 ||
        requiredSkills.every((s) => (emp.skills ?? []).includes(s));

      let insertionIndex: number;
      let extraKm: number;
      let distanceFromCurrent: number | null = null;

      if (gpsPos) {
        distanceFromCurrent = Math.round(haversineKm(gpsPos.lat, gpsPos.lng, newPoint.lat, newPoint.lng) * 10) / 10;
      }

      if (waypoints.length === 0) {
        // Empty route — cost is distance from GPS to order (or null)
        insertionIndex = 0;
        extraKm = distanceFromCurrent ?? 0;
      } else {
        const result = findBestInsertion(waypoints, newPoint);
        insertionIndex = result.index;
        extraKm = result.costKm;
      }

      // Score: lower = better
      // Primary: extra_km (route cost)
      // Secondary: skills mismatch penalty
      // Tertiary: workload balance (more orders = slightly worse)
      const score =
        extraKm +
        (hasSkills ? 0 : 200) +
        currentOrders * 2;

      scored.push({
        employee_id: emp.id,
        employee_name: (emp as any).user?.full_name ?? 'Pracownik',
        plate: employeeToPlate.get(emp.id) ?? null,
        current_orders: currentOrders,
        insertion_index: insertionIndex,
        extra_km: extraKm,
        distance_from_current: distanceFromCurrent,
        has_skills: hasSkills,
        score,
      });
    }

    scored.sort((a, b) => a.score - b.score);

    // Return top 3, stripping the internal score field
    const suggestions = scored.slice(0, 3).map(({ score: _score, ...rest }) => rest);

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error('[planner/suggest-insert]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
