'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ClipboardList, CheckCircle2, Users, DollarSign, Clock, MapPin,
  Calendar, LayoutDashboard, Download, RefreshCw,
  GanttChartSquare,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { GanttView } from '../planner/_components/GanttView';
import type { EmployeeRoute, UnassignedOrder } from '../planner/_components/types';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } },
  item: { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } },
};

interface DashStats {
  todayOrders: number;
  completedToday: number;
  activeEmployees: number;
  revenueToday: number;
}

interface TodayOrder {
  id: string;
  client_name: string;
  service_names: string;
  time: string;
  employee_name: string;
  status: string;
  address: string;
  priority: string;
}

interface EmployeeStatus {
  name: string;
  status: string;
  region: string;
  regionColor: string;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  new: { label: 'Nowe', color: 'bg-blue-100 text-blue-700' },
  assigned: { label: 'Przydzielone', color: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'W trakcie', color: 'bg-violet-100 text-violet-700' },
  completed: { label: 'Ukończone', color: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Anulowane', color: 'bg-red-100 text-red-700' },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashStats>({ todayOrders: 0, completedToday: 0, activeEmployees: 0, revenueToday: 0 });
  const [todayOrders, setTodayOrders] = useState<TodayOrder[]>([]);
  const [empStatuses, setEmpStatuses] = useState<EmployeeStatus[]>([]);
  const [recentActivity, setRecentActivity] = useState<{ text: string; time: string; dot: string }[]>([]);
  const [weeklyData, setWeeklyData] = useState<{ day: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Gantt state ──
  const [ganttRoutes, setGanttRoutes] = useState<EmployeeRoute[]>([]);
  const [ganttUnassigned, setGanttUnassigned] = useState<UnassignedOrder[]>([]);
  const [ganttLoading, setGanttLoading] = useState(true);
  const today = new Date().toISOString().split('T')[0];

  const supabase = createClient();

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    // Today's orders
    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, status, priority, total_price, scheduled_time_start, scheduled_time_end, address, services, client:clients(name), employee:employees(user:profiles(full_name))')
      .eq('scheduled_date', today)
      .order('scheduled_time_start');

    const orders = ordersData || [];
    const completed = orders.filter(o => o.status === 'completed');
    const revenue = completed.reduce((s, o) => s + Number(o.total_price), 0);

    setStats({
      todayOrders: orders.length,
      completedToday: completed.length,
      activeEmployees: 0,
      revenueToday: revenue,
    });

    setTodayOrders(orders.map((o: any) => ({
      id: o.id,
      client_name: o.client?.name || 'Nieznany',
      service_names: (o.services || []).map((s: any) => s.name).join(', '),
      time: `${(o.scheduled_time_start || '').slice(0, 5)}-${(o.scheduled_time_end || '').slice(0, 5)}`,
      employee_name: o.employee?.user?.full_name || 'Nieprzydzielone',
      status: o.status,
      address: o.address,
      priority: o.priority,
    })));

    // Active employees
    const { data: empData } = await supabase
      .from('employees')
      .select('id, is_active, user:profiles(full_name), region:regions(name, color)')
      .eq('is_active', true);

    if (empData) {
      setStats(prev => ({ ...prev, activeEmployees: empData.length }));
      setEmpStatuses(empData.map((e: any) => ({
        name: e.user?.full_name || 'Nieznany',
        status: 'Dostępny',
        region: e.region?.name || '-',
        regionColor: e.region?.color || '#3B82F6',
      })));
    }

    // Weekly orders for chart
    const weekData: { day: string; count: number }[] = [];
    const dayLabels = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('scheduled_date', dateStr);
      weekData.push({ day: dayLabels[dayIdx], count: count || 0 });
    }
    setWeeklyData(weekData);

    // Recent orders (activity)
    const { data: recentData } = await supabase
      .from('orders')
      .select('status, created_at, client:clients(name)')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentData) {
      setRecentActivity(recentData.map((o: any) => {
        const ago = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
        const timeStr = ago < 60 ? `${ago} min temu` : ago < 1440 ? `${Math.round(ago / 60)} godz. temu` : `${Math.round(ago / 1440)} dni temu`;
        return {
          text: `${o.status === 'new' ? 'Nowe zlecenie' : o.status === 'completed' ? 'Ukończono' : 'Aktualizacja'}: ${o.client?.name || 'Nieznany'}`,
          time: timeStr,
          dot: o.status === 'completed' ? 'bg-emerald-500' : o.status === 'new' ? 'bg-blue-500' : 'bg-amber-500',
        };
      }));
    }

    setLoading(false);
  }, []);

  const fetchGantt = useCallback(async () => {
    setGanttLoading(true);
    try {
      const res = await fetch(`/api/planner?date=${today}`);
      if (res.ok) {
        const data = await res.json();
        setGanttRoutes(data.routes ?? []);
        setGanttUnassigned(data.unassigned ?? []);
      }
    } finally {
      setGanttLoading(false);
    }
  }, [today]);

  useEffect(() => {
    fetchDashboard();
    fetchGantt();

    // Realtime — auto-update when any order changes
    const channel = supabase
      .channel('dashboard-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchDashboard();
        fetchGantt();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchDashboard, fetchGantt]);

  const maxWeekly = Math.max(...weeklyData.map(d => d.count), 1);

  const statCards = [
    { title: 'Zlecenia dziś', value: stats.todayOrders.toString(), subtitle: `${stats.completedToday} ukończonych`, gradient: 'from-blue-500 to-blue-600', icon: ClipboardList },
    { title: 'Ukończone', value: stats.completedToday.toString(), subtitle: stats.todayOrders > 0 ? `${Math.round((stats.completedToday / stats.todayOrders) * 100)}% skuteczności` : '0%', gradient: 'from-emerald-500 to-emerald-600', icon: CheckCircle2 },
    { title: 'Pracownicy', value: stats.activeEmployees.toString(), subtitle: 'aktywnych w zespole', gradient: 'from-violet-500 to-violet-600', icon: Users },
    { title: 'Przychód dziś', value: `${stats.revenueToday.toLocaleString()} zł`, subtitle: 'z ukończonych zleceń', gradient: 'from-rose-500 to-rose-600', icon: DollarSign },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Dashboard"
        subtitle="Witaj z powrotem w RouteTire"
        icon={<LayoutDashboard className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
            <Button variant="outline" className="h-9 rounded-xl text-sm gap-2"><Download className="h-4 w-4" /> Eksport</Button>
          </div>
        }
      />
      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" variants={ANIM.container} initial="hidden" animate="show">
          {statCards.map(stat => (
            <motion.div key={stat.title} variants={ANIM.item} whileHover={{ scale: 1.02, y: -2 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${stat.gradient} p-5 text-white shadow-lg cursor-pointer`}>
              <div className="relative z-10">
                <p className="text-sm font-medium text-white/80">{stat.title}</p>
                <p className="mt-2 text-3xl font-bold">{loading ? '...' : stat.value}</p>
                <p className="mt-1 text-xs text-white/70">{stat.subtitle}</p>
              </div>
              <stat.icon className="absolute -right-2 -bottom-2 h-20 w-20 text-white/10" />
            </motion.div>
          ))}
        </motion.div>

        {/* Row 2: Weekly chart + Employees */}
        <motion.div className="grid grid-cols-1 gap-6 lg:grid-cols-3"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
          <Card className="lg:col-span-2 rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold">Zlecenia - ostatnie 7 dni</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between h-44 pt-4 gap-3">
                {weeklyData.map((d, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-[10px] text-gray-500 font-medium">{d.count}</span>
                    <motion.div
                      className="w-full max-w-[40px] bg-blue-500 rounded-t-lg"
                      initial={{ height: 0 }}
                      animate={{ height: `${(d.count / maxWeekly) * 140}px` }}
                      transition={{ duration: 0.5, delay: i * 0.05 }}
                    />
                    <span className="text-xs text-gray-500">{d.day}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2"><Users className="h-4 w-4" /> Zespół</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {empStatuses.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Brak pracowników</p>
              ) : empStatuses.map((emp, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: emp.regionColor }} />
                    <div>
                      <p className="text-sm font-medium">{emp.name}</p>
                      <p className="text-xs text-gray-400">{emp.region}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">{emp.status}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Row 3: Gantt timeline */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
          <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between py-3 px-5 border-b border-gray-100">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <GanttChartSquare className="h-4 w-4 text-blue-500" />
                Harmonogram dziś
                <Badge variant="outline" className="rounded-lg text-xs font-normal">
                  {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
                </Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl text-gray-400 hover:text-gray-700"
                onClick={fetchGantt}
                disabled={ganttLoading}
              >
                <RefreshCw className={`h-4 w-4 ${ganttLoading ? 'animate-spin' : ''}`} />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {ganttLoading ? (
                <div className="flex items-center justify-center h-32 text-gray-400 gap-2 text-sm">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Ładowanie harmonogramu…
                </div>
              ) : ganttRoutes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-1">
                  <GanttChartSquare className="h-8 w-8 opacity-30" />
                  <p className="text-sm">Brak tras na dziś</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <GanttView
                    routes={ganttRoutes}
                    unassigned={ganttUnassigned}
                    date={today}
                    onRefresh={fetchGantt}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Row 4: Today's Orders + Activity */}
        <motion.div className="grid grid-cols-1 gap-6 lg:grid-cols-3"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.55 }}>
          <Card className="lg:col-span-2 rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2"><Calendar className="h-4 w-4" /> Dzisiejsze zlecenia</CardTitle>
              <Badge variant="outline" className="rounded-lg">{todayOrders.length}</Badge>
            </CardHeader>
            <CardContent>
              {todayOrders.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Brak zleceń na dziś</p>
              ) : (
                <div className="space-y-2">
                  {todayOrders.map(order => {
                    const s = statusLabels[order.status] || statusLabels.new;
                    return (
                      <div key={order.id} className="flex items-center justify-between rounded-xl border border-gray-100 p-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="text-center min-w-[50px]">
                            <Clock className="h-3.5 w-3.5 text-gray-400 mx-auto" />
                            <p className="text-[11px] font-medium text-gray-600 mt-0.5">{order.time}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">{order.client_name}</p>
                            <p className="text-xs text-gray-500 truncate max-w-[200px]">{order.service_names}</p>
                            <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{order.address}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{order.employee_name}</span>
                          <Badge className={`text-[10px] rounded-lg ${s.color}`}>{s.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Ostatnia aktywność</CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Brak aktywności</p>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map((a, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`mt-1.5 h-2 w-2 rounded-full ${a.dot} shrink-0`} />
                      <div>
                        <p className="text-sm text-gray-700">{a.text}</p>
                        <p className="text-xs text-gray-400">{a.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
