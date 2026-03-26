'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ClipboardList, CheckCircle2, Clock, MapPin,
  Calendar, LayoutDashboard, Download, RefreshCw,
  GanttChartSquare, Users, Loader2, AlertCircle,
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
  inProgress: number;
  completed: number;
  unassigned: number;
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
  const [stats, setStats] = useState<DashStats>({ todayOrders: 0, inProgress: 0, completed: 0, unassigned: 0 });
  const [todayOrders, setTodayOrders] = useState<TodayOrder[]>([]);
  const [empStatuses, setEmpStatuses] = useState<EmployeeStatus[]>([]);
  const [recentActivity, setRecentActivity] = useState<{ text: string; time: string; dot: string }[]>([]);
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

    setStats({
      todayOrders: orders.length,
      inProgress: orders.filter((o: any) => o.status === 'in_progress').length,
      completed: orders.filter((o: any) => o.status === 'completed').length,
      unassigned: orders.filter((o: any) => o.status === 'new').length,
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

    // Employees for Zespół section
    const { data: empData } = await supabase
      .from('employees')
      .select('id, is_active, user:profiles(full_name), region:regions(name, color)')
      .eq('is_active', true);

    if (empData) {
      setEmpStatuses(empData.map((e: any) => ({
        name: e.user?.full_name || 'Nieznany',
        status: 'Dostępny',
        region: e.region?.name || '-',
        regionColor: e.region?.color || '#3B82F6',
      })));
    }

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

  // Silent refresh — used by GanttView D&D (no spinner, no unmount)
  const silentRefreshGantt = useCallback(async () => {
    try {
      const res = await fetch(`/api/planner?date=${today}`);
      if (res.ok) {
        const data = await res.json();
        setGanttRoutes(data.routes ?? []);
        setGanttUnassigned(data.unassigned ?? []);
      }
    } catch {}
  }, [today]);

  useEffect(() => {
    fetchDashboard();
    fetchGantt();

    // Realtime — auto-update when any order changes
    const channel = supabase
      .channel('dashboard-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchDashboard();
        silentRefreshGantt(); // silent — nie odmountowuje GanttView
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchDashboard, fetchGantt, silentRefreshGantt]);

  const statCards = [
    {
      title: 'Zlecenia dziś',
      value: stats.todayOrders.toString(),
      subtitle: stats.todayOrders > 0 ? `${stats.completed} ukończonych, ${stats.unassigned} nowych` : 'Brak zleceń',
      gradient: 'from-blue-500 to-blue-600',
      icon: ClipboardList,
    },
    {
      title: 'W trakcie',
      value: stats.inProgress.toString(),
      subtitle: stats.inProgress > 0 ? 'aktywne realizacje' : 'brak aktywnych',
      gradient: 'from-orange-500 to-orange-600',
      icon: Loader2,
    },
    {
      title: 'Zakończone dziś',
      value: stats.completed.toString(),
      subtitle: stats.todayOrders > 0 ? `${Math.round((stats.completed / stats.todayOrders) * 100)}% skuteczności` : '0% skuteczności',
      gradient: 'from-emerald-500 to-emerald-600',
      icon: CheckCircle2,
    },
    {
      title: 'Nieprzypisane',
      value: stats.unassigned.toString(),
      subtitle: stats.unassigned > 0 ? 'wymagają przydzielenia' : 'wszystko przydzielone',
      gradient: stats.unassigned > 0 ? 'from-rose-500 to-rose-600' : 'from-slate-400 to-slate-500',
      icon: AlertCircle,
    },
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

        {/* Row 2: Gantt (full width) */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
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
              {/*
                GanttView is ALWAYS mounted once the card renders — this prevents
                the "widget refresh" flash. Loading and empty states are overlays,
                not conditional unmounts.
              */}
              <div className="relative">
                {/* Always-mounted GanttView */}
                <div className={`overflow-x-auto ${ganttRoutes.length === 0 ? 'invisible h-0 overflow-hidden' : ''}`}>
                  <GanttView
                    routes={ganttRoutes}
                    unassigned={ganttUnassigned}
                    date={today}
                    onRefresh={silentRefreshGantt}
                  />
                </div>
                {/* Overlays — shown on top when no data yet */}
                {ganttLoading && ganttRoutes.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-gray-400 gap-2 text-sm">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Ładowanie harmonogramu…
                  </div>
                )}
                {!ganttLoading && ganttRoutes.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-1">
                    <GanttChartSquare className="h-8 w-8 opacity-30" />
                    <p className="text-sm">Brak tras na dziś</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Row 3: Zespół (full width, horizontal grid) */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2"><Users className="h-4 w-4" /> Zespół</CardTitle>
            </CardHeader>
            <CardContent>
              {empStatuses.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Brak pracowników</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {empStatuses.map((emp, i) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-2.5">
                      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: emp.regionColor }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{emp.name}</p>
                        <p className="text-xs text-gray-400 truncate">{emp.region}</p>
                      </div>
                      <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded-full flex-shrink-0">●</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Row 4: Today's Orders + Activity */}
        <motion.div className="grid grid-cols-1 gap-6 lg:grid-cols-3"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
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
