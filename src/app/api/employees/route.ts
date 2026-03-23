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
