/**
 * POST /api/orders/update-time
 *
 * Update the scheduled_time_start for an order (used by Gantt drag).
 * Optionally reassign to a different employee.
 *
 * Body: { order_id: string, scheduled_time_start: string, employee_id?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const { order_id, scheduled_time_start, employee_id } = await request.json();

    if (!order_id || !scheduled_time_start) {
      return NextResponse.json(
        { error: 'order_id and scheduled_time_start are required' },
        { status: 400 },
      );
    }

    const update: Record<string, unknown> = { scheduled_time_start };
    if (employee_id) {
      update.employee_id = employee_id;
      update.status = 'assigned';
    }

    const { error } = await supabase
      .from('orders')
      .update(update)
      .eq('id', order_id);

    if (error) {
      console.error('[orders/update-time]', error);
      return NextResponse.json({ error: 'Failed to update order time' }, { status: 500 });
    }

    return NextResponse.json({ success: true, order_id, scheduled_time_start, employee_id });
  } catch (err) {
    console.error('[orders/update-time]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
