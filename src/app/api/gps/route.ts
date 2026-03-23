import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// POST /api/gps - Receive GPS location updates from Satis GPS
// Matches vehicles by plate_number or satis_device_id
// Then finds the currently assigned employee to that vehicle
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const updates = Array.isArray(body) ? body : [body];
    let processed = 0;

    for (const update of updates) {
      const { device_id, plate_number, lat, lng, speed, ignition, timestamp } = update;

      if (!lat || !lng) continue;

      // Find vehicle by satis_device_id or plate_number
      let vehicleId: string | null = null;
      let query = supabase.from('vehicles').select('id');

      if (device_id) {
        const { data } = await query.eq('satis_device_id', device_id).single();
        if (data) vehicleId = data.id;
      }

      if (!vehicleId && plate_number) {
        const { data } = await supabase.from('vehicles').select('id').eq('plate_number', plate_number).single();
        if (data) vehicleId = data.id;
      }

      if (!vehicleId) continue;

      // Find currently assigned employee for this vehicle
      const { data: assignment } = await supabase
        .from('vehicle_assignments')
        .select('employee_id')
        .eq('vehicle_id', vehicleId)
        .eq('is_active', true)
        .single();

      const employeeId = assignment?.employee_id || null;

      // Determine status from GPS data
      let status = 'online';
      if (ignition === false && (speed === 0 || speed === undefined)) status = 'offline';
      else if (speed !== undefined && speed > 5) status = 'driving';
      else if (ignition === true && (speed === undefined || speed <= 5)) status = 'working';

      // Insert location update (linked to both employee and vehicle)
      if (employeeId) {
        await supabase.from('employee_locations').insert({
          employee_id: employeeId,
          vehicle_id: vehicleId,
          lat,
          lng,
          status,
          timestamp: timestamp || new Date().toISOString(),
        });
      }

      processed++;
    }

    return NextResponse.json({ success: true, processed });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/gps - Get latest GPS positions for all vehicles
export async function GET() {
  // Get latest location per vehicle from employee_locations
  const { data: locations } = await supabase
    .from('employee_locations')
    .select('*, employee:employees(user:profiles(full_name))')
    .not('vehicle_id', 'is', null)
    .order('timestamp', { ascending: false });

  // Get all vehicles with their current assignments
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, plate_number, brand, model')
    .eq('is_active', true);

  const { data: assignments } = await supabase
    .from('vehicle_assignments')
    .select('vehicle_id, employee:employees(user:profiles(full_name))')
    .eq('is_active', true);

  // Build latest location per vehicle
  const latestPerVehicle = new Map<string, any>();
  for (const loc of (locations || [])) {
    if (!latestPerVehicle.has(loc.vehicle_id)) {
      latestPerVehicle.set(loc.vehicle_id, loc);
    }
  }

  const positions = (vehicles || []).map(v => {
    const loc = latestPerVehicle.get(v.id);
    const assign = (assignments || []).find((a: any) => a.vehicle_id === v.id);
    return {
      vehicle_id: v.id,
      plate_number: v.plate_number,
      vehicle: `${v.brand} ${v.model}`,
      driver: (assign as any)?.employee?.user?.full_name || null,
      lat: loc?.lat || null,
      lng: loc?.lng || null,
      status: loc?.status || 'offline',
      last_update: loc?.timestamp || null,
    };
  });

  return NextResponse.json({ positions, count: positions.length });
}
