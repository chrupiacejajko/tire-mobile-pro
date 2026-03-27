/**
 * Work Schedules API — v2 (start_at + duration_minutes model)
 *
 * GET  /api/work-schedules?from=YYYY-MM-DD&to=YYYY-MM-DD&employee_id=X
 * POST /api/work-schedules  — single upsert or bulk generation
 * DELETE /api/work-schedules — delete by id or range
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const employeeId = searchParams.get('employee_id');

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to date parameters are required' }, { status: 400 });
  }

  // Overlap query: shifts where start_at < end_of_range AND end_at > start_of_range
  const rangeStart = `${from}T00:00:00`;
  const rangeEnd = `${to}T23:59:59`;

  let query = supabase
    .from('work_schedules')
    .select('*')
    .lt('start_at', rangeEnd)
    .gt('end_at', rangeStart)
    .order('start_at', { ascending: true });

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with vehicle plate and region name
  const vehicleIds = new Set<string>();
  const regionIds = new Set<string>();
  for (const s of (data || [])) {
    if (s.vehicle_id) vehicleIds.add(s.vehicle_id);
    if (s.region_id) regionIds.add(s.region_id);
  }

  const vehicleMap = new Map<string, string>();
  if (vehicleIds.size > 0) {
    const { data: vehicles } = await supabase
      .from('vehicles').select('id, plate_number').in('id', Array.from(vehicleIds));
    if (vehicles) for (const v of vehicles) vehicleMap.set(v.id, v.plate_number);
  }

  const regionMap = new Map<string, { name: string; color: string }>();
  if (regionIds.size > 0) {
    const { data: regions } = await supabase
      .from('regions').select('id, name, color').in('id', Array.from(regionIds));
    if (regions) for (const r of regions) regionMap.set(r.id, { name: r.name, color: r.color });
  }

  const enriched = (data || []).map(s => ({
    ...s,
    vehicle_plate: s.vehicle_id ? vehicleMap.get(s.vehicle_id) || null : null,
    region_name: s.region_id ? regionMap.get(s.region_id)?.name || null : null,
    region_color: s.region_id ? regionMap.get(s.region_id)?.color || null : null,
  }));

  return NextResponse.json({ schedules: enriched });
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();

    // ── Bulk generation: duty pattern ──
    if (body.bulk && body.pattern === '48_48') {
      const { employees: empList, from_date, start_time, duration_hours, shift_count } = body;
      const durationH = Number(duration_hours) || 48;
      const count = Number(shift_count) || 4;

      if (!Array.isArray(empList) || empList.length === 0 || !from_date) {
        return NextResponse.json({ error: 'employees array and from_date required' }, { status: 400 });
      }

      const patternStartTime = start_time || '07:00';
      const onDays = Math.ceil(durationH / 24);

      // Fetch employee defaults
      const empIds = empList.map((e: { employee_id: string }) => e.employee_id);
      const { data: empDefaults } = await supabase
        .from('employees')
        .select('id, default_vehicle_id, region_id, default_location, default_lat, default_lng')
        .in('id', empIds);

      const defaultsMap = new Map<string, { vehicle_id: string | null; region_id: string | null; location_address: string | null; location_lat: number | null; location_lng: number | null }>();
      if (empDefaults) {
        for (const e of empDefaults) {
          defaultsMap.set(e.id, {
            vehicle_id: e.default_vehicle_id || null,
            region_id: e.region_id || null,
            location_address: e.default_location || null,
            location_lat: e.default_lat || null,
            location_lng: e.default_lng || null,
          });
        }
      }

      // Duration directly from hours — no end_time calculation needed
      const [sh, sm] = patternStartTime.split(':').map(Number);
      const shiftDurationMinutes = durationH * 60;

      const rows: Array<Record<string, unknown>> = [];

      for (const emp of empList) {
        const { employee_id: empId, first_on_date } = emp;
        if (!empId || !first_on_date) continue;

        const defaults = defaultsMap.get(empId);

        // Generate `count` duty periods
        for (let c = 0; c < count; c++) {
          // Each cycle: onDays ON, onDays OFF
          const cycleOffset = c * onDays * 2;
          const shiftDate = new Date(first_on_date + 'T00:00:00');
          shiftDate.setDate(shiftDate.getDate() + cycleOffset);

          const startAt = new Date(shiftDate);
          startAt.setHours(sh, sm || 0, 0, 0);

          rows.push({
            employee_id: empId,
            start_at: startAt.toISOString(),
            duration_minutes: shiftDurationMinutes,
            notes: 'DYZUR_48_48',
            vehicle_id: defaults?.vehicle_id || null,
            region_id: defaults?.region_id || null,
            location_address: defaults?.location_address || null,
            location_lat: defaults?.location_lat || null,
            location_lng: defaults?.location_lng || null,
          });
        }
      }

      if (rows.length === 0) {
        return NextResponse.json({ message: 'No schedules generated', count: 0 });
      }

      const { data, error } = await supabase
        .from('work_schedules')
        .upsert(rows, { onConflict: 'employee_id,start_at' })
        .select();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ schedules: data, count: data?.length ?? 0 }, { status: 201 });
    }

    // ── Single upsert ──
    const { employee_id, start_at, duration_minutes, notes, vehicle_id, region_id,
            location_address, location_lat, location_lng } = body;

    if (!employee_id || !start_at) {
      return NextResponse.json({ error: 'employee_id and start_at are required' }, { status: 400 });
    }

    const upsertData: Record<string, unknown> = {
      employee_id,
      start_at,
      duration_minutes: duration_minutes || 480,
      notes: notes || null,
    };
    if (vehicle_id !== undefined) upsertData.vehicle_id = vehicle_id || null;
    if (region_id !== undefined) upsertData.region_id = region_id || null;
    if (location_address !== undefined) upsertData.location_address = location_address || null;
    if (location_lat !== undefined) upsertData.location_lat = location_lat || null;
    if (location_lng !== undefined) upsertData.location_lng = location_lng || null;

    const { data, error } = await supabase
      .from('work_schedules')
      .upsert(upsertData, { onConflict: 'employee_id,start_at' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ schedule: data }, { status: 201 });
  } catch (err) {
    console.error('[work-schedules POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { id, employee_id, from, to } = body;

    // Delete by ID (preferred)
    if (id) {
      const { error } = await supabase.from('work_schedules').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // Delete by employee + date range
    if (employee_id && from && to) {
      const { error } = await supabase
        .from('work_schedules')
        .delete()
        .eq('employee_id', employee_id)
        .gte('start_at', `${from}T00:00:00`)
        .lte('start_at', `${to}T23:59:59`);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'id or employee_id+from+to required' }, { status: 400 });
  } catch (err) {
    console.error('[work-schedules DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
