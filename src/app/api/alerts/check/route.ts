import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  const supabase = getAdminClient();
  const today = new Date().toISOString().split('T')[0];
  const alertsToCreate: {
    order_id?: string;
    employee_id?: string;
    message: string;
    severity: string;
  }[] = [];

  try {
    // 1. SLA Breach: orders not completed past their scheduled date
    const { data: slaOrders } = await supabase
      .from('orders')
      .select('id')
      .not('status', 'eq', 'completed')
      .not('status', 'eq', 'cancelled')
      .lt('scheduled_date', today);

    for (const order of slaOrders ?? []) {
      alertsToCreate.push({
        order_id: order.id,
        message: `Zlecenie #${order.id.slice(0, 8).toUpperCase()} przekroczylo termin realizacji`,
        severity: 'critical',
      });
    }

    // 2. Unassigned orders scheduled for today
    const { data: unassignedOrders } = await supabase
      .from('orders')
      .select('id')
      .eq('status', 'new')
      .eq('scheduled_date', today);

    for (const order of unassignedOrders ?? []) {
      alertsToCreate.push({
        order_id: order.id,
        message: `Zlecenie #${order.id.slice(0, 8).toUpperCase()} na dzis nie jest przypisane`,
        severity: 'warning',
      });
    }

    // 3. No progress: in_progress orders with stale work logs (>60 min, no ended_at)
    const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: staleOrders } = await supabase
      .from('orders')
      .select('id')
      .eq('status', 'in_progress');

    for (const order of staleOrders ?? []) {
      // Check if there's an active work log older than 60 minutes
      const { data: logs } = await supabase
        .from('work_logs')
        .select('id, started_at')
        .eq('order_id', order.id)
        .is('ended_at', null)
        .lt('started_at', sixtyMinAgo)
        .limit(1);

      if (logs && logs.length > 0) {
        alertsToCreate.push({
          order_id: order.id,
          message: `Brak postepu na zleceniu #${order.id.slice(0, 8).toUpperCase()} od ponad godziny`,
          severity: 'warning',
        });
      }
    }

    // Deduplicate: don't create alerts if identical unread alert already exists
    let alertsCreated = 0;
    for (const alert of alertsToCreate) {
      const { data: existing } = await supabase
        .from('alerts')
        .select('id')
        .eq('message', alert.message)
        .eq('is_read', false)
        .limit(1);

      if (existing && existing.length > 0) continue;

      const { error } = await supabase.from('alerts').insert({
        order_id: alert.order_id || null,
        employee_id: alert.employee_id || null,
        message: alert.message,
        severity: alert.severity,
      });

      if (!error) alertsCreated++;
    }

    return NextResponse.json({ alerts_created: alertsCreated });
  } catch (err) {
    console.error('[alerts/check]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
