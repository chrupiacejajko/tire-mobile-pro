import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);

  const warehouseId = searchParams.get('warehouse_id');
  const employeeId = searchParams.get('employee_id');

  let query = supabase
    .from('material_stock')
    .select(`
      *,
      material_type:material_types(id, name, unit),
      warehouse:warehouses(id, name),
      employee:employees(id, user:profiles(full_name))
    `)
    .gt('quantity', 0)
    .order('material_type_id');

  if (warehouseId) query = query.eq('warehouse_id', warehouseId);
  if (employeeId) query = query.eq('employee_id', employeeId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const { action } = body;

  if (action === 'receive') {
    return handleReceive(supabase, body);
  } else if (action === 'consume') {
    return handleConsume(supabase, body);
  } else if (action === 'transfer') {
    return handleTransfer(supabase, body);
  }

  return NextResponse.json({ error: 'Invalid action. Use: receive, consume, transfer' }, { status: 400 });
}

async function handleReceive(supabase: any, body: any) {
  const { material_type_id, warehouse_id, employee_id, quantity } = body;

  if (!material_type_id || !quantity || quantity <= 0) {
    return NextResponse.json({ error: 'material_type_id and positive quantity required' }, { status: 400 });
  }

  // Upsert stock
  await upsertStock(supabase, material_type_id, warehouse_id || null, employee_id || null, quantity);

  // Log movement
  await supabase.from('material_movements').insert({
    material_type_id,
    to_warehouse_id: warehouse_id || null,
    to_employee_id: employee_id || null,
    quantity,
    movement_type: 'receive',
    notes: body.notes || null,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}

async function handleConsume(supabase: any, body: any) {
  const { material_type_id, warehouse_id, employee_id, quantity, order_id } = body;

  if (!material_type_id || !quantity || quantity <= 0) {
    return NextResponse.json({ error: 'material_type_id and positive quantity required' }, { status: 400 });
  }

  // Decrease stock
  await upsertStock(supabase, material_type_id, warehouse_id || null, employee_id || null, -quantity);

  // Log movement
  await supabase.from('material_movements').insert({
    material_type_id,
    from_warehouse_id: warehouse_id || null,
    from_employee_id: employee_id || null,
    quantity,
    movement_type: 'consume',
    order_id: order_id || null,
    notes: body.notes || null,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}

async function handleTransfer(supabase: any, body: any) {
  const {
    material_type_id, quantity,
    from_warehouse_id, from_employee_id,
    to_warehouse_id, to_employee_id,
  } = body;

  if (!material_type_id || !quantity || quantity <= 0) {
    return NextResponse.json({ error: 'material_type_id and positive quantity required' }, { status: 400 });
  }

  // Decrease source
  await upsertStock(supabase, material_type_id, from_warehouse_id || null, from_employee_id || null, -quantity);

  // Increase destination
  await upsertStock(supabase, material_type_id, to_warehouse_id || null, to_employee_id || null, quantity);

  // Log movement
  await supabase.from('material_movements').insert({
    material_type_id,
    from_warehouse_id: from_warehouse_id || null,
    from_employee_id: from_employee_id || null,
    to_warehouse_id: to_warehouse_id || null,
    to_employee_id: to_employee_id || null,
    quantity,
    movement_type: 'transfer',
    notes: body.notes || null,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}

async function upsertStock(
  supabase: any,
  materialTypeId: string,
  warehouseId: string | null,
  employeeId: string | null,
  delta: number
) {
  // Try to find existing stock record
  let query = supabase
    .from('material_stock')
    .select('id, quantity')
    .eq('material_type_id', materialTypeId);

  if (warehouseId) {
    query = query.eq('warehouse_id', warehouseId);
  } else {
    query = query.is('warehouse_id', null);
  }

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  } else {
    query = query.is('employee_id', null);
  }

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    const newQty = Math.max(0, existing.quantity + delta);
    await supabase
      .from('material_stock')
      .update({ quantity: newQty })
      .eq('id', existing.id);
  } else if (delta > 0) {
    await supabase.from('material_stock').insert({
      material_type_id: materialTypeId,
      warehouse_id: warehouseId,
      employee_id: employeeId,
      quantity: delta,
    });
  }
}
