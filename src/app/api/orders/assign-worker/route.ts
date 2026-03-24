import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/orders/assign-worker
 * Manually assign a worker to an order from the dispatch page.
 * Body: { order_id: string, employee_id: string }
 */
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const { order_id, employee_id } = await request.json();

    if (!order_id || !employee_id) {
      return NextResponse.json({ error: 'order_id and employee_id are required' }, { status: 400 });
    }

    // Get employee name
    const { data: emp } = await supabase
      .from('employees')
      .select('id, user:profiles(full_name)')
      .eq('id', employee_id)
      .single();

    const employeeName = (emp as any)?.user?.full_name ?? 'Pracownik';

    // Update order
    const { error: updateError } = await supabase.from('orders').update({
      employee_id,
      status: 'assigned',
    }).eq('id', order_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      employee_name: employeeName,
    });
  } catch (err) {
    console.error('[orders/assign-worker]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
