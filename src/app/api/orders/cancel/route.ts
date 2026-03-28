import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/api/auth-guard';
import { cancelOrderByClient } from '@/lib/orders/self-care';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { order_id, reason } = body;

    if (!order_id) {
      return NextResponse.json(
        { error: 'order_id is required' },
        { status: 400 },
      );
    }

    const result = await cancelOrderByClient({ orderId: order_id, reason });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    console.error('[orders/cancel]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
