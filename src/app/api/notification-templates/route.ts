import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET /api/notification-templates — list all notification templates
export async function GET() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('notification_templates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ templates: data });
}

// POST /api/notification-templates — create a new template
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { name, trigger, channel, subject, body: templateBody, is_active, send_after_time, send_before_time } = body;

    if (!name || !trigger || !channel) {
      return NextResponse.json({ error: 'name, trigger, and channel are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('notification_templates')
      .insert({
        name,
        trigger,
        channel,
        subject: subject || null,
        body: templateBody || '',
        is_active: is_active !== false,
        send_after_time: send_after_time || null,
        send_before_time: send_before_time || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ template: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/notification-templates — update a template
export async function PUT(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Rename 'body' field to avoid conflict with request body
    if ('body' in updates) {
      updates.body = updates.body;
    }

    const { data, error } = await supabase
      .from('notification_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ template: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/notification-templates — soft-delete (set is_active = false)
export async function DELETE(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'id query param is required' }, { status: 400 });

    const { error } = await supabase
      .from('notification_templates')
      .update({ is_active: false })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
