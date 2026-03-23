import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// POST /api/webhooks - Receive webhook events from external systems (Smifybot, Satis GPS)
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { type, data } = body;

    switch (type) {
      case 'smifybot.call_completed': {
        // Smifybot finished a phone call - create notification
        await supabase.from('notifications').insert({
          user_id: (await supabase.from('profiles').select('id').eq('role', 'admin').single()).data?.id || '',
          type: 'smifybot_call',
          title: 'Nowe połączenie Smifybot',
          message: `Rozmowa z ${data.caller_phone || 'nieznany'}. ${data.summary || ''}`,
        });
        return NextResponse.json({ success: true });
      }

      case 'satis_gps.location_update': {
        // Satis GPS location update
        const { employee_id, lat, lng, status } = data;
        if (employee_id && lat && lng) {
          await supabase.from('employee_locations').insert({
            employee_id,
            lat,
            lng,
            status: status || 'online',
          });
        }
        return NextResponse.json({ success: true });
      }

      case 'order.status_changed': {
        // Generic order status change webhook
        const { order_id, new_status } = data;
        if (order_id && new_status) {
          await supabase.from('orders').update({ status: new_status }).eq('id', order_id);
        }
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown event type: ${type}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
