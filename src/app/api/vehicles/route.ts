import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = getAdminClient();

  // Fetch vehicles
  const { data: vehicles, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('plate_number');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch vehicle_skills with skill info for all vehicles
  const { data: vehicleSkills } = await supabase
    .from('vehicle_skills')
    .select('vehicle_id, skill:skills(id, name, color)');

  // Build a map: vehicle_id -> skills[]
  const skillsMap = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
  if (vehicleSkills) {
    for (const vs of vehicleSkills) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const skill = (vs as any).skill;
      if (!skill) continue;
      const list = skillsMap.get(vs.vehicle_id) || [];
      list.push({ id: skill.id, name: skill.name, color: skill.color || null });
      skillsMap.set(vs.vehicle_id, list);
    }
  }

  const enriched = (vehicles || []).map(v => ({
    ...v,
    skills: skillsMap.get(v.id) || [],
  }));

  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { plate_number, brand, model, year, satis_device_id, notes, is_active, skill_ids } = body;

    if (!plate_number || !brand || !model) {
      return NextResponse.json({ error: 'plate_number, brand, and model are required' }, { status: 400 });
    }

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .insert({
        plate_number,
        brand,
        model,
        year: year ? Number(year) : null,
        satis_device_id: satis_device_id || null,
        notes: notes || null,
        is_active: is_active !== undefined ? is_active : true,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Insert vehicle_skills
    if (vehicle && Array.isArray(skill_ids) && skill_ids.length > 0) {
      const rows = skill_ids.map((sid: string) => ({ vehicle_id: vehicle.id, skill_id: sid }));
      await supabase.from('vehicle_skills').insert(rows);
    }

    return NextResponse.json(vehicle, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { id, plate_number, brand, model, year, is_active, satis_device_id, notes, skill_ids } = body;

    if (!id) {
      return NextResponse.json({ error: 'Vehicle id is required' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (plate_number !== undefined) update.plate_number = plate_number;
    if (brand !== undefined) update.brand = brand;
    if (model !== undefined) update.model = model;
    if (year !== undefined) update.year = year ? Number(year) : null;
    if (is_active !== undefined) update.is_active = is_active;
    if (satis_device_id !== undefined) update.satis_device_id = satis_device_id || null;
    if (notes !== undefined) update.notes = notes || null;

    if (Object.keys(update).length > 0) {
      const { error } = await supabase.from('vehicles').update(update).eq('id', id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    // Update vehicle_skills if provided
    if (Array.isArray(skill_ids)) {
      // Delete existing
      await supabase.from('vehicle_skills').delete().eq('vehicle_id', id);
      // Insert new
      if (skill_ids.length > 0) {
        const rows = skill_ids.map((sid: string) => ({ vehicle_id: id, skill_id: sid }));
        await supabase.from('vehicle_skills').insert(rows);
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const nowISO = new Date().toISOString();

  // Check for future work schedules referencing this vehicle
  const { count: scheduleCount } = await supabase
    .from('work_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('vehicle_id', id)
    .gte('start_at', nowISO);

  if (scheduleCount && scheduleCount > 0) {
    return NextResponse.json(
      { error: 'Nie można usunąć pojazdu — ma przypisane nadchodzące grafiki pracy' },
      { status: 409 }
    );
  }

  // Check for active employees who have this vehicle as their default
  const { count: employeeCount } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('default_vehicle_id', id)
    .eq('is_active', true);

  if (employeeCount && employeeCount > 0) {
    return NextResponse.json(
      { error: 'Nie można usunąć pojazdu — jest przypisany jako domyślny pojazd aktywnych pracowników' },
      { status: 409 }
    );
  }

  // Soft delete
  const { error } = await supabase
    .from('vehicles')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
