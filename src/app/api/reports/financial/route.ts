/**
 * GET /api/reports/financial?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Financial report: revenue, costs, margins, breakdowns by category / employee / day
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm } from '@/lib/geo';

// ── helpers ──────────────────────────────────────────────────────────────────

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: now.toISOString().split('T')[0] };
}

function calcDrivenKm(locs: { lat: number; lng: number }[]): number {
  let km = 0;
  for (let i = 1; i < locs.length; i++) {
    const prev = locs[i - 1];
    const curr = locs[i];
    if (prev.lat && prev.lng && curr.lat && curr.lng) {
      km += haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
    }
  }
  return Math.round(km * 10) / 10;
}

const FUEL_COST_PER_KM = 0.5; // PLN
const DEFAULT_HOURS_PER_DAY = 8;

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);

  const range = defaultRange();
  const from = searchParams.get('from') || range.from;
  const to = searchParams.get('to') || range.to;

  // 1. Completed orders in date range
  const { data: orders } = await supabase
    .from('orders')
    .select('id, employee_id, total_price, scheduled_date, services')
    .eq('status', 'completed')
    .gte('scheduled_date', from)
    .lte('scheduled_date', to);

  const safeOrders = orders || [];

  // 2. All services (for category lookup)
  const { data: servicesTable } = await supabase
    .from('services')
    .select('id, category');

  const categoryById = new Map<string, string>();
  for (const s of servicesTable || []) {
    categoryById.set(s.id, s.category ?? 'inne');
  }

  // 3. Employees with hourly rates
  const { data: employees } = await supabase
    .from('employees')
    .select('id, hourly_rate, user:profiles(full_name)')
    .eq('is_active', true);

  const safeEmployees = employees || [];

  // 4. GPS locations in date range
  const { data: locations } = await supabase
    .from('employee_locations')
    .select('employee_id, lat, lng, timestamp')
    .gte('timestamp', `${from}T00:00:00`)
    .lte('timestamp', `${to}T23:59:59`)
    .order('timestamp', { ascending: true });

  // Group locations by employee
  const locByEmp = new Map<string, { lat: number; lng: number }[]>();
  for (const loc of locations || []) {
    if (!loc.employee_id || !loc.lat || !loc.lng) continue;
    const list = locByEmp.get(loc.employee_id) || [];
    list.push({ lat: loc.lat, lng: loc.lng });
    locByEmp.set(loc.employee_id, list);
  }

  // ── Revenue totals ───────────────────────────────────────────────────────

  const totalRevenue = safeOrders.reduce((s, o) => s + Number(o.total_price ?? 0), 0);
  const ordersCount = safeOrders.length;
  const avgPerOrder = ordersCount > 0 ? Math.round((totalRevenue / ordersCount) * 100) / 100 : 0;

  // ── Revenue by category ──────────────────────────────────────────────────

  const catMap = new Map<string, { count: number; revenue: number }>();
  for (const order of safeOrders) {
    const svcList: { service_id?: string; name?: string; price?: number; quantity?: number }[] =
      Array.isArray(order.services) ? order.services : [];
    for (const svc of svcList) {
      const cat = (svc.service_id ? categoryById.get(svc.service_id) : null) ?? 'inne';
      const rev = Number(svc.price ?? 0) * Number(svc.quantity ?? 1);
      const existing = catMap.get(cat) || { count: 0, revenue: 0 };
      catMap.set(cat, { count: existing.count + 1, revenue: existing.revenue + rev });
    }
  }
  const byCategory = [...catMap.entries()]
    .map(([category, d]) => ({ category, count: d.count, revenue: Math.round(d.revenue * 100) / 100 }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Revenue by employee ──────────────────────────────────────────────────

  const empOrderMap = new Map<string, { count: number; revenue: number }>();
  for (const order of safeOrders) {
    if (!order.employee_id) continue;
    const ex = empOrderMap.get(order.employee_id) || { count: 0, revenue: 0 };
    empOrderMap.set(order.employee_id, {
      count: ex.count + 1,
      revenue: ex.revenue + Number(order.total_price ?? 0),
    });
  }

  const empNameMap = new Map<string, string>();
  for (const emp of safeEmployees) {
    empNameMap.set(emp.id, (emp.user as any)?.full_name ?? 'Pracownik');
  }

  const byEmployee = [...empOrderMap.entries()].map(([eid, d]) => {
    const locs = locByEmp.get(eid) || [];
    const kmDriven = calcDrivenKm(locs);
    return {
      employee_id: eid,
      employee_name: empNameMap.get(eid) ?? 'Pracownik',
      orders_count: d.count,
      revenue: Math.round(d.revenue * 100) / 100,
      km_driven: kmDriven,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // ── Revenue by day ───────────────────────────────────────────────────────

  const dayMap = new Map<string, { count: number; revenue: number }>();
  for (const order of safeOrders) {
    const d = order.scheduled_date;
    if (!d) continue;
    const ex = dayMap.get(d) || { count: 0, revenue: 0 };
    dayMap.set(d, { count: ex.count + 1, revenue: ex.revenue + Number(order.total_price ?? 0) });
  }
  const byDay = [...dayMap.entries()]
    .map(([date, d]) => ({ date, orders_count: d.count, revenue: Math.round(d.revenue * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Costs ────────────────────────────────────────────────────────────────

  const totalKm = byEmployee.reduce((s, e) => s + e.km_driven, 0);
  const fuelCost = Math.round(totalKm * FUEL_COST_PER_KM * 100) / 100;

  // Try shifts table; fall back to 8h/working-day estimate
  let laborHours = 0;
  let laborCost = 0;

  let shiftsAvailable = true;
  const { data: shifts, error: shiftsError } = await supabase
    .from('shifts')
    .select('employee_id, start_time, end_time')
    .gte('start_time', `${from}T00:00:00`)
    .lte('start_time', `${to}T23:59:59`);

  if (shiftsError || !shifts) {
    shiftsAvailable = false;
  }

  if (shiftsAvailable && shifts && shifts.length > 0) {
    // Calculate from actual shifts
    for (const shift of shifts) {
      if (!shift.start_time || !shift.end_time) continue;
      const start = new Date(shift.start_time).getTime();
      const end = new Date(shift.end_time).getTime();
      const hours = (end - start) / (1000 * 60 * 60);
      if (hours > 0 && hours < 24) {
        laborHours += hours;
        const emp = safeEmployees.find(e => e.id === shift.employee_id);
        const rate = Number(emp?.hourly_rate ?? 30);
        laborCost += hours * rate;
      }
    }
  } else {
    // Fallback: count unique working dates per employee, 8h each
    const empDays = new Map<string, Set<string>>();
    for (const order of safeOrders) {
      if (!order.employee_id || !order.scheduled_date) continue;
      const set = empDays.get(order.employee_id) || new Set();
      set.add(order.scheduled_date);
      empDays.set(order.employee_id, set);
    }
    for (const [eid, dates] of empDays) {
      const days = dates.size;
      const emp = safeEmployees.find(e => e.id === eid);
      const rate = Number(emp?.hourly_rate ?? 30);
      laborHours += days * DEFAULT_HOURS_PER_DAY;
      laborCost += days * DEFAULT_HOURS_PER_DAY * rate;
    }
  }

  laborHours = Math.round(laborHours * 10) / 10;
  laborCost = Math.round(laborCost * 100) / 100;
  const totalCosts = Math.round((fuelCost + laborCost) * 100) / 100;

  // ── Margin ───────────────────────────────────────────────────────────────

  const profit = Math.round((totalRevenue - totalCosts) * 100) / 100;
  const marginPct = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0;

  // ── Response ─────────────────────────────────────────────────────────────

  return NextResponse.json({
    period: { from, to },
    revenue: {
      total: Math.round(totalRevenue * 100) / 100,
      orders_count: ordersCount,
      avg_per_order: avgPerOrder,
      by_category: byCategory,
      by_employee: byEmployee,
      by_day: byDay,
    },
    costs: {
      total_km: Math.round(totalKm * 10) / 10,
      fuel_cost: fuelCost,
      labor_hours: laborHours,
      labor_cost: laborCost,
      total: totalCosts,
    },
    margin: {
      gross_revenue: Math.round(totalRevenue * 100) / 100,
      total_costs: totalCosts,
      profit,
      margin_pct: marginPct,
    },
  });
}
