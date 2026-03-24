import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm } from '@/lib/geo';

/**
 * GET /api/dispatcher/workers?date=2025-01-01&address=...&city=...
 *
 * Lightweight worker suggestion for the dispatch page.
 * Returns top workers with GPS distance and order counts.
 * Does NOT require an order_id (unlike suggest-insert).
 */
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const addressQuery = searchParams.get('address') || '';
  const cityQuery = searchParams.get('city') || '';

  try {
    // Geocode the address to get coordinates
    let orderLat: number | null = null;
    let orderLng: number | null = null;

    if (addressQuery) {
      try {
        const hereKey = process.env.HERE_API_KEY;
        if (hereKey) {
          const geoQuery = [addressQuery, cityQuery, 'Polska'].filter(Boolean).join(', ');
          const geoRes = await fetch(
            `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(geoQuery)}&apiKey=${hereKey}`
          );
          const geoData = await geoRes.json();
          const pos = geoData.items?.[0]?.position;
          if (pos) { orderLat = pos.lat; orderLng = pos.lng; }
        }
      } catch { /* geocoding is best-effort */ }
    }

    // Fetch active employees
    const { data: employees } = await supabase
      .from('employees')
      .select('id, user:profiles(full_name)')
      .eq('is_active', true);

    if (!employees?.length) {
      return NextResponse.json({ suggestions: [] });
    }

    const empIds = employees.map(e => e.id);

    // Vehicle plates
    const { data: vehicleAssignments } = await supabase
      .from('vehicle_assignments')
      .select('employee_id, vehicle:vehicles(plate_number)')
      .eq('is_active', true)
      .in('employee_id', empIds);

    const empToPlate = new Map<string, string>();
    for (const a of vehicleAssignments || []) {
      if (a.employee_id) {
        const plate = (a.vehicle as any)?.plate_number;
        if (plate) empToPlate.set(a.employee_id, plate);
      }
    }

    // Order counts for the date
    const { data: dayOrders } = await supabase
      .from('orders')
      .select('employee_id')
      .eq('scheduled_date', date)
      .not('status', 'eq', 'cancelled')
      .not('employee_id', 'is', null);

    const orderCount = new Map<string, number>();
    for (const o of dayOrders || []) {
      if (o.employee_id) orderCount.set(o.employee_id, (orderCount.get(o.employee_id) || 0) + 1);
    }

    // Unavailabilities
    const { data: unavailabilities } = await supabase
      .from('unavailabilities')
      .select('employee_id')
      .lte('start_date', date)
      .gte('end_date', date);

    const unavailableIds = new Set((unavailabilities ?? []).map(u => u.employee_id));

    // GPS positions
    const gpsMap = new Map<string, { lat: number; lng: number; status: string | null }>();
    const { data: recentPositions } = await supabase
      .from('employee_locations')
      .select('employee_id, lat, lng, status')
      .in('employee_id', empIds)
      .order('timestamp', { ascending: false })
      .limit(500);

    for (const pos of recentPositions || []) {
      if (pos.employee_id && !gpsMap.has(pos.employee_id) && pos.lat && pos.lng) {
        gpsMap.set(pos.employee_id, { lat: pos.lat, lng: pos.lng, status: pos.status });
      }
    }

    // Score and sort
    interface WorkerEntry {
      employee_id: string;
      employee_name: string;
      plate: string | null;
      current_orders: number;
      gps_distance_km: number | null;
      is_driving: boolean;
      is_nearby: boolean;
      score: number;
    }

    const results: WorkerEntry[] = [];

    for (const emp of employees) {
      if (unavailableIds.has(emp.id)) continue;

      const gps = gpsMap.get(emp.id);
      let distKm: number | null = null;

      if (gps && orderLat !== null && orderLng !== null) {
        distKm = Math.round(haversineKm(gps.lat, gps.lng, orderLat, orderLng) * 10) / 10;
      }

      const orders = orderCount.get(emp.id) || 0;
      const isDriving = gps?.status === 'driving';
      const isNearby = distKm !== null && distKm < 20;

      // Score: lower = better (closer + fewer orders)
      const gpsScore = distKm !== null ? distKm * 3 : 500;
      const workloadPenalty = orders * 5;
      const drivingBonus = isDriving ? -10 : 0;
      const score = gpsScore + workloadPenalty + drivingBonus;

      results.push({
        employee_id: emp.id,
        employee_name: (emp as any).user?.full_name ?? 'Pracownik',
        plate: empToPlate.get(emp.id) ?? null,
        current_orders: orders,
        gps_distance_km: distKm,
        is_driving: isDriving,
        is_nearby: isNearby,
        score,
      });
    }

    results.sort((a, b) => a.score - b.score);

    const suggestions = results.slice(0, 5).map(({ score: _score, ...rest }) => rest);

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error('[dispatcher/workers]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
