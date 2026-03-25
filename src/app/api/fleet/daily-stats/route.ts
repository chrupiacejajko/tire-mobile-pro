import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/fleet/daily-stats
 *
 * Aggregates daily vehicle statistics from employee_locations telemetry.
 * Should be called once at end of day (e.g., 23:55) via cron.
 *
 * Also callable manually: POST { "date": "2026-03-25" }
 * Without body: uses today's date.
 *
 * GET /api/fleet/daily-stats?vehicle_id=xxx&from=2026-03-01&to=2026-03-25
 * Returns daily stats for trend charts.
 */

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.SATISGPS_WEBHOOK_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  let targetDate: string;

  try {
    const body = await request.json().catch(() => ({}));
    targetDate = body?.date || new Date().toISOString().split('T')[0];
  } catch {
    targetDate = new Date().toISOString().split('T')[0];
  }

  // Get all active vehicles
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, plate_number')
    .eq('is_active', true);

  if (!vehicles?.length) {
    return NextResponse.json({ success: true, message: 'No active vehicles', date: targetDate });
  }

  const results: { plate: string; km: number; fuel: number | null; maxSpeed: number }[] = [];

  for (const vehicle of vehicles) {
    // Get all locations for this vehicle on this date
    const dayStart = `${targetDate}T00:00:00Z`;
    const dayEnd = `${targetDate}T23:59:59Z`;

    const { data: locations } = await supabase
      .from('employee_locations')
      .select('odometer_km, fuel_liters, total_fuel_used, speed, engine_on, timestamp')
      .eq('vehicle_id', vehicle.id)
      .gte('timestamp', dayStart)
      .lte('timestamp', dayEnd)
      .order('timestamp', { ascending: true });

    if (!locations?.length) continue;

    // Compute daily stats
    const odometerValues = locations
      .map(l => l.odometer_km)
      .filter((v): v is number => v != null && v > 0);

    const odometerStart = odometerValues.length > 0 ? Math.min(...odometerValues) : null;
    const odometerEnd = odometerValues.length > 0 ? Math.max(...odometerValues) : null;

    const fuelUsedValues = locations
      .map(l => l.total_fuel_used)
      .filter((v): v is number => v != null && v > 0);

    const fuelStart = fuelUsedValues.length > 0 ? Math.min(...fuelUsedValues) : null;
    const fuelEnd = fuelUsedValues.length > 0 ? Math.max(...fuelUsedValues) : null;
    const fuelUsed = (fuelStart != null && fuelEnd != null) ? fuelEnd - fuelStart : null;

    const maxSpeed = Math.max(0, ...locations.map(l => l.speed ?? 0));

    // Engine hours — count minutes where engine_on = true
    let engineMinutes = 0;
    for (let i = 1; i < locations.length; i++) {
      if (locations[i - 1].engine_on) {
        const prev = new Date(locations[i - 1].timestamp).getTime();
        const curr = new Date(locations[i].timestamp).getTime();
        const diffMin = (curr - prev) / 60_000;
        // Only count if gap < 5 minutes (otherwise it's a data gap)
        if (diffMin > 0 && diffMin < 5) {
          engineMinutes += diffMin;
        }
      }
    }

    const kmDriven = (odometerStart != null && odometerEnd != null)
      ? odometerEnd - odometerStart
      : 0;

    const avgConsumption = (fuelUsed != null && kmDriven > 0)
      ? Math.round((fuelUsed / kmDriven) * 1000) / 10 // L/100km
      : null;

    // Upsert into vehicle_daily_stats
    const { error } = await supabase
      .from('vehicle_daily_stats')
      .upsert({
        vehicle_id: vehicle.id,
        date: targetDate,
        odometer_start: odometerStart,
        odometer_end: odometerEnd,
        fuel_used: fuelUsed ? Math.round(fuelUsed * 10) / 10 : null,
        avg_fuel_consumption: avgConsumption,
        max_speed: maxSpeed,
        engine_hours: Math.round(engineMinutes / 6) / 10, // Round to 0.1h
      }, {
        onConflict: 'vehicle_id,date',
      });

    if (!error) {
      results.push({
        plate: vehicle.plate_number,
        km: kmDriven,
        fuel: fuelUsed ? Math.round(fuelUsed * 10) / 10 : null,
        maxSpeed,
      });
    }
  }

  return NextResponse.json({
    success: true,
    date: targetDate,
    vehicles_processed: results.length,
    stats: results,
  });
}

/**
 * GET /api/fleet/daily-stats?vehicle_id=xxx&from=2026-03-01&to=2026-03-25
 * or GET /api/fleet/daily-stats?from=2026-03-01&to=2026-03-25  (all vehicles)
 */
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = request.nextUrl;

  const vehicleId = searchParams.get('vehicle_id');
  const from = searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const to = searchParams.get('to') || new Date().toISOString().split('T')[0];

  let query = supabase
    .from('vehicle_daily_stats')
    .select('*, vehicle:vehicles(plate_number, brand, model)')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false });

  if (vehicleId) {
    query = query.eq('vehicle_id', vehicleId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Compute totals per vehicle
  const byVehicle = new Map<string, { plate: string; totalKm: number; totalFuel: number; maxSpeed: number; days: number }>();
  for (const row of data || []) {
    const vid = row.vehicle_id;
    const existing = byVehicle.get(vid) || {
      plate: (row as any).vehicle?.plate_number || '',
      totalKm: 0,
      totalFuel: 0,
      maxSpeed: 0,
      days: 0,
    };
    existing.totalKm += row.km_driven || 0;
    existing.totalFuel += row.fuel_used || 0;
    existing.maxSpeed = Math.max(existing.maxSpeed, row.max_speed || 0);
    existing.days++;
    byVehicle.set(vid, existing);
  }

  return NextResponse.json({
    from,
    to,
    entries: data,
    summary: Object.fromEntries(byVehicle),
  });
}
