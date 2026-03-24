import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET /api/webhooks/config — list configured webhooks
export async function GET() {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('webhooks')
    .select('id, name, url, events, is_active, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ webhooks: data });
}

// POST /api/webhooks/config — create a new webhook
// Body: { name, url, events, secret }
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { name, url, events, secret } = body;

    if (!name || !url) {
      return NextResponse.json({ error: 'name and url are required' }, { status: 400 });
    }

    if (events && !Array.isArray(events)) {
      return NextResponse.json({ error: 'events must be an array' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('webhooks')
      .insert({
        name,
        url,
        events: events || [],
        secret: secret || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ webhook: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/webhooks/config?id=X — deactivate a webhook (soft delete)
export async function DELETE(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('webhooks')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ webhook: data });
}
