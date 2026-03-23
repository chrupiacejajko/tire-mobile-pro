/**
 * Work time tracking API
 *
 * GET  /api/work-logs?order_id=xxx          — logs for order
 * POST /api/work-logs  { order_id, employee_id, action: 'start'|'stop', notes? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('order_id');
  const employeeId = searchParams.get('employee_id');

  let query = supabase
    .from('work_logs')
    .select('id, order_id, employee_id, started_at, ended_at, duration_minutes, notes')
    .order('started_at', { ascending: false });

  if (orderId) query = query.eq('order_id', orderId);
  if (employeeId) query = query.eq('employee_id', employeeId);

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute total time per order
  const totalMinutes = (data || []).reduce((s, l) => s + (l.duration_minutes ?? 0), 0);
  const activeLog = (data || []).find(l => !l.ended_at);

  return NextResponse.json({ logs: data, total_minutes: totalMinutes, active_log: activeLog ?? null });
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { order_id, employee_id, action, notes } = body;

    if (!order_id || !action) {
      return NextResponse.json({ error: 'order_id and action required' }, { status: 400 });
    }

    if (action === 'start') {
      // Stop any active log for this employee first
      if (employee_id) {
        await supabase
          .from('work_logs')
          .update({ ended_at: new Date().toISOString() })
          .eq('employee_id', employee_id)
          .is('ended_at', null);
      }

      const { data, error } = await supabase
        .from('work_logs')
        .insert({ order_id, employee_id: employee_id ?? null, started_at: new Date().toISOString(), notes })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Update order status to in_progress
      await supabase.from('orders').update({ status: 'in_progress' }).eq('id', order_id).eq('status', 'assigned');

      return NextResponse.json({ success: true, action: 'started', log: data });
    }

    if (action === 'stop') {
      // Find active log for this order
      const { data: active } = await supabase
        .from('work_logs')
        .select('id, started_at')
        .eq('order_id', order_id)
        .is('ended_at', null)
        .single();

      if (!active) {
        return NextResponse.json({ error: 'No active timer for this order' }, { status: 404 });
      }

      const { data, error } = await supabase
        .from('work_logs')
        .update({ ended_at: new Date().toISOString(), notes: notes ?? null })
        .eq('id', active.id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ success: true, action: 'stopped', log: data });
    }

    return NextResponse.json({ error: 'action must be start or stop' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
