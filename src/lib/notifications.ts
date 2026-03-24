/**
 * Worker notification system.
 *
 * Inserts in-app notifications into worker_notifications table.
 * Future: SMS via Twilio, email via Resend.
 */

import { getAdminClient } from '@/lib/supabase/admin';

export type NotificationType =
  | 'order_assigned'
  | 'order_updated'
  | 'order_cancelled'
  | 'schedule_change'
  | 'general';

export type NotificationChannel = 'in_app' | 'sms' | 'email';

export interface NotifyWorkerParams {
  employee_id: string;
  order_id?: string;
  type: NotificationType;
  title: string;
  body: string;
  channel?: NotificationChannel;
}

/**
 * Send a notification to a worker.
 * Currently supports in-app only (inserts row into worker_notifications).
 * Future: SMS via Twilio, email via Resend based on channel param.
 */
export async function notifyWorker(params: NotifyWorkerParams): Promise<void> {
  const supabase = getAdminClient();
  const channel = params.channel ?? 'in_app';

  const { error } = await supabase.from('worker_notifications').insert({
    employee_id: params.employee_id,
    order_id: params.order_id ?? null,
    type: params.type,
    title: params.title,
    body: params.body,
    channel,
    sent_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[notifyWorker] Failed to insert notification:', error.message);
  }

  // Future: if (channel === 'sms') { await sendSMS(...) }
  // Future: if (channel === 'email') { await sendEmail(...) }
}
