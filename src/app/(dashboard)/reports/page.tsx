'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart3, TrendingUp, DollarSign, Clock, FileDown, Calendar,
  CheckCircle2, XCircle, Loader2, RefreshCw, Car, User,
  MapPin, AlertTriangle, Activity, Zap, Navigation, Wallet,
  Fuel, Briefcase, PieChart,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ── Animation preset ──────────────────────────────────────────────────────────
const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } },
  item: { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } },
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface DailyEmpReport {
  employee_id: string;
  employee_name: string;
  plate: string | null;
  orders_total: number;
  orders_completed: number;
  orders_pending: number;
  orders_cancelled: number;
  completion_rate: number | null;
  driven_km: number;
  max_speed_kmh: number;
  gps_pings: number;
}

interface DailySummary {
  orders_total: number;
  orders_completed: number;
  orders_pending: number;
  orders_cancelled: number;
  completion_rate: number;
  active_employees: number;
  total_driven_km: number;
}

interface DailyReport {
  date: string;
  generated_at: string;
  summary: DailySummary;
  employees: DailyEmpReport[];
}

// ── Circular progress ─────────────────────────────────────────────────────────
function RingProgress({ pct, size = 80, stroke = 8, color = '#10b981' }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.7s ease' }} />
    </svg>
  );
}

// ── Employee operational card ──────────────────────────────────────────────────
function EmpCard({ emp, vehicles }: { emp: DailyEmpReport; vehicles: any[] }) {
  const pct = emp.completion_rate ?? 0;
  const vehicle = vehicles.find(v => v.plate_number === emp.plate);
  const speed = vehicle?.speed ?? null;
  const status = vehicle?.status ?? null;
  const isMoving = status === 'driving';
  const isOnline = !!vehicle?.last_update && (Date.now() - new Date(vehicle.last_update).getTime()) < 10 * 60 * 1000;

  const ringColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <motion.div variants={ANIM.item}
      className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {/* Avatar + ring */}
        <div className="relative flex-shrink-0">
          <RingProgress pct={pct} size={56} stroke={5} color={ringColor} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-bold text-gray-700">{pct}%</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 text-sm truncate">{emp.employee_name}</p>
            {isMoving && (
              <span className="flex items-center gap-0.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                <Navigation className="h-2.5 w-2.5" />{speed} km/h
              </span>
            )}
            {!isMoving && isOnline && (
              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Postój</span>
            )}
            {!isOnline && (
              <span className="text-[10px] bg-red-50 text-red-400 px-1.5 py-0.5 rounded-full">Offline</span>
            )}
          </div>
          {emp.plate && <p className="text-xs text-gray-400">{emp.plate}</p>}

          {/* Mini stats */}
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="h-3 w-3" />{emp.orders_completed}/{emp.orders_total}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Car className="h-3 w-3" />{emp.driven_km} km
            </span>
            {emp.orders_pending > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <Clock className="h-3 w-3" />{emp.orders_pending} czeka
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: ringColor }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Operational (live) view ────────────────────────────────────────────────────
function OperationalView({ date }: { date: string }) {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    const [repRes, vehRes] = await Promise.all([
      fetch(`/api/reports/daily?date=${date}`),
      fetch('/api/vehicles/locations'),
    ]);
    const [rep, veh] = await Promise.all([repRes.json(), vehRes.json()]);
    setReport(rep);
    setVehicles(Array.isArray(veh) ? veh : []);
    setLastRefresh(new Date());
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (!report) return null;

  const { summary } = report;
  const sRate = summary.completion_rate;
  const sColor = sRate >= 80 ? '#10b981' : sRate >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="space-y-6">
      {/* Refresh indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Live — odświeża co 30s · Ostatnio: {lastRefresh.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> Odśwież
        </button>
      </div>

      {/* Big summary row */}
      <motion.div className="grid grid-cols-2 sm:grid-cols-4 gap-4" variants={ANIM.container} initial="hidden" animate="show">
        {[
          { label: 'Wszystkich zleceń',   value: summary.orders_total,     icon: BarChart3,    color: 'text-gray-900',    bg: 'bg-gray-50' },
          { label: 'Ukończonych',          value: summary.orders_completed,  icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Oczekujących',         value: summary.orders_pending,    icon: Clock,        color: 'text-amber-600',   bg: 'bg-amber-50' },
          { label: 'Łącznie km',          value: `${summary.total_driven_km} km`, icon: Car,   color: 'text-blue-600',    bg: 'bg-blue-50' },
        ].map(s => (
          <motion.div key={s.label} variants={ANIM.item} className={`${s.bg} rounded-2xl border border-gray-100 p-4 flex items-center gap-3`}>
            <s.icon className={`h-5 w-5 ${s.color} flex-shrink-0`} />
            <div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Big ring + efficiency metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Overall completion ring */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center justify-center gap-3">
          <div className="relative">
            <RingProgress pct={sRate} size={120} stroke={12} color={sColor} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-gray-900">{sRate}%</span>
              <span className="text-[10px] text-gray-400">ukończono</span>
            </div>
          </div>
          <p className="text-sm font-semibold text-gray-700">Wynik dzienny</p>
          <div className="flex gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{summary.orders_completed} ukończonych</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />{summary.orders_pending} pozostałych</span>
          </div>
        </div>

        {/* Efficiency metrics (GeoTask-style) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" />
            Wskaźniki efektywności
          </p>
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                label: 'Czas planowania',
                value: '~80% szybciej',
                sub: 'vs. ręczne układanie tras',
                color: 'text-emerald-600',
                bg: 'bg-emerald-50',
                icon: Clock,
              },
              {
                label: 'Przejechane km',
                value: `${summary.total_driven_km} km`,
                sub: `przez ${summary.active_employees} pojazdów`,
                color: 'text-blue-600',
                bg: 'bg-blue-50',
                icon: Car,
              },
              {
                label: 'Aktywni pracownicy',
                value: `${summary.active_employees}`,
                sub: 'busów w trasie lub online',
                color: 'text-violet-600',
                bg: 'bg-violet-50',
                icon: User,
              },
              {
                label: 'Wskaźnik realizacji',
                value: `${sRate}%`,
                sub: summary.orders_cancelled > 0 ? `${summary.orders_cancelled} anulowanych` : 'bez anulacji',
                color: sRate >= 80 ? 'text-emerald-600' : sRate >= 50 ? 'text-amber-600' : 'text-red-600',
                bg: sRate >= 80 ? 'bg-emerald-50' : sRate >= 50 ? 'bg-amber-50' : 'bg-red-50',
                icon: TrendingUp,
              },
            ].map(m => (
              <div key={m.label} className={`${m.bg} rounded-xl p-3 flex items-start gap-3`}>
                <m.icon className={`h-4 w-4 ${m.color} mt-0.5 flex-shrink-0`} />
                <div>
                  <p className={`font-bold text-base ${m.color}`}>{m.value}</p>
                  <p className="text-xs font-medium text-gray-700">{m.label}</p>
                  <p className="text-[10px] text-gray-400">{m.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-employee grid */}
      {report.employees.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-orange-500" />
            Postępy pracowników — na żywo
          </h3>
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
            variants={ANIM.container} initial="hidden" animate="show"
          >
            {report.employees.map(emp => (
              <EmpCard key={emp.employee_id} emp={emp} vehicles={vehicles} />
            ))}
          </motion.div>
        </div>
      )}

      {report.employees.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Activity className="h-10 w-10 mx-auto mb-3 text-gray-200" />
          <p>Brak aktywnych pracowników na ten dzień</p>
        </div>
      )}
    </div>
  );
}

// ── Statistics (original) view ────────────────────────────────────────────────
function StatisticsView({ period, onPeriodChange }: { period: string; onPeriodChange: (v: string) => void }) {
  const [orders, setOrders] = useState<{
    status: string; total_price: number; scheduled_date: string;
    services: { name: string; price: number }[];
  }[]>([]);
  const supabase = createClient();

  const fetchData = useCallback(async () => {
    const now = new Date();
    let startDate: string;
    if (period === 'today') startDate = now.toISOString().split('T')[0];
    else if (period === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); startDate = d.toISOString().split('T')[0]; }
    else if (period === 'month') { const d = new Date(now); d.setMonth(d.getMonth() - 1); startDate = d.toISOString().split('T')[0]; }
    else { const d = new Date(now); d.setMonth(d.getMonth() - 3); startDate = d.toISOString().split('T')[0]; }
    const { data } = await supabase.from('orders').select('status, total_price, scheduled_date, services').gte('scheduled_date', startDate);
    if (data) setOrders(data);
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => o.status === 'completed').length;
  const totalRevenue = orders.filter(o => o.status === 'completed').reduce((s, o) => s + Number(o.total_price), 0);
  const avgOrderValue = completedOrders > 0 ? Math.round(totalRevenue / completedOrders) : 0;
  const successRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

  const serviceMap = new Map<string, { count: number; revenue: number }>();
  orders.filter(o => o.status === 'completed').forEach(o => {
    (o.services || []).forEach((s: any) => {
      const n = typeof s === 'string' ? s : s?.name ?? '';
      const p = typeof s === 'string' ? 0 : Number(s?.price ?? 0);
      const ex = serviceMap.get(n) || { count: 0, revenue: 0 };
      serviceMap.set(n, { count: ex.count + 1, revenue: ex.revenue + p });
    });
  });
  const topServices = [...serviceMap.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 6);

  const dailyMap = new Map<string, number>();
  orders.forEach(o => { dailyMap.set(o.scheduled_date, (dailyMap.get(o.scheduled_date) || 0) + 1); });
  const dailyData = [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const maxDaily = Math.max(...dailyData.map(d => d[1]), 1);

  const exportCSV = () => {
    const headers = 'Data,Status,Kwota,Usługi\n';
    const rows = orders.map(o => `${o.scheduled_date},${o.status},${o.total_price},"${(o.services || []).map((s: any) => typeof s === 'string' ? s : s?.name ?? '').join(', ')}"`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `raport-${period}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Select value={period} onValueChange={v => onPeriodChange(v ?? 'month')}>
          <SelectTrigger className="w-44 h-9 rounded-xl">
            <Calendar className="mr-2 h-4 w-4" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Dziś</SelectItem>
            <SelectItem value="week">Ostatnie 7 dni</SelectItem>
            <SelectItem value="month">Ostatni miesiąc</SelectItem>
            <SelectItem value="quarter">Ostatni kwartał</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" className="h-9 rounded-xl text-sm gap-2" onClick={exportCSV}>
          <FileDown className="h-4 w-4" /> Eksportuj CSV
        </Button>
      </div>

      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4" variants={ANIM.container} initial="hidden" animate="show">
        {[
          { label: 'Zlecenia', value: totalOrders.toString(), icon: BarChart3, color: 'from-blue-500 to-blue-600' },
          { label: 'Przychód', value: `${totalRevenue.toLocaleString()} zł`, icon: DollarSign, color: 'from-emerald-500 to-emerald-600' },
          { label: 'Śr. wartość', value: `${avgOrderValue} zł`, icon: TrendingUp, color: 'from-violet-500 to-violet-600' },
          { label: 'Skuteczność', value: `${successRate}%`, icon: Clock, color: 'from-rose-500 to-rose-600' },
        ].map(kpi => (
          <motion.div key={kpi.label} variants={ANIM.item}
            className={`rounded-2xl bg-gradient-to-br ${kpi.color} p-5 text-white shadow-lg relative overflow-hidden`}>
            <p className="text-sm text-white/80">{kpi.label}</p>
            <p className="text-2xl font-bold mt-1">{kpi.value}</p>
            <kpi.icon className="absolute -right-2 -bottom-2 h-16 w-16 text-white/10" />
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader><CardTitle className="text-base font-bold">Zlecenia wg dnia</CardTitle></CardHeader>
            <CardContent>
              {dailyData.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Brak danych</p>
              ) : (
                <div className="flex items-end justify-between h-48 gap-1">
                  {dailyData.map(([date, count]) => (
                    <div key={date} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] text-gray-500 font-medium">{count}</span>
                      <motion.div className="w-full max-w-[32px] bg-blue-500 rounded-t-lg"
                        initial={{ height: 0 }} animate={{ height: `${(count / maxDaily) * 150}px` }}
                        transition={{ duration: 0.5, delay: 0.1 }} />
                      <span className="text-[9px] text-gray-400">{date.slice(8)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader><CardTitle className="text-base font-bold">Top usługi</CardTitle></CardHeader>
            <CardContent>
              {topServices.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Brak danych</p>
              ) : (
                <div className="space-y-4">
                  {topServices.map(([name, data]) => {
                    const maxRev = topServices[0]?.[1].revenue || 1;
                    return (
                      <div key={name}>
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="font-medium text-gray-700 truncate">{name}</span>
                          <span className="font-bold text-gray-900 shrink-0 ml-2">{data.revenue.toLocaleString()} zł</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <motion.div className="h-2 rounded-full bg-blue-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${(data.revenue / maxRev) * 100}%` }}
                            transition={{ duration: 0.6 }} />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">{data.count} zleceń</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

// ── Financial report types ────────────────────────────────────────────────────
interface FinancialReport {
  period: { from: string; to: string };
  revenue: {
    total: number;
    orders_count: number;
    avg_per_order: number;
    by_category: { category: string; count: number; revenue: number }[];
    by_employee: { employee_id: string; employee_name: string; orders_count: number; revenue: number; km_driven: number }[];
    by_day: { date: string; orders_count: number; revenue: number }[];
  };
  costs: {
    total_km: number;
    fuel_cost: number;
    labor_hours: number;
    labor_cost: number;
    total: number;
  };
  margin: {
    gross_revenue: number;
    total_costs: number;
    profit: number;
    margin_pct: number;
  };
}

// ── Date helpers for presets ──────────────────────────────────────────────────
function toISO(d: Date) { return d.toISOString().split('T')[0]; }

function getPresetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = toISO(now);
  switch (preset) {
    case 'week': {
      const d = new Date(now);
      const day = d.getDay() || 7; // Monday = 1
      d.setDate(d.getDate() - day + 1);
      return { from: toISO(d), to: today };
    }
    case 'month': {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      return { from: `${y}-${m}-01`, to: today };
    }
    case '30days': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { from: toISO(d), to: today };
    }
    case 'quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const qStart = new Date(now.getFullYear(), qMonth, 1);
      return { from: toISO(qStart), to: today };
    }
    default:
      return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: today };
  }
}

// ── Financial (Finanse) view ─────────────────────────────────────────────────
function FinanseView() {
  const initRange = getPresetRange('month');
  const [from, setFrom] = useState(initRange.from);
  const [to, setTo] = useState(initRange.to);
  const [data, setData] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/financial?from=${from}&to=${to}`);
      const json = await res.json();
      setData(json);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (preset: string) => {
    const r = getPresetRange(preset);
    setFrom(r.from);
    setTo(r.to);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-400">
        <DollarSign className="h-10 w-10 mx-auto mb-3 text-gray-200" />
        <p>Nie udalo sie zaladowac danych finansowych</p>
      </div>
    );
  }

  const maxCatRevenue = Math.max(...data.revenue.by_category.map(c => c.revenue), 1);
  const maxDayRevenue = Math.max(...data.revenue.by_day.map(d => d.revenue), 1);
  const marginColor = data.margin.margin_pct >= 40 ? 'from-emerald-500 to-emerald-600' : 'from-red-500 to-red-600';

  return (
    <div className="space-y-6">
      {/* Date range picker */}
      <div className="flex items-center flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="text-sm bg-transparent outline-none text-gray-700 font-medium" />
          <span className="text-gray-300">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="text-sm bg-transparent outline-none text-gray-700 font-medium" />
        </div>
        <div className="flex gap-1.5">
          {[
            { key: 'week', label: 'Ten tydzien' },
            { key: 'month', label: 'Ten miesiac' },
            { key: '30days', label: 'Ostatnie 30 dni' },
            { key: 'quarter', label: 'Ten kwartal' },
          ].map(p => (
            <button key={p.key} onClick={() => applyPreset(p.key)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4" variants={ANIM.container} initial="hidden" animate="show">
        {[
          { label: 'Przychod', value: `${data.revenue.total.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zl`, icon: DollarSign, color: 'from-emerald-500 to-emerald-600' },
          { label: 'Zamowienia', value: data.revenue.orders_count.toString(), icon: BarChart3, color: 'from-blue-500 to-blue-600' },
          { label: 'Sr. per zamowienie', value: `${data.revenue.avg_per_order.toFixed(2)} zl`, icon: TrendingUp, color: 'from-amber-500 to-amber-600' },
          { label: `Marza ${data.margin.margin_pct}%`, value: `${data.margin.profit.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zl`, icon: PieChart, color: marginColor },
        ].map(kpi => (
          <motion.div key={kpi.label} variants={ANIM.item}
            className={`rounded-2xl bg-gradient-to-br ${kpi.color} p-5 text-white shadow-lg relative overflow-hidden`}>
            <p className="text-sm text-white/80">{kpi.label}</p>
            <p className="text-2xl font-bold mt-1">{kpi.value}</p>
            <kpi.icon className="absolute -right-2 -bottom-2 h-16 w-16 text-white/10" />
          </motion.div>
        ))}
      </motion.div>

      {/* Revenue by category */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardHeader><CardTitle className="text-base font-bold">Przychod wg kategorii</CardTitle></CardHeader>
          <CardContent>
            {data.revenue.by_category.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Brak danych</p>
            ) : (
              <div className="space-y-3">
                {data.revenue.by_category.map(cat => (
                  <div key={cat.category} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-gray-600 truncate">{cat.category}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${(cat.revenue / maxCatRevenue * 100)}%` }}
                        transition={{ duration: 0.6 }}
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-900 w-28 text-right">{cat.revenue.toFixed(0)} zl</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Revenue by employee */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardHeader><CardTitle className="text-base font-bold">Przychod wg pracownika</CardTitle></CardHeader>
          <CardContent>
            {data.revenue.by_employee.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Brak danych</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 font-semibold text-gray-600">Pracownik</th>
                      <th className="text-right py-2 font-semibold text-gray-600">Zlecen</th>
                      <th className="text-right py-2 font-semibold text-gray-600">Przychod</th>
                      <th className="text-right py-2 font-semibold text-gray-600">km</th>
                      <th className="text-right py-2 font-semibold text-gray-600">Przychod/km</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.revenue.by_employee.map(emp => (
                      <tr key={emp.employee_id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="py-2.5 font-medium text-gray-800">{emp.employee_name}</td>
                        <td className="py-2.5 text-right text-gray-600">{emp.orders_count}</td>
                        <td className="py-2.5 text-right font-bold text-gray-900">{emp.revenue.toLocaleString('pl-PL')} zl</td>
                        <td className="py-2.5 text-right text-gray-600">{emp.km_driven}</td>
                        <td className="py-2.5 text-right text-gray-600">
                          {emp.km_driven > 0 ? (emp.revenue / emp.km_driven).toFixed(1) : '—'} zl
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Daily trend */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardHeader><CardTitle className="text-base font-bold">Trend dzienny</CardTitle></CardHeader>
          <CardContent>
            {data.revenue.by_day.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Brak danych</p>
            ) : (
              <div className="flex items-end gap-1 h-48 overflow-x-auto pb-1">
                {data.revenue.by_day.map(day => (
                  <div key={day.date} className="flex flex-col items-center gap-1 flex-1 min-w-[24px]">
                    <span className="text-[9px] text-gray-400 font-medium">{day.revenue > 0 ? `${(day.revenue / 1000).toFixed(1)}k` : ''}</span>
                    <motion.div
                      className="w-full max-w-[24px] bg-gradient-to-t from-blue-500 to-blue-400 rounded-t"
                      initial={{ height: 0 }}
                      animate={{ height: `${(day.revenue / maxDayRevenue * 100)}%` }}
                      transition={{ duration: 0.5 }}
                      style={{ minHeight: day.revenue > 0 ? '4px' : '0px' }}
                    />
                    <span className="text-[10px] text-gray-400">{day.date.slice(8)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Costs breakdown */}
      <motion.div className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        variants={ANIM.container} initial="hidden" animate="show">
        {[
          {
            label: 'Paliwo',
            value: `${data.costs.fuel_cost.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zl`,
            sub: `${data.costs.total_km} km x 0.50 zl`,
            icon: Fuel,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
          {
            label: 'Robocizna',
            value: `${data.costs.labor_cost.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zl`,
            sub: `${data.costs.labor_hours} h`,
            icon: Briefcase,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
          },
          {
            label: 'Razem koszty',
            value: `${data.costs.total.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zl`,
            sub: 'paliwo + robocizna',
            icon: Wallet,
            color: 'text-red-600',
            bg: 'bg-red-50',
          },
        ].map(c => (
          <motion.div key={c.label} variants={ANIM.item}
            className={`${c.bg} rounded-2xl border border-gray-100 p-5`}>
            <div className="flex items-center gap-2 mb-2">
              <c.icon className={`h-5 w-5 ${c.color}`} />
              <p className="text-sm font-semibold text-gray-700">{c.label}</p>
            </div>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Profit summary */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <div className={`rounded-2xl p-6 bg-gradient-to-br ${data.margin.margin_pct >= 40 ? 'from-emerald-500 to-emerald-600' : data.margin.margin_pct >= 0 ? 'from-amber-500 to-amber-600' : 'from-red-500 to-red-600'} text-white shadow-lg relative overflow-hidden`}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-5 w-5 text-white/80" />
            <p className="text-sm font-semibold text-white/80">Podsumowanie zysku</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-white/60">Przychod</p>
              <p className="text-xl font-bold">{data.margin.gross_revenue.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zl</p>
            </div>
            <div>
              <p className="text-xs text-white/60">Koszty</p>
              <p className="text-xl font-bold">-{data.margin.total_costs.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zl</p>
            </div>
            <div>
              <p className="text-xs text-white/60">Zysk</p>
              <p className="text-3xl font-black">{data.margin.profit.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zl</p>
            </div>
            <div>
              <p className="text-xs text-white/60">Marza</p>
              <p className="text-3xl font-black">{data.margin.margin_pct}%</p>
            </div>
          </div>
          <DollarSign className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </div>
      </motion.div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [tab, setTab] = useState<'operational' | 'stats' | 'finance'>('operational');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [period, setPeriod] = useState('month');

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Raporty"
        subtitle="Centrum operacyjne i analityka"
        icon={<BarChart3 className="h-5 w-5" />}
      />

      <div className="p-6 space-y-5">
        {/* Tab + date selector row */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {[
              { key: 'operational', label: 'Operacyjny', icon: Activity },
              { key: 'stats',       label: 'Statystyki', icon: BarChart3 },
              { key: 'finance',     label: 'Finanse',    icon: Wallet },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as any)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t.key
                    ? 'bg-white shadow text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'operational' && (
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="text-sm bg-transparent outline-none text-gray-700 font-medium"
              />
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'operational' && (
            <motion.div key="op" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <OperationalView date={date} />
            </motion.div>
          )}
          {tab === 'stats' && (
            <motion.div key="st" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <StatisticsView period={period} onPeriodChange={setPeriod} />
            </motion.div>
          )}
          {tab === 'finance' && (
            <motion.div key="fin" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <FinanseView />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
