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
  MapPin, AlertTriangle, Activity, Zap, Navigation,
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [tab, setTab] = useState<'operational' | 'stats'>('operational');
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
        </AnimatePresence>
      </div>
    </div>
  );
}
