'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { BarChart3, TrendingUp, DollarSign, Clock, Download, Users, Calendar, FileDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } },
  item: { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } },
};

export default function ReportsPage() {
  const [orders, setOrders] = useState<{ status: string; total_price: number; scheduled_date: string; services: { name: string; price: number }[] }[]>([]);
  const [period, setPeriod] = useState('month');
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

  // Service breakdown
  const serviceMap = new Map<string, { count: number; revenue: number }>();
  orders.filter(o => o.status === 'completed').forEach(o => {
    (o.services || []).forEach(s => {
      const existing = serviceMap.get(s.name) || { count: 0, revenue: 0 };
      serviceMap.set(s.name, { count: existing.count + 1, revenue: existing.revenue + Number(s.price) });
    });
  });
  const topServices = [...serviceMap.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 6);

  // Daily orders for chart
  const dailyMap = new Map<string, number>();
  orders.forEach(o => {
    dailyMap.set(o.scheduled_date, (dailyMap.get(o.scheduled_date) || 0) + 1);
  });
  const dailyData = [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const maxDaily = Math.max(...dailyData.map(d => d[1]), 1);

  const exportCSV = () => {
    const headers = 'Data,Status,Kwota,Usługi\n';
    const rows = orders.map(o => `${o.scheduled_date},${o.status},${o.total_price},"${(o.services || []).map(s => s.name).join(', ')}"`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raport-${period}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Raporty"
        subtitle="Analityka i statystyki"
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <Button variant="outline" className="h-9 rounded-xl text-sm gap-2" onClick={exportCSV}>
            <FileDown className="h-4 w-4" /> Eksportuj CSV
          </Button>
        }
      />
      <div className="p-6 space-y-6">
        {/* Period filter */}
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={v => setPeriod(v ?? 'month')}>
            <SelectTrigger className="w-40 h-9 rounded-xl">
              <Calendar className="mr-2 h-4 w-4" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Dziś</SelectItem>
              <SelectItem value="week">Ostatnie 7 dni</SelectItem>
              <SelectItem value="month">Ostatni miesiąc</SelectItem>
              <SelectItem value="quarter">Ostatni kwartał</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPIs */}
        <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" variants={ANIM.container} initial="hidden" animate="show">
          {[
            { label: 'Zlecenia', value: totalOrders.toString(), icon: BarChart3, color: 'from-blue-500 to-blue-600' },
            { label: 'Przychód', value: `${totalRevenue.toLocaleString()} zł`, icon: DollarSign, color: 'from-emerald-500 to-emerald-600' },
            { label: 'Śr. wartość zlecenia', value: `${avgOrderValue} zł`, icon: TrendingUp, color: 'from-violet-500 to-violet-600' },
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
          {/* Daily orders chart */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardHeader><CardTitle className="text-base font-bold">Zlecenia wg dnia</CardTitle></CardHeader>
              <CardContent>
                {dailyData.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">Brak danych w wybranym okresie</p>
                ) : (
                  <div className="flex items-end justify-between h-48 gap-1">
                    {dailyData.map(([date, count]) => (
                      <div key={date} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-[10px] text-gray-500 font-medium">{count}</span>
                        <motion.div
                          className="w-full max-w-[32px] bg-blue-500 rounded-t-lg"
                          initial={{ height: 0 }}
                          animate={{ height: `${(count / maxDaily) * 150}px` }}
                          transition={{ duration: 0.5, delay: 0.1 }}
                        />
                        <span className="text-[9px] text-gray-400">{date.slice(8)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Top services */}
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
                            <motion.div
                              className="h-2 rounded-full bg-blue-500"
                              initial={{ width: 0 }}
                              animate={{ width: `${(data.revenue / maxRev) * 100}%` }}
                              transition={{ duration: 0.6 }}
                            />
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
    </div>
  );
}
