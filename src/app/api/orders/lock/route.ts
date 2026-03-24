/**
 * POST /api/orders/lock
 *
 * Toggle the is_locked flag on an order.
 *
 * Body: { order_id: string, is_locked: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth } from '@/lib/api/auth-guard';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;
  const supabase = getAdminClient();

  try {
    const { order_id, is_locked } = await request.json();

    if (!order_id || typeof is_locked !== 'boolean') {
      return NextResponse.json(
        { error: 'order_id (string) and is_locked (boolean) are required' },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from('orders')
      .update({ is_locked })
      .eq('id', order_id);

    if (error) {
      console.error('[orders/lock]', error);
      return NextResponse.json({ error: 'Failed to update lock state' }, { status: 500 });
    }

    return NextResponse.json({ success: true, order_id, is_locked });
  } catch (err) {
    console.error('[orders/lock]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
