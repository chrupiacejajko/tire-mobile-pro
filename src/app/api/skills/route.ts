import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get('active') === 'true';

  let query = supabase.from('skills').select('*').order('name');
  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { name, description } = body;
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

    const { data, error } = await supabase
      .from('skills')
      .insert({ name, description: description || null })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { id, name, description, is_active } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('skills')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Check references in employee_skills
  const { count: empSkillCount } = await supabase
    .from('employee_skills')
    .select('id', { count: 'exact', head: true })
    .eq('skill_id', id);

  // Check references in vehicle_skills
  const { count: vehSkillCount } = await supabase
    .from('vehicle_skills')
    .select('id', { count: 'exact', head: true })
    .eq('skill_id', id);

  if ((empSkillCount && empSkillCount > 0) || (vehSkillCount && vehSkillCount > 0)) {
    return NextResponse.json(
      { error: 'Nie można dezaktywować umiejętności — jest przypisana do pracownika lub pojazdu' },
      { status: 409 }
    );
  }

  // Soft delete
  const { error } = await supabase
    .from('skills')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
