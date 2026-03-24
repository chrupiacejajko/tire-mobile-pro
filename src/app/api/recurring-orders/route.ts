/**
 * /api/recurring-orders
 *
 * GET  — List all recurring orders with client info
 * POST — Create a new recurring order
 * PUT  — Update an existing recurring order (body includes id)
 * DELETE — Soft-delete (set is_active = false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('recurring_orders')
    .select('*, client:clients(name, phone, address, city)')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recurring_orders: data });
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const {
      client_id,
      service_ids,
      frequency,
      preferred_day,
      preferred_time_window,
      preferred_employee_id,
      address,
      city,
      notes,
      next_date,
    } = body;

    if (!client_id || !frequency) {
      return NextResponse.json(
        { error: 'client_id and frequency are required' },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('recurring_orders')
      .insert({
        client_id,
        service_ids: service_ids || [],
        frequency,
        preferred_day: preferred_day ?? null,
        preferred_time_window: preferred_time_window ?? null,
        preferred_employee_id: preferred_employee_id ?? null,
        address: address ?? null,
        city: city ?? null,
        notes: notes ?? null,
        next_date: next_date ?? null,
        is_active: true,
      })
      .select('*, client:clients(name)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, recurring_order: data }, { status: 201 });
  } catch (err) {
    console.error('[recurring-orders] POST', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('recurring_orders')
      .update(updates)
      .eq('id', id)
      .select('*, client:clients(name)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, recurring_order: data });
  } catch (err) {
    console.error('[recurring-orders] PUT', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Soft-delete: set is_active = false
    const { error } = await supabase
      .from('recurring_orders')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, deleted: id });
  } catch (err) {
    console.error('[recurring-orders] DELETE', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
