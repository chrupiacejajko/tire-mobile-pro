import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .from('regions')
    .select('*')
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add counts
  const withCounts = await Promise.all((data || []).map(async (r) => {
    const [empRes, ordRes] = await Promise.all([
      supabase.from('employees').select('id', { count: 'exact', head: true }).eq('region_id', r.id),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('region_id', r.id),
    ]);
    return { ...r, employee_count: empRes.count || 0, order_count: ordRes.count || 0 };
  }));
  return NextResponse.json(withCounts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, color, description, main_address, main_lat, main_lng } = body;
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const insertData: Record<string, unknown> = { name, color: color || '#3B82F6' };
  if (description !== undefined) insertData.description = description;
  if (main_address !== undefined) insertData.main_address = main_address || null;
  if (main_lat !== undefined) insertData.main_lat = main_lat;
  if (main_lng !== undefined) insertData.main_lng = main_lng;

  const { data, error } = await supabase
    .from('regions')
    .insert(insertData)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, color, description } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (color !== undefined) updates.color = color;
  if (description !== undefined) updates.description = description;
  if (body.polygon !== undefined) updates.polygon = body.polygon;
  if (body.free_zone_polygon !== undefined) updates.free_zone_polygon = body.free_zone_polygon;
  if (body.main_address !== undefined) updates.main_address = body.main_address || null;
  if (body.main_lat !== undefined) updates.main_lat = body.main_lat;
  if (body.main_lng !== undefined) updates.main_lng = body.main_lng;
  if (body.display_order !== undefined) updates.display_order = body.display_order;

  const { data, error } = await supabase
    .from('regions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { reorder } = body;
  if (!Array.isArray(reorder) || reorder.length === 0) {
    return NextResponse.json({ error: 'reorder array required' }, { status: 400 });
  }

  const results = await Promise.all(
    reorder.map(({ id, display_order }: { id: string; display_order: number }) =>
      supabase.from('regions').update({ display_order }).eq('id', id)
    )
  );

  const failed = results.find(r => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const today = new Date().toISOString().split('T')[0];

  // Check future work schedules in this region
  const { count: scheduleCount } = await supabase
    .from('work_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('region_id', id)
    .gte('date', today);

  // Check active (non-completed/cancelled) orders in this region
  const { count: orderCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('region_id', id)
    .not('status', 'in', '("completed","cancelled")');

  // Check active employees assigned to this region
  const { count: employeeCount } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('region_id', id)
    .eq('is_active', true);

  if (
    (scheduleCount && scheduleCount > 0) ||
    (orderCount && orderCount > 0) ||
    (employeeCount && employeeCount > 0)
  ) {
    return NextResponse.json(
      { error: 'Nie można usunąć regionu — ma przypisanych pracowników, grafiki lub zlecenia' },
      { status: 409 }
    );
  }

  // TODO: Regions table does not have an is_active column yet.
  // Once added (via migration), change this hard delete to a soft delete:
  //   await supabase.from('regions').update({ is_active: false }).eq('id', id);
  // For now, the guards above prevent deletion of regions with active references.
  const { error } = await supabase.from('regions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
