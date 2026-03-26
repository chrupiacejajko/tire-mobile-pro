/**
 * GET /api/reports/work-time?from=2026-03-01&to=2026-03-25
 *
 * Work time report: scheduled vs actual hours, breaks, completed orders,
 * earnings per employee, minimum wage compliance check.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: now.toISOString().split('T')[0] };
}

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);

  const range = defaultRange();
  const from = searchParams.get('from') || range.from;
  const to = searchParams.get('to') || range.to;

  // 1. Employees
  const { data: employees } = await supabase
    .from('employees')
    .select('id, first_name, last_name, shift_rate')
    .eq('is_active', true);

  const safeEmployees = employees || [];

  // 2. Work schedules in date range (new model: start_at, duration_minutes, end_at)
  const rangeStart = `${from}T00:00:00`;
  const rangeEnd = `${to}T23:59:59`;
  const { data: schedules } = await supabase
    .from('work_schedules')
    .select('employee_id, start_at, duration_minutes, end_at')
    .lt('start_at', rangeEnd)
    .gt('end_at', rangeStart);

  const safeSchedules = schedules || [];

  // Group schedules by employee
  const schedulesByEmp = new Map<string, { dates: Set<string>; totalHours: number }>();
  for (const s of safeSchedules) {
    if (!s.employee_id) continue;
    const entry = schedulesByEmp.get(s.employee_id) || { dates: new Set(), totalHours: 0 };
    // Extract date from start_at for day counting
    const schedDate = new Date(s.start_at).toISOString().split('T')[0];
    entry.dates.add(schedDate);
    // Calculate hours from duration_minutes
    if (s.duration_minutes && s.duration_minutes > 0) {
      entry.totalHours += s.duration_minutes / 60;
    }
    schedulesByEmp.set(s.employee_id, entry);
  }

  // 3. Shifts (clock_in, clock_out, break_minutes) in date range
  const { data: shifts } = await supabase
    .from('shifts')
    .select('employee_id, clock_in, clock_out, break_minutes')
    .gte('date', from)
    .lte('date', to);

  const safeShifts = shifts || [];

  // Group shifts by employee
  const shiftsByEmp = new Map<string, { actualMinutes: number; breakMinutes: number }>();
  for (const s of safeShifts) {
    if (!s.employee_id || !s.clock_in || !s.clock_out) continue;
    const entry = shiftsByEmp.get(s.employee_id) || { actualMinutes: 0, breakMinutes: 0 };
    const start = new Date(s.clock_in).getTime();
    const end = new Date(s.clock_out).getTime();
    const totalMin = (end - start) / (1000 * 60);
    const breakMin = Number(s.break_minutes ?? 0);
    if (totalMin > 0 && totalMin < 24 * 60) {
      entry.actualMinutes += totalMin - breakMin;
      entry.breakMinutes += breakMin;
    }
    shiftsByEmp.set(s.employee_id, entry);
  }

  // 4. Completed orders per employee in date range
  const { data: orders } = await supabase
    .from('orders')
    .select('employee_id')
    .eq('status', 'completed')
    .gte('scheduled_date', from)
    .lte('scheduled_date', to);

  const safeOrders = orders || [];
  const ordersByEmp = new Map<string, number>();
  for (const o of safeOrders) {
    if (!o.employee_id) continue;
    ordersByEmp.set(o.employee_id, (ordersByEmp.get(o.employee_id) || 0) + 1);
  }

  // 5. Build per-employee result
  const MINIMUM_RATE = 31.40;

  const result = safeEmployees.map(emp => {
    const schedule = schedulesByEmp.get(emp.id);
    const shift = shiftsByEmp.get(emp.id);

    const scheduledDays = schedule?.dates.size ?? 0;
    const scheduledHours = Math.round((schedule?.totalHours ?? 0) * 100) / 100;
    const actualHours = Math.round((shift?.actualMinutes ?? 0) / 60 * 100) / 100;
    const breakHours = Math.round((shift?.breakMinutes ?? 0) / 60 * 100) / 100;
    const completedOrders = ordersByEmp.get(emp.id) ?? 0;
    const shiftRate = emp.shift_rate != null ? Number(emp.shift_rate) : null;
    const totalEarnings = shiftRate != null ? Math.round(shiftRate * scheduledDays * 100) / 100 : 0;
    const effectiveRate = actualHours > 0 ? Math.round(totalEarnings / actualHours * 100) / 100 : 0;
    const belowMinimum = actualHours > 0 && effectiveRate < MINIMUM_RATE;

    return {
      employee_id: emp.id,
      employee_name: [emp.first_name, emp.last_name].filter(Boolean).join(' ') || 'Pracownik',
      scheduled_days: scheduledDays,
      scheduled_hours: scheduledHours,
      actual_hours: actualHours,
      break_hours: breakHours,
      completed_orders: completedOrders,
      shift_rate: shiftRate,
      total_earnings: totalEarnings,
      effective_rate: effectiveRate,
      below_minimum: belowMinimum,
    };
  })
    .filter(r => r.scheduled_days > 0 || r.actual_hours > 0 || r.completed_orders > 0)
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name, 'pl'));

  return NextResponse.json({
    period: { from, to },
    employees: result,
  });
}
