/**
 * POST /api/worker/tasks/complete
 * Body: { order_id, notes?, photos?: string[] (base64 or URLs), closure_code_id?, closure_notes? }
 *
 * Marks order as completed, saves notes, closure code, and optional photo URLs.
 *
 * Auth: worker JWT — verifies the order belongs to the calling worker.
 *       Admin may complete any order.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { fireNotification, buildNotificationContext } from '@/lib/notification-dispatcher';
import { checkAuth } from '@/lib/api/auth-guard';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'worker']);
  if (!auth.ok) return auth.response;

  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { order_id, notes, photos, closure_code_id, closure_notes } = body;

    if (!order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 });

    // Ownership check: worker can only complete orders assigned to them
    if (auth.role === 'worker') {
      const { data: order } = await supabase
        .from('orders')
        .select('employee_id')
        .eq('id', order_id)
        .maybeSingle();

      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      if (order.employee_id !== auth.employeeId) {
        return NextResponse.json(
          { error: 'Forbidden', code: 'NOT_YOUR_ORDER' },
          { status: 403 }
        );
      }
    }

    // Update order status
    const updateData: Record<string, any> = {
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
    if (notes) updateData.notes = notes;
    if (closure_code_id) updateData.closure_code_id = closure_code_id;
    if (closure_notes) updateData.closure_notes = closure_notes;

    const { error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', order_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Save photo URLs if provided
    if (photos?.length) {
      const photoRows = photos.map((url: string, i: number) => ({
        order_id,
        url,
        taken_at: new Date().toISOString(),
        sort_order: i,
      }));
      await supabase.from('order_photos').insert(photoRows);
    }

    // Fire completion notification (fire-and-forget)
    buildNotificationContext(order_id).then(ctx => fireNotification('order_completed', ctx)).catch(() => {});

    // Re-optimize remaining route for this employee (fire-and-forget)
    try {
      const { data: completedOrder } = await supabase
        .from('orders')
        .select('employee_id, scheduled_date')
        .eq('id', order_id)
        .single();

      if (completedOrder?.employee_id) {
        const today = new Date().toISOString().split('T')[0];
        const orderDate = completedOrder.scheduled_date || today;

        // Only reoptimize if the order is for today
        if (orderDate === today) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'http://localhost:3000';

          // Reoptimize this employee's route first
          fetch(`${baseUrl}/api/planner/reoptimize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_id: completedOrder.employee_id,
              date: orderDate,
            }),
          })
          .then(() => {
            // After this employee is reoptimized, cascade to all others
            // (depth=1: don't cascade the cascade)
            fetch(`${baseUrl}/api/planner/reoptimize`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                date: orderDate,
                cascade: true,
                employee_id: completedOrder.employee_id, // skip this one — already done
              }),
            }).catch(() => {});
          })
          .catch(() => {}); // fire-and-forget
        }
      }
    } catch {
      // reoptimize is best-effort, don't block completion
    }

    return NextResponse.json({ success: true, order_id, completed_at: updateData.completed_at });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
