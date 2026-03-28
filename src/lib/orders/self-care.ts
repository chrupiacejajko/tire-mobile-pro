import { getAdminClient } from '@/lib/supabase/admin';
import { notifyWorker } from '@/lib/notifications';
import {
  buildNotificationContext,
  fireNotification,
} from '@/lib/notification-dispatcher';

const TIME_WINDOW_RANGES: Record<string, { start: string; end: string }> = {
  morning: { start: '08:00', end: '12:00' },
  afternoon: { start: '12:00', end: '16:00' },
  evening: { start: '16:00', end: '20:00' },
};

type Result = { success: true; message: string } | { success: false; status: number; error: string };

function addMinutesToTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  const normalized = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}:00`;
}

function durationMinutesFromOrder(order: {
  scheduled_time_start: string | null;
  scheduled_time_end: string | null;
  service_duration_minutes: number | null;
}): number {
  if (typeof order.service_duration_minutes === 'number' && order.service_duration_minutes > 0) {
    return order.service_duration_minutes;
  }

  if (order.scheduled_time_start && order.scheduled_time_end) {
    const [sh, sm] = order.scheduled_time_start.split(':').map(Number);
    const [eh, em] = order.scheduled_time_end.split(':').map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (end > start) return end - start;
  }

  return 60;
}

export async function cancelOrderByClient(input: {
  orderId: string;
  reason?: string | null;
}): Promise<Result> {
  const supabase = getAdminClient();

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status, employee_id')
    .eq('id', input.orderId)
    .single();

  if (fetchErr || !order) {
    return { success: false, status: 404, error: 'Order not found' };
  }

  if (order.status === 'completed' || order.status === 'cancelled') {
    return {
      success: false,
      status: 400,
      error: 'Nie można anulować zlecenia, które jest już zakończone lub anulowane.',
    };
  }

  const updatePayload: Record<string, unknown> = { status: 'cancelled' };
  if (input.reason) updatePayload.notes = input.reason;

  const { error: updateErr } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', input.orderId);

  if (updateErr) {
    return { success: false, status: 500, error: updateErr.message };
  }

  if (order.employee_id) {
    notifyWorker({
      employee_id: order.employee_id,
      order_id: input.orderId,
      type: 'order_cancelled',
      title: 'Anulacja wizyty',
      body: `Klient anulował wizytę${input.reason ? `. Powód: ${input.reason}` : ''}`,
    }).catch(() => {});
  }

  buildNotificationContext(input.orderId)
    .then(ctx => fireNotification('order_cancelled', ctx))
    .catch(() => {});

  return { success: true, message: 'Wizyta została anulowana.' };
}

export async function rescheduleOrderByClient(input: {
  orderId: string;
  newDate: string;
  newTimeWindow?: string | null;
  newTime?: string | null;
}): Promise<Result> {
  const supabase = getAdminClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requestedDate = new Date(`${input.newDate}T00:00:00`);
  if (requestedDate <= today) {
    return { success: false, status: 400, error: 'Nowa data musi być w przyszłości.' };
  }

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status, employee_id, scheduled_time_start, scheduled_time_end, service_duration_minutes')
    .eq('id', input.orderId)
    .single();

  if (fetchErr || !order) {
    return { success: false, status: 404, error: 'Order not found' };
  }

  if (order.status === 'completed' || order.status === 'cancelled') {
    return {
      success: false,
      status: 400,
      error: 'Zmiana terminu nie jest możliwa dla zakończonych lub anulowanych zleceń.',
    };
  }

  const durationMinutes = durationMinutesFromOrder(order);
  const range = input.newTimeWindow ? TIME_WINDOW_RANGES[input.newTimeWindow] : null;
  const nextStart = input.newTime || range?.start || order.scheduled_time_start || '08:00:00';
  const normalizedStart = nextStart.length === 5 ? `${nextStart}:00` : nextStart;
  const normalizedEnd = addMinutesToTime(normalizedStart, durationMinutes);

  const updatePayload: Record<string, unknown> = {
    scheduled_date: input.newDate,
    time_window: input.newTimeWindow || null,
    scheduled_time_start: normalizedStart,
    scheduled_time_end: normalizedEnd,
    time_window_start: range?.start ? `${range.start}:00` : null,
    time_window_end: range?.end ? `${range.end}:00` : null,
    status: 'new',
    employee_id: null,
  };

  const { error: updateErr } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', input.orderId);

  if (updateErr) {
    return { success: false, status: 500, error: updateErr.message };
  }

  if (order.employee_id) {
    notifyWorker({
      employee_id: order.employee_id,
      order_id: input.orderId,
      type: 'schedule_change',
      title: 'Zmiana terminu wizyty',
      body: `Klient przełożył wizytę na ${input.newDate}`,
    }).catch(() => {});
  }

  buildNotificationContext(input.orderId)
    .then(ctx => fireNotification('reschedule', ctx))
    .catch(() => {});

  return { success: true, message: 'Termin został zmieniony.' };
}
