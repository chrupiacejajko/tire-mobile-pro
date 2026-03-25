import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm } from '@/lib/geo';

const MAX_DISTANCE_KM = 50;
const AVG_CITY_SPEED_KMH = 40;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');
  const date = searchParams.get('date');

  if (isNaN(lat) || isNaN(lng) || !date) {
    return NextResponse.json(
      { error: 'Missing required params: lat, lng, date' },
      { status: 400 },
    );
  }

  const supabase = getAdminClient();

  try {
    // 1. Get employees with work_schedules for the given date
    const { data: schedules, error: schedErr } = await supabase
      .from('work_schedules')
      .select('employee_id, employee:employees(first_name)')
      .eq('date', date);

    if (schedErr) throw schedErr;
    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ available: false });
    }

    const empIds = schedules.map((s: any) => s.employee_id);

    // 2. Get latest GPS positions from employee_locations
    const { data: locations, error: locErr } = await supabase
      .from('employee_locations')
      .select('employee_id, lat, lng, timestamp')
      .in('employee_id', empIds)
      .order('timestamp', { ascending: false });

    if (locErr) throw locErr;

    // Deduplicate: keep only the latest position per employee
    const latestByEmp = new Map<string, { lat: number; lng: number }>();
    for (const loc of locations ?? []) {
      if (!latestByEmp.has(loc.employee_id) && loc.lat && loc.lng) {
        latestByEmp.set(loc.employee_id, { lat: loc.lat, lng: loc.lng });
      }
    }

    // 3. Calculate distances and filter within MAX_DISTANCE_KM
    const candidates: {
      first_name: string;
      distance_km: number;
      eta_minutes: number;
    }[] = [];

    for (const sched of schedules) {
      const pos = latestByEmp.get(sched.employee_id);
      if (!pos) continue;

      const dist = haversineKm(lat, lng, pos.lat, pos.lng);
      if (dist > MAX_DISTANCE_KM) continue;

      const emp = sched.employee as any;
      const firstName = emp?.first_name ?? 'Kierowca';
      const etaMinutes = Math.round((dist / AVG_CITY_SPEED_KMH) * 60);

      candidates.push({
        first_name: firstName,
        distance_km: Math.round(dist * 10) / 10,
        eta_minutes: Math.max(etaMinutes, 1),
      });
    }

    // 4. Sort by distance
    candidates.sort((a, b) => a.distance_km - b.distance_km);

    // 5. Return closest available one
    if (candidates.length === 0) {
      return NextResponse.json({ available: false });
    }

    return NextResponse.json({
      available: true,
      driver: candidates[0],
    });
  } catch (err) {
    console.error('[nearby-driver] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
