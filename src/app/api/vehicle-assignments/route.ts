import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function PUT(request: NextRequest) {
  const supabaseAdmin = getAdminClient();
  try {
    const body = await request.json();
    const { vehicle_id, employee_id } = body;

    if (!vehicle_id || !employee_id) {
      return NextResponse.json({ error: 'vehicle_id and employee_id are required' }, { status: 400 });
    }

    // Deactivate current assignment for this vehicle
    await supabaseAdmin
      .from('vehicle_assignments')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('vehicle_id', vehicle_id)
      .eq('is_active', true);

    // Deactivate current assignment for this employee (one vehicle per employee)
    await supabaseAdmin
      .from('vehicle_assignments')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('employee_id', employee_id)
      .eq('is_active', true);

    // Create new assignment
    const { error } = await supabaseAdmin.from('vehicle_assignments').insert({
      vehicle_id,
      employee_id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
