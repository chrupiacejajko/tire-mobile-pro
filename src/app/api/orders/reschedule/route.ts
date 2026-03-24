import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { notifyWorker } from '@/lib/notifications';
import {
  buildNotificationContext,
  fireNotification,
} from '@/lib/notification-dispatcher';
import { checkAuth } from '@/lib/api/auth-guard';

const TIME_WINDOW_RANGES: Record<string, { start: string; end: string }> = {
  morning: { start: '08:00', end: '12:00' },
  afternoon: { start: '12:00', end: '16:00' },
  evening: { start: '16:00', end: '20:00' },
};

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { order_id, new_date, new_time_window, new_time } = body;

    if (!order_id) {
      return NextResponse.json(
        { error: 'order_id is required' },
        { status: 400 },
      );
    }

    if (!new_date) {
      return NextResponse.json(
        { error: 'new_date is required' },
        { status: 400 },
      );
    }

    // Validate date is in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const requestedDate = new Date(new_date + 'T00:00:00');
    if (requestedDate <= today) {
      return NextResponse.json(
        { error: 'Nowa data musi być w przyszłości.' },
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
            'Zmiana terminu nie jest możliwa dla zakończonych lub anulowanych zleceń.',
        },
        { status: 400 },
      );
    }

    const wasAssigned = !!order.employee_id;
    const previousEmployeeId = order.employee_id;

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      scheduled_date: new_date,
      time_window: new_time_window || null,
      scheduled_time_start: new_time || null,
    };

    // Set time window boundaries
    if (new_time_window && TIME_WINDOW_RANGES[new_time_window]) {
      const range = TIME_WINDOW_RANGES[new_time_window];
      updatePayload.time_window_start = range.start;
      updatePayload.time_window_end = range.end;
    } else {
      updatePayload.time_window_start = null;
      updatePayload.time_window_end = null;
    }

    // If was assigned, reset to new and clear employee
    if (wasAssigned) {
      updatePayload.status = 'new';
      updatePayload.employee_id = null;
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
        type: 'schedule_change',
        title: 'Zmiana terminu wizyty',
        body: `Klient przełożył wizytę na ${new_date}`,
      }).catch(() => {});
    }

    // Fire client notification (fire-and-forget)
    buildNotificationContext(order_id)
      .then((ctx) => fireNotification('reschedule', ctx))
      .catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Termin został zmieniony.',
    });
  } catch (err) {
    console.error('[orders/reschedule]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
