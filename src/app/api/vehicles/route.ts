import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function PUT(request: NextRequest) {
  const supabaseAdmin = getAdminClient();
  try {
    const body = await request.json();
    const { id, plate_number, brand, model, year, is_active, satis_device_id, notes } = body;

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

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('vehicles').update(update).eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
