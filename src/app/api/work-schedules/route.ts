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
    .select('*, employee:employees(id, user_id, profiles:user_id(full_name))')
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

  return NextResponse.json({ schedules: data });
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();

    // ── Bulk generation ──
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
      }> = [];

      const current = new Date(from_date + 'T00:00:00');
      const end = new Date(to_date + 'T00:00:00');

      while (current <= end) {
        const isoDay = current.getDay() === 0 ? 7 : current.getDay(); // 1=Mon,...,7=Sun
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

    // ── Single upsert ──
    const { employee_id, date, start_time, end_time, is_night_shift, notes } = body;

    if (!employee_id || !date) {
      return NextResponse.json(
        { error: 'employee_id and date are required' },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('work_schedules')
      .upsert(
        {
          employee_id,
          date,
          start_time: start_time || '08:00',
          end_time: end_time || '16:00',
          is_night_shift: is_night_shift ?? false,
          notes: notes || null,
        },
        { onConflict: 'employee_id,date' },
      )
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
      // Delete range
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
      // Delete single
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
