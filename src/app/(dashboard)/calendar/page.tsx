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
import { ChevronLeft, ChevronRight, Plus, Clock, Calendar as CalendarIcon, User, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface CalendarOrder {
  id: string;
  client_name: string;
  service_names: string;
  scheduled_date: string;
  scheduled_time_start: string;
  scheduled_time_end: string;
  status: string;
  employee_id: string | null;
  employee_name: string | null;
  employee_color: string;
}

interface EmployeeCol {
  id: string;
  name: string;
  color: string;
  region: string;
}

const HOURS = Array.from({ length: 12 }, (_, i) => `${(i + 7).toString().padStart(2, '0')}:00`);
const DAYS_PL = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

const statusColors: Record<string, string> = {
  new: 'bg-blue-400',
  assigned: 'bg-amber-400',
  in_progress: 'bg-violet-400',
  completed: 'bg-emerald-400',
  cancelled: 'bg-gray-300',
};

const statusBorders: Record<string, string> = {
  new: 'border-l-blue-600',
  assigned: 'border-l-amber-600',
  in_progress: 'border-l-violet-600',
  completed: 'border-l-emerald-600',
  cancelled: 'border-l-gray-500',
};

export default function CalendarPage() {
  const [orders, setOrders] = useState<CalendarOrder[]>([]);
  const [employees, setEmployees] = useState<EmployeeCol[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'team' | 'week' | 'month'>('team');
  const [currentDate, setCurrentDate] = useState(new Date());
  const supabase = createClient();

  const dateStr = currentDate.toISOString().split('T')[0];

  const getWeekDates = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
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

    let query = supabase
      .from('orders')
      .select('id, scheduled_date, scheduled_time_start, scheduled_time_end, status, services, employee_id, client:clients(name), employee:employees(user:profiles(full_name), region:regions(color))')
      .not('status', 'eq', 'cancelled')
      .order('scheduled_time_start');

    if (view === 'team') {
      query = query.eq('scheduled_date', dateStr);
    } else if (view === 'week') {
      query = query.gte('scheduled_date', weekStart).lte('scheduled_date', weekEnd);
    } else {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = `${year}-${(month + 1).toString().padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0);
      const lastDayStr = lastDay.toISOString().split('T')[0];
      query = query.gte('scheduled_date', firstDay).lte('scheduled_date', lastDayStr);
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
        employee_id: o.employee_id,
        employee_name: o.employee?.user?.full_name || null,
        employee_color: o.employee?.region?.color || '#94A3B8',
      })));
    }

    const { data: empData } = await supabase
      .from('employees')
      .select('id, user:profiles(full_name), region:regions(name, color)')
      .eq('is_active', true);

    if (empData) {
      setEmployees(empData.map((e: any) => ({
        id: e.id,
        name: e.user?.full_name || 'Nieznany',
        color: e.region?.color || '#94A3B8',
        region: e.region?.name || '',
      })));
    }

    setLoading(false);
  }, [currentDate, view, dateStr, weekStart, weekEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const navigate = (dir: number) => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  };

  const getTitle = () => {
    if (view === 'team') return currentDate.toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (view === 'month') return currentDate.toLocaleDateString('pl', { month: 'long', year: 'numeric' });
    const s = weekDates[0]; const e = weekDates[6];
    return `${s.getDate()} ${s.toLocaleDateString('pl', { month: 'short' })} - ${e.getDate()} ${e.toLocaleDateString('pl', { month: 'short' })} ${e.getFullYear()}`;
  };

  const getEventsForEmployeeHour = (empId: string, hourNum: number) => {
    return orders.filter(o => {
      if (o.employee_id !== empId) return false;
      const [h] = (o.scheduled_time_start || '00:00').split(':').map(Number);
      return h === hourNum;
    });
  };

  const getEventsForDateHour = (date: string, hourNum: number) => {
    return orders.filter(o => {
      if (o.scheduled_date !== date) return false;
      const [h] = (o.scheduled_time_start || '00:00').split(':').map(Number);
      return h === hourNum;
    });
  };

  const getEventHeight = (start: string, end: string) => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return Math.max(((eh * 60 + em) - (sh * 60 + sm)) / 60, 0.4);
  };

  const unassigned = orders.filter(o => !o.employee_id);

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Kalendarz"
        subtitle="Harmonogram zleceń"
        icon={<CalendarIcon className="h-5 w-5" />}
        actions={
          <Button className="h-9 rounded-xl text-sm gap-2 bg-orange-500 hover:bg-orange-600">
            <Plus className="h-4 w-4" /> Nowe zlecenie
          </Button>
        }
      />
      <div className="p-6 space-y-4">
        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-base font-bold min-w-[200px] text-center">{getTitle()}</h2>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="ml-2 h-8 rounded-lg text-xs" onClick={() => setCurrentDate(new Date())}>Dziś</Button>
          </div>
          <div className="flex items-center gap-2">
            {/* Employee legend */}
            <div className="hidden xl:flex items-center gap-3 mr-4">
              {employees.map(emp => (
                <div key={emp.id} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: emp.color }} />
                  <span className="text-xs text-gray-500">{emp.name}</span>
                </div>
              ))}
            </div>
            <Select value={view} onValueChange={v => setView((v ?? 'team') as 'team' | 'week' | 'month')}>
              <SelectTrigger className="w-36 h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="team">Zespół (dzień)</SelectItem>
                <SelectItem value="week">Tydzień</SelectItem>
                <SelectItem value="month">Miesiąc</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Unassigned orders alert */}
        {unassigned.length > 0 && view === 'team' && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">{unassigned.length} nieprzydzielone zlecenia</span>
              <span className="text-xs text-amber-600">
                {unassigned.map(o => `${o.client_name} (${(o.scheduled_time_start || '').slice(0, 5)})`).join(' · ')}
              </span>
            </div>
          </div>
        )}

        {/* ===== TEAM VIEW (per employee) ===== */}
        {view === 'team' && (
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-0 overflow-auto">
              <div className="min-w-[700px]">
                {/* Header: hours + employee columns */}
                <div className={`grid border-b bg-gray-50/80`} style={{ gridTemplateColumns: `60px repeat(${employees.length}, 1fr)` }}>
                  <div className="p-3 text-center text-xs font-medium text-gray-400 border-r">
                    <Clock className="h-4 w-4 mx-auto" />
                  </div>
                  {employees.map(emp => (
                    <div key={emp.id} className="p-3 text-center border-r last:border-r-0">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: emp.color }} />
                        <p className="text-sm font-bold text-gray-900">{emp.name}</p>
                      </div>
                      <p className="text-[11px] text-gray-400">{emp.region}</p>
                    </div>
                  ))}
                </div>

                {/* Time rows */}
                {HOURS.map((hour, hourIdx) => {
                  const hourNum = hourIdx + 7;
                  return (
                    <div key={hour} className={`grid border-b last:border-b-0 min-h-[56px]`} style={{ gridTemplateColumns: `60px repeat(${employees.length}, 1fr)` }}>
                      <div className="p-1.5 text-center text-[11px] text-gray-400 border-r flex items-start justify-center pt-1.5">{hour}</div>
                      {employees.map(emp => {
                        const events = getEventsForEmployeeHour(emp.id, hourNum);
                        return (
                          <div key={emp.id} className="relative border-r last:border-r-0 p-0.5 min-h-[56px]">
                            {events.map(event => {
                              const duration = getEventHeight(event.scheduled_time_start, event.scheduled_time_end);
                              const startMin = Number((event.scheduled_time_start || '00:00').split(':')[1]);
                              return (
                                <motion.div
                                  key={event.id}
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className={`${statusColors[event.status]} text-white rounded-lg px-2 py-1 text-[11px] cursor-pointer hover:opacity-90 absolute left-0.5 right-0.5 border-l-4 ${statusBorders[event.status]}`}
                                  style={{
                                    height: `${Math.max(duration * 56 - 4, 24)}px`,
                                    top: `${(startMin / 60) * 56 + 2}px`,
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
          </Card>
        )}

        {/* ===== WEEK VIEW ===== */}
        {view === 'week' && (
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-0 overflow-auto">
              <div className="min-w-[800px]">
                <div className="grid grid-cols-8 border-b bg-gray-50/80">
                  <div className="p-3 text-center text-xs font-medium text-gray-400 border-r"><Clock className="h-4 w-4 mx-auto" /></div>
                  {weekDates.map((date, i) => {
                    const isToday = date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
                    return (
                      <div key={i} className="p-3 text-center border-r last:border-r-0">
                        <p className="text-xs font-medium text-gray-500">{DAYS_PL[i]}</p>
                        <p className={`text-lg font-bold ${isToday ? 'text-orange-600' : 'text-gray-900'}`}>{date.getDate()}</p>
                      </div>
                    );
                  })}
                </div>
                {HOURS.map((hour, hourIdx) => {
                  const hourNum = hourIdx + 7;
                  return (
                    <div key={hour} className="grid grid-cols-8 border-b last:border-b-0 min-h-[56px]">
                      <div className="p-1.5 text-center text-[11px] text-gray-400 border-r flex items-start justify-center pt-1.5">{hour}</div>
                      {weekDates.map((date, dayIdx) => {
                        const ds = date.toISOString().split('T')[0];
                        const events = getEventsForDateHour(ds, hourNum);
                        return (
                          <div key={dayIdx} className="relative border-r last:border-r-0 p-0.5 min-h-[56px]">
                            {events.map(event => {
                              const duration = getEventHeight(event.scheduled_time_start, event.scheduled_time_end);
                              const startMin = Number((event.scheduled_time_start || '00:00').split(':')[1]);
                              return (
                                <motion.div
                                  key={event.id}
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className={`${statusColors[event.status]} text-white rounded-lg px-2 py-1 text-[11px] cursor-pointer hover:opacity-90 absolute left-0.5 right-0.5`}
                                  style={{
                                    height: `${Math.max(duration * 56 - 4, 24)}px`,
                                    top: `${(startMin / 60) * 56 + 2}px`,
                                    borderLeft: `3px solid ${event.employee_color}`,
                                  }}
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
          </Card>
        )}

        {/* ===== MONTH VIEW ===== */}
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
                          const ds = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                          const dayOrders = orders.filter(o => o.scheduled_date === ds);
                          const isToday = ds === new Date().toISOString().split('T')[0];
                          return (
                            <div key={di} className={`min-h-[80px] rounded-lg border p-1 ${isToday ? 'border-orange-300 bg-orange-50/50' : 'border-gray-100'}`}>
                              <p className={`text-xs font-medium mb-0.5 ${isToday ? 'text-orange-600' : 'text-gray-600'}`}>{day}</p>
                              {dayOrders.slice(0, 3).map(o => (
                                <div key={o.id} className={`${statusColors[o.status]} text-white rounded px-1 py-0.5 text-[9px] mb-0.5 truncate`}>
                                  {(o.scheduled_time_start || '').slice(0, 5)} {o.client_name}
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
      </div>
    </div>
  );
}
