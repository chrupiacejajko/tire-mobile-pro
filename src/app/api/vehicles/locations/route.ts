import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { pollSatisGPS } from '@/lib/satisgps/poller';

/**
 * GET /api/vehicles/locations
 *
 * Returns real-time vehicle positions.
 * Primary: fresh from Satis GPS REST API (live data)
 * Fallback: latest from DB if API fails
 */
export async function GET() {
  const supabase = getAdminClient();

  // Get all active vehicles + driver assignments in parallel
  const [vehiclesRes, assignmentsRes] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, plate_number, brand, model, year, satis_device_id, is_active')
      .eq('is_active', true)
      .order('plate_number'),
    supabase
      .from('vehicle_assignments')
      .select('vehicle_id, employee_id, employee:employees(user:profiles(full_name))')
      .eq('is_active', true),
  ]);

  const vehicles = vehiclesRes.data || [];
  const assignments = assignmentsRes.data || [];

  const assignMap = new Map(
    assignments.map((a: any) => [a.vehicle_id, (a.employee?.user?.full_name ?? null) as string | null])
  );
  const plateMap = new Map(vehicles.map(v => [v.plate_number, v]));
  const deviceMap = new Map(
    vehicles.filter(v => v.satis_device_id).map(v => [v.satis_device_id!, v] as const)
  );

  // Try fresh data from Satis GPS API
  const apiResult = await pollSatisGPS();

  if (apiResult.ok && apiResult.vehicles.length > 0) {
    // Merge API data with DB vehicle info
    const result = vehicles.map(vehicle => {
      // Match API vehicle by plate or device ID
      const apiVehicle = apiResult.vehicles.find(
        av => av.plate === vehicle.plate_number || av.satisId === vehicle.satis_device_id
      );

      if (!apiVehicle) {
        return {
          ...vehicle,
          lat: null, lng: null, status: 'offline' as const,
          speed: null, direction: null, rpm: null,
          driving_time: null, location_address: null, last_update: null,
          fuel_liters: null, fuel_percent: null, odometer_km: null,
          voltage: null, engine_on: null, heading: null,
          driver_name: assignMap.get(vehicle.id) ?? null,
        };
      }

      const speed = apiVehicle.speed ?? 0;
      const engineOn = apiVehicle.ignitionOn ?? false;
      const status = engineOn
        ? (speed > 5 ? 'driving' : 'working')
        : (speed > 0 ? 'driving' : 'online');

      return {
        ...vehicle,
        lat: apiVehicle.lat,
        lng: apiVehicle.lng,
        status,
        speed: apiVehicle.speed,
        direction: apiVehicle.direction,
        rpm: apiVehicle.rpm,
        driving_time: null,
        location_address: apiVehicle.location,
        last_update: apiVehicle.timestamp,
        fuel_liters: apiVehicle.fuel,
        fuel_percent: apiVehicle.fuelPercent,
        odometer_km: apiVehicle.odometer,
        voltage: apiVehicle.voltage,
        engine_on: apiVehicle.ignitionOn,
        heading: apiVehicle.direction ? parseInt(apiVehicle.direction, 10) || null : null,
        driver_name: assignMap.get(vehicle.id) ?? null,
      };
    });

    return NextResponse.json(result);
  }

  // Fallback: read from DB (stale but better than nothing)
  const result = await Promise.all(
    vehicles.map(async (vehicle) => {
      const { data: loc } = await supabase
        .from('employee_locations')
        .select('lat, lng, status, speed, direction, rpm, driving_time, location_address, timestamp, fuel_liters, fuel_percent, odometer_km, voltage, engine_on, heading')
        .eq('vehicle_id', vehicle.id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      return {
        ...vehicle,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        status: loc?.status ?? 'offline',
        speed: loc?.speed ?? null,
        direction: loc?.direction ?? null,
        rpm: loc?.rpm ?? null,
        driving_time: loc?.driving_time ?? null,
        location_address: loc?.location_address ?? null,
        last_update: loc?.timestamp ?? null,
        fuel_liters: loc?.fuel_liters ?? null,
        fuel_percent: loc?.fuel_percent ?? null,
        odometer_km: loc?.odometer_km ?? null,
        voltage: loc?.voltage ?? null,
        engine_on: loc?.engine_on ?? null,
        heading: loc?.heading ?? null,
        driver_name: assignMap.get(vehicle.id) ?? null,
      };
    })
  );

  return NextResponse.json(result);
}
