/**
 * Work Schedules API (Grafik zmian)
 *
 * GET  /api/work-schedules?from=YYYY-MM-DD&to=YYYY-MM-DD&employee_id=X
 * POST /api/work-schedules  — single upsert or bulk generation
 * DELETE /api/work-schedules — delete single or range
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
    return NextResponse.json(
      { error: 'from and to date parameters are required' },
      { status: 400 },
    );
  }

  let query = supabase
    .from('work_schedules')
    .select('*, employee:employees(id, user_id, region_id, default_vehicle_id, profiles:user_id(full_name))')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true });

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with vehicle plate and region name
  // Collect unique vehicle_ids and region_ids
  const vehicleIds = new Set<string>();
  const regionIds = new Set<string>();
  for (const s of (data || [])) {
    if (s.vehicle_id) vehicleIds.add(s.vehicle_id);
    if (s.region_id) regionIds.add(s.region_id);
  }

  let vehicleMap = new Map<string, string>();
  if (vehicleIds.size > 0) {
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('id, plate_number')
      .in('id', Array.from(vehicleIds));
    if (vehicles) {
      for (const v of vehicles) vehicleMap.set(v.id, v.plate_number);
    }
  }

  let regionMap = new Map<string, { name: string; color: string }>();
  if (regionIds.size > 0) {
    const { data: regions } = await supabase
      .from('regions')
      .select('id, name, color')
      .in('id', Array.from(regionIds));
    if (regions) {
      for (const r of regions) regionMap.set(r.id, { name: r.name, color: r.color });
    }
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

    // -- Bulk generation: 48/48 duty pattern --
    if (body.bulk && body.pattern === '48_48') {
      const { employees: empList, from_date, to_date, start_time, end_time } = body;

      if (!Array.isArray(empList) || empList.length === 0 || !from_date || !to_date) {
        return NextResponse.json(
          { error: 'employees array, from_date, and to_date are required for 48_48 pattern' },
          { status: 400 },
        );
      }

      const patternStartTime = start_time || '07:00';
      const patternEndTime = end_time || '23:00';

      // Fetch employee defaults for vehicle_id and region_id
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

      const rows: Array<{
        employee_id: string;
        date: string;
        start_time: string;
        end_time: string;
        notes: string;
        vehicle_id: string | null;
        region_id: string | null;
        location_address: string | null;
        location_lat: number | null;
        location_lng: number | null;
      }> = [];

      for (const emp of empList) {
        const { employee_id: empId, first_on_date } = emp;
        if (!empId || !first_on_date) continue;

        const defaults = defaultsMap.get(empId);

        const firstOn = new Date(first_on_date + 'T00:00:00');
        const current = new Date(from_date + 'T00:00:00');
        const end = new Date(to_date + 'T00:00:00');

        while (current <= end) {
          const diffDays = Math.round((current.getTime() - firstOn.getTime()) / 86400000);
          const posInCycle = ((diffDays % 4) + 4) % 4;
          const isOnDuty = posInCycle === 0 || posInCycle === 1;

          if (isOnDuty) {
            rows.push({
              employee_id: empId,
              date: current.toISOString().split('T')[0],
              start_time: patternStartTime,
              end_time: patternEndTime,
              notes: 'DYZUR_48_48',
              vehicle_id: defaults?.vehicle_id || null,
              region_id: defaults?.region_id || null,
              location_address: defaults?.location_address || null,
              location_lat: defaults?.location_lat || null,
              location_lng: defaults?.location_lng || null,
            });
          }

          current.setDate(current.getDate() + 1);
        }
      }

      if (rows.length === 0) {
        return NextResponse.json({ message: 'No schedules generated', count: 0 });
      }

      const { data, error } = await supabase
        .from('work_schedules')
        .upsert(rows, { onConflict: 'employee_id,date' })
        .select();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ schedules: data, count: data?.length ?? 0 }, { status: 201 });
    }

    // -- Bulk generation (standard) --
    if (body.bulk) {
      const {
        employee_id,
        from_date,
        to_date,
        template_id,
        start_time,
        end_time,
        skip_weekends,
      } = body;

      if (!employee_id || !from_date || !to_date) {
        return NextResponse.json(
          { error: 'employee_id, from_date, and to_date are required for bulk' },
          { status: 400 },
        );
      }

      // Fetch employee defaults for location
      const { data: empDefault } = await supabase
        .from('employees')
        .select('id, default_location, default_lat, default_lng')
        .eq('id', employee_id)
        .single();

      let templateStartTime = start_time || '08:00';
      let templateEndTime = end_time || '16:00';
      let templateDays: number[] | null = null;

      if (template_id) {
        const { data: tpl } = await supabase
          .from('schedule_templates')
          .select('*')
          .eq('id', template_id)
          .single();

        if (tpl) {
          templateStartTime = tpl.start_time;
          templateEndTime = tpl.end_time;
          templateDays = tpl.days_of_week;
        }
      }

      const rows: Array<{
        employee_id: string;
        date: string;
        start_time: string;
        end_time: string;
        location_address: string | null;
        location_lat: number | null;
        location_lng: number | null;
      }> = [];

      const current = new Date(from_date + 'T00:00:00');
      const endDate = new Date(to_date + 'T00:00:00');

      while (current <= endDate) {
        const isoDay = current.getDay() === 0 ? 7 : current.getDay();
        const isWeekend = isoDay === 6 || isoDay === 7;

        if (skip_weekends && isWeekend) {
          current.setDate(current.getDate() + 1);
          continue;
        }

        if (templateDays && !templateDays.includes(isoDay)) {
          current.setDate(current.getDate() + 1);
          continue;
        }

        rows.push({
          employee_id,
          date: current.toISOString().split('T')[0],
          start_time: templateStartTime,
          end_time: templateEndTime,
          location_address: empDefault?.default_location || null,
          location_lat: empDefault?.default_lat || null,
          location_lng: empDefault?.default_lng || null,
        });

        current.setDate(current.getDate() + 1);
      }

      if (rows.length === 0) {
        return NextResponse.json({ message: 'No schedules generated', count: 0 });
      }

      const { data, error } = await supabase
        .from('work_schedules')
        .upsert(rows, { onConflict: 'employee_id,date' })
        .select();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ schedules: data, count: data?.length ?? 0 }, { status: 201 });
    }

    // -- Single upsert --
    const { employee_id, date, start_time, end_time, is_night_shift, notes, vehicle_id, region_id, location_address, location_lat, location_lng } = body;

    if (!employee_id || !date) {
      return NextResponse.json(
        { error: 'employee_id and date are required' },
        { status: 400 },
      );
    }

    // Conflict check: employee overlap
    const { data: empConflicts } = await supabase
      .from('work_schedules')
      .select('id, date, start_time, end_time')
      .eq('employee_id', employee_id)
      .eq('date', date)
      .neq('employee_id', '__skip__'); // always true, just to chain

    // If there's already a schedule for this employee+date, upsert will replace it
    // But we need to check vehicle overlap with OTHER employees (time-aware)
    if (vehicle_id) {
      const { data: vehicleConflicts } = await supabase
        .from('work_schedules')
        .select('id, employee_id, date, start_time, end_time')
        .eq('vehicle_id', vehicle_id)
        .eq('date', date)
        .neq('employee_id', employee_id);

      // Check actual time overlap (not just same date)
      const newStart = start_time || '08:00';
      const newEnd = end_time || '16:00';
      const overlapping = (vehicleConflicts || []).filter(c => {
        const cStart = c.start_time || '00:00';
        const cEnd = c.end_time || '23:59';
        // Overlap: NOT (newEnd <= cStart OR newStart >= cEnd)
        return !(newEnd <= cStart || newStart >= cEnd);
      });

      if (overlapping.length > 0) {
        const conflictEmpId = overlapping[0].employee_id;
        const { data: conflictEmp } = await supabase
          .from('employees')
          .select('id, profiles:user_id(full_name)')
          .eq('id', conflictEmpId)
          .single();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const empName = (conflictEmp as any)?.profiles?.full_name || 'inny pracownik';

        const { data: veh } = await supabase
          .from('vehicles')
          .select('plate_number')
          .eq('id', vehicle_id)
          .single();

        return NextResponse.json({
          error: `Pojazd ${veh?.plate_number || vehicle_id} jest przypisany do ${empName} (${overlapping[0].start_time}–${overlapping[0].end_time})`,
          conflict: 'vehicle',
        }, { status: 409 });
      }
    }

    const upsertData: Record<string, unknown> = {
      employee_id,
      date,
      start_time: start_time || '08:00',
      end_time: end_time || '16:00',
      is_night_shift: is_night_shift ?? false,
      notes: notes || null,
    };
    if (vehicle_id !== undefined) upsertData.vehicle_id = vehicle_id || null;
    if (region_id !== undefined) upsertData.region_id = region_id || null;
    if (location_address !== undefined) upsertData.location_address = location_address || null;
    if (location_lat !== undefined) upsertData.location_lat = location_lat || null;
    if (location_lng !== undefined) upsertData.location_lng = location_lng || null;

    const { data, error } = await supabase
      .from('work_schedules')
      .upsert(upsertData, { onConflict: 'employee_id,date' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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
    const { employee_id, date, from_date, to_date } = body;

    if (!employee_id) {
      return NextResponse.json({ error: 'employee_id is required' }, { status: 400 });
    }

    if (from_date && to_date) {
      const { error } = await supabase
        .from('work_schedules')
        .delete()
        .eq('employee_id', employee_id)
        .gte('date', from_date)
        .lte('date', to_date);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (date) {
      const { error } = await supabase
        .from('work_schedules')
        .delete()
        .eq('employee_id', employee_id)
        .eq('date', date);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'date or from_date+to_date required' }, { status: 400 });
  } catch (err) {
    console.error('[work-schedules DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
