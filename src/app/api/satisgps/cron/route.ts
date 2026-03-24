import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { pollSatisGPS } from '@/lib/satisgps/poller';

/**
 * GET /api/satisgps/cron
 *
 * Called by Railway Cron Job every minute.
 * Fetches all vehicle positions from Satis GPS and stores in Supabase.
 *
 * Railway Cron config:
 *   Command: curl https://tire-mobile-pro-production.up.railway.app/api/satisgps/cron?secret=kruszwil2024
 *   Schedule: * * * * *  (every minute)
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.SATISGPS_WEBHOOK_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const startTime = Date.now();

  // Poll Satis GPS
  const result = await pollSatisGPS();

  if (!result.ok) {
    console.error('[CRON] Satis GPS poll failed:', result.error);
    return NextResponse.json({
      success: false,
      error: result.error,
      sessionExpired: result.sessionExpired ?? false,
      duration: Date.now() - startTime,
    }, { status: result.sessionExpired ? 401 : 500 });
  }

  // Store all vehicle locations
  let stored = 0;
  const unknownPlates: string[] = [];

  for (const vehicle of result.vehicles) {
    const speed = vehicle.speed ?? 0;
    const status = speed > 5 ? 'driving' : speed === 0 ? 'working' : 'online';

    // Match by plate_number first, fallback to satis_device_id
    let dbVehicle: { id: string } | null = null;
    const { data: byPlate } = await supabase
      .from('vehicles').select('id').eq('plate_number', vehicle.plate).limit(1).maybeSingle();
    if (byPlate) {
      dbVehicle = byPlate;
    } else if (vehicle.satisId) {
      const { data: byDevice } = await supabase
        .from('vehicles').select('id').eq('satis_device_id', vehicle.satisId).limit(1).maybeSingle();
      dbVehicle = byDevice;
    }

    if (!dbVehicle) {
      unknownPlates.push(vehicle.plate);
      continue;
    }

    // Get active driver
    const { data: assignment } = await supabase
      .from('vehicle_assignments')
      .select('employee_id')
      .eq('vehicle_id', dbVehicle.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from('employee_locations').insert({
      employee_id: assignment?.employee_id ?? null,
      vehicle_id: dbVehicle.id,
      lat: vehicle.lat,
      lng: vehicle.lng,
      status,
      speed: vehicle.speed ?? 0,
      direction: vehicle.direction ?? null,
      rpm: vehicle.rpm ?? null,
      driving_time: vehicle.drivingTime ?? null,
      location_address: vehicle.location ?? null,
      timestamp: new Date().toISOString(),
    });

    if (!error) stored++;
  }

  const duration = Date.now() - startTime;
  console.log(`[CRON] Satis GPS: ${result.vehicles.length} vehicles, ${stored} stored in ${duration}ms`);

  return NextResponse.json({
    success: true,
    vehicles: result.vehicles.length,
    stored,
    unknownPlates,
    duration,
    timestamp: new Date().toISOString(),
  });
}
