import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendBookingConfirmation, sendStatusUpdate } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { order_id, type } = body as {
      order_id: string;
      type: 'booking_confirmation' | 'status_update' | 'day_before_reminder';
    };

    if (!order_id || !type) {
      return NextResponse.json(
        { error: 'Missing order_id or type' },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    // Fetch order with client data
    const { data: order, error } = await supabase
      .from('orders')
      .select(
        `
        id, status, scheduled_date, scheduled_time_start, time_window,
        services, total_price, address,
        client:clients(name, phone, email)
      `
      )
      .eq('id', order_id)
      .single();

    if (error || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    const client = order.client as unknown as { name: string; phone: string; email: string | null } | null;
    const clientEmail = client?.email;

    if (!clientEmail) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'Client has no email address',
      });
    }

    const orderForEmail = {
      id: order.id,
      status: order.status,
      scheduled_date: order.scheduled_date,
      scheduled_time_start: order.scheduled_time_start,
      time_window: order.time_window,
      services: (order.services as { name: string; price: number; quantity: number }[]) || [],
      total_price: order.total_price,
      address: order.address,
    };

    switch (type) {
      case 'booking_confirmation':
        await sendBookingConfirmation(order_id, clientEmail, orderForEmail);
        break;
      case 'status_update':
        await sendStatusUpdate(order_id, clientEmail, orderForEmail, order.status);
        break;
      case 'day_before_reminder':
        // TODO: implement day-before reminder template
        await sendBookingConfirmation(order_id, clientEmail, orderForEmail);
        break;
    }

    return NextResponse.json({ success: true, type, order_id });
  } catch (err) {
    console.error('[EMAIL API] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
