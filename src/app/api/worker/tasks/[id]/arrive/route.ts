/**
 * POST /api/worker/tasks/{id}/arrive
 * Body: { lat?: number, lng?: number }
 *
 * Transitions order from 'in_transit' to 'in_progress'.
 * Signals that the worker has arrived at the client location and started work.
 *
 * Auth: worker JWT — verifies the order belongs to the calling worker.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth } from '@/lib/api/auth-guard';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;

  const auth = await checkAuth(request, ['admin', 'worker']);
  if (!auth.ok) return auth.response;

  const supabase = getAdminClient();

  try {
    const body = await request.json().catch(() => ({}));

    // Fetch order
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, employee_id')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Ownership check
    if (auth.role === 'worker' && order.employee_id !== auth.employeeId) {
      return NextResponse.json(
        { error: 'Forbidden', code: 'NOT_YOUR_ORDER' },
        { status: 403 },
      );
    }

    // Status check
    if (order.status !== 'in_transit') {
      return NextResponse.json(
        {
          error: 'Cannot arrive — order is not in in_transit status',
          code: 'INVALID_STATUS',
          current_status: order.status,
        },
        { status: 409 },
      );
    }

    // Update order status
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      status: 'in_progress',
      arrived_at: now,
      actual_start_time: now,
    };

    if (body.lat != null && body.lng != null) {
      updateData.arrival_lat = body.lat;
      updateData.arrival_lng = body.lng;
    }

    const { error: updateErr } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      order_id: orderId,
      status: 'in_progress',
    });
  } catch (err: unknown) {
    console.error('[arrive]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
