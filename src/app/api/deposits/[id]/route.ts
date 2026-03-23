import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

/** PATCH /api/deposits/[id] — update status or details */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getAdminClient();
  const { id } = await params;
  try {
    const body = await request.json();
    const { status, storage_location, notes, picked_up_date, expected_pickup, storage_price } = body;

    const update: Record<string, any> = {};
    if (status !== undefined) update.status = status;
    if (storage_location !== undefined) update.storage_location = storage_location;
    if (notes !== undefined) update.notes = notes;
    if (expected_pickup !== undefined) update.expected_pickup = expected_pickup;
    if (storage_price !== undefined) update.storage_price = storage_price;
    if (status === 'picked_up') update.picked_up_date = picked_up_date || new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('tire_deposits')
      .update(update)
      .eq('id', id)
      .select('*, client:clients(name, phone)')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ deposit: data });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/deposits/[id] */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getAdminClient();
  const { id } = await params;
  const { error } = await supabase.from('tire_deposits').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
