/**
 * GET /api/reports/plan-vs-execution?date=YYYY-MM-DD
 *
 * Compares planned schedule vs actual execution:
 * - Per-employee completion rate, delay, km variance
 * - Per-order planned vs actual times
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm } from '@/lib/geo';

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  // 1. Fetch all orders for the date with client geo data
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, status, employee_id, scheduled_time_start, time_window,
      services, completed_at, total_price,
      client:clients(name, address, lat, lng)
    `)
    .eq('scheduled_date', date)
    .order('scheduled_time_start', { ascending: true });

  // 2. Fetch work_logs for actual durations
  const orderIds = (orders || []).map(o => o.id);
  let workLogs: any[] = [];
  if (orderIds.length > 0) {
    const { data } = await supabase
      .from('work_logs')
      .select('order_id, employee_id, started_at, ended_at, duration_minutes')
      .in('order_id', orderIds);
    workLogs = data || [];
  }

  // 3. Fetch employees
  const { data: employees } = await supabase
    .from('employees')
    .select('id, user:profiles(full_name)')
    .eq('is_active', true);

  const empNameMap = new Map<string, string>();
  for (const emp of employees || []) {
    empNameMap.set(emp.id, (emp.user as any)?.full_name ?? 'Pracownik');
  }

  // 4. Fetch GPS locations for actual km
  const { data: locations } = await supabase
    .from('employee_locations')
    .select('employee_id, lat, lng, timestamp')
    .gte('timestamp', `${date}T00:00:00`)
    .lte('timestamp', `${date}T23:59:59`)
    .order('timestamp', { ascending: true });

  // Group locations by employee
  const locByEmp = new Map<string, { lat: number; lng: number }[]>();
  for (const loc of locations || []) {
    if (!loc.employee_id || !loc.lat || !loc.lng) continue;
    const list = locByEmp.get(loc.employee_id) || [];
    list.push({ lat: loc.lat, lng: loc.lng });
    locByEmp.set(loc.employee_id, list);
  }

  function calcGpsKm(locs: { lat: number; lng: number }[]): number {
    let km = 0;
    for (let i = 1; i < locs.length; i++) {
      km += haversineKm(locs[i - 1].lat, locs[i - 1].lng, locs[i].lat, locs[i].lng);
    }
    return Math.round(km * 10) / 10;
  }

  // Group orders by employee
  type OrderRow = NonNullable<typeof orders>[number];
  const ordersByEmp = new Map<string, OrderRow[]>();
  for (const o of orders || []) {
    if (!o.employee_id) continue;
    const list = ordersByEmp.get(o.employee_id) || [];
    list.push(o);
    ordersByEmp.set(o.employee_id, list);
  }

  // Work log lookup by order_id
  const wlByOrder = new Map<string, any>();
  for (const wl of workLogs) {
    if (wl.order_id) wlByOrder.set(wl.order_id, wl);
  }

  // Estimate service duration from services array (default 45 min)
  function estimateServiceDuration(services: any[]): number {
    if (!services || services.length === 0) return 45;
    let total = 0;
    for (const s of services) {
      if (typeof s === 'object' && s?.duration_minutes) {
        total += s.duration_minutes;
      } else {
        total += 30; // default per service
      }
    }
    return total || 45;
  }

  // Build per-employee report
  const employeeReports: any[] = [];

  for (const [empId, empOrders] of ordersByEmp) {
    const completed = empOrders.filter(o => o.status === 'completed');
    const cancelled = empOrders.filter(o => o.status === 'cancelled');

    // Planned km: haversine between consecutive order locations
    const orderedPoints = empOrders
      .filter(o => (o.client as any)?.lat && (o.client as any)?.lng)
      .map(o => ({ lat: (o.client as any).lat, lng: (o.client as any).lng }));
    let plannedKm = 0;
    for (let i = 1; i < orderedPoints.length; i++) {
      plannedKm += haversineKm(
        orderedPoints[i - 1].lat, orderedPoints[i - 1].lng,
        orderedPoints[i].lat, orderedPoints[i].lng,
      );
    }
    plannedKm = Math.round(plannedKm * 10) / 10;

    // Actual km from GPS
    const gpsLocs = locByEmp.get(empId) || [];
    const actualKm = calcGpsKm(gpsLocs);

    // Per-order details
    const orderDetails: any[] = [];
    let totalDelayMinutes = 0;
    let onTimeCount = 0;
    let lateCount = 0;

    for (const o of empOrders) {
      const wl = wlByOrder.get(o.id);
      const plannedTime = o.scheduled_time_start
        ? o.scheduled_time_start.substring(0, 5)
        : null;

      const plannedDuration = estimateServiceDuration(o.services || []);

      let actualStart: string | null = null;
      let actualDuration: number | null = null;

      if (wl) {
        if (wl.started_at) {
          const startDate = new Date(wl.started_at);
          actualStart = startDate.toTimeString().substring(0, 5);
        }
        actualDuration = wl.duration_minutes ?? null;
        if (!actualDuration && wl.started_at && wl.ended_at) {
          actualDuration = Math.round(
            (new Date(wl.ended_at).getTime() - new Date(wl.started_at).getTime()) / 60000,
          );
        }
      } else if (o.completed_at && o.scheduled_time_start) {
        // Estimate from completed_at
        const completedDate = new Date(o.completed_at);
        actualStart = null; // no work log start
        // Rough actual duration from scheduled start to completion
        const schedParts = o.scheduled_time_start.split(':').map(Number);
        const schedMs = new Date(`${date}T${o.scheduled_time_start}`).getTime();
        if (!isNaN(schedMs)) {
          actualDuration = Math.round((completedDate.getTime() - schedMs) / 60000);
        }
      }

      // Delay: how late actual start was vs planned
      let delayMinutes = 0;
      if (plannedTime && actualStart) {
        const [ph, pm] = plannedTime.split(':').map(Number);
        const [ah, am] = actualStart.split(':').map(Number);
        delayMinutes = (ah * 60 + am) - (ph * 60 + pm);
        if (delayMinutes < 0) delayMinutes = 0;
      }

      if (delayMinutes <= 10) {
        onTimeCount++;
      } else {
        lateCount++;
      }
      totalDelayMinutes += delayMinutes;

      orderDetails.push({
        order_id: o.id,
        client_name: (o.client as any)?.name ?? '—',
        planned_time: plannedTime,
        actual_start: actualStart,
        planned_duration_min: plannedDuration,
        actual_duration_min: actualDuration,
        delay_minutes: delayMinutes,
        status: o.status,
      });
    }

    const avgDelay = empOrders.length > 0
      ? Math.round(totalDelayMinutes / empOrders.length)
      : 0;

    const kmVariance = plannedKm > 0
      ? Math.round(((actualKm - plannedKm) / plannedKm) * 1000) / 10
      : 0;

    employeeReports.push({
      employee_id: empId,
      employee_name: empNameMap.get(empId) ?? 'Pracownik',
      planned_orders: empOrders.length,
      completed_orders: completed.length,
      cancelled_orders: cancelled.length,
      completion_rate: empOrders.length > 0
        ? Math.round((completed.length / empOrders.length) * 100)
        : 0,
      planned_km: plannedKm,
      actual_km: actualKm,
      km_variance_pct: kmVariance,
      avg_delay_minutes: avgDelay,
      on_time_count: onTimeCount,
      late_count: lateCount,
      orders: orderDetails,
    });
  }

  // Summary
  const totalPlanned = employeeReports.reduce((s, e) => s + e.planned_orders, 0);
  const totalCompleted = employeeReports.reduce((s, e) => s + e.completed_orders, 0);
  const totalCancelled = employeeReports.reduce((s, e) => s + e.cancelled_orders, 0);
  const avgCompletionRate = employeeReports.length > 0
    ? Math.round(employeeReports.reduce((s, e) => s + e.completion_rate, 0) / employeeReports.length)
    : 0;
  const avgDelay = employeeReports.length > 0
    ? Math.round(employeeReports.reduce((s, e) => s + e.avg_delay_minutes, 0) / employeeReports.length)
    : 0;
  const plannedKmTotal = Math.round(employeeReports.reduce((s, e) => s + e.planned_km, 0) * 10) / 10;
  const actualKmTotal = Math.round(employeeReports.reduce((s, e) => s + e.actual_km, 0) * 10) / 10;

  return NextResponse.json({
    date,
    employees: employeeReports,
    summary: {
      total_planned: totalPlanned,
      total_completed: totalCompleted,
      total_cancelled: totalCancelled,
      avg_completion_rate: avgCompletionRate,
      avg_delay_minutes: avgDelay,
      planned_km_total: plannedKmTotal,
      actual_km_total: actualKmTotal,
    },
  });
}
