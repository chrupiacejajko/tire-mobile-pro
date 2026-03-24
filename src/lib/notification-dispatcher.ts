import { getAdminClient } from '@/lib/supabase/admin';

interface NotificationContext {
  order_id: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  date?: string;
  time_window?: string;
  employee_name?: string;
  services?: string;
  total_price?: number;
  tracking_url?: string;
  address?: string;
}

/**
 * Fire all active notification templates matching the trigger.
 * Replaces placeholders in subject/body with actual values.
 */
export async function fireNotification(trigger: string, context: NotificationContext) {
  const supabase = getAdminClient();

  const { data: templates } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('trigger', trigger)
    .eq('is_active', true);

  if (!templates?.length) return;

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  for (const tmpl of templates) {
    // Check time constraints
    if (tmpl.send_after_time && currentTime < tmpl.send_after_time) continue;
    if (tmpl.send_before_time && currentTime > tmpl.send_before_time) continue;

    // Replace placeholders
    let subject = tmpl.subject || '';
    let body = tmpl.body || '';

    const replacements: Record<string, string> = {
      '{{client_name}}': context.client_name || '',
      '{{date}}': context.date || '',
      '{{time_window}}': context.time_window || '',
      '{{employee_name}}': context.employee_name || '',
      '{{services}}': context.services || '',
      '{{total_price}}': context.total_price?.toString() || '',
      '{{tracking_url}}': context.tracking_url || `https://app.routetire.pl/tracking/${context.order_id}`,
      '{{address}}': context.address || '',
      '{{order_id}}': context.order_id?.slice(0, 8) || '',
    };

    for (const [key, value] of Object.entries(replacements)) {
      subject = subject.replaceAll(key, value);
      body = body.replaceAll(key, value);
    }

    // Send based on channel
    if ((tmpl.channel === 'email' || tmpl.channel === 'both') && context.client_email) {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'RouteTire <noreply@routetire.pl>',
            to: context.client_email,
            subject,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:#f97316;color:white;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center;">
                <h2 style="margin:0;">RouteTire</h2>
              </div>
              <div style="background:white;border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 12px 12px;">
                ${body.replace(/\n/g, '<br>')}
              </div>
            </div>`,
          }),
        }).catch(() => {});
      }
      console.log(`[Notification] ${trigger} → email to ${context.client_email}: ${subject}`);
    }

    if ((tmpl.channel === 'sms' || tmpl.channel === 'both') && context.client_phone) {
      // SMS placeholder — log for now, integrate Twilio/SMS API later
      console.log(`[Notification] ${trigger} → SMS to ${context.client_phone}: ${body.slice(0, 160)}`);
    }
  }
}

/**
 * Build notification context from an order ID.
 */
export async function buildNotificationContext(orderId: string): Promise<NotificationContext> {
  const supabase = getAdminClient();
  const { data: order } = await supabase
    .from('orders')
    .select(`
      id, scheduled_date, time_window, total_price, address,
      services, status,
      client:clients(name, email, phone, address, city),
      employee:employees(user:profiles(full_name))
    `)
    .eq('id', orderId)
    .single();

  if (!order) return { order_id: orderId };

  const client = order.client as any;
  const employee = order.employee as any;
  const services = (order.services as any[])?.map((s: any) => s.name).join(', ') || '';

  const windowLabels: Record<string, string> = {
    morning: 'rano (8:00-12:00)',
    afternoon: 'po południu (12:00-16:00)',
    evening: 'wieczorem (16:00-20:00)',
  };

  return {
    order_id: order.id,
    client_name: client?.name || '',
    client_email: client?.email || '',
    client_phone: client?.phone || '',
    date: order.scheduled_date || '',
    time_window: windowLabels[order.time_window as string] || order.time_window || '',
    employee_name: employee?.user?.full_name || '',
    services,
    total_price: order.total_price,
    tracking_url: `https://booking.routetire.pl/tracking/${order.id}`,
    address: order.address || client?.address || '',
  };
}
