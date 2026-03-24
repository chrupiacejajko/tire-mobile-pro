import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { fireNotification, buildNotificationContext } from '@/lib/notification-dispatcher';

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { order_id, action, new_date, new_time_window } = body;

    if (!order_id || !action) {
      return NextResponse.json(
        { error: 'order_id and action are required' },
        { status: 400 },
      );
    }

    // Fetch the current order
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status')
      .eq('id', order_id)
      .single();

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (action === 'reschedule') {
      if (!new_date) {
        return NextResponse.json(
          { error: 'new_date is required for reschedule' },
          { status: 400 },
        );
      }

      if (order.status !== 'new' && order.status !== 'assigned') {
        return NextResponse.json(
          {
            error:
              'Zmiana terminu jest mozliwa tylko dla zlecen o statusie "nowe" lub "przypisane".',
          },
          { status: 400 },
        );
      }

      const { error: updateErr } = await supabase
        .from('orders')
        .update({
          scheduled_date: new_date,
          time_window: new_time_window || null,
          employee_id: null,
          status: 'new',
        })
        .eq('id', order_id);

      if (updateErr) {
        return NextResponse.json(
          { error: updateErr.message },
          { status: 500 },
        );
      }

      // Fire reschedule notification (fire-and-forget)
      buildNotificationContext(order_id).then(ctx => fireNotification('reschedule', ctx)).catch(() => {});

      return NextResponse.json({ success: true, message: 'Termin został zmieniony.' });
    }

    if (action === 'cancel') {
      if (order.status === 'completed' || order.status === 'cancelled') {
        return NextResponse.json(
          {
            error:
              'Nie mozna anulowac zlecenia, ktore jest juz zakonczone lub anulowane.',
          },
          { status: 400 },
        );
      }

      const { error: updateErr } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', order_id);

      if (updateErr) {
        return NextResponse.json(
          { error: updateErr.message },
          { status: 500 },
        );
      }

      // Fire cancellation notification (fire-and-forget)
      buildNotificationContext(order_id).then(ctx => fireNotification('order_cancelled', ctx)).catch(() => {});

      return NextResponse.json({ success: true, message: 'Wizyta została anulowana.' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[tracking/actions]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
