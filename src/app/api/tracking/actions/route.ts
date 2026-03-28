import { NextRequest, NextResponse } from 'next/server';
import { verifyTrackingActionToken } from '@/lib/security/tracking-token';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import {
  cancelOrderByClient,
  rescheduleOrderByClient,
} from '@/lib/orders/self-care';

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rate = checkRateLimit(`tracking-actions:${ip}`, 10, 15 * 60 * 1000);
    if (!rate.ok) {
      return NextResponse.json(
        { error: 'Too many requests', code: 'RATE_LIMIT' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
      );
    }

    const body = await request.json();
    const { order_id, action, new_date, new_time_window, tracking_token, reason } = body;

    if (!order_id || !action) {
      return NextResponse.json(
        { error: 'order_id and action are required' },
        { status: 400 },
      );
    }

    if (!tracking_token || !(await verifyTrackingActionToken(tracking_token, order_id))) {
      return NextResponse.json(
        { error: 'Invalid tracking token', code: 'INVALID_TRACKING_TOKEN' },
        { status: 401 },
      );
    }

    if (action === 'reschedule') {
      if (!new_date) {
        return NextResponse.json(
          { error: 'new_date is required for reschedule' },
          { status: 400 },
        );
      }

      const result = await rescheduleOrderByClient({
        orderId: order_id,
        newDate: new_date,
        newTimeWindow: new_time_window,
      });
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json({ success: true, message: result.message });
    }

    if (action === 'cancel') {
      const result = await cancelOrderByClient({
        orderId: order_id,
        reason: reason || null,
      });
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json({ success: true, message: result.message });
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
