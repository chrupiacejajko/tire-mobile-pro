import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { phone, message, order_id, delay_minutes = 5 } = body;

    if (!phone || !message) {
      return NextResponse.json(
        { error: 'phone and message are required' },
        { status: 400 },
      );
    }

    const sendAt = new Date(Date.now() + delay_minutes * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('pending_sms')
      .insert({
        phone,
        message,
        order_id: order_id || null,
        send_at: sendAt,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[sms/queue] insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id, send_at: sendAt });
  } catch (err) {
    console.error('[sms/queue]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
