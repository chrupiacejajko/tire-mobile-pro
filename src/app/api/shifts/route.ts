/**
 * Shift tracking (RCP) API
 *
 * GET  /api/shifts?date=YYYY-MM-DD&employee_id=XXX  — single shift or all shifts for date
 * POST /api/shifts  { employee_id, action: 'clock_in' | 'clock_out' | 'add_break', break_minutes? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const employeeId = searchParams.get('employee_id');

  if (!date) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 });
  }

  if (employeeId) {
    // Return single shift for employee on date
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', date)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ shift: data });
  }

  // Return all shifts for date with employee name
  const { data, error } = await supabase
    .from('shifts')
    .select('*, employees!inner(id, user_id, profiles:user_id(full_name))')
    .eq('date', date)
    .order('clock_in', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const shifts = (data || []).map((s: any) => ({
    ...s,
    employee_name: s.employees?.profiles?.full_name ?? 'Nieznany',
    employees: undefined,
  }));

  return NextResponse.json({ shifts });
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { employee_id, action, break_minutes } = body;

    if (!employee_id || !action) {
      return NextResponse.json({ error: 'employee_id and action required' }, { status: 400 });
    }

    const today = new Date().toISOString().split('T')[0];

    if (action === 'clock_in') {
      // Check if shift already exists for today
      const { data: existing } = await supabase
        .from('shifts')
        .select('id')
        .eq('employee_id', employee_id)
        .eq('date', today)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: 'Shift already exists for today' }, { status: 409 });
      }

      const { data, error } = await supabase
        .from('shifts')
        .insert({
          employee_id,
          date: today,
          clock_in: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, action: 'clock_in', shift: data });
    }

    if (action === 'clock_out') {
      const { data, error } = await supabase
        .from('shifts')
        .update({ clock_out: new Date().toISOString() })
        .eq('employee_id', employee_id)
        .eq('date', today)
        .is('clock_out', null)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, action: 'clock_out', shift: data });
    }

    if (action === 'add_break') {
      const mins = Number(break_minutes) || 15;

      // Get current break_minutes first
      const { data: current } = await supabase
        .from('shifts')
        .select('id, break_minutes')
        .eq('employee_id', employee_id)
        .eq('date', today)
        .single();

      if (!current) {
        return NextResponse.json({ error: 'No shift found for today' }, { status: 404 });
      }

      const { data, error } = await supabase
        .from('shifts')
        .update({ break_minutes: (current.break_minutes || 0) + mins })
        .eq('id', current.id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, action: 'add_break', shift: data });
    }

    return NextResponse.json({ error: 'action must be clock_in, clock_out, or add_break' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
