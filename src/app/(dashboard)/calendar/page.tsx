'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, Plus, Clock, Calendar as CalendarIcon,
  User, Users, MapPin, Phone, AlertTriangle, Zap, X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface CalendarOrder {
  id: string;
  client_name: string;
  client_phone: string;
  service_names: string;
  scheduled_date: string;
  scheduled_time_start: string;
  scheduled_time_end: string;
  status: string;
  priority: string;
  address: string;
  total_price: number;
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

interface ClientOption { id: string; name: string; phone: string; address: string; city: string; }
interface ServiceOption { id: string; name: string; price: number; duration_minutes: number; }

const HOURS = Array.from({ length: 12 }, (_, i) => `${(i + 7).toString().padStart(2, '0')}:00`);
const ROW_H = 60; // px per hour row
const DAYS_PL = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

const statusConfig: Record<string, { bg: string; border: string; label: string; dot: string }> = {
  new: { bg: 'bg-blue-400', border: 'border-l-blue-600', label: 'Nowe', dot: 'bg-blue-500' },
  assigned: { bg: 'bg-amber-400', border: 'border-l-amber-600', label: 'Przydzielone', dot: 'bg-amber-500' },
  in_progress: { bg: 'bg-violet-400', border: 'border-l-violet-600', label: 'W trakcie', dot: 'bg-violet-500' },
  completed: { bg: 'bg-emerald-400', border: 'border-l-emerald-600', label: 'Ukończone', dot: 'bg-emerald-500' },
  cancelled: { bg: 'bg-gray-300', border: 'border-l-gray-500', label: 'Anulowane', dot: 'bg-gray-400' },
};

export default function CalendarPage() {
  const [orders, setOrders] = useState<CalendarOrder[]>([]);
  const [employees, setEmployees] = useState<EmployeeCol[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'team' | 'week' | 'month'>('team');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedOrder, setSelectedOrder] = useState<CalendarOrder | null>(null);
  const [newOrderDialog, setNewOrderDialog] = useState(false);
  const [newOrderTime, setNewOrderTime] = useState('08:00');
  const [newOrderEmpId, setNewOrderEmpId] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ client_id: '', scheduled_date: '', scheduled_time_start: '08:00', address: '', priority: 'normal', notes: '', service_ids: [] as string[] });

  const supabase = createClient();
  const router = useRouter();
  const dateStr = currentDate.toISOString().split('T')[0];

  // Current time indicator
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const nowTop = (nowHour - 7) * ROW_H;
  const isToday = dateStr === new Date().toISOString().split('T')[0];

  const getWeekDates = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  };
  const weekDates = getWeekDates(currentDate);
  const weekStart = weekDates[0].toISOString().split('T')[0];
  const weekEnd = weekDates[6].toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('id, scheduled_date, scheduled_time_start, scheduled_time_end, status, priority, services, employee_id, address, total_price, client:clients(name, phone), employee:employees(user:profiles(full_name), region:regions(color))')
      .not('status', 'eq', 'cancelled')
      .order('scheduled_time_start');

    if (view === 'team') query = query.eq('scheduled_date', dateStr);
    else if (view === 'week') query = query.gte('scheduled_date', weekStart).lte('scheduled_date', weekEnd);
    else {
      const y = currentDate.getFullYear(), m = currentDate.getMonth();
      query = query.gte('scheduled_date', `${y}-${(m+1).toString().padStart(2,'0')}-01`).lte('scheduled_date', new Date(y, m+1, 0).toISOString().split('T')[0]);
    }

    const [ordersRes, empRes, clientsRes, servicesRes] = await Promise.all([
      query,
      supabase.from('employees').select('id, user:profiles(full_name), region:regions(name, color)').eq('is_active', true),
      supabase.from('clients').select('id, name, phone, address, city').order('name'),
      supabase.from('services').select('id, name, price, duration_minutes').eq('is_active', true),
    ]);

    if (ordersRes.data) {
      setOrders(ordersRes.data.map((o: any) => ({
        id: o.id, client_name: o.client?.name || 'Nieznany', client_phone: o.client?.phone || '',
        service_names: (o.services || []).map((s: any) => s.name).join(', '),
        scheduled_date: o.scheduled_date, scheduled_time_start: o.scheduled_time_start,
        scheduled_time_end: o.scheduled_time_end, status: o.status, priority: o.priority,
        address: o.address, total_price: Number(o.total_price),
        employee_id: o.employee_id, employee_name: o.employee?.user?.full_name || null,
        employee_color: o.employee?.region?.color || '#94A3B8',
      })));
    }
    if (empRes.data) setEmployees(empRes.data.map((e: any) => ({ id: e.id, name: e.user?.full_name || '?', color: e.region?.color || '#94A3B8', region: e.region?.name || '' })));
    if (clientsRes.data) setClients(clientsRes.data as ClientOption[]);
    if (servicesRes.data) setServices(servicesRes.data as ServiceOption[]);
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
    return `${weekDates[0].getDate()} ${weekDates[0].toLocaleDateString('pl', { month: 'short' })} - ${weekDates[6].getDate()} ${weekDates[6].toLocaleDateString('pl', { month: 'short' })} ${weekDates[6].getFullYear()}`;
  };

  const getEvents = (empId: string | null, dateFilter: string | null, hourNum: number) => {
    return orders.filter(o => {
      if (empId && o.employee_id !== empId) return false;
      if (dateFilter && o.scheduled_date !== dateFilter) return false;
      const [h] = (o.scheduled_time_start || '00:00').split(':').map(Number);
      return h === hourNum;
    });
  };

  const getDuration = (start: string, end: string) => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return Math.max(((eh * 60 + em) - (sh * 60 + sm)) / 60, 0.4);
  };

  const unassigned = orders.filter(o => !o.employee_id);

  // Quick assign unassigned order to employee
  const quickAssign = async (orderId: string, empId: string) => {
    await supabase.from('orders').update({ employee_id: empId, status: 'assigned' }).eq('id', orderId);
    fetchData();
  };

  // Create new order from calendar
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const selectedServices = services.filter(s => form.service_ids.includes(s.id));
    const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
    const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);
    const [h, m] = form.scheduled_time_start.split(':').map(Number);
    const endMin = h * 60 + m + totalDuration;
    const endTime = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`;
    const client = clients.find(c => c.id === form.client_id);

    await supabase.from('orders').insert({
      client_id: form.client_id,
      employee_id: newOrderEmpId || null,
      status: newOrderEmpId ? 'assigned' : 'new',
      priority: form.priority,
      scheduled_date: form.scheduled_date || dateStr,
      scheduled_time_start: form.scheduled_time_start,
      scheduled_time_end: endTime,
      address: form.address || (client ? `${client.address}, ${client.city}` : ''),
      services: selectedServices.map(s => ({ service_id: s.id, name: s.name, price: Number(s.price), quantity: 1 })),
      total_price: totalPrice,
      notes: form.notes || null,
    });

    setSaving(false);
    setNewOrderDialog(false);
    setForm({ client_id: '', scheduled_date: '', scheduled_time_start: '08:00', address: '', priority: 'normal', notes: '', service_ids: [] });
    setNewOrderEmpId('');
    fetchData();
  };

  const openNewOrder = (time?: string, empId?: string) => {
    setForm({ ...form, scheduled_time_start: time || '08:00', scheduled_date: dateStr });
    setNewOrderEmpId(empId || '');
    setNewOrderDialog(true);
  };

  // Stats
  const dayStats = useMemo(() => {
    const total = orders.length;
    const completed = orders.filter(o => o.status === 'completed').length;
    const empLoad = employees.map(e => ({ name: e.name, count: orders.filter(o => o.employee_id === e.id).length }));
    return { total, completed, empLoad };
  }, [orders, employees]);

  // Render event block
  const renderEvent = (event: CalendarOrder, showEmployee = false) => {
    const duration = getDuration(event.scheduled_time_start, event.scheduled_time_end);
    const startMin = Number((event.scheduled_time_start || '00:00').split(':')[1]);
    const cfg = statusConfig[event.status] || statusConfig.new;
    return (
      <motion.div
        key={event.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.02, zIndex: 10 }}
        onClick={() => setSelectedOrder(event)}
        className={`${cfg.bg} text-white rounded-lg px-2 py-1 text-[11px] cursor-pointer absolute left-0.5 right-0.5 border-l-4 ${cfg.border} overflow-hidden shadow-sm hover:shadow-md transition-shadow`}
        style={{
          height: `${Math.max(duration * ROW_H - 4, 24)}px`,
          top: `${(startMin / 60) * ROW_H + 2}px`,
        }}
      >
        <p className="font-semibold truncate">{event.client_name}</p>
        {duration >= 0.5 && <p className="truncate opacity-80">{event.service_names}</p>}
        {showEmployee && event.employee_name && duration >= 0.7 && (
          <p className="truncate opacity-70 text-[10px]">{event.employee_name}</p>
        )}
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Kalendarz"
        subtitle="Harmonogram zleceń"
        icon={<CalendarIcon className="h-5 w-5" />}
        actions={
          <Button className="h-9 rounded-xl text-sm gap-2 bg-orange-500 hover:bg-orange-600" onClick={() => openNewOrder()}>
            <Plus className="h-4 w-4" /> Nowe zlecenie
          </Button>
        }
      />
      <div className="p-6 space-y-4">
        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="text-base font-bold min-w-[200px] text-center">{getTitle()}</h2>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" className="ml-2 h-8 rounded-lg text-xs" onClick={() => setCurrentDate(new Date())}>Dziś</Button>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Day stats bar (team view) */}
        {view === 'team' && !loading && (
          <div className="flex items-center gap-4 text-sm">
            <Badge variant="outline" className="rounded-lg gap-1.5 py-1"><CalendarIcon className="h-3 w-3" /> {dayStats.total} zleceń</Badge>
            <Badge variant="outline" className="rounded-lg gap-1.5 py-1 text-emerald-700 border-emerald-200 bg-emerald-50">{dayStats.completed} ukończonych</Badge>
            {unassigned.length > 0 && <Badge variant="outline" className="rounded-lg gap-1.5 py-1 text-amber-700 border-amber-200 bg-amber-50"><AlertTriangle className="h-3 w-3" /> {unassigned.length} nieprzydzielonych</Badge>}
            <div className="hidden lg:flex items-center gap-3 ml-auto">
              {dayStats.empLoad.map(e => (
                <span key={e.name} className="text-xs text-gray-500">{e.name}: <strong>{e.count}</strong></span>
              ))}
            </div>
          </div>
        )}

        {/* Unassigned orders alert with quick assign */}
        {unassigned.length > 0 && view === 'team' && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">{unassigned.length} nieprzydzielone zlecenia</span>
              <Button variant="outline" size="sm" className="ml-auto h-7 text-xs rounded-lg border-amber-300 text-amber-700"
                onClick={async () => {
                  const res = await fetch('/api/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: dateStr, strategy: 'balance' }) });
                  const data = await res.json();
                  if (data.assigned > 0) fetchData();
                }}>
                <Zap className="h-3 w-3 mr-1" /> Auto-przydziel
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {unassigned.map(o => (
                <div key={o.id} className="flex items-center gap-1.5 bg-white rounded-lg px-2 py-1 border border-amber-200 text-xs">
                  <span className="font-medium">{o.client_name}</span>
                  <span className="text-amber-600">{(o.scheduled_time_start || '').slice(0, 5)}</span>
                  <Select onValueChange={v => { if (v) quickAssign(o.id, v as string); }}>
                    <SelectTrigger className="h-6 w-24 text-[10px] rounded border-amber-300"><SelectValue placeholder="Przydziel →" /></SelectTrigger>
                    <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
          </div>
        )}

        {/* Status legend */}
        {!loading && (
          <div className="flex items-center gap-3">
            {Object.entries(statusConfig).filter(([k]) => k !== 'cancelled').map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <div className={`h-2.5 w-2.5 rounded-full ${v.dot}`} />
                <span className="text-[11px] text-gray-500">{v.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ===== TEAM VIEW ===== */}
        {view === 'team' && !loading && (
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-0 overflow-auto">
              <div className="min-w-[700px]">
                <div className="grid border-b bg-gray-50/80 sticky top-0 z-10" style={{ gridTemplateColumns: `60px repeat(${employees.length}, 1fr)` }}>
                  <div className="p-3 text-center text-xs font-medium text-gray-400 border-r"><Clock className="h-4 w-4 mx-auto" /></div>
                  {employees.map(emp => (
                    <div key={emp.id} className="p-3 text-center border-r last:border-r-0">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: emp.color }} />
                        <p className="text-sm font-bold text-gray-900">{emp.name}</p>
                      </div>
                      <p className="text-[11px] text-gray-400">{emp.region} · {orders.filter(o => o.employee_id === emp.id).length} zleceń</p>
                    </div>
                  ))}
                </div>
                <div className="relative">
                  {/* Current time line */}
                  {isToday && nowHour >= 7 && nowHour <= 19 && (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${nowTop}px` }}>
                      <div className="flex items-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1" />
                        <div className="flex-1 h-[2px] bg-red-500" />
                      </div>
                    </div>
                  )}
                  {HOURS.map((hour, hourIdx) => {
                    const hourNum = hourIdx + 7;
                    return (
                      <div key={hour} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: `60px repeat(${employees.length}, 1fr)`, minHeight: `${ROW_H}px` }}>
                        <div className="p-1.5 text-center text-[11px] text-gray-400 border-r flex items-start justify-center pt-1.5">{hour}</div>
                        {employees.map(emp => {
                          const events = getEvents(emp.id, null, hourNum);
                          return (
                            <div key={emp.id} className="relative border-r last:border-r-0 p-0.5 cursor-pointer hover:bg-orange-50/30 transition-colors"
                              style={{ minHeight: `${ROW_H}px` }}
                              onDoubleClick={() => openNewOrder(`${hourNum.toString().padStart(2, '0')}:00`, emp.id)}>
                              {events.map(event => renderEvent(event))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== WEEK VIEW ===== */}
        {view === 'week' && !loading && (
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-0 overflow-auto">
              <div className="min-w-[800px]">
                <div className="grid grid-cols-8 border-b bg-gray-50/80 sticky top-0 z-10">
                  <div className="p-3 text-center text-xs font-medium text-gray-400 border-r"><Clock className="h-4 w-4 mx-auto" /></div>
                  {weekDates.map((date, i) => {
                    const isTd = date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
                    const dayOrders = orders.filter(o => o.scheduled_date === date.toISOString().split('T')[0]);
                    return (
                      <div key={i} className={`p-3 text-center border-r last:border-r-0 ${isTd ? 'bg-orange-50/50' : ''}`}>
                        <p className="text-xs font-medium text-gray-500">{DAYS_PL[i]}</p>
                        <p className={`text-lg font-bold ${isTd ? 'text-orange-600' : 'text-gray-900'}`}>{date.getDate()}</p>
                        {dayOrders.length > 0 && <p className="text-[10px] text-gray-400">{dayOrders.length} zleceń</p>}
                      </div>
                    );
                  })}
                </div>
                {HOURS.map((hour, hourIdx) => {
                  const hourNum = hourIdx + 7;
                  return (
                    <div key={hour} className="grid grid-cols-8 border-b last:border-b-0" style={{ minHeight: `${ROW_H}px` }}>
                      <div className="p-1.5 text-center text-[11px] text-gray-400 border-r flex items-start justify-center pt-1.5">{hour}</div>
                      {weekDates.map((date, dayIdx) => {
                        const ds = date.toISOString().split('T')[0];
                        const events = getEvents(null, ds, hourNum);
                        return (
                          <div key={dayIdx} className="relative border-r last:border-r-0 p-0.5" style={{ minHeight: `${ROW_H}px` }}>
                            {events.map(event => renderEvent(event, true))}
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
        {view === 'month' && !loading && (
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-4">
              {(() => {
                const year = currentDate.getFullYear(), month = currentDate.getMonth();
                const startPad = new Date(year, month, 1).getDay() === 0 ? 6 : new Date(year, month, 1).getDay() - 1;
                const totalDays = new Date(year, month + 1, 0).getDate();
                const weeks: (number | null)[][] = [];
                let week: (number | null)[] = Array(startPad).fill(null);
                for (let d = 1; d <= totalDays; d++) { week.push(d); if (week.length === 7) { weeks.push(week); week = []; } }
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
                          const isTd = ds === new Date().toISOString().split('T')[0];
                          return (
                            <div key={di} className={`min-h-[80px] rounded-lg border p-1 cursor-pointer hover:border-orange-200 transition-colors ${isTd ? 'border-orange-300 bg-orange-50/50' : 'border-gray-100'}`}
                              onClick={() => { setCurrentDate(new Date(ds)); setView('team'); }}>
                              <div className="flex items-center justify-between">
                                <p className={`text-xs font-medium ${isTd ? 'text-orange-600' : 'text-gray-600'}`}>{day}</p>
                                {dayOrders.length > 0 && <Badge className="h-4 w-4 rounded-full p-0 text-[8px] flex items-center justify-center bg-orange-500">{dayOrders.length}</Badge>}
                              </div>
                              {dayOrders.slice(0, 3).map(o => (
                                <div key={o.id} className={`${statusConfig[o.status]?.bg || 'bg-gray-300'} text-white rounded px-1 py-0.5 text-[9px] mb-0.5 truncate`}>
                                  {(o.scheduled_time_start || '').slice(0, 5)} {o.client_name}
                                </div>
                              ))}
                              {dayOrders.length > 3 && <p className="text-[9px] text-gray-400">+{dayOrders.length - 3}</p>}
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

      {/* Order detail panel */}
      <AnimatePresence>
        {selectedOrder && (
          <motion.div
            className="fixed inset-y-0 right-0 z-50 w-[380px] bg-white shadow-2xl border-l"
            initial={{ x: 380 }} animate={{ x: 0 }} exit={{ x: 380 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold">Szczegóły zlecenia</h3>
              <button onClick={() => setSelectedOrder(null)} className="h-8 w-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 60px)' }}>
              <div className={`rounded-xl p-3 ${statusConfig[selectedOrder.status]?.bg} text-white`}>
                <p className="text-sm font-bold">{statusConfig[selectedOrder.status]?.label}</p>
                <p className="text-xs opacity-80">{selectedOrder.priority === 'urgent' ? 'PILNE' : selectedOrder.priority === 'high' ? 'Wysoki priorytet' : ''}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Klient</p>
                <p className="text-sm font-medium">{selectedOrder.client_name}</p>
                {selectedOrder.client_phone && <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" />{selectedOrder.client_phone}</p>}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Termin</p>
                <p className="text-sm"><CalendarIcon className="h-3.5 w-3.5 inline mr-1 text-gray-400" />{selectedOrder.scheduled_date}</p>
                <p className="text-sm"><Clock className="h-3.5 w-3.5 inline mr-1 text-gray-400" />{(selectedOrder.scheduled_time_start || '').slice(0, 5)} - {(selectedOrder.scheduled_time_end || '').slice(0, 5)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Adres</p>
                <p className="text-sm flex items-start gap-1"><MapPin className="h-3.5 w-3.5 mt-0.5 text-gray-400" />{selectedOrder.address}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Usługi</p>
                <p className="text-sm">{selectedOrder.service_names}</p>
                <p className="text-sm font-bold mt-1">{selectedOrder.total_price} zł</p>
              </div>
              {selectedOrder.employee_name && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Pracownik</p>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedOrder.employee_color }} />
                    <p className="text-sm font-medium">{selectedOrder.employee_name}</p>
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1 rounded-xl text-xs" onClick={() => { setSelectedOrder(null); router.push(`/orders`); }}>
                  Otwórz zlecenie
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New order dialog */}
      <Dialog open={newOrderDialog} onOpenChange={setNewOrderDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nowe zlecenie z kalendarza</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateOrder} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Klient</Label>
                <button type="button" className="text-xs text-orange-500 hover:text-orange-600 font-medium"
                  onClick={() => {
                    const name = prompt('Imię i nazwisko / Firma:');
                    const phone = prompt('Telefon:');
                    const address = prompt('Adres:');
                    const city = prompt('Miasto:');
                    if (name && phone && address && city) {
                      supabase.from('clients').insert({ name, phone, address, city, vehicles: [] }).select('id').single()
                        .then(({ data }) => {
                          if (data) {
                            setClients([...clients, { id: data.id, name, phone, address, city }]);
                            setForm({ ...form, client_id: data.id, address: `${address}, ${city}` });
                          }
                        });
                    }
                  }}>
                  + Nowy klient
                </button>
              </div>
              <Select value={form.client_id} onValueChange={v => {
                const c = clients.find(cl => cl.id === v);
                setForm({ ...form, client_id: v ?? '', address: c ? `${c.address}, ${c.city}` : '' });
              }}>
                <SelectTrigger><SelectValue placeholder="Wybierz klienta" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.city})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Data</Label><Input type="date" value={form.scheduled_date || dateStr} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>Godzina</Label><Input type="time" value={form.scheduled_time_start} onChange={e => setForm({ ...form, scheduled_time_start: e.target.value })} /></div>
            </div>
            <div className="space-y-2">
              <Label>Pracownik</Label>
              <Select value={newOrderEmpId} onValueChange={v => setNewOrderEmpId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Opcjonalnie" /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.region})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Usługi</Label>
              <div className="max-h-32 overflow-y-auto border rounded-xl p-2 space-y-1">
                {services.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={form.service_ids.includes(s.id)} onChange={e => {
                      if (e.target.checked) setForm({ ...form, service_ids: [...form.service_ids, s.id] });
                      else setForm({ ...form, service_ids: form.service_ids.filter(id => id !== s.id) });
                    }} className="rounded" />
                    <span className="flex-1">{s.name}</span>
                    <span className="text-gray-500">{Number(s.price)} zł</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2"><Label>Adres</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setNewOrderDialog(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving || !form.client_id} className="bg-orange-500 hover:bg-orange-600">{saving ? 'Tworzenie...' : 'Utwórz'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
