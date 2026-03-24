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
    .order('name');
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
  const { name, color } = body;
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const { data, error } = await supabase
    .from('regions')
    .insert({ name, color: color || '#3B82F6' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, color } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (color !== undefined) updates.color = color;
  if (body.polygon !== undefined) updates.polygon = body.polygon;

  const { data, error } = await supabase
    .from('regions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase.from('regions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
