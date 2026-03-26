/**
 * GET /api/worker/day-summary?date=YYYY-MM-DD&employee_id=UUID
 *
 * Returns an end-of-shift summary for a given worker and date.
 * Aggregates data from: work_schedules, shifts, orders, vehicle_daily_stats.
 *
 * Auth: worker JWT (own data) or admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth } from '@/lib/api/auth-guard';

export async function GET(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'worker']);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const employeeId = searchParams.get('employee_id');

  // ── Validation ──────────────────────────────────────────────────────────
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'date query param is required (YYYY-MM-DD)' },
      { status: 400 },
    );
  }

  if (!employeeId) {
    return NextResponse.json(
      { error: 'employee_id query param is required' },
      { status: 400 },
    );
  }

  // Workers can only see their own summary
  if (auth.role === 'worker' && auth.employeeId !== employeeId) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'NOT_YOUR_DATA' },
      { status: 403 },
    );
  }

  const supabase = getAdminClient();

  try {
    // ── 1. Work schedule for the day ──────────────────────────────────────
    const { data: schedule } = await supabase
      .from('work_schedules')
      .select('start_time, end_time')
      .eq('employee_id', employeeId)
      .eq('date', date)
      .maybeSingle();

    const shiftStart = schedule?.start_time ?? null;
    const shiftEnd = schedule?.end_time ?? null;

    // Compute total scheduled hours
    let totalHours: number | null = null;
    if (shiftStart && shiftEnd) {
      const [sh, sm] = shiftStart.split(':').map(Number);
      const [eh, em] = shiftEnd.split(':').map(Number);
      totalHours = eh + em / 60 - (sh + sm / 60);
      if (totalHours < 0) totalHours += 24; // overnight shift
    }

    // ── 2. Actual shift (clock in/out) ────────────────────────────────────
    const { data: shift } = await supabase
      .from('shifts')
      .select('clock_in, clock_out, break_minutes')
      .eq('employee_id', employeeId)
      .eq('date', date)
      .maybeSingle();

    const breakMinutes = shift?.break_minutes ?? 0;

    // If we have actual clock data, override totalHours
    if (shift?.clock_in && shift?.clock_out) {
      const clockIn = new Date(shift.clock_in).getTime();
      const clockOut = new Date(shift.clock_out).getTime();
      totalHours = Math.round(((clockOut - clockIn) / 3_600_000) * 10) / 10;
    }

    // ── 3. Orders for the day ─────────────────────────────────────────────
    const { data: orders } = await supabase
      .from('orders')
      .select('id, status, total_price, closure_code_id, closure_codes(code)')
      .eq('employee_id', employeeId)
      .eq('date', date);

    const ordersList = orders ?? [];

    const ordersTotal = ordersList.length;

    const completedStatuses = ['completed', 'done'];
    const cancelledStatuses = ['cancelled'];

    const ordersCompleted = ordersList.filter((o) =>
      completedStatuses.includes(o.status),
    ).length;

    const ordersCancelled = ordersList.filter((o) =>
      cancelledStatuses.includes(o.status),
    ).length;

    // Total revenue from completed orders
    const totalRevenue = ordersList
      .filter((o) => completedStatuses.includes(o.status))
      .reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

    // Closure code breakdown
    const closureCodes: Record<string, number> = {};
    for (const order of ordersList) {
      const codeObj = order.closure_codes as { code?: string } | null;
      const code = codeObj?.code;
      if (code) {
        closureCodes[code] = (closureCodes[code] || 0) + 1;
      }
    }

    // ── 4. Vehicle daily stats (km driven) ────────────────────────────────
    // Find vehicle assigned to the worker for this date
    let totalKm: number | null = null;

    const { data: wsWithVehicle } = await supabase
      .from('work_schedules')
      .select('vehicle_id')
      .eq('employee_id', employeeId)
      .eq('date', date)
      .maybeSingle();

    const vehicleId = wsWithVehicle?.vehicle_id;

    if (vehicleId) {
      const { data: vStats } = await supabase
        .from('vehicle_daily_stats')
        .select('km_driven')
        .eq('vehicle_id', vehicleId)
        .eq('date', date)
        .maybeSingle();

      totalKm = vStats?.km_driven ?? null;
    }

    // ── Response ──────────────────────────────────────────────────────────
    return NextResponse.json({
      date,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      total_hours: totalHours,
      break_minutes: breakMinutes,
      orders_total: ordersTotal,
      orders_completed: ordersCompleted,
      orders_cancelled: ordersCancelled,
      total_km: totalKm,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      closure_codes: closureCodes,
    });
  } catch (err: unknown) {
    console.error('[day-summary]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
