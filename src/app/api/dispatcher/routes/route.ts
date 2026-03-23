import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm, totalRouteKm } from '@/lib/geo';
import { getRouteInfo } from '@/lib/here-routing';

/**
 * GET /api/dispatcher/routes?date=2026-03-23
 *
 * Returns all employees with their ordered route for the day:
 * - Current GPS position
 * - Orders in chronological order with client coordinates
 * - Total route distance
 *
 * Used by dispatcher map to draw polylines per employee.
 */

// Distinct colors for up to 10 employees
const ROUTE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#F97316', '#EC4899', '#84CC16', '#6366F1',
];

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  // Get all active employees
  const { data: employees } = await supabase
    .from('employees')
    .select('id, user:profiles(full_name), region_id')
    .eq('is_active', true);

  if (!employees?.length) return NextResponse.json({ routes: [] });

  // Get vehicle assignments
  const { data: vehicleAssignments } = await supabase
    .from('vehicle_assignments')
    .select('employee_id, vehicle_id, vehicle:vehicles(plate_number)')
    .eq('is_active', true);

  const vehicleToEmployee = new Map<string, string>();
  const employeeToPlate = new Map<string, string>();
  for (const a of (vehicleAssignments || [])) {
    if (a.vehicle_id && a.employee_id) {
      vehicleToEmployee.set(a.vehicle_id, a.employee_id);
      const plate = (a.vehicle as any)?.plate_number;
      if (plate) employeeToPlate.set(a.employee_id, plate);
    }
  }

  // Get latest GPS positions
  const { data: recentPositions } = await supabase
    .from('employee_locations')
    .select('employee_id, vehicle_id, lat, lng, speed, direction, status, timestamp')
    .order('timestamp', { ascending: false })
    .limit(300);

  const gpsMap = new Map<string, { lat: number; lng: number; speed: number | null; direction: string | null; status: string | null; timestamp: string }>();
  const seenKeys = new Set<string>();

  for (const pos of (recentPositions || [])) {
    if (pos.employee_id && !seenKeys.has('e:' + pos.employee_id) && pos.lat && pos.lng) {
      seenKeys.add('e:' + pos.employee_id);
      gpsMap.set(pos.employee_id, { lat: pos.lat, lng: pos.lng, speed: pos.speed, direction: pos.direction, status: pos.status, timestamp: pos.timestamp });
    }
    if (pos.vehicle_id && !seenKeys.has('v:' + pos.vehicle_id) && pos.lat && pos.lng) {
      seenKeys.add('v:' + pos.vehicle_id);
      const empId = vehicleToEmployee.get(pos.vehicle_id);
      if (empId && !gpsMap.has(empId)) {
        gpsMap.set(empId, { lat: pos.lat, lng: pos.lng, speed: pos.speed, direction: pos.direction, status: pos.status, timestamp: pos.timestamp });
      }
    }
  }

  // Get today's orders with client coordinates
  const { data: todayOrders } = await supabase
    .from('orders')
    .select('id, employee_id, status, priority, scheduled_time_start, scheduled_time_end, services, client:clients(id, name, phone, lat, lng, address, city)')
    .eq('scheduled_date', date)
    .not('employee_id', 'is', null)
    .not('status', 'eq', 'cancelled')
    .order('scheduled_time_start', { ascending: true });

  // Group orders by employee
  const ordersByEmployee = new Map<string, typeof todayOrders>();
  for (const order of (todayOrders || [])) {
    if (!order.employee_id) continue;
    const list = ordersByEmployee.get(order.employee_id) || [];
    list.push(order);
    ordersByEmployee.set(order.employee_id, list);
  }

  // Build routes
  const routes = await Promise.all(employees
    .filter(emp => {
      const pos = gpsMap.get(emp.id);
      const orders = ordersByEmployee.get(emp.id) || [];
      return pos || orders.length > 0;
    })
    .map(async (emp, idx) => {
      const pos = gpsMap.get(emp.id);
      const orders = ordersByEmployee.get(emp.id) || [];
      const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];

      // Build waypoints: GPS → order1 → order2 → ...
      const waypoints: { lat: number; lng: number }[] = [];
      if (pos) waypoints.push({ lat: pos.lat, lng: pos.lng });

      const mappedOrders = orders.map(o => {
        const c = (o as any).client;
        const hasCoords = c?.lat && c?.lng;
        if (hasCoords) waypoints.push({ lat: c.lat, lng: c.lng });
        return {
          id: o.id,
          status: o.status,
          priority: (o as any).priority,
          time: o.scheduled_time_start,
          time_end: o.scheduled_time_end,
          lat: c?.lat ?? null,
          lng: c?.lng ?? null,
          client_name: c?.name ?? 'Klient',
          client_address: [c?.address, c?.city].filter(Boolean).join(', '),
          services: (o as any).services ?? [],
        };
      });

      const totalKm = totalRouteKm(waypoints);

      // HERE: get ETA from current position to first pending order
      let etaToNextMinutes: number | null = null;
      let etaToNextNoTrafficMinutes: number | null = null;
      const nextOrder = mappedOrders.find(o => o.status !== 'completed' && o.lat && o.lng);
      if (pos && nextOrder?.lat && nextOrder?.lng) {
        const routeInfo = await getRouteInfo(pos.lat, pos.lng, nextOrder.lat, nextOrder.lng);
        etaToNextMinutes = routeInfo.duration_minutes;
        etaToNextNoTrafficMinutes = routeInfo.duration_no_traffic_minutes;
      }

      return {
        employee_id: emp.id,
        employee_name: (emp.user as any)?.full_name ?? 'Pracownik',
        plate: employeeToPlate.get(emp.id) ?? null,
        color,
        current_position: pos ? { lat: pos.lat, lng: pos.lng, speed: pos.speed, direction: pos.direction, status: pos.status, timestamp: pos.timestamp } : null,
        orders: mappedOrders,
        total_orders: orders.length,
        total_km: Math.round(totalKm * 10) / 10,
        eta_to_next_minutes: etaToNextMinutes,
        eta_to_next_no_traffic_minutes: etaToNextNoTrafficMinutes,
        traffic_delay_minutes: etaToNextMinutes !== null && etaToNextNoTrafficMinutes !== null
          ? Math.max(0, etaToNextMinutes - etaToNextNoTrafficMinutes)
          : null,
        waypoints,
      };
    }));

  return NextResponse.json({ routes, date });
}
