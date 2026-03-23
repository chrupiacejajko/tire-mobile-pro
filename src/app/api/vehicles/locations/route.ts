import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = getAdminClient();

  // Get all active vehicles
  const { data: vehicles, error } = await supabase
    .from('vehicles')
    .select('id, plate_number, brand, model, year, satis_device_id, is_active')
    .eq('is_active', true)
    .order('plate_number');

  if (error || !vehicles) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }

  // For each vehicle get latest location
  const result = await Promise.all(
    vehicles.map(async (vehicle) => {
      // Latest location
      const { data: loc } = await supabase
        .from('employee_locations')
        .select('lat, lng, status, speed, direction, rpm, driving_time, timestamp, employee_id')
        .eq('vehicle_id', vehicle.id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      // Active driver assignment
      const { data: assignment } = await supabase
        .from('vehicle_assignments')
        .select('employee_id, employee:employees(user:profiles(full_name))')
        .eq('vehicle_id', vehicle.id)
        .eq('is_active', true)
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
        last_update: loc?.timestamp ?? null,
        driver_name: (assignment?.employee as any)?.user?.full_name ?? null,
      };
    })
  );

  return NextResponse.json(result);
}
