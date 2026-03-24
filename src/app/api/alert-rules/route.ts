/**
 * Alert Rules API (Reguly alertow)
 *
 * GET    /api/alert-rules         — list all rules
 * POST   /api/alert-rules         — create rule
 * PUT    /api/alert-rules         — update rule
 * DELETE /api/alert-rules?id=X    — delete rule
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('alert_rules')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules: data });
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { name, event, condition, is_active } = body;

    if (!name || !event) {
      return NextResponse.json(
        { error: 'name and event are required' },
        { status: 400 },
      );
    }

    const validEvents = [
      'sla_breach',
      'unassigned_today',
      'no_progress',
      'worker_outside_zone',
      'order_not_completed',
    ];
    if (!validEvents.includes(event)) {
      return NextResponse.json(
        { error: `event must be one of: ${validEvents.join(', ')}` },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('alert_rules')
      .insert({
        name,
        event,
        condition: condition || {},
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule: data }, { status: 201 });
  } catch (err) {
    console.error('[alert-rules POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { id, name, event, condition, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (event !== undefined) updates.event = event;
    if (condition !== undefined) updates.condition = condition;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await supabase
      .from('alert_rules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule: data });
  } catch (err) {
    console.error('[alert-rules PUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id parameter required' }, { status: 400 });
  }

  const { error } = await supabase.from('alert_rules').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
