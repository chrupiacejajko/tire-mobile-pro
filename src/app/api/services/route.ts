import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabaseAdmin = getAdminClient();
  const { data, error } = await supabaseAdmin
    .from('services')
    .select('id, name, description, price, duration_minutes, category, is_active, required_skill_ids, vehicle_type_id')
    .eq('is_active', true)
    .order('category')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ services: data });
}

export async function DELETE(request: NextRequest) {
  const supabaseAdmin = getAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Fetch active orders that might reference this service
  const { data: activeOrders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('id, services')
    .in('status', ['new', 'assigned', 'in_progress']);

  if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 500 });

  // JS-side check: does any order's services JSONB array contain this service_id?
  const referenced = (activeOrders || []).some((order) => {
    const services = order.services;
    if (!Array.isArray(services)) return false;
    return services.some((s: { service_id?: string }) => s.service_id === id);
  });

  if (referenced) {
    return NextResponse.json(
      { error: 'Nie można dezaktywować usługi — jest zaplanowana w nadchodzących zleceniach' },
      { status: 409 }
    );
  }

  // Soft delete
  const { error } = await supabaseAdmin
    .from('services')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

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
