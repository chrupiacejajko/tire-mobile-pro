'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus, Clock, Calendar as CalendarIcon, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface CalendarOrder {
  id: string;
  client_name: string;
  service_names: string;
  scheduled_date: string;
  scheduled_time_start: string;
  scheduled_time_end: string;
  status: string;
  employee_name: string | null;
  employee_color: string;
}

const HOURS = Array.from({ length: 12 }, (_, i) => `${(i + 7).toString().padStart(2, '0')}:00`);

const statusColors: Record<string, string> = {
  new: 'bg-blue-400',
  assigned: 'bg-amber-400',
  in_progress: 'bg-violet-400',
  completed: 'bg-emerald-400',
  cancelled: 'bg-gray-300',
};

export default function CalendarPage() {
  const [orders, setOrders] = useState<CalendarOrder[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'week' | 'day' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const supabase = createClient();

  // Get week range
  const getWeekDates = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday
    start.setDate(diff);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  const weekDates = getWeekDates(currentDate);
  const weekStart = weekDates[0].toISOString().split('T')[0];
  const weekEnd = weekDates[6].toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    setLoading(true);

    const dateFilter = view === 'day'
      ? currentDate.toISOString().split('T')[0]
      : null;

    let query = supabase
      .from('orders')
      .select('id, scheduled_date, scheduled_time_start, scheduled_time_end, status, services, client:clients(name), employee:employees(user:profiles(full_name), region:regions(color))')
      .not('status', 'eq', 'cancelled')
      .order('scheduled_time_start');

    if (dateFilter) {
      query = query.eq('scheduled_date', dateFilter);
    } else {
      query = query.gte('scheduled_date', weekStart).lte('scheduled_date', weekEnd);
    }

    const { data } = await query;

    if (data) {
      setOrders(data.map((o: any) => ({
        id: o.id,
        client_name: o.client?.name || 'Nieznany',
        service_names: (o.services || []).map((s: any) => s.name).join(', '),
        scheduled_date: o.scheduled_date,
        scheduled_time_start: o.scheduled_time_start,
        scheduled_time_end: o.scheduled_time_end,
        status: o.status,
        employee_name: o.employee?.user?.full_name || null,
        employee_color: o.employee?.region?.color || '#3B82F6',
      })));
    }

    // Fetch employees for legend
    const { data: empData } = await supabase
      .from('employees')
      .select('id, user:profiles(full_name), region:regions(color)')
      .eq('is_active', true);

    if (empData) {
      setEmployees(empData.map((e: any) => ({
        id: e.id,
        name: e.user?.full_name || 'Nieznany',
        color: e.region?.color || '#3B82F6',
      })));
    }

    setLoading(false);
  }, [currentDate, view, weekStart, weekEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const navigateWeek = (dir: number) => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + (view === 'day' ? dir : dir * 7));
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  const formatWeekRange = () => {
    const s = weekDates[0];
    const e = weekDates[6];
    return `${s.getDate()} ${s.toLocaleDateString('pl', { month: 'short' })} - ${e.getDate()} ${e.toLocaleDateString('pl', { month: 'short' })} ${e.getFullYear()}`;
  };

  const getEventsForDateHour = (date: string, hourStart: number) => {
    return orders.filter(o => {
      if (o.scheduled_date !== date) return false;
      const [h] = (o.scheduled_time_start || '00:00').split(':').map(Number);
      return h === hourStart;
    });
  };

  const getEventDuration = (start: string, end: string) => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
  };

  const DAYS_PL = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Kalendarz"
        subtitle="Harmonogram zleceń"
        icon={<CalendarIcon className="h-5 w-5" />}
        actions={
          <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Nowe zlecenie
          </Button>
        }
      />
      <div className="p-6 space-y-4">
        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => navigateWeek(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-base font-bold min-w-[220px] text-center">
              {view === 'day' ? currentDate.toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' })
                : view === 'month' ? currentDate.toLocaleDateString('pl', { month: 'long', year: 'numeric' })
                : formatWeekRange()}
            </h2>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => navigateWeek(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="ml-2 h-8 rounded-lg text-xs" onClick={goToday}>Dziś</Button>
          </div>
          <div className="flex items-center gap-2">
            {/* Employee legend */}
            <div className="hidden lg:flex items-center gap-3 mr-4">
              {employees.map(emp => (
                <div key={emp.id} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: emp.color }} />
                  <span className="text-xs text-gray-500">{emp.name}</span>
                </div>
              ))}
            </div>
            <Select value={view} onValueChange={v => setView((v ?? 'week') as 'week' | 'day' | 'month')}>
              <SelectTrigger className="w-28 h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Dzień</SelectItem>
                <SelectItem value="week">Tydzień</SelectItem>
                <SelectItem value="month">Miesiąc</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Month View */}
        {view === 'month' && (
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-4">
              {(() => {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const firstDay = new Date(year, month, 1);
                const lastDay = new Date(year, month + 1, 0);
                const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
                const totalDays = lastDay.getDate();
                const weeks: (number | null)[][] = [];
                let week: (number | null)[] = Array(startPad).fill(null);
                for (let d = 1; d <= totalDays; d++) {
                  week.push(d);
                  if (week.length === 7) { weeks.push(week); week = []; }
                }
                if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

                return (
                  <div>
                    <div className="grid grid-cols-7 gap-1 mb-2">
                      {DAYS_PL.map(d => <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>)}
                    </div>
                    {weeks.map((w, wi) => (
                      <div key={wi} className="grid grid-cols-7 gap-1">
                        {w.map((day, di) => {
                          if (day === null) return <div key={di} className="min-h-[80px]" />;
                          const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                          const dayOrders = orders.filter(o => o.scheduled_date === dateStr);
                          const isToday = dateStr === new Date().toISOString().split('T')[0];
                          return (
                            <div key={di} className={`min-h-[80px] rounded-lg border p-1 ${isToday ? 'border-blue-300 bg-blue-50/50' : 'border-gray-100'}`}>
                              <p className={`text-xs font-medium mb-0.5 ${isToday ? 'text-blue-600' : 'text-gray-600'}`}>{day}</p>
                              {dayOrders.slice(0, 3).map(o => (
                                <div key={o.id} className={`${statusColors[o.status]} text-white rounded px-1 py-0.5 text-[9px] mb-0.5 truncate`}
                                  title={`${o.client_name} - ${o.service_names}`}>
                                  {o.scheduled_time_start?.slice(0, 5)} {o.client_name}
                                </div>
                              ))}
                              {dayOrders.length > 3 && <p className="text-[9px] text-gray-400">+{dayOrders.length - 3} więcej</p>}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Week/Day Calendar Grid */}
        {view !== 'month' && <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardContent className="p-0 overflow-auto">
            <div className="min-w-[800px]">
              {/* Header */}
              <div className={`grid border-b bg-gray-50/80 ${view === 'day' ? 'grid-cols-2' : 'grid-cols-8'}`}>
                <div className="p-3 text-center text-xs font-medium text-gray-400 border-r">
                  <Clock className="h-4 w-4 mx-auto" />
                </div>
                {(view === 'day' ? [currentDate] : weekDates).map((date, i) => {
                  const isToday = date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
                  return (
                    <div key={i} className="p-3 text-center border-r last:border-r-0">
                      <p className="text-xs font-medium text-gray-500">{DAYS_PL[date.getDay() === 0 ? 6 : date.getDay() - 1]}</p>
                      <p className={`text-lg font-bold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>{date.getDate()}</p>
                    </div>
                  );
                })}
              </div>

              {/* Time rows */}
              {HOURS.map((hour, hourIdx) => {
                const hourNum = hourIdx + 7;
                return (
                  <div key={hour} className={`grid border-b last:border-b-0 min-h-[56px] ${view === 'day' ? 'grid-cols-2' : 'grid-cols-8'}`}>
                    <div className="p-1.5 text-center text-[11px] text-gray-400 border-r flex items-start justify-center pt-1.5">
                      {hour}
                    </div>
                    {(view === 'day' ? [currentDate] : weekDates).map((date, dayIdx) => {
                      const dateStr = date.toISOString().split('T')[0];
                      const events = getEventsForDateHour(dateStr, hourNum);
                      return (
                        <div key={dayIdx} className="relative border-r last:border-r-0 p-0.5 min-h-[56px]">
                          {events.map(event => {
                            const duration = getEventDuration(event.scheduled_time_start, event.scheduled_time_end);
                            const startMin = Number((event.scheduled_time_start || '00:00').split(':')[1]);
                            return (
                              <motion.div
                                key={event.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={`${statusColors[event.status]} text-white rounded-lg px-2 py-1 text-[11px] cursor-pointer hover:opacity-90 transition-opacity absolute left-0.5 right-0.5`}
                                style={{
                                  height: `${Math.max(duration * 56 - 4, 24)}px`,
                                  top: `${(startMin / 60) * 56 + 2}px`,
                                  borderLeft: `3px solid ${event.employee_color}`,
                                }}
                                title={`${event.client_name} - ${event.service_names}`}
                              >
                                <p className="font-semibold truncate">{event.client_name}</p>
                                {duration >= 0.5 && <p className="truncate opacity-80">{event.service_names}</p>}
                              </motion.div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>}
      </div>
    </div>
  );
}
