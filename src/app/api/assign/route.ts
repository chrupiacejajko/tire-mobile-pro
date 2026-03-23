import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// POST /api/assign - Auto-assign unassigned orders to best available employees
// Algorithm: balance workload across employees, match by region, consider skills
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { date, strategy } = body; // strategy: 'balance' | 'minimize'

    const targetDate = date || new Date().toISOString().split('T')[0];

    // Get unassigned orders for the date
    const { data: unassigned } = await supabase
      .from('orders')
      .select('id, region_id, scheduled_date, scheduled_time_start, scheduled_time_end, services')
      .eq('scheduled_date', targetDate)
      .eq('status', 'new')
      .is('employee_id', null);

    if (!unassigned || unassigned.length === 0) {
      return NextResponse.json({ message: 'No unassigned orders', assigned: 0 });
    }

    // Get active employees with their current workload for the day
    const { data: employees } = await supabase
      .from('employees')
      .select('id, region_id, skills, hourly_rate, working_hours')
      .eq('is_active', true);

    if (!employees || employees.length === 0) {
      return NextResponse.json({ error: 'No active employees available' }, { status: 400 });
    }

    // Count existing assignments per employee for the day
    const { data: existingOrders } = await supabase
      .from('orders')
      .select('employee_id, scheduled_time_start, scheduled_time_end')
      .eq('scheduled_date', targetDate)
      .not('employee_id', 'is', null)
      .not('status', 'eq', 'cancelled');

    const workloadMap = new Map<string, number>();
    const scheduleMap = new Map<string, { start: string; end: string }[]>();

    for (const order of (existingOrders || [])) {
      if (!order.employee_id) continue;
      workloadMap.set(order.employee_id, (workloadMap.get(order.employee_id) || 0) + 1);
      const sched = scheduleMap.get(order.employee_id) || [];
      sched.push({ start: order.scheduled_time_start, end: order.scheduled_time_end });
      scheduleMap.set(order.employee_id, sched);
    }

    let assigned = 0;
    const results: { order_id: string; employee_id: string; employee_name?: string }[] = [];

    for (const order of unassigned) {
      // Score each employee for this order
      let bestEmployee: string | null = null;
      let bestScore = -Infinity;

      for (const emp of employees) {
        let score = 0;

        // Region match bonus (+10)
        if (order.region_id && emp.region_id === order.region_id) score += 10;

        // Workload balance (fewer orders = higher score)
        const currentLoad = workloadMap.get(emp.id) || 0;
        if (strategy === 'minimize') {
          // Minimize resources: pack orders onto fewer employees
          score += currentLoad * 2;
        } else {
          // Balance: prefer employees with fewer orders
          score -= currentLoad * 3;
        }

        // Check time conflicts
        const empSchedule = scheduleMap.get(emp.id) || [];
        const hasConflict = empSchedule.some(s =>
          order.scheduled_time_start < s.end && order.scheduled_time_end > s.start
        );
        if (hasConflict) score -= 100; // Heavy penalty for conflicts

        if (score > bestScore) {
          bestScore = score;
          bestEmployee = emp.id;
        }
      }

      if (bestEmployee && bestScore > -50) {
        await supabase.from('orders').update({
          employee_id: bestEmployee,
          status: 'assigned',
        }).eq('id', order.id);

        // Update workload tracking
        workloadMap.set(bestEmployee, (workloadMap.get(bestEmployee) || 0) + 1);
        const sched = scheduleMap.get(bestEmployee) || [];
        sched.push({ start: order.scheduled_time_start, end: order.scheduled_time_end });
        scheduleMap.set(bestEmployee, sched);

        results.push({ order_id: order.id, employee_id: bestEmployee });
        assigned++;
      }
    }

    return NextResponse.json({
      assigned,
      total_unassigned: unassigned.length,
      strategy: strategy || 'balance',
      results,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
