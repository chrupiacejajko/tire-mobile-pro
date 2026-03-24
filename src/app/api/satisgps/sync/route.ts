import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { parseMapState, parseFullResponse, extractMapState, SatisVehicle } from '@/lib/satisgps/converter';
import { pollSatisGPS } from '@/lib/satisgps/poller';

/**
 * POST /api/satisgps/sync
 *
 * Two modes:
 *
 * A) AUTO (recommended):
 *    Body: { "auto": true }
 *    Requires SATISGPS_COOKIE env var → fetches all vehicles automatically
 *
 * B) MANUAL (paste from browser):
 *    Body: <raw JSON from Satis GPS network tab>
 *    Works without env vars — just paste the response
 *
 * C) CRON (Railway cron or external trigger):
 *    Body: { "cron": true, "secret": "..." }
 *    Used by automated polling every ~60s
 */

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  let body: any;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let vehicles: SatisVehicle[] = [];
  let sourceMode = 'manual';

  // ── A/C: AUTO mode ──────────────────────────────────────────────
  if (body?.auto === true || body?.cron === true) {
    if (body?.cron && body.secret !== process.env.SATISGPS_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Invalid cron secret' }, { status: 401 });
    }

    const result = await pollSatisGPS();
    if (!result.ok) {
      return NextResponse.json({
        success: false,
        error: result.error,
        hint: result.statusCode === 302 || result.statusCode === 401
          ? 'Session expired — update SATISGPS_COOKIE in Railway env vars'
          : 'Check SATISGPS_COOKIE and SATISGPS_URL env vars',
        raw: result.raw,
      }, { status: 422 });
    }

    vehicles = result.vehicles;
    sourceMode = 'auto';

  // ── B: MANUAL paste mode ─────────────────────────────────────────
  } else {
    // Try full response parser first (table + markers + dashboard)
    const fullVehicles = parseFullResponse(body);
    if (fullVehicles.length > 0) {
      vehicles = fullVehicles;
    } else {
      // Fallback to map state only
      const mapState = extractMapState(body);
      if (!mapState) {
        return NextResponse.json({
          error: 'Nie znaleziono danych mapy w JSON.',
          hint: 'Wklej pełny response z zakładki Network w DevTools (szukaj requestu do Localization.GPSTracking/)',
        }, { status: 422 });
      }
      vehicles = parseMapState(mapState);
    }
    sourceMode = 'manual';
  }

  if (vehicles.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'Brak pojazdów w odpowiedzi Satis GPS',
      mode: sourceMode,
    });
  }

  // ── Store all vehicles ────────────────────────────────────────────
  const results: {
    plate: string;
    lat: number;
    lng: number;
    speed: number | null;
    status: string;
    stored: boolean;
    reason?: string;
  }[] = [];

  for (const vehicle of vehicles) {
    const status = getStatusFromVehicle(vehicle);

    // Find vehicle in DB by plate or satis_device_id
    const { data: dbVehicle } = await supabase
      .from('vehicles')
      .select('id, plate_number')
      .or(`plate_number.eq.${vehicle.plate},satis_device_id.eq.${vehicle.satisId}`)
      .single();

    if (!dbVehicle) {
      results.push({
        plate: vehicle.plate,
        lat: vehicle.lat,
        lng: vehicle.lng,
        speed: vehicle.speed,
        status,
        stored: false,
        reason: 'not_in_db',
      });
      continue;
    }

    // Find active driver assignment for this vehicle
    const { data: assignment } = await supabase
      .from('vehicle_assignments')
      .select('employee_id')
      .eq('vehicle_id', dbVehicle.id)
      .eq('is_active', true)
      .single();

    const employeeId = assignment?.employee_id ?? null;

    // Store location with all available telemetry
    const { error } = await supabase.from('employee_locations').insert({
      employee_id: employeeId,
      vehicle_id: dbVehicle.id,
      lat: vehicle.lat,
      lng: vehicle.lng,
      speed: vehicle.speed,
      direction: vehicle.direction,
      rpm: vehicle.rpm,
      status,
      location_address: vehicle.location,
      driving_time: vehicle.drivingTime,
      timestamp: vehicle.timestamp
        ? new Date(vehicle.timestamp).toISOString()
        : new Date().toISOString(),
    });

    results.push({
      plate: vehicle.plate,
      lat: vehicle.lat,
      lng: vehicle.lng,
      speed: vehicle.speed,
      status,
      stored: !error,
      reason: error ? error.message : (employeeId ? 'ok' : 'no_driver'),
    });
  }

  const stored = results.filter((r) => r.stored).length;
  const notInDb = results.filter((r) => r.reason === 'not_in_db').map((r) => r.plate);

  return NextResponse.json({
    success: true,
    mode: sourceMode,
    processed: vehicles.length,
    stored,
    vehicles: results,
    ...(notInDb.length > 0 && {
      warning: `Tablice nieznane w bazie: ${notInDb.join(', ')} — dodaj je w sekcji Flota`,
    }),
  });
}

/** GET /api/satisgps/sync — quick status check */
export async function GET() {
  const hasCookie = !!process.env.SATISGPS_COOKIE;
  const hasUrl = !!process.env.SATISGPS_URL;

  const supabase = getAdminClient();
  const { data: latest } = await supabase
    .from('employee_locations')
    .select('timestamp')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    configured: hasCookie && hasUrl,
    hasCookie,
    hasUrl,
    lastSync: latest?.timestamp ?? null,
    autoMode: hasCookie ? 'ready' : 'missing SATISGPS_COOKIE',
  });
}

function getStatusFromVehicle(v: SatisVehicle): string {
  if (v.speed === null || v.speed === undefined) return 'online';
  if (v.speed === 0) return 'working';
  if (v.speed > 5) return 'driving';
  return 'online';
}
