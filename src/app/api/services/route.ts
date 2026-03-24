import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function PUT(request: NextRequest) {
  const supabaseAdmin = getAdminClient();
  try {
    const body = await request.json();
    const { id, name, description, price, duration_minutes, category, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: 'Service id is required' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (price !== undefined) update.price = Number(price);
    if (duration_minutes !== undefined) update.duration_minutes = Number(duration_minutes);
    if (category !== undefined) update.category = category;
    if (is_active !== undefined) update.is_active = is_active;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('services').update(update).eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
