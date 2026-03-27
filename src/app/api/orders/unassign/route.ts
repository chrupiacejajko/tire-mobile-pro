/**
 * POST /api/orders/unassign
 *
 * Unassign an order from its employee, setting status back to 'new'.
 *
 * Body: { order_id: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth } from '@/lib/api/auth-guard';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;
  const supabase = getAdminClient();

  try {
    const { order_id } = await request.json();

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('orders')
      .update({
        employee_id: null,
        status: 'new',
      })
      .eq('id', order_id);

    if (error) {
      console.error('[orders/unassign]', error);
      return NextResponse.json({ error: 'Failed to unassign order' }, { status: 500 });
    }

    return NextResponse.json({ success: true, order_id });
  } catch (err) {
    console.error('[orders/unassign]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
