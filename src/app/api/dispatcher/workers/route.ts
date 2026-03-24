import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm } from '@/lib/geo';
import { checkAuth } from '@/lib/api/auth-guard';

/**
 * GET /api/dispatcher/workers?date=2025-01-01&address=...&city=...
 *
 * Live worker suggestions for dispatch page.
 * Returns available workers (with score) AND unavailable workers (with rejection reasons).
 * Enforces live gating: GPS freshness, work_status, account_status, planner_status.
 *
 * Auth: admin | dispatcher
 */

/** Hard limit on GPS freshness — older data = worker treated as "no GPS" */
const GPS_FRESHNESS_MINUTES = 15;

const REJECTION_REASONS: Record<string, string> = {
  account_not_active:  'Konto nieaktywowane',
  account_blocked:     'Konto zablokowane',
  off_work:            'Poza zmianą',
  on_break:            'Na przerwie',
  forced_unavailable:  'Niedostępny (override admina)',
  gps_stale:           `Brak GPS od >${GPS_FRESHNESS_MINUTES} min`,
  no_gps:              'Brak danych GPS',
  unavailability:      'Urlop / niedyspozycyjność',
};

export async function GET(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;

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
      return NextResponse.json({ suggestions: [], unavailable: [] });
    }

    const empIds = employees.map(e => e.id);

    // ── Fetch all data in parallel ──────────────────────────────────────────
    const [
      vehicleAssignmentsRes,
      dayOrdersRes,
      unavailabilitiesRes,
      recentPositionsRes,
      operationalStatesRes,
    ] = await Promise.all([
      supabase
        .from('vehicle_assignments')
        .select('employee_id, vehicle:vehicles(plate_number)')
        .eq('is_active', true)
        .in('employee_id', empIds),

      supabase
        .from('orders')
        .select('employee_id')
        .eq('scheduled_date', date)
        .not('status', 'eq', 'cancelled')
        .not('employee_id', 'is', null),

      supabase
        .from('unavailabilities')
        .select('employee_id')
        .lte('start_date', date)
        .gte('end_date', date),

      supabase
        .from('employee_locations')
        .select('employee_id, lat, lng, status, timestamp')
        .in('employee_id', empIds)
        .order('timestamp', { ascending: false })
        .limit(500),

      supabase
        .from('employee_operational_state')
        .select('employee_id, account_status, work_status, planner_status, last_gps_at')
        .in('employee_id', empIds),
    ]);

    // Build lookup maps
    const empToPlate = new Map<string, string>();
    for (const a of vehicleAssignmentsRes.data || []) {
      if (a.employee_id) {
        const plate = (a.vehicle as any)?.plate_number;
        if (plate) empToPlate.set(a.employee_id, plate);
      }
    }

    const orderCount = new Map<string, number>();
    for (const o of dayOrdersRes.data || []) {
      if (o.employee_id) orderCount.set(o.employee_id, (orderCount.get(o.employee_id) || 0) + 1);
    }

    const unavailableIds = new Set((unavailabilitiesRes.data ?? []).map(u => u.employee_id));

    const gpsMap = new Map<string, { lat: number; lng: number; status: string | null; timestamp: string }>();
    for (const pos of recentPositionsRes.data || []) {
      if (pos.employee_id && !gpsMap.has(pos.employee_id) && pos.lat && pos.lng) {
        gpsMap.set(pos.employee_id, { lat: pos.lat, lng: pos.lng, status: pos.status, timestamp: pos.timestamp });
      }
    }

    const opStateMap = new Map<string, {
      account_status: string;
      work_status: string;
      planner_status: string;
      last_gps_at: string | null;
    }>();
    for (const s of operationalStatesRes.data || []) {
      opStateMap.set(s.employee_id, s);
    }

    const now = Date.now();
    const freshnessThresholdMs = GPS_FRESHNESS_MINUTES * 60 * 1000;

    interface AvailableWorker {
      employee_id: string;
      employee_name: string;
      plate: string | null;
      current_orders: number;
      gps_distance_km: number | null;
      is_driving: boolean;
      is_nearby: boolean;
      work_status: string;
      last_gps_at: string | null;
      score: number;
    }

    interface UnavailableWorker {
      employee_id: string;
      employee_name: string;
      reason_code: string;
      reason_label: string;
      work_status: string;
      last_gps_at: string | null;
    }

    const available: AvailableWorker[] = [];
    const unavailable: UnavailableWorker[] = [];

    for (const emp of employees) {
      const name = (emp as any).user?.full_name ?? 'Pracownik';
      const opState = opStateMap.get(emp.id);
      const gps = gpsMap.get(emp.id);
      const accountStatus = opState?.account_status ?? 'active'; // legacy: assume active
      const workStatus = opState?.work_status ?? 'off_work';
      const plannerStatus = opState?.planner_status ?? 'available';
      const lastGpsAt = gps?.timestamp ?? opState?.last_gps_at ?? null;

      // ── Rejection checks (in priority order) ──
      const addUnavailable = (code: string) => {
        unavailable.push({
          employee_id: emp.id,
          employee_name: name,
          reason_code: code,
          reason_label: REJECTION_REASONS[code] ?? code,
          work_status: workStatus,
          last_gps_at: lastGpsAt,
        });
      };

      if (accountStatus === 'invited') { addUnavailable('account_not_active'); continue; }
      if (accountStatus === 'blocked') { addUnavailable('account_blocked'); continue; }
      if (unavailableIds.has(emp.id)) { addUnavailable('unavailability'); continue; }
      if (plannerStatus === 'forced_unavailable') { addUnavailable('forced_unavailable'); continue; }
      if (plannerStatus === 'unavailable') { addUnavailable('forced_unavailable'); continue; }
      if (workStatus === 'off_work') { addUnavailable('off_work'); continue; }
      if (workStatus === 'break') { addUnavailable('on_break'); continue; }

      // GPS freshness check (skip if forced_available by admin — they know what they're doing)
      if (plannerStatus !== 'forced_available') {
        if (!lastGpsAt) { addUnavailable('no_gps'); continue; }
        const gpsAge = now - new Date(lastGpsAt).getTime();
        if (gpsAge > freshnessThresholdMs) { addUnavailable('gps_stale'); continue; }
      }

      // ── Worker is available — compute score ──
      let distKm: number | null = null;
      if (gps && orderLat !== null && orderLng !== null) {
        distKm = Math.round(haversineKm(gps.lat, gps.lng, orderLat, orderLng) * 10) / 10;
      }

      const orders = orderCount.get(emp.id) || 0;
      const isDriving = gps?.status === 'driving';
      const isNearby = distKm !== null && distKm < 20;

      const gpsScore = distKm !== null ? distKm * 3 : 200;
      const workloadPenalty = orders * 5;
      const drivingBonus = isDriving ? -10 : 0;
      const score = gpsScore + workloadPenalty + drivingBonus;

      available.push({
        employee_id: emp.id,
        employee_name: name,
        plate: empToPlate.get(emp.id) ?? null,
        current_orders: orders,
        gps_distance_km: distKm,
        is_driving: isDriving,
        is_nearby: isNearby,
        work_status: workStatus,
        last_gps_at: lastGpsAt,
        score,
      });
    }

    available.sort((a, b) => a.score - b.score);
    const suggestions = available.slice(0, 5).map(({ score: _score, ...rest }) => rest);

    return NextResponse.json({
      suggestions,          // top 5 available workers (scored)
      unavailable,          // all rejected workers with reasons
      meta: {
        gps_freshness_minutes: GPS_FRESHNESS_MINUTES,
        date,
      },
    });
  } catch (err) {
    console.error('[dispatcher/workers]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
