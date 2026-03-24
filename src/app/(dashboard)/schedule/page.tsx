'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, Shield, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

// -- Types --

interface EmployeeInfo {
  id: string;
  name: string;
  region_id: string | null;
  default_vehicle_id: string | null;
  region_name?: string | null;
  region_color?: string | null;
}

interface VehicleInfo {
  id: string;
  plate_number: string;
  brand: string;
  model: string;
  is_active: boolean;
}

interface RegionInfo {
  id: string;
  name: string;
  color: string;
}

interface WorkSchedule {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_night_shift: boolean;
  notes: string | null;
  vehicle_id: string | null;
  region_id: string | null;
  vehicle_plate: string | null;
  region_name: string | null;
  region_color: string | null;
}

type ViewMode = 'day' | 'week' | 'month';

// -- Helpers --

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const m = new Date(d);
  m.setDate(diff);
  return m;
}

function formatDayHeader(d: Date): { day: string; date: string; full: string; isWeekend: boolean } {
  const dayNames = ['Nd', 'Pn', 'Wt', 'Sr', 'Cz', 'Pt', 'So'];
  const dow = d.getDay();
  return {
    day: dayNames[dow],
    date: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
    full: `${dayNames[dow]} ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
    isWeekend: dow === 0 || dow === 6,
  };
}

function timeStr(t: string): string {
  return t?.slice(0, 5) ?? '';
}

// -- Main Page --

export default function SchedulePage() {
  const supabase = createClient();
  const [employees, setEmployees] = useState<EmployeeInfo[]>([]);
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [startDate, setStartDate] = useState(() => getMonday(new Date()));

  // Dialogs
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [dutyDialogOpen, setDutyDialogOpen] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState({
    employee_id: '',
    start_date: '',
    start_time: '07:00',
    end_date: '',
    end_time: '07:00',
    vehicle_id: '',
    region_id: '',
    notes: '',
    isNew: true,
    originalDate: '', // for editing existing
  });

  // 48/48 duty form
  const [dutyForm, setDutyForm] = useState({
    employee_groups: {} as Record<string, 'A' | 'B'>,
    from_date: '',
    to_date: '',
    start_time: '07:00',
    end_time: '23:00',
  });

  const today = formatDate(new Date());

  const days = useMemo(() => {
    let count = 7;
    if (viewMode === 'day') count = 1;
    else if (viewMode === 'month') count = 30;
    const result: Date[] = [];
    for (let i = 0; i < count; i++) {
      result.push(addDays(startDate, i));
    }
    return result;
  }, [startDate, viewMode]);

  const dateRange = useMemo(() => ({
    from: formatDate(days[0]),
    to: formatDate(days[days.length - 1]),
  }), [days]);

  // -- Data fetching --

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch employees with region info
      const { data: empData } = await supabase
        .from('employees')
        .select('id, region_id, default_vehicle_id, user:profiles(full_name), region:regions(name, color)')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const empList: EmployeeInfo[] = (empData || []).map((e: any) => ({
        id: e.id,
        name: e.user?.full_name || 'Pracownik',
        region_id: e.region_id,
        default_vehicle_id: e.default_vehicle_id || null,
        region_name: e.region?.name || null,
        region_color: e.region?.color || null,
      }));
      setEmployees(empList);

      // Fetch vehicles
      const { data: vehData } = await supabase
        .from('vehicles')
        .select('id, plate_number, brand, model, is_active')
        .eq('is_active', true)
        .order('plate_number');
      setVehicles(vehData || []);

      // Fetch regions
      const { data: regData } = await supabase
        .from('regions')
        .select('id, name, color')
        .order('name');
      setRegions(regData || []);

      // Fetch schedules via API (includes vehicle_plate and region_name)
      const schedRes = await fetch(`/api/work-schedules?from=${dateRange.from}&to=${dateRange.to}`);
      const schedJson = await schedRes.json();
      setSchedules(schedJson.schedules || []);
    } catch (err) {
      console.error('[schedule] fetch error', err);
    }
    setLoading(false);
  }, [dateRange, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // -- Schedule lookup --

  const scheduleMap = useMemo(() => {
    const m = new Map<string, WorkSchedule>();
    for (const s of schedules) {
      m.set(`${s.employee_id}:${s.date}`, s);
    }
    return m;
  }, [schedules]);

  // Vehicle gantt: vehicle_id -> date -> schedule info
  const vehicleScheduleMap = useMemo(() => {
    const m = new Map<string, Map<string, WorkSchedule>>();
    for (const s of schedules) {
      if (!s.vehicle_id) continue;
      let dateMap = m.get(s.vehicle_id);
      if (!dateMap) {
        dateMap = new Map();
        m.set(s.vehicle_id, dateMap);
      }
      dateMap.set(s.date, s);
    }
    return m;
  }, [schedules]);

  // Employee name lookup
  const employeeNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.id, e.name);
    return m;
  }, [employees]);

  // Vehicle plate lookup
  const vehiclePlateMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vehicles) m.set(v.id, v.plate_number);
    return m;
  }, [vehicles]);

  // -- Handlers --

  function handleCellClick(employeeId: string, dateStr: string) {
    const existing = scheduleMap.get(`${employeeId}:${dateStr}`);
    const emp = employees.find(e => e.id === employeeId);
    setConflictError(null);

    if (existing) {
      setEditForm({
        employee_id: existing.employee_id,
        start_date: existing.date,
        start_time: timeStr(existing.start_time),
        end_date: existing.date,
        end_time: timeStr(existing.end_time),
        vehicle_id: existing.vehicle_id || emp?.default_vehicle_id || '',
        region_id: existing.region_id || emp?.region_id || '',
        notes: existing.notes || '',
        isNew: false,
        originalDate: existing.date,
      });
    } else {
      const endDate = formatDate(addDays(new Date(dateStr + 'T00:00:00'), 1));
      setEditForm({
        employee_id: employeeId,
        start_date: dateStr,
        start_time: '07:00',
        end_date: endDate,
        end_time: '07:00',
        vehicle_id: emp?.default_vehicle_id || '',
        region_id: emp?.region_id || '',
        notes: '',
        isNew: true,
        originalDate: '',
      });
    }
    setEditDialogOpen(true);
  }

  async function handleSaveSchedule() {
    setSavingSchedule(true);
    setConflictError(null);

    // For multi-day shifts, create one schedule entry per day
    const start = new Date(editForm.start_date + 'T00:00:00');
    const end = new Date(editForm.end_date + 'T00:00:00');
    const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

    for (let i = 0; i < dayCount; i++) {
      const currentDay = addDays(start, i);
      const dateStr = formatDate(currentDay);

      // Determine time for this day
      let dayStart = editForm.start_time;
      let dayEnd = editForm.end_time;
      if (dayCount > 1) {
        if (i === 0) {
          dayStart = editForm.start_time;
          dayEnd = '23:59';
        } else if (i === dayCount - 1) {
          dayStart = '00:00';
          dayEnd = editForm.end_time;
        } else {
          dayStart = '00:00';
          dayEnd = '23:59';
        }
      }

      const res = await fetch('/api/work-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: editForm.employee_id,
          date: dateStr,
          start_time: dayStart,
          end_time: dayEnd,
          vehicle_id: editForm.vehicle_id || null,
          region_id: editForm.region_id || null,
          notes: editForm.notes || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setConflictError(err.error || 'Wystąpił błąd');
        setSavingSchedule(false);
        return;
      }
    }

    setSavingSchedule(false);
    setEditDialogOpen(false);
    fetchData();
  }

  async function handleDeleteSchedule() {
    await fetch('/api/work-schedules', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: editForm.employee_id,
        date: editForm.originalDate || editForm.start_date,
      }),
    });
    setEditDialogOpen(false);
    fetchData();
  }

  function navigate(dir: number) {
    let count = 7;
    if (viewMode === 'day') count = 1;
    else if (viewMode === 'month') count = 30;
    setStartDate(prev => addDays(prev, dir * count));
  }

  function goToday() {
    if (viewMode === 'day') setStartDate(new Date());
    else setStartDate(getMonday(new Date()));
  }

  // -- 48/48 Duty handlers --

  function openDutyDialog() {
    const todayStr = formatDate(new Date());
    const in30 = formatDate(addDays(new Date(), 30));
    setDutyForm({
      employee_groups: {},
      from_date: todayStr,
      to_date: in30,
      start_time: '07:00',
      end_time: '23:00',
    });
    setDutyDialogOpen(true);
  }

  function toggleDutyEmployee(empId: string) {
    setDutyForm(prev => {
      const groups = { ...prev.employee_groups };
      if (groups[empId]) {
        delete groups[empId];
      } else {
        groups[empId] = 'A';
      }
      return { ...prev, employee_groups: groups };
    });
  }

  function setDutyGroup(empId: string, group: 'A' | 'B') {
    setDutyForm(prev => ({
      ...prev,
      employee_groups: { ...prev.employee_groups, [empId]: group },
    }));
  }

  async function handleDutyGenerate() {
    const selectedEmployees = Object.entries(dutyForm.employee_groups);
    if (selectedEmployees.length === 0) return;

    const fromDate = dutyForm.from_date;
    const groupBStart = formatDate(addDays(new Date(fromDate + 'T00:00:00'), 2));

    const empPayload = selectedEmployees.map(([empId, group]) => ({
      employee_id: empId,
      first_on_date: group === 'A' ? fromDate : groupBStart,
    }));

    await fetch('/api/work-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bulk: true,
        pattern: '48_48',
        employees: empPayload,
        from_date: dutyForm.from_date,
        to_date: dutyForm.to_date,
        start_time: dutyForm.start_time,
        end_time: dutyForm.end_time,
      }),
    });

    setDutyDialogOpen(false);
    fetchData();
  }

  // Auto-fill vehicle/region when employee changes
  function handleEmployeeChange(empId: string) {
    const emp = employees.find(e => e.id === empId);
    setEditForm(f => ({
      ...f,
      employee_id: empId,
      vehicle_id: emp?.default_vehicle_id || f.vehicle_id,
      region_id: emp?.region_id || f.region_id,
    }));
  }

  // -- Rendering --

  const monthLabel = useMemo(() => {
    const months = [
      'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
    ];
    const first = days[0];
    const last = days[days.length - 1];
    if (first.getMonth() === last.getMonth()) {
      return `${months[first.getMonth()]} ${first.getFullYear()}`;
    }
    return `${months[first.getMonth()]} - ${months[last.getMonth()]} ${last.getFullYear()}`;
  }, [days]);

  // Vehicles that appear in any schedule in the date range
  const activeVehicleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of schedules) {
      if (s.vehicle_id) ids.add(s.vehicle_id);
    }
    return ids;
  }, [schedules]);

  const vehiclesForGantt = useMemo(() => {
    return vehicles.filter(v => activeVehicleIds.has(v.id));
  }, [vehicles, activeVehicleIds]);

  const isCompact = viewMode === 'month';

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Grafik zmian"
        subtitle="Planowanie dyżurów pracowników"
        icon={<CalendarDays className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                setConflictError(null);
                const todayStr = formatDate(new Date());
                const endStr = formatDate(addDays(new Date(), 1));
                setEditForm({
                  employee_id: employees[0]?.id || '',
                  start_date: todayStr,
                  start_time: '07:00',
                  end_date: endStr,
                  end_time: '07:00',
                  vehicle_id: employees[0]?.default_vehicle_id || '',
                  region_id: employees[0]?.region_id || '',
                  notes: '',
                  isNew: true,
                  originalDate: '',
                });
                setEditDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Utwórz dyżur
            </Button>
            <Button
              className="h-9 rounded-xl text-sm gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={openDutyDialog}
            >
              <Shield className="h-4 w-4" /> Generuj 48/48
            </Button>
          </div>
        }
      />

      <div className="p-4 lg:p-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-1">
            {(['day', 'week', 'month'] as ViewMode[]).map(v => (
              <Button
                key={v}
                variant={viewMode === v ? 'default' : 'outline'}
                size="sm"
                className={cn('h-8 rounded-lg text-xs', viewMode === v && 'bg-blue-600 hover:bg-blue-700')}
                onClick={() => {
                  setViewMode(v);
                  if (v === 'day') setStartDate(new Date());
                  else setStartDate(getMonday(new Date()));
                }}
              >
                {v === 'day' ? 'Dzień' : v === 'week' ? 'Tydzień' : 'Miesiąc'}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={goToday}>
              Dzisiaj
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <span className="text-sm font-semibold text-gray-700">{monthLabel}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* == EMPLOYEE GANTT == */}
            <div>
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Grafik pracowników
              </h2>
              <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  {employees.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <p className="text-sm font-medium">Brak aktywnych pracowników</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="sticky left-0 z-10 bg-gray-50 w-[160px] min-w-[160px] px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-100">
                              Pracownik
                            </th>
                            {days.map(d => {
                              const info = formatDayHeader(d);
                              const isToday = formatDate(d) === today;
                              return (
                                <th
                                  key={formatDate(d)}
                                  className={cn(
                                    'px-1 py-2.5 text-center border-r border-gray-50',
                                    isCompact ? 'min-w-[32px]' : 'min-w-[90px]',
                                    info.isWeekend && 'bg-gray-100/50',
                                    isToday && 'ring-2 ring-inset ring-orange-400 bg-orange-50/30',
                                  )}
                                >
                                  <div className={cn(
                                    'text-[10px] font-semibold uppercase',
                                    info.isWeekend ? 'text-red-400' : 'text-gray-400',
                                  )}>
                                    {info.day}
                                  </div>
                                  <div className={cn(
                                    'text-[11px] font-bold',
                                    isToday ? 'text-orange-600' : 'text-gray-700',
                                  )}>
                                    {info.date}
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {employees.map(emp => (
                            <tr key={emp.id} className="border-b border-gray-50 hover:bg-gray-50/30">
                              <td className="sticky left-0 z-10 bg-white w-[160px] min-w-[160px] px-3 py-2 border-r border-gray-100">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0"
                                    style={{ backgroundColor: emp.region_color || '#374151' }}
                                  >
                                    {emp.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-[12px] font-medium text-gray-800 truncate block">{emp.name}</span>
                                    {emp.default_vehicle_id && (
                                      <span className="text-[10px] text-gray-400 truncate block">
                                        {vehiclePlateMap.get(emp.default_vehicle_id) || ''}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              {days.map(d => {
                                const dateStr = formatDate(d);
                                const info = formatDayHeader(d);
                                const isToday = dateStr === today;
                                const key = `${emp.id}:${dateStr}`;
                                const schedule = scheduleMap.get(key);

                                return (
                                  <td
                                    key={dateStr}
                                    className={cn(
                                      'px-0.5 py-1 border-r border-gray-50 cursor-pointer transition-colors',
                                      isCompact ? 'min-w-[32px]' : 'min-w-[90px]',
                                      info.isWeekend && 'bg-gray-50/50',
                                      isToday && 'ring-2 ring-inset ring-orange-400',
                                    )}
                                    onClick={() => handleCellClick(emp.id, dateStr)}
                                  >
                                    {schedule ? (
                                      <div
                                        className={cn(
                                          'mx-auto w-full rounded-md flex items-center justify-center text-white',
                                          isCompact ? 'h-6' : 'h-10',
                                        )}
                                        style={{
                                          backgroundColor: schedule.region_color || '#3b82f6',
                                        }}
                                        title={`${timeStr(schedule.start_time)}-${timeStr(schedule.end_time)} ${schedule.vehicle_plate || ''} ${schedule.region_name || ''}`}
                                      >
                                        {isCompact ? (
                                          <span className="text-[8px] font-bold">
                                            {timeStr(schedule.start_time).replace(':', '')}
                                          </span>
                                        ) : (
                                          <div className="text-center px-1">
                                            <div className="text-[9px] font-bold whitespace-nowrap">
                                              {schedule.notes === 'DYZUR_48_48' ? 'DYŻUR ' : ''}
                                              {timeStr(schedule.start_time)}-{timeStr(schedule.end_time)}
                                            </div>
                                            {schedule.vehicle_plate && (
                                              <div className="text-[8px] opacity-90 whitespace-nowrap">{schedule.vehicle_plate}</div>
                                            )}
                                            {schedule.region_name && (
                                              <div className="text-[8px] opacity-80 whitespace-nowrap">{schedule.region_name}</div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className={cn(
                                        'mx-auto w-full rounded-md hover:bg-gray-100 transition-colors',
                                        isCompact ? 'h-6' : 'h-10',
                                      )} />
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* == VEHICLE GANTT == */}
            {vehiclesForGantt.length > 0 && (
              <div>
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" /> Grafik pojazdów
                </h2>
                <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="sticky left-0 z-10 bg-gray-50 w-[160px] min-w-[160px] px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-100">
                              Pojazd
                            </th>
                            {days.map(d => {
                              const info = formatDayHeader(d);
                              const isToday = formatDate(d) === today;
                              return (
                                <th
                                  key={formatDate(d)}
                                  className={cn(
                                    'px-1 py-2.5 text-center border-r border-gray-50',
                                    isCompact ? 'min-w-[32px]' : 'min-w-[90px]',
                                    info.isWeekend && 'bg-gray-100/50',
                                    isToday && 'ring-2 ring-inset ring-orange-400 bg-orange-50/30',
                                  )}
                                >
                                  <div className={cn(
                                    'text-[10px] font-semibold uppercase',
                                    info.isWeekend ? 'text-red-400' : 'text-gray-400',
                                  )}>
                                    {info.day}
                                  </div>
                                  <div className={cn(
                                    'text-[11px] font-bold',
                                    isToday ? 'text-orange-600' : 'text-gray-700',
                                  )}>
                                    {info.date}
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {vehiclesForGantt.map(veh => {
                            const dateMap = vehicleScheduleMap.get(veh.id);
                            return (
                              <tr key={veh.id} className="border-b border-gray-50 hover:bg-gray-50/30">
                                <td className="sticky left-0 z-10 bg-white w-[160px] min-w-[160px] px-3 py-2 border-r border-gray-100">
                                  <div>
                                    <span className="text-[12px] font-bold text-gray-800">{veh.plate_number}</span>
                                    <span className="text-[10px] text-gray-400 block">{veh.brand} {veh.model}</span>
                                  </div>
                                </td>
                                {days.map(d => {
                                  const dateStr = formatDate(d);
                                  const info = formatDayHeader(d);
                                  const isToday = dateStr === today;
                                  const schedule = dateMap?.get(dateStr);
                                  const empName = schedule ? (employeeNameMap.get(schedule.employee_id) || '?') : null;

                                  return (
                                    <td
                                      key={dateStr}
                                      className={cn(
                                        'px-0.5 py-1 border-r border-gray-50',
                                        isCompact ? 'min-w-[32px]' : 'min-w-[90px]',
                                        info.isWeekend && 'bg-gray-50/50',
                                        isToday && 'ring-2 ring-inset ring-orange-400',
                                      )}
                                    >
                                      {schedule ? (
                                        <div
                                          className={cn(
                                            'mx-auto w-full rounded-md flex items-center justify-center text-white',
                                            isCompact ? 'h-6' : 'h-10',
                                          )}
                                          style={{
                                            backgroundColor: schedule.region_color || '#3b82f6',
                                          }}
                                          title={`${empName} ${timeStr(schedule.start_time)}-${timeStr(schedule.end_time)}`}
                                        >
                                          {isCompact ? (
                                            <span className="text-[8px] font-bold">
                                              {(empName || '').charAt(0)}
                                            </span>
                                          ) : (
                                            <div className="text-center px-1">
                                              <div className="text-[9px] font-bold whitespace-nowrap truncate max-w-[80px]">
                                                {empName}
                                              </div>
                                              <div className="text-[8px] opacity-90 whitespace-nowrap">
                                                {timeStr(schedule.start_time)}-{timeStr(schedule.end_time)}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className={cn(
                                          'mx-auto w-full rounded-md',
                                          isCompact ? 'h-6' : 'h-10',
                                        )} />
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>

      {/* == Edit / Create Schedule Dialog == */}
      <Dialog open={editDialogOpen} onOpenChange={o => { setEditDialogOpen(o); if (!o) setConflictError(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editForm.isNew ? 'Nowy dyżur' : 'Edytuj dyżur'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Employee */}
            <div className="space-y-2">
              <Label>Pracownik</Label>
              <Select
                value={editForm.employee_id}
                onValueChange={v => handleEmployeeChange(v ?? '')}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start date + time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Początek dyżuru</Label>
                <Input
                  type="date"
                  value={editForm.start_date}
                  onChange={e => {
                    const newStart = e.target.value;
                    const newEnd = formatDate(addDays(new Date(newStart + 'T00:00:00'), 1));
                    setEditForm(f => ({ ...f, start_date: newStart, end_date: newEnd }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Godzina</Label>
                <Input
                  type="time"
                  value={editForm.start_time}
                  onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))}
                />
              </div>
            </div>

            {/* End date + time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Koniec dyżuru</Label>
                <Input
                  type="date"
                  value={editForm.end_date}
                  onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Godzina</Label>
                <Input
                  type="time"
                  value={editForm.end_time}
                  onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))}
                />
              </div>
            </div>

            {/* Vehicle */}
            <div className="space-y-2">
              <Label>Pojazd</Label>
              <Select
                value={editForm.vehicle_id}
                onValueChange={v => setEditForm(f => ({ ...f, vehicle_id: v === '__none__' ? '' : (v ?? '') }))}
              >
                <SelectTrigger><SelectValue placeholder="Wybierz pojazd" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Brak --</SelectItem>
                  {vehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.plate_number} ({v.brand} {v.model})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Region */}
            <div className="space-y-2">
              <Label>Obszar</Label>
              <Select
                value={editForm.region_id}
                onValueChange={v => setEditForm(f => ({ ...f, region_id: v === '__none__' ? '' : (v ?? '') }))}
              >
                <SelectTrigger><SelectValue placeholder="Wybierz region" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Brak --</SelectItem>
                  {regions.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                        {r.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notatki</Label>
              <Textarea
                value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Opcjonalne..."
                rows={2}
              />
            </div>

            {/* Conflict error */}
            {conflictError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{conflictError}</span>
              </div>
            )}

            <div className="flex justify-between">
              <div>
                {!editForm.isNew && (
                  <Button
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={handleDeleteSchedule}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Usuń
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Anuluj
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={handleSaveSchedule}
                  disabled={savingSchedule}
                >
                  {savingSchedule ? 'Zapisywanie...' : 'Zapisz'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* == 48/48 Duty Dialog == */}
      <Dialog open={dutyDialogOpen} onOpenChange={setDutyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generuj dyżury 48/48</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pracownicy i grupy</Label>
              <p className="text-[11px] text-gray-400">
                Grupa A: dyżur zaczyna się od daty początkowej. Grupa B: dyżur zaczyna się 2 dni później.
              </p>
              <div className="max-h-52 overflow-y-auto border rounded-lg p-2 space-y-1">
                {employees.map(e => {
                  const selected = !!dutyForm.employee_groups[e.id];
                  return (
                    <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleDutyEmployee(e.id)}
                      />
                      <span className="text-sm flex-1">{e.name}</span>
                      {selected && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDutyGroup(e.id, 'A')}
                            className={cn(
                              'px-2 py-0.5 text-[10px] font-bold rounded',
                              dutyForm.employee_groups[e.id] === 'A'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                            )}
                          >
                            Grupa A
                          </button>
                          <button
                            type="button"
                            onClick={() => setDutyGroup(e.id, 'B')}
                            className={cn(
                              'px-2 py-0.5 text-[10px] font-bold rounded',
                              dutyForm.employee_groups[e.id] === 'B'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                            )}
                          >
                            Grupa B
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {Object.keys(dutyForm.employee_groups).length > 0 && (
                <p className="text-[11px] text-gray-400">
                  Wybrano: {Object.keys(dutyForm.employee_groups).length} pracowników
                  (A: {Object.values(dutyForm.employee_groups).filter(g => g === 'A').length},
                  B: {Object.values(dutyForm.employee_groups).filter(g => g === 'B').length})
                </p>
              )}
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Od</Label>
                <Input
                  type="date"
                  value={dutyForm.from_date}
                  onChange={e => setDutyForm(f => ({ ...f, from_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Do</Label>
                <Input
                  type="date"
                  value={dutyForm.to_date}
                  onChange={e => setDutyForm(f => ({ ...f, to_date: e.target.value }))}
                />
              </div>
            </div>

            {/* Working hours */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Godzina rozpoczęcia</Label>
                <Input
                  type="time"
                  value={dutyForm.start_time}
                  onChange={e => setDutyForm(f => ({ ...f, start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Godzina zakończenia</Label>
                <Input
                  type="time"
                  value={dutyForm.end_time}
                  onChange={e => setDutyForm(f => ({ ...f, end_time: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDutyDialogOpen(false)}>
                Anuluj
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={Object.keys(dutyForm.employee_groups).length === 0 || !dutyForm.from_date || !dutyForm.to_date}
                onClick={handleDutyGenerate}
              >
                <Shield className="h-4 w-4 mr-1" /> Generuj
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
