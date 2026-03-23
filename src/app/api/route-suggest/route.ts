import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm, etaMinutes, insertionCostKm } from '@/lib/geo';

/**
 * GET /api/route-suggest?lat=52.1&lng=21.0&date=2026-03-23
 *
 * Returns ranked list of employees who can handle a new order at (lat,lng):
 * - Distance from current GPS position
 * - ETA (estimated time of arrival)
 * - How many km it adds to their existing route
 * - Current workload for the day
 *
 * Used by dispatcher when a client calls → "Kto jest najbliżej?"
 */
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  // Get all active employees with names
  const { data: employees } = await supabase
    .from('employees')
    .select('id, user:profiles(full_name)')
    .eq('is_active', true);

  if (!employees?.length) {
    return NextResponse.json({ suggestions: [] });
  }

  // Get vehicle assignments to map vehicles → employees
  const { data: vehicleAssignments } = await supabase
    .from('vehicle_assignments')
    .select('employee_id, vehicle_id')
    .eq('is_active', true);

  const vehicleToEmployee = new Map<string, string>();
  for (const a of (vehicleAssignments || [])) {
    if (a.vehicle_id && a.employee_id) vehicleToEmployee.set(a.vehicle_id, a.employee_id);
  }

  // Get latest GPS positions
  const { data: recentPositions } = await supabase
    .from('employee_locations')
    .select('employee_id, vehicle_id, lat, lng, timestamp, speed, status')
    .order('timestamp', { ascending: false })
    .limit(200);

  const gpsMap = new Map<string, { lat: number; lng: number; speed: number | null; status: string | null; timestamp: string }>();
  const seenKeys = new Set<string>();

  for (const pos of (recentPositions || [])) {
    if (pos.employee_id && !seenKeys.has('e:' + pos.employee_id) && pos.lat && pos.lng) {
      seenKeys.add('e:' + pos.employee_id);
      gpsMap.set(pos.employee_id, { lat: pos.lat, lng: pos.lng, speed: pos.speed, status: pos.status, timestamp: pos.timestamp });
    }
    if (pos.vehicle_id && !seenKeys.has('v:' + pos.vehicle_id) && pos.lat && pos.lng) {
      seenKeys.add('v:' + pos.vehicle_id);
      const empId = vehicleToEmployee.get(pos.vehicle_id);
      if (empId && !gpsMap.has(empId)) {
        gpsMap.set(empId, { lat: pos.lat, lng: pos.lng, speed: pos.speed, status: pos.status, timestamp: pos.timestamp });
      }
    }
  }

  // Get today's orders per employee (for workload + waypoints)
  const { data: todayOrders } = await supabase
    .from('orders')
    .select('employee_id, status, scheduled_time_start, client:clients(lat, lng, address, city)')
    .eq('scheduled_date', date)
    .not('employee_id', 'is', null)
    .not('status', 'eq', 'cancelled')
    .order('scheduled_time_start', { ascending: true });

  const ordersMap = new Map<string, { status: string; time: string; lat: number; lng: number; address: string }[]>();
  for (const o of (todayOrders || [])) {
    if (!o.employee_id) continue;
    const c = (o as any).client;
    const list = ordersMap.get(o.employee_id) || [];
    list.push({
      status: o.status,
      time: o.scheduled_time_start,
      lat: c?.lat ?? 0,
      lng: c?.lng ?? 0,
      address: [c?.address, c?.city].filter(Boolean).join(', '),
    });
    ordersMap.set(o.employee_id, list);
  }

  // Build suggestions
  const suggestions = employees
    .map(emp => {
      const empId = emp.id;
      const name = (emp.user as any)?.full_name ?? 'Pracownik';
      const pos = gpsMap.get(empId);
      const orders = ordersMap.get(empId) || [];
      const ordersToday = orders.length;

      if (!pos) {
        return {
          employee_id: empId,
          name,
          distance_km: null,
          eta_minutes: null,
          inserting_adds_km: null,
          orders_today: ordersToday,
          current_status: null,
          has_gps: false,
        };
      }

      const distKm = Math.round(haversineKm(pos.lat, pos.lng, lat, lng) * 10) / 10;
      const eta = etaMinutes(distKm);

      // Calculate insertion cost if employee has existing waypoints
      const waypoints = orders
        .filter(o => o.lat && o.lng)
        .map(o => ({ lat: o.lat, lng: o.lng }));

      let insertionKm: number | null = null;
      if (waypoints.length > 0) {
        const cost = insertionCostKm([pos, ...waypoints], { lat, lng });
        insertionKm = Math.round(cost * 10) / 10;
      }

      return {
        employee_id: empId,
        name,
        distance_km: distKm,
        eta_minutes: eta,
        inserting_adds_km: insertionKm,
        orders_today: ordersToday,
        current_status: pos.status,
        current_speed: pos.speed,
        has_gps: true,
        last_seen: pos.timestamp,
      };
    })
    .filter(s => s.has_gps || s.orders_today > 0)
    .sort((a, b) => {
      // Sort by distance (nulls last)
      if (a.distance_km === null) return 1;
      if (b.distance_km === null) return -1;
      return a.distance_km - b.distance_km;
    });

  return NextResponse.json({ suggestions, target: { lat, lng, date } });
}
