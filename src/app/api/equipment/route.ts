import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);

  const warehouseId = searchParams.get('warehouse_id');
  const employeeId = searchParams.get('employee_id');
  const typeId = searchParams.get('type_id');
  const status = searchParams.get('status');

  let query = supabase
    .from('equipment')
    .select(`
      *,
      type:equipment_types(id, name),
      warehouse:warehouses(id, name),
      employee:employees(id, user:profiles(full_name))
    `)
    .order('created_at', { ascending: false });

  if (warehouseId) query = query.eq('warehouse_id', warehouseId);
  if (employeeId) query = query.eq('employee_id', employeeId);
  if (typeId) query = query.eq('type_id', typeId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const { serial_number, type_id, warehouse_id, employee_id, status, notes } = body;

  const { data, error } = await supabase
    .from('equipment')
    .insert({
      serial_number,
      type_id,
      warehouse_id: warehouse_id || null,
      employee_id: employee_id || null,
      status: status || 'available',
      notes: notes || null,
    })
    .select(`
      *,
      type:equipment_types(id, name),
      warehouse:warehouses(id, name),
      employee:employees(id, user:profiles(full_name))
    `)
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
    .from('equipment')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      type:equipment_types(id, name),
      warehouse:warehouses(id, name),
      employee:employees(id, user:profiles(full_name))
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
