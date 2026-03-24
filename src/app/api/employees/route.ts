import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth } from '@/lib/api/auth-guard';

export async function GET() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('employees')
    .select(`
      *,
      user:profiles(full_name, email, phone, role),
      region:regions(name, color),
      default_vehicle:vehicles!employees_default_vehicle_id_fkey(id, plate_number, brand, model),
      employee_skills(skill_id, skill:skills(id, name, is_active))
    `)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin']);
  if (!auth.ok) return auth.response;
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const {
      first_name, last_name, email, phone, phone_secondary,
      region_id, default_vehicle_id, shift_rate,
      mobile_login, mobile_password, role, skill_ids,
    } = body;

    const full_name = `${first_name || ''} ${last_name || ''}`.trim();

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: 'TempPass123!',
      email_confirm: true,
      user_metadata: { full_name, role: role || 'worker' },
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Update profile with phone and role
    const profileUpdate: Record<string, unknown> = { full_name };
    if (phone) profileUpdate.phone = phone;
    if (role) profileUpdate.role = role;
    await supabase.from('profiles').update(profileUpdate).eq('id', authData.user.id);

    // Create employee record
    const { data: employee, error: empError } = await supabase.from('employees').insert({
      user_id: authData.user.id,
      first_name: first_name || null,
      last_name: last_name || null,
      region_id: region_id || null,
      default_vehicle_id: default_vehicle_id || null,
      shift_rate: shift_rate ? Number(shift_rate) : null,
      phone_secondary: phone_secondary || null,
      mobile_login: mobile_login || null,
      mobile_password: mobile_password || null,
      skills: [],
      hourly_rate: 0,
    }).select().single();

    if (empError) {
      return NextResponse.json({ error: empError.message }, { status: 400 });
    }

    // Insert employee_skills
    if (skill_ids && Array.isArray(skill_ids) && skill_ids.length > 0 && employee) {
      const rows = skill_ids.map((sid: string) => ({
        employee_id: employee.id,
        skill_id: sid,
      }));
      await supabase.from('employee_skills').insert(rows);
    }

    return NextResponse.json({ employee }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await checkAuth(request, ['admin']);
  if (!auth.ok) return auth.response;
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const {
      id, first_name, last_name, phone, phone_secondary, role,
      region_id, default_vehicle_id, shift_rate,
      mobile_login, mobile_password, is_active, skill_ids,
      start_time, end_time, skills, hourly_rate,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Employee id is required' }, { status: 400 });
    }

    // Get employee to find user_id
    const { data: emp, error: empFetchError } = await supabase
      .from('employees')
      .select('user_id')
      .eq('id', id)
      .single();

    if (empFetchError || !emp) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Update profile (full_name, phone, role)
    const profileUpdate: Record<string, unknown> = {};
    if (first_name !== undefined || last_name !== undefined) {
      // Build full_name from first + last
      const fName = first_name ?? '';
      const lName = last_name ?? '';
      profileUpdate.full_name = `${fName} ${lName}`.trim();
    }
    if (phone !== undefined) profileUpdate.phone = phone;
    if (role !== undefined) profileUpdate.role = role;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', emp.user_id);
      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 400 });
      }
    }

    // Update employee record
    const employeeUpdate: Record<string, unknown> = {};
    if (first_name !== undefined) employeeUpdate.first_name = first_name;
    if (last_name !== undefined) employeeUpdate.last_name = last_name;
    if (phone_secondary !== undefined) employeeUpdate.phone_secondary = phone_secondary || null;
    if (default_vehicle_id !== undefined) employeeUpdate.default_vehicle_id = default_vehicle_id || null;
    if (shift_rate !== undefined) employeeUpdate.shift_rate = shift_rate ? Number(shift_rate) : null;
    if (mobile_login !== undefined) employeeUpdate.mobile_login = mobile_login || null;
    if (mobile_password !== undefined) employeeUpdate.mobile_password = mobile_password || null;
    if (is_active !== undefined) employeeUpdate.is_active = is_active;
    if (region_id !== undefined) employeeUpdate.region_id = region_id || null;
    if (hourly_rate !== undefined) employeeUpdate.hourly_rate = Number(hourly_rate);

    // Legacy: support old skills field
    if (skills !== undefined) {
      employeeUpdate.skills = Array.isArray(skills)
        ? skills
        : skills.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    if (start_time !== undefined || end_time !== undefined) {
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
      const { error: empError } = await supabase
        .from('employees')
        .update(employeeUpdate)
        .eq('id', id);
      if (empError) {
        return NextResponse.json({ error: empError.message }, { status: 400 });
      }
    }

    // Update employee_skills junction
    if (skill_ids !== undefined && Array.isArray(skill_ids)) {
      // Delete existing
      await supabase.from('employee_skills').delete().eq('employee_id', id);
      // Insert new
      if (skill_ids.length > 0) {
        const rows = skill_ids.map((sid: string) => ({
          employee_id: id,
          skill_id: sid,
        }));
        await supabase.from('employee_skills').insert(rows);
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
