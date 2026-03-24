import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServerSupabaseClient();

  const { data: warehouses, error } = await supabase
    .from('warehouses')
    .select('*')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get equipment counts per warehouse
  const { data: equipmentCounts } = await supabase
    .from('equipment')
    .select('warehouse_id');

  // Get material stock counts per warehouse
  const { data: stockCounts } = await supabase
    .from('material_stock')
    .select('warehouse_id, quantity');

  const enriched = (warehouses || []).map((w: any) => ({
    ...w,
    equipment_count: (equipmentCounts || []).filter((e: any) => e.warehouse_id === w.id).length,
    material_stock_count: (stockCounts || [])
      .filter((s: any) => s.warehouse_id === w.id)
      .reduce((sum: number, s: any) => sum + (s.quantity || 0), 0),
  }));

  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const { name, address } = body;

  const { data, error } = await supabase
    .from('warehouses')
    .insert({ name, address: address || null })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('warehouses')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
