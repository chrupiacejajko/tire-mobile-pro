import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// POST /api/notify - Send notification to client (SMS/Email)
// In production, integrate with SMS gateway (e.g., SMSAPI.pl, Twilio) and email service (e.g., Resend, SendGrid)
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { order_id, template_name, channel } = body; // channel: 'sms' | 'email'

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    // Get order with client info
    const { data: order } = await supabase
      .from('orders')
      .select('*, client:clients(name, phone, email)')
      .eq('id', order_id)
      .single();

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Get template
    const { data: template } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('name', template_name || 'Potwierdzenie wizyty')
      .eq('is_active', true)
      .single();

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Replace placeholders
    const client = order.client as { name: string; phone: string; email: string } | null;
    const services = (order.services || []).map((s: { name: string }) => s.name).join(', ');

    let messageBody = template.body
      .replace('{client_name}', client?.name || 'Kliencie')
      .replace('{date}', order.scheduled_date)
      .replace('{time}', (order.scheduled_time_start || '').slice(0, 5))
      .replace('{address}', order.address)
      .replace('{price}', order.total_price?.toString() || '0')
      .replace('{services}', services)
      .replace('{eta}', '30');

    let subject = (template.subject || '')
      .replace('{client_name}', client?.name || 'Kliencie')
      .replace('{date}', order.scheduled_date);

    const targetChannel = channel || template.type;

    if (targetChannel === 'sms') {
      // TODO: Integrate with SMS gateway (SMSAPI.pl, Twilio, etc.)
      // For now, log the message
      console.log(`[SMS] To: ${client?.phone} | Message: ${messageBody}`);

      // Save as notification
      const admins = await supabase.from('profiles').select('id').eq('role', 'admin');
      if (admins.data?.[0]) {
        await supabase.from('notifications').insert({
          user_id: admins.data[0].id,
          type: 'sms_sent',
          title: `SMS wysłany do ${client?.name}`,
          message: messageBody,
        });
      }

      return NextResponse.json({
        success: true,
        channel: 'sms',
        to: client?.phone,
        message: messageBody,
        note: 'SMS gateway not configured yet. Message logged.',
      });
    } else {
      // TODO: Integrate with email service (Resend, SendGrid, etc.)
      console.log(`[EMAIL] To: ${client?.email} | Subject: ${subject} | Body: ${messageBody}`);

      return NextResponse.json({
        success: true,
        channel: 'email',
        to: client?.email,
        subject,
        message: messageBody,
        note: 'Email service not configured yet. Message logged.',
      });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/notify/templates - List all notification templates
export async function GET() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('notification_templates')
    .select('*')
    .order('trigger_event, type');

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ templates: data });
}
