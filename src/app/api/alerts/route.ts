import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET /api/alerts — list alerts
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unread_only') === 'true';

  let query = supabase
    .from('alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alerts: data });
}

// POST /api/alerts — create alert
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { rule_id, order_id, employee_id, message, severity } = body;

    if (!message || !severity) {
      return NextResponse.json(
        { error: 'message and severity are required' },
        { status: 400 },
      );
    }

    if (!['info', 'warning', 'critical'].includes(severity)) {
      return NextResponse.json(
        { error: 'severity must be info, warning, or critical' },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('alerts')
      .insert({
        rule_id: rule_id || null,
        order_id: order_id || null,
        employee_id: employee_id || null,
        message,
        severity,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alert: data }, { status: 201 });
  } catch (err) {
    console.error('[alerts POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/alerts — mark alert(s) as read
export async function PUT(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();

    // Mark all as read
    if (body.mark_all_read) {
      const { error } = await supabase
        .from('alerts')
        .update({ is_read: true })
        .eq('is_read', false);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Mark single alert as read
    if (body.id && body.is_read !== undefined) {
      const { error } = await supabase
        .from('alerts')
        .update({ is_read: body.is_read })
        .eq('id', body.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  } catch (err) {
    console.error('[alerts PUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
