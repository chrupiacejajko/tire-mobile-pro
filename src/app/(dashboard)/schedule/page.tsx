'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──

interface Employee {
  id: string;
  name: string;
}

interface WorkSchedule {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_night_shift: boolean;
  notes: string | null;
}

interface Unavailability {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  type: string;
}

interface ScheduleTemplate {
  id: string;
  name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
}

type ViewMode = '7' | '14' | '30';

// ── Helpers ──

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

function formatDayHeader(d: Date): { day: string; date: string; isWeekend: boolean } {
  const dayNames = ['Nd', 'Pn', 'Wt', 'Sr', 'Cz', 'Pt', 'So'];
  const dow = d.getDay();
  return {
    day: dayNames[dow],
    date: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
    isWeekend: dow === 0 || dow === 6,
  };
}

function timeStr(t: string): string {
  return t?.slice(0, 5) ?? '';
}

// ── Main Page ──

export default function SchedulePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [unavailabilities, setUnavailabilities] = useState<Unavailability[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>('14');
  const [startDate, setStartDate] = useState(() => getMonday(new Date()));

  // Dialogs
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState({
    employee_id: '',
    date: '',
    start_time: '08:00',
    end_time: '16:00',
    is_night_shift: false,
    notes: '',
    isNew: true,
  });

  // Bulk form
  const [bulkForm, setBulkForm] = useState({
    employee_ids: [] as string[],
    from_date: '',
    to_date: '',
    template_id: '',
    start_time: '08:00',
    end_time: '16:00',
    skip_weekends: true,
  });

  const today = formatDate(new Date());

  const days = useMemo(() => {
    const count = parseInt(viewMode);
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

  // ── Data fetching ──

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, schedRes, unavRes, tplRes] = await Promise.all([
        fetch('/api/employees').then(r => r.json()),
        fetch(`/api/work-schedules?from=${dateRange.from}&to=${dateRange.to}`).then(r => r.json()),
        fetch(`/api/unavailabilities?from=${dateRange.from}&to=${dateRange.to}`).then(r => r.json()),
        fetch('/api/schedule-templates').then(r => r.json()),
      ]);

      const empList: Employee[] = (empRes.employees || []).map((e: any) => ({
        id: e.id,
        name: e.user?.full_name || e.profiles?.full_name || 'Pracownik',
      }));
      setEmployees(empList);
      setSchedules(schedRes.schedules || []);
      setUnavailabilities(unavRes.unavailabilities || []);
      setTemplates(tplRes.templates || []);
    } catch (err) {
      console.error('[schedule] fetch error', err);
    }
    setLoading(false);
  }, [dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Schedule lookup ──

  const scheduleMap = useMemo(() => {
    const m = new Map<string, WorkSchedule>();
    for (const s of schedules) {
      m.set(`${s.employee_id}:${s.date}`, s);
    }
    return m;
  }, [schedules]);

  const unavailabilityMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const u of unavailabilities) {
      const start = new Date(u.start_date + 'T00:00:00');
      const end = new Date(u.end_date + 'T00:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        m.set(`${u.employee_id}:${formatDate(d)}`, true);
      }
    }
    return m;
  }, [unavailabilities]);

  // ── Handlers ──

  function handleCellClick(employeeId: string, date: string) {
    const existing = scheduleMap.get(`${employeeId}:${date}`);
    if (existing) {
      setEditForm({
        employee_id: existing.employee_id,
        date: existing.date,
        start_time: timeStr(existing.start_time),
        end_time: timeStr(existing.end_time),
        is_night_shift: existing.is_night_shift,
        notes: existing.notes || '',
        isNew: false,
      });
    } else {
      setEditForm({
        employee_id: employeeId,
        date,
        start_time: '08:00',
        end_time: '16:00',
        is_night_shift: false,
        notes: '',
        isNew: true,
      });
    }
    setEditDialogOpen(true);
  }

  async function handleSaveSchedule() {
    await fetch('/api/work-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: editForm.employee_id,
        date: editForm.date,
        start_time: editForm.start_time,
        end_time: editForm.end_time,
        is_night_shift: editForm.is_night_shift,
        notes: editForm.notes || null,
      }),
    });
    setEditDialogOpen(false);
    fetchData();
  }

  async function handleDeleteSchedule() {
    await fetch('/api/work-schedules', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: editForm.employee_id,
        date: editForm.date,
      }),
    });
    setEditDialogOpen(false);
    fetchData();
  }

  async function handleBulkGenerate() {
    for (const empId of bulkForm.employee_ids) {
      await fetch('/api/work-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bulk: true,
          employee_id: empId,
          from_date: bulkForm.from_date,
          to_date: bulkForm.to_date,
          template_id: bulkForm.template_id || undefined,
          start_time: !bulkForm.template_id ? bulkForm.start_time : undefined,
          end_time: !bulkForm.template_id ? bulkForm.end_time : undefined,
          skip_weekends: bulkForm.skip_weekends,
        }),
      });
    }
    setBulkDialogOpen(false);
    fetchData();
  }

  function navigate(dir: number) {
    const count = parseInt(viewMode);
    setStartDate(prev => addDays(prev, dir * count));
  }

  function goToday() {
    setStartDate(getMonday(new Date()));
  }

  function openBulkDialog() {
    setBulkForm({
      employee_ids: [],
      from_date: dateRange.from,
      to_date: dateRange.to,
      template_id: '',
      start_time: '08:00',
      end_time: '16:00',
      skip_weekends: true,
    });
    setBulkDialogOpen(true);
  }

  const toggleBulkEmployee = (id: string) => {
    setBulkForm(prev => ({
      ...prev,
      employee_ids: prev.employee_ids.includes(id)
        ? prev.employee_ids.filter(e => e !== id)
        : [...prev.employee_ids, id],
    }));
  };

  const selectAllBulkEmployees = () => {
    setBulkForm(prev => ({
      ...prev,
      employee_ids: prev.employee_ids.length === employees.length
        ? []
        : employees.map(e => e.id),
    }));
  };

  // ── Rendering ──

  const monthLabel = useMemo(() => {
    const months = [
      'Styczen', 'Luty', 'Marzec', 'Kwiecien', 'Maj', 'Czerwiec',
      'Lipiec', 'Sierpien', 'Wrzesien', 'Pazdziernik', 'Listopad', 'Grudzien',
    ];
    const first = days[0];
    const last = days[days.length - 1];
    if (first.getMonth() === last.getMonth()) {
      return `${months[first.getMonth()]} ${first.getFullYear()}`;
    }
    return `${months[first.getMonth()]} - ${months[last.getMonth()]} ${last.getFullYear()}`;
  }, [days]);

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Grafik zmian"
        subtitle="Planowanie zmian pracownikow"
        icon={<CalendarDays className="h-5 w-5" />}
        actions={
          <Button
            className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={openBulkDialog}
          >
            <Copy className="h-4 w-4" /> Zastosuj szablon
          </Button>
        }
      />

      <div className="p-4 lg:p-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
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

          <div className="ml-auto flex items-center gap-1">
            {(['7', '14', '30'] as ViewMode[]).map(v => (
              <Button
                key={v}
                variant={viewMode === v ? 'default' : 'outline'}
                size="sm"
                className={cn('h-8 rounded-lg text-xs', viewMode === v && 'bg-blue-600 hover:bg-blue-700')}
                onClick={() => setViewMode(v)}
              >
                {v === '7' ? 'Tydzien' : v === '14' ? '2 Tygodnie' : 'Miesiac'}
              </Button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Brak pracownikow</p>
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
                              'min-w-[70px] px-1 py-2.5 text-center border-r border-gray-50',
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
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-gray-600 to-gray-800 text-white text-[10px] font-bold shrink-0">
                              {emp.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-[12px] font-medium text-gray-800 truncate">{emp.name}</span>
                          </div>
                        </td>
                        {days.map(d => {
                          const dateStr = formatDate(d);
                          const info = formatDayHeader(d);
                          const isToday = dateStr === today;
                          const key = `${emp.id}:${dateStr}`;
                          const schedule = scheduleMap.get(key);
                          const isUnavailable = unavailabilityMap.get(key);

                          return (
                            <td
                              key={dateStr}
                              className={cn(
                                'min-w-[70px] px-0.5 py-1 border-r border-gray-50 cursor-pointer transition-colors',
                                info.isWeekend && 'bg-gray-50/50',
                                isToday && 'ring-2 ring-inset ring-orange-400',
                              )}
                              onClick={() => handleCellClick(emp.id, dateStr)}
                            >
                              {isUnavailable ? (
                                <div className="mx-auto h-8 w-full rounded-md bg-red-100 flex items-center justify-center"
                                  style={{
                                    backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(239,68,68,0.15) 3px, rgba(239,68,68,0.15) 6px)',
                                  }}
                                >
                                  <span className="text-[9px] font-medium text-red-500">Niedost.</span>
                                </div>
                              ) : schedule ? (
                                <div className={cn(
                                  'mx-auto h-8 w-full rounded-md flex items-center justify-center',
                                  schedule.is_night_shift
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-blue-100 text-blue-700',
                                )}>
                                  <span className="text-[10px] font-semibold whitespace-nowrap">
                                    {timeStr(schedule.start_time)}-{timeStr(schedule.end_time)}
                                  </span>
                                </div>
                              ) : (
                                <div className="mx-auto h-8 w-full rounded-md hover:bg-gray-100 transition-colors" />
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

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 text-[11px] text-gray-500">
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-8 rounded bg-blue-100" />
            <span>Zaplanowane</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-8 rounded bg-indigo-100" />
            <span>Zmiana nocna</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-8 rounded bg-red-100" style={{
              backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(239,68,68,0.15) 3px, rgba(239,68,68,0.15) 6px)',
            }} />
            <span>Niedostepnosc</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-8 rounded border-2 border-orange-400" />
            <span>Dzisiaj</span>
          </div>
        </div>
      </div>

      {/* ── Edit / Create Schedule Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editForm.isNew ? 'Dodaj zmiane' : 'Edytuj zmiane'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pracownik</Label>
              <Select
                value={editForm.employee_id}
                onValueChange={v => setEditForm(f => ({ ...f, employee_id: v ?? '' }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input
                type="date"
                value={editForm.date}
                onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rozpoczecie</Label>
                <Input
                  type="time"
                  value={editForm.start_time}
                  onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Zakonczenie</Label>
                <Input
                  type="time"
                  value={editForm.end_time}
                  onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={editForm.is_night_shift}
                onCheckedChange={v => setEditForm(f => ({ ...f, is_night_shift: v }))}
              />
              <span className="text-sm text-gray-700">Zmiana nocna</span>
            </div>
            <div className="space-y-2">
              <Label>Notatki</Label>
              <Input
                value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Opcjonalne..."
              />
            </div>
            <div className="flex justify-between">
              <div>
                {!editForm.isNew && (
                  <Button
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={handleDeleteSchedule}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Usun
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Anuluj
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSaveSchedule}>
                  Zapisz
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk / Template Dialog ── */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Zastosuj szablon grafiku</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Employee selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Pracownicy</Label>
                <button
                  type="button"
                  onClick={selectAllBulkEmployees}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  {bulkForm.employee_ids.length === employees.length ? 'Odznacz wszystko' : 'Zaznacz wszystko'}
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                {employees.map(e => (
                  <label key={e.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                    <Checkbox
                      checked={bulkForm.employee_ids.includes(e.id)}
                      onCheckedChange={() => toggleBulkEmployee(e.id)}
                    />
                    <span className="text-sm">{e.name}</span>
                  </label>
                ))}
              </div>
              {bulkForm.employee_ids.length > 0 && (
                <p className="text-[11px] text-gray-400">
                  Wybrano: {bulkForm.employee_ids.length} pracownikow
                </p>
              )}
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Od</Label>
                <Input
                  type="date"
                  value={bulkForm.from_date}
                  onChange={e => setBulkForm(f => ({ ...f, from_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Do</Label>
                <Input
                  type="date"
                  value={bulkForm.to_date}
                  onChange={e => setBulkForm(f => ({ ...f, to_date: e.target.value }))}
                />
              </div>
            </div>

            {/* Template */}
            <div className="space-y-2">
              <Label>Szablon</Label>
              <Select
                value={bulkForm.template_id}
                onValueChange={v => setBulkForm(f => ({ ...f, template_id: v ?? '' }))}
              >
                <SelectTrigger><SelectValue placeholder="Reczne godziny" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Reczne godziny</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({timeStr(t.start_time)}-{timeStr(t.end_time)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Manual times (when no template selected) */}
            {(!bulkForm.template_id || bulkForm.template_id === '__none__') && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Rozpoczecie</Label>
                  <Input
                    type="time"
                    value={bulkForm.start_time}
                    onChange={e => setBulkForm(f => ({ ...f, start_time: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Zakonczenie</Label>
                  <Input
                    type="time"
                    value={bulkForm.end_time}
                    onChange={e => setBulkForm(f => ({ ...f, end_time: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Skip weekends */}
            <div className="flex items-center gap-3">
              <Switch
                checked={bulkForm.skip_weekends}
                onCheckedChange={v => setBulkForm(f => ({ ...f, skip_weekends: v }))}
              />
              <span className="text-sm text-gray-700">Pomin weekendy</span>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>
                Anuluj
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                disabled={bulkForm.employee_ids.length === 0 || !bulkForm.from_date || !bulkForm.to_date}
                onClick={handleBulkGenerate}
              >
                <Plus className="h-4 w-4 mr-1" /> Generuj grafik
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
