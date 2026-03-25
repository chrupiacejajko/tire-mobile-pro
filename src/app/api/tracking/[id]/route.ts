import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = getAdminClient();

  try {
    // Fetch order with employee info and client coords
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select(`
        id, status, address, scheduled_date, time_window,
        client:clients(lat, lng),
        employee:employees(
          id,
          user:profiles(full_name)
        )
      `)
      .eq('id', id)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const employee = order.employee as any;
    const client = order.client as any;
    const destLat = client?.lat ?? null;
    const destLng = client?.lng ?? null;

    let driverLat: number | null = null;
    let driverLng: number | null = null;
    let driverSpeed: number | null = null;
    let vehicleInfo: { brand: string; model: string; plate: string } | null = null;

    if (employee?.id) {
      // Get latest employee location
      const { data: loc } = await supabase
        .from('employee_locations')
        .select('lat, lng, speed, timestamp')
        .eq('employee_id', employee.id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (loc) {
        driverLat = loc.lat;
        driverLng = loc.lng;
        driverSpeed = loc.speed;
      }

      // Get vehicle assignment
      const { data: assignment } = await supabase
        .from('vehicle_assignments')
        .select('vehicle:vehicles(brand, model, plate_number)')
        .eq('employee_id', employee.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (assignment) {
        const v = (assignment as any).vehicle;
        if (v) {
          vehicleInfo = { brand: v.brand, model: v.model, plate: v.plate_number };
        }
      }
    }

    // Calculate rough ETA based on haversine distance
    let etaMinutes: number | null = null;
    if (driverLat != null && driverLng != null && destLat != null && destLng != null) {
      const dist = haversineKm(driverLat, driverLng, destLat, destLng);
      // Assume average 40 km/h in city conditions
      const avgSpeed = driverSpeed && driverSpeed > 5 ? driverSpeed : 40;
      etaMinutes = Math.max(1, Math.round((dist / avgSpeed) * 60));
    }

    return NextResponse.json({
      order: {
        id: order.id,
        status: order.status,
        address: order.address,
        lat: destLat,
        lng: destLng,
        scheduled_date: order.scheduled_date,
        time_window: order.time_window,
      },
      driver: employee
        ? {
            name: employee.user?.full_name || null,
            lat: driverLat,
            lng: driverLng,
            vehicle: vehicleInfo,
          }
        : null,
      eta_minutes: etaMinutes,
    });
  } catch (err) {
    console.error('[tracking/id]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
