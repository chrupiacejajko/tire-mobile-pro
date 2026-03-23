/**
 * GET /api/satisgps/debug
 * Shows raw data from Satis GPS + DB matching result.
 * Use to diagnose missing/offline vehicles.
 */
import { NextResponse } from 'next/server';
import { pollSatisGPS } from '@/lib/satisgps/poller';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const result = await pollSatisGPS();
  const supabase = getAdminClient();

  const { data: dbVehicles } = await supabase
    .from('vehicles')
    .select('id, plate_number, satis_device_id, is_active');

  const { data: assignments } = await supabase
    .from('vehicle_assignments')
    .select('vehicle_id, employee_id, is_active');

  const matched = await Promise.all((result.vehicles ?? []).map(async v => {
    const plates = [...new Set([v.plate, v.plate.replace(/\s+/g, ''), v.plate.toUpperCase(), v.plate.toUpperCase().replace(/\s+/g, '')])];
    let dbMatch = null;
    for (const plate of plates) {
      const { data } = await supabase
        .from('vehicles')
        .select('id, plate_number, satis_device_id')
        .or(`plate_number.eq.${plate},satis_device_id.eq.${v.satisId}`)
        .single();
      if (data) { dbMatch = data; break; }
    }
    const assignment = assignments?.find(a => a.vehicle_id === dbMatch?.id && a.is_active);
    return {
      satis_plate: v.plate,
      satis_id: v.satisId,
      speed: v.speed,
      lat: v.lat,
      lng: v.lng,
      db_match: dbMatch?.plate_number ?? '❌ NO MATCH',
      db_vehicle_id: dbMatch?.id ?? null,
      has_assignment: !!assignment,
      employee_id: assignment?.employee_id ?? null,
    };
  }));

  return NextResponse.json({
    ok: result.ok,
    error: result.error,
    satis_vehicles_count: result.vehicles?.length ?? 0,
    db_vehicles_count: dbVehicles?.length ?? 0,
    vehicles: matched,
    db_plates: dbVehicles?.map(v => ({ id: v.id, plate: v.plate_number, satis_id: v.satis_device_id })),
  });
}
