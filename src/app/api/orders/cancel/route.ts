import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { notifyWorker } from '@/lib/notifications';
import {
  buildNotificationContext,
  fireNotification,
} from '@/lib/notification-dispatcher';

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { order_id, reason } = body;

    if (!order_id) {
      return NextResponse.json(
        { error: 'order_id is required' },
        { status: 400 },
      );
    }

    // Fetch order
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, employee_id')
      .eq('id', order_id)
      .single();

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.status === 'completed' || order.status === 'cancelled') {
      return NextResponse.json(
        {
          error:
            'Nie można anulować zlecenia, które jest już zakończone lub anulowane.',
        },
        { status: 400 },
      );
    }

    const wasAssigned = !!order.employee_id;
    const previousEmployeeId = order.employee_id;

    const updatePayload: Record<string, unknown> = {
      status: 'cancelled',
    };

    if (reason) {
      updatePayload.notes = reason;
    }

    const { error: updateErr } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', order_id);

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 },
      );
    }

    // Notify worker if was assigned
    if (wasAssigned && previousEmployeeId) {
      notifyWorker({
        employee_id: previousEmployeeId,
        order_id,
        type: 'order_cancelled',
        title: 'Anulacja wizyty',
        body: `Klient anulował wizytę${reason ? `. Powód: ${reason}` : ''}`,
      }).catch(() => {});
    }

    // Fire client notification (fire-and-forget)
    buildNotificationContext(order_id)
      .then((ctx) => fireNotification('order_cancelled', ctx))
      .catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Wizyta została anulowana.',
    });
  } catch (err) {
    console.error('[orders/cancel]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
