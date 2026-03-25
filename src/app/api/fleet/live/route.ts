import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { pollSatisGPS } from '@/lib/satisgps/poller';

/**
 * GET /api/fleet/live
 *
 * Returns real-time fleet status:
 * - Live GPS positions from Satis API (fresh, not from DB)
 * - Vehicle info (plate, brand, model)
 * - Assigned driver
 * - Full telemetry (fuel, odometer, RPM, voltage, speed, heading, engine)
 *
 * Query params:
 *   ?source=api   — fetch fresh from Satis (default)
 *   ?source=db    — return latest from employee_locations table
 */
export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source') || 'api';
  const supabase = getAdminClient();

  if (source === 'api') {
    // Fresh data from Satis GPS API
    const result = await pollSatisGPS();

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    // Enrich with DB data (vehicle info, driver assignment)
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('id, plate_number, brand, model, year, satis_device_id, is_active');

    const { data: assignments } = await supabase
      .from('vehicle_assignments')
      .select('vehicle_id, employee_id, employee:employees(user:profiles(full_name))')
      .eq('is_active', true);

    const vehicleMap = new Map(
      (vehicles || []).map(v => [v.plate_number, v])
    );
    const deviceMap = new Map(
      (vehicles || []).map(v => [v.satis_device_id, v])
    );
    const assignMap = new Map(
      (assignments || []).map((a: any) => [a.vehicle_id, {
        employee_id: a.employee_id,
        driver_name: a.employee?.user?.full_name || null,
      }])
    );

    const fleet = result.vehicles.map(v => {
      const dbVehicle = vehicleMap.get(v.plate) || deviceMap.get(v.satisId);
      const assignment = dbVehicle ? assignMap.get(dbVehicle.id) : null;

      const speed = v.speed ?? 0;
      const engineOn = v.ignitionOn ?? false;

      return {
        // Vehicle identity
        plate: v.plate,
        brand: dbVehicle?.brand || null,
        model: dbVehicle?.model || null,
        year: dbVehicle?.year || null,
        vehicle_id: dbVehicle?.id || null,
        satis_device_id: v.satisId,
        in_database: !!dbVehicle,

        // Driver
        driver_name: assignment?.driver_name || null,
        employee_id: assignment?.employee_id || null,

        // Position
        lat: v.lat,
        lng: v.lng,
        location: v.location,
        heading: v.direction ? parseInt(v.direction, 10) || null : null,

        // Telemetry
        speed,
        rpm: v.rpm ?? 0,
        engine_on: engineOn,
        fuel_liters: v.fuel,
        fuel_percent: v.fuelPercent,
        odometer_km: v.odometer,
        voltage: v.voltage,
        total_fuel_used: v.raw?.TotalVehicleFuelUsage ?? null,

        // Computed status
        status: engineOn
          ? (speed > 5 ? 'driving' : 'idle')
          : 'parked',

        // Timestamp
        last_update: v.timestamp,
      };
    });

    // Sort: driving first, then idle, then parked
    const statusOrder = { driving: 0, idle: 1, parked: 2 };
    fleet.sort((a, b) =>
      (statusOrder[a.status as keyof typeof statusOrder] ?? 9) -
      (statusOrder[b.status as keyof typeof statusOrder] ?? 9)
    );

    // Summary stats
    const summary = {
      total: fleet.length,
      driving: fleet.filter(f => f.status === 'driving').length,
      idle: fleet.filter(f => f.status === 'idle').length,
      parked: fleet.filter(f => f.status === 'parked').length,
      avg_fuel_percent: Math.round(
        fleet.filter(f => f.fuel_percent != null).reduce((s, f) => s + (f.fuel_percent || 0), 0) /
        Math.max(fleet.filter(f => f.fuel_percent != null).length, 1)
      ),
      total_km_today: null, // Would need daily stats
    };

    return NextResponse.json({
      source: 'api',
      timestamp: new Date().toISOString(),
      summary,
      vehicles: fleet,
    });
  }

  // DB source — latest position per vehicle
  const { data: latestPositions } = await supabase
    .from('employee_locations')
    .select(`
      *,
      vehicle:vehicles(id, plate_number, brand, model, year),
      employee:employees(user:profiles(full_name))
    `)
    .not('vehicle_id', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(50);

  // Deduplicate — keep only latest per vehicle
  const seen = new Set<string>();
  const unique = (latestPositions || []).filter(p => {
    if (!p.vehicle_id || seen.has(p.vehicle_id)) return false;
    seen.add(p.vehicle_id);
    return true;
  });

  return NextResponse.json({
    source: 'db',
    timestamp: new Date().toISOString(),
    vehicles: unique.map((p: any) => ({
      plate: p.vehicle?.plate_number,
      brand: p.vehicle?.brand,
      model: p.vehicle?.model,
      vehicle_id: p.vehicle_id,
      driver_name: p.employee?.user?.full_name || null,
      employee_id: p.employee_id,
      lat: p.lat,
      lng: p.lng,
      location: p.location_address,
      speed: p.speed,
      rpm: p.rpm,
      engine_on: p.engine_on,
      fuel_liters: p.fuel_liters,
      fuel_percent: p.fuel_percent,
      odometer_km: p.odometer_km,
      voltage: p.voltage,
      status: p.status,
      last_update: p.timestamp,
    })),
  });
}
