import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/api/auth-guard';
import { rescheduleOrderByClient } from '@/lib/orders/self-care';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;

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

    const result = await rescheduleOrderByClient({
      orderId: order_id,
      newDate: new_date,
      newTimeWindow: new_time_window,
      newTime: new_time,
    });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    console.error('[orders/reschedule]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
