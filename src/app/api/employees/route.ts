import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const supabaseAdmin = getAdminClient();
  try {
    const body = await request.json();
    const { full_name, email, phone, region_id, skills, hourly_rate, vehicle_info } = body;

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: 'TempPass123!', // Temporary password
      email_confirm: true,
      user_metadata: { full_name, role: 'worker' },
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Update profile with phone
    if (phone) {
      await supabaseAdmin.from('profiles').update({ phone }).eq('id', authData.user.id);
    }

    // Create employee record
    const { data: employee, error: empError } = await supabaseAdmin.from('employees').insert({
      user_id: authData.user.id,
      region_id: region_id || null,
      skills: skills ? skills.split(',').map((s: string) => s.trim()) : [],
      hourly_rate: Number(hourly_rate) || 40,
      vehicle_info: vehicle_info || null,
    }).select().single();

    if (empError) {
      return NextResponse.json({ error: empError.message }, { status: 400 });
    }

    return NextResponse.json({ employee }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const supabaseAdmin = getAdminClient();
  try {
    const body = await request.json();
    const { id, full_name, phone, role, start_time, end_time, skills, is_active, hourly_rate, region_id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Employee id is required' }, { status: 400 });
    }

    // Get employee to find user_id
    const { data: emp, error: empFetchError } = await supabaseAdmin
      .from('employees')
      .select('user_id')
      .eq('id', id)
      .single();

    if (empFetchError || !emp) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Update profile (full_name, phone, role)
    const profileUpdate: Record<string, unknown> = {};
    if (full_name !== undefined) profileUpdate.full_name = full_name;
    if (phone !== undefined) profileUpdate.phone = phone;
    if (role !== undefined) profileUpdate.role = role;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('id', emp.user_id);
      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 400 });
      }
    }

    // Update employee record (working_hours, skills, is_active, hourly_rate, region_id)
    const employeeUpdate: Record<string, unknown> = {};
    if (skills !== undefined) {
      employeeUpdate.skills = Array.isArray(skills)
        ? skills
        : skills.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    if (is_active !== undefined) employeeUpdate.is_active = is_active;
    if (hourly_rate !== undefined) employeeUpdate.hourly_rate = Number(hourly_rate);
    if (region_id !== undefined) employeeUpdate.region_id = region_id || null;

    if (start_time !== undefined || end_time !== undefined) {
      // Build a simple working_hours object with start/end for all weekdays
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const wh: Record<string, { start: string; end: string } | null> = {};
      for (const day of days) {
        if (start_time && end_time) {
          wh[day] = { start: start_time, end: end_time };
        } else {
          wh[day] = null;
        }
      }
      employeeUpdate.working_hours = wh;
    }

    if (Object.keys(employeeUpdate).length > 0) {
      const { error: empError } = await supabaseAdmin
        .from('employees')
        .update(employeeUpdate)
        .eq('id', id);
      if (empError) {
        return NextResponse.json({ error: empError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
