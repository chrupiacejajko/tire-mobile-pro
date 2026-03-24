import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET /api/unavailabilities
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employee_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let query = supabase
    .from('unavailabilities')
    .select('*, employee:employees(id, user:profiles(full_name))')
    .order('start_date', { ascending: true });

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }
  if (from) {
    query = query.gte('end_date', from);
  }
  if (to) {
    query = query.lte('start_date', to);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ unavailabilities: data });
}

// POST /api/unavailabilities
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const {
      employee_id,
      type,
      start_date,
      end_date,
      start_time,
      end_time,
      is_recurring,
      recurrence_day,
      notes,
    } = body;

    if (!employee_id || !type || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'employee_id, type, start_date, and end_date are required' },
        { status: 400 },
      );
    }

    const validTypes = ['vacation', 'sick_leave', 'training', 'personal', 'other'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(', ')}` },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('unavailabilities')
      .insert({
        employee_id,
        type,
        start_date,
        end_date,
        start_time: start_time || null,
        end_time: end_time || null,
        is_recurring: is_recurring ?? false,
        recurrence_day: recurrence_day ?? null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ unavailability: data }, { status: 201 });
  } catch (err) {
    console.error('[unavailabilities POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/unavailabilities
export async function DELETE(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('unavailabilities')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[unavailabilities DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
