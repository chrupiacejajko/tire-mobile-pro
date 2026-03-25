import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/sms';

export async function POST() {
  const supabase = getAdminClient();

  try {
    // Fetch all unsent SMS where send_at has passed
    const { data: pending, error: fetchErr } = await supabase
      .from('pending_sms')
      .select('id, phone, message')
      .eq('sent', false)
      .lte('send_at', new Date().toISOString())
      .order('send_at', { ascending: true })
      .limit(50);

    if (fetchErr) {
      console.error('[sms/process-pending] fetch error:', fetchErr);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!pending || pending.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    let successCount = 0;
    let failCount = 0;

    for (const sms of pending) {
      const result = await sendSms(sms.phone, sms.message);

      if (result.success) {
        await supabase
          .from('pending_sms')
          .update({ sent: true, sent_at: new Date().toISOString() })
          .eq('id', sms.id);
        successCount++;
      } else {
        await supabase
          .from('pending_sms')
          .update({ error: result.error || 'Unknown error' })
          .eq('id', sms.id);
        failCount++;
      }
    }

    return NextResponse.json({
      processed: pending.length,
      success: successCount,
      failed: failCount,
    });
  } catch (err) {
    console.error('[sms/process-pending]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
