'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  format, addDays, isToday as dateFnsIsToday,
} from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Shield,
  AlertTriangle, Car, Users, CalendarDays, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Topbar } from '@/components/layout/topbar';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

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
type ActiveTab = 'workers' | 'vehicles';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDaysTo(d: Date, n: number): Date {
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

function timeStr(t: string): string {
  return t?.slice(0, 5) ?? '';
}

/** Convert hex + alpha to rgba string for inline styles */
function hexAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const FALLBACK_COLOR = '#3b82f6';

// ─── Shift Block ──────────────────────────────────────────────────────────────

function ShiftBlock({
  schedule,
  compact,
  onClick,
}: {
  schedule: WorkSchedule;
  compact: boolean;
  onClick: () => void;
}) {
  const color = schedule.region_color || FALLBACK_COLOR;
  const isDuty = schedule.notes === 'DYZUR_48_48';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="relative cursor-pointer rounded-md overflow-hidden select-none group/block"
      style={{ height: compact ? 22 : 56 }}
      onClick={onClick}
      title={`${timeStr(schedule.start_time)}–${timeStr(schedule.end_time)}${schedule.vehicle_plate ? ' · ' + schedule.vehicle_plate : ''}${schedule.region_name ? ' · ' + schedule.region_name : ''}`}
    >
      {/* Background tint */}
      <div className="absolute inset-0" style={{ backgroundColor: hexAlpha(color, 0.10) }} />
      {/* Left accent border */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: color }} />
      {/* Hover highlight */}
      <div className="absolute inset-0 opacity-0 group-hover/block:opacity-100 transition-opacity" style={{ backgroundColor: hexAlpha(color, 0.08) }} />

      {compact ? (
        <div className="relative flex items-center justify-center h-full pl-1">
          <span className="text-[9px] font-bold truncate" style={{ color }}>
            {timeStr(schedule.start_time)}
          </span>
        </div>
      ) : (
        <div className="relative pl-2.5 pr-1.5 py-1 flex flex-col justify-center h-full">
          <div className="flex items-center gap-1 min-w-0">
            {isDuty && (
              <Shield className="h-2.5 w-2.5 shrink-0" style={{ color }} />
            )}
            <span className="text-[10px] font-bold truncate" style={{ color }}>
              {timeStr(schedule.start_time)}–{timeStr(schedule.end_time)}
            </span>
          </div>
          {schedule.vehicle_plate && (
            <div className="flex items-center gap-1 min-w-0">
              <Car className="h-2.5 w-2.5 shrink-0 text-gray-400" />
              <span className="text-[9px] text-gray-500 truncate">{schedule.vehicle_plate}</span>
            </div>
          )}
          {schedule.region_name && (
            <span className="text-[9px] truncate" style={{ color: hexAlpha(color, 0.85) }}>
              {schedule.region_name}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Empty Cell Ghost ─────────────────────────────────────────────────────────

function EmptyCell({ compact, onClick }: { compact: boolean; onClick: () => void }) {
  return (
    <div
      className={cn(
        'w-full cursor-pointer rounded-md group/empty flex items-center justify-center transition-colors hover:bg-gray-100/70',
        compact ? 'h-[22px]' : 'h-[56px]',
      )}
      onClick={onClick}
    >
      <Plus className="h-3 w-3 text-gray-300 opacity-0 group-hover/empty:opacity-100 transition-opacity" />
    </div>
  );
}

// ─── Day Column Header ────────────────────────────────────────────────────────

function DayHeader({ date, compact }: { date: Date; compact: boolean }) {
  const dayNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
  const dow = date.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const isNow = dateFnsIsToday(date);
  const dayName = dayNames[dow];
  const dayNum = date.getDate();
  const monthNum = String(date.getMonth() + 1).padStart(2, '0');

  return (
    <th
      className={cn(
        'px-0.5 py-2 text-center border-r border-gray-100 transition-colors',
        compact ? 'min-w-[30px]' : 'min-w-[100px]',
        isWeekend && !isNow && 'bg-gray-50/60',
        isNow && 'bg-blue-50/40',
      )}
    >
      <div className={cn('text-[10px] font-medium uppercase tracking-wide', isWeekend ? 'text-rose-400' : 'text-gray-400')}>
        {compact ? dayName.charAt(0) : dayName}
      </div>
      <div className="flex items-center justify-center mt-0.5">
        {isNow ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
            {dayNum}
          </span>
        ) : (
          <span className={cn('text-[11px] font-semibold', isWeekend ? 'text-rose-400' : 'text-gray-700')}>
            {dayNum}
          </span>
        )}
      </div>
      {!compact && (
        <div className="text-[9px] text-gray-300 mt-0.5">{monthNum}</div>
      )}
    </th>
  );
}

// ─── Gantt Grid ───────────────────────────────────────────────────────────────

function GanttGrid({
  rows,
  days,
  scheduleMap,
  compact,
  resourceLabel,
  renderResourceCell,
  onCellClick,
}: {
  rows: { id: string }[];
  days: Date[];
  scheduleMap: Map<string, WorkSchedule>;
  compact: boolean;
  resourceLabel: string;
  renderResourceCell: (id: string) => React.ReactNode;
  onCellClick: (id: string, dateStr: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
        <CalendarDays className="h-8 w-8 text-gray-200" />
        <p className="text-sm font-medium">Brak danych do wyświetlenia</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            {/* Sticky resource column */}
            <th className="sticky left-0 z-20 bg-white w-[160px] min-w-[160px] px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100">
              {resourceLabel}
            </th>
            {days.map(d => (
              <DayHeader key={toDateStr(d)} date={d} compact={compact} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr
              key={row.id}
              className={cn('border-b border-gray-50 last:border-0', rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/20')}
            >
              {/* Resource name cell */}
              <td className="sticky left-0 z-10 w-[160px] min-w-[160px] px-3 py-1.5 border-r border-gray-100"
                  style={{ backgroundColor: rowIdx % 2 === 0 ? 'white' : 'rgb(249 250 251 / 0.2)' }}>
                {renderResourceCell(row.id)}
              </td>

              {/* Day cells */}
              {days.map(d => {
                const dateStr = toDateStr(d);
                const isNow = dateFnsIsToday(d);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const schedule = scheduleMap.get(`${row.id}:${dateStr}`);

                return (
                  <td
                    key={dateStr}
                    className={cn(
                      'px-0.5 py-1 border-r border-gray-50',
                      compact ? 'min-w-[30px]' : 'min-w-[100px]',
                      isWeekend && 'bg-gray-50/40',
                      isNow && 'bg-blue-50/20',
                    )}
                  >
                    <AnimatePresence mode="wait">
                      {schedule ? (
                        <ShiftBlock
                          key={schedule.id}
                          schedule={schedule}
                          compact={compact}
                          onClick={() => onCellClick(row.id, dateStr)}
                        />
                      ) : (
                        <EmptyCell
                          key={`empty-${row.id}-${dateStr}`}
                          compact={compact}
                          onClick={() => onCellClick(row.id, dateStr)}
                        />
                      )}
                    </AnimatePresence>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const supabase = createClient();

  const [employees, setEmployees] = useState<EmployeeInfo[]>([]);
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [activeTab, setActiveTab] = useState<ActiveTab>('workers');
  const [startDate, setStartDate] = useState(() => getMonday(new Date()));
  const [navDir, setNavDir] = useState<1 | -1>(1);

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
    originalDate: '',
  });

  // 48/48 form
  const [dutyForm, setDutyForm] = useState({
    employee_groups: {} as Record<string, 'A' | 'B'>,
    from_date: '',
    to_date: '',
    start_time: '07:00',
    end_time: '23:00',
  });

  // ── Days in view ──

  const days = useMemo(() => {
    const count = viewMode === 'day' ? 1 : viewMode === 'week' ? 7 : 30;
    return Array.from({ length: count }, (_, i) => addDaysTo(startDate, i));
  }, [startDate, viewMode]);

  const dateRange = useMemo(() => ({
    from: toDateStr(days[0]),
    to: toDateStr(days[days.length - 1]),
  }), [days]);

  // ── Data fetching ──

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, vehRes, regRes, schedRes] = await Promise.all([
        supabase
          .from('employees')
          .select('id, region_id, default_vehicle_id, user:profiles(full_name), region:regions(name, color)')
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
        supabase
          .from('vehicles')
          .select('id, plate_number, brand, model, is_active')
          .eq('is_active', true)
          .order('plate_number'),
        supabase
          .from('regions')
          .select('id, name, color')
          .order('name'),
        fetch(`/api/work-schedules?from=${dateRange.from}&to=${dateRange.to}`).then(r => r.json()),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setEmployees((empRes.data || []).map((e: any) => ({
        id: e.id,
        name: e.user?.full_name || 'Pracownik',
        region_id: e.region_id,
        default_vehicle_id: e.default_vehicle_id || null,
        region_name: e.region?.name || null,
        region_color: e.region?.color || null,
      })));
      setVehicles(vehRes.data || []);
      setRegions(regRes.data || []);
      setSchedules(schedRes.schedules || []);
    } catch (err) {
      console.error('[schedule] fetch error', err);
    }
    setLoading(false);
  }, [dateRange, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Maps ──

  const scheduleMap = useMemo(() => {
    const m = new Map<string, WorkSchedule>();
    for (const s of schedules) m.set(`${s.employee_id}:${s.date}`, s);
    return m;
  }, [schedules]);

  const vehicleScheduleMap = useMemo(() => {
    const m = new Map<string, WorkSchedule>();
    for (const s of schedules) {
      if (s.vehicle_id) m.set(`${s.vehicle_id}:${s.date}`, s);
    }
    return m;
  }, [schedules]);

  const employeeNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.id, e.name);
    return m;
  }, [employees]);

  const vehiclePlateMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vehicles) m.set(v.id, v.plate_number);
    return m;
  }, [vehicles]);

  const activeVehicleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of schedules) if (s.vehicle_id) ids.add(s.vehicle_id);
    return ids;
  }, [schedules]);

  const vehiclesForGantt = useMemo(
    () => vehicles.filter(v => activeVehicleIds.has(v.id)),
    [vehicles, activeVehicleIds],
  );

  // ── Period label ──

  const periodLabel = useMemo(() => {
    const MONTHS = [
      'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
    ];
    const first = days[0];
    const last = days[days.length - 1];
    if (viewMode === 'day') {
      const dayNames = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
      return `${dayNames[first.getDay()]}, ${first.getDate()} ${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
    }
    if (first.getMonth() === last.getMonth()) {
      return `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
    }
    return `${MONTHS[first.getMonth()]} – ${MONTHS[last.getMonth()]} ${last.getFullYear()}`;
  }, [days, viewMode]);

  // ── Navigation ──

  function navigate(dir: 1 | -1) {
    setNavDir(dir);
    const count = viewMode === 'day' ? 1 : viewMode === 'week' ? 7 : 30;
    setStartDate(prev => addDaysTo(prev, dir * count));
  }

  function goToday() {
    setStartDate(viewMode === 'day' ? new Date() : getMonday(new Date()));
  }

  function switchView(v: ViewMode) {
    setViewMode(v);
    setStartDate(v === 'day' ? new Date() : getMonday(new Date()));
  }

  // ── Cell click ──

  function handleCellClick(resourceId: string, dateStr: string, forWorker = true) {
    if (!forWorker) return; // vehicle cells are read-only
    const existing = scheduleMap.get(`${resourceId}:${dateStr}`);
    const emp = employees.find(e => e.id === resourceId);
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
      setEditForm({
        employee_id: resourceId,
        start_date: dateStr,
        start_time: '07:00',
        end_date: toDateStr(addDaysTo(new Date(dateStr + 'T00:00:00'), 1)),
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

  // ── Save / delete ──

  async function handleSaveSchedule() {
    setSavingSchedule(true);
    setConflictError(null);

    const start = new Date(editForm.start_date + 'T00:00:00');
    const end = new Date(editForm.end_date + 'T00:00:00');
    const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

    for (let i = 0; i < dayCount; i++) {
      const d = addDaysTo(start, i);
      const dateStr = toDateStr(d);
      const dayStart = dayCount > 1 ? (i === 0 ? editForm.start_time : '00:00') : editForm.start_time;
      const dayEnd = dayCount > 1 ? (i === dayCount - 1 ? editForm.end_time : '23:59') : editForm.end_time;

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
      body: JSON.stringify({ employee_id: editForm.employee_id, date: editForm.originalDate || editForm.start_date }),
    });
    setEditDialogOpen(false);
    fetchData();
  }

  function handleEmployeeChange(empId: string) {
    const emp = employees.find(e => e.id === empId);
    setEditForm(f => ({
      ...f,
      employee_id: empId,
      vehicle_id: emp?.default_vehicle_id || f.vehicle_id,
      region_id: emp?.region_id || f.region_id,
    }));
  }

  // ── 48/48 ──

  function openDutyDialog() {
    const todayStr = toDateStr(new Date());
    setDutyForm({
      employee_groups: {},
      from_date: todayStr,
      to_date: toDateStr(addDaysTo(new Date(), 30)),
      start_time: '07:00',
      end_time: '23:00',
    });
    setDutyDialogOpen(true);
  }

  function toggleDutyEmployee(empId: string) {
    setDutyForm(prev => {
      const groups = { ...prev.employee_groups };
      if (groups[empId]) { delete groups[empId]; } else { groups[empId] = 'A'; }
      return { ...prev, employee_groups: groups };
    });
  }

  function setDutyGroup(empId: string, group: 'A' | 'B') {
    setDutyForm(prev => ({ ...prev, employee_groups: { ...prev.employee_groups, [empId]: group } }));
  }

  async function handleDutyGenerate() {
    const selected = Object.entries(dutyForm.employee_groups);
    if (selected.length === 0) return;
    const groupBStart = toDateStr(addDaysTo(new Date(dutyForm.from_date + 'T00:00:00'), 2));
    await fetch('/api/work-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bulk: true,
        pattern: '48_48',
        employees: selected.map(([empId, group]) => ({
          employee_id: empId,
          first_on_date: group === 'A' ? dutyForm.from_date : groupBStart,
        })),
        from_date: dutyForm.from_date,
        to_date: dutyForm.to_date,
        start_time: dutyForm.start_time,
        end_time: dutyForm.end_time,
      }),
    });
    setDutyDialogOpen(false);
    fetchData();
  }

  const compact = viewMode === 'month';

  // ─────────────────────────────────────────────────────────────────────────────

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
                const todayStr = toDateStr(new Date());
                setEditForm({
                  employee_id: employees[0]?.id || '',
                  start_date: todayStr,
                  start_time: '07:00',
                  end_date: toDateStr(addDaysTo(new Date(), 1)),
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

      <div className="p-4 lg:p-6 space-y-4">
        {/* ── Controls ── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View switcher */}
          <div className="relative flex items-center bg-white border border-gray-200 rounded-xl p-1 gap-0.5 shadow-sm">
            {(['day', 'week', 'month'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => switchView(v)}
                className={cn(
                  'relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors z-10',
                  viewMode === v ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {viewMode === v && (
                  <motion.div
                    layoutId="view-pill"
                    className="absolute inset-0 bg-blue-50 rounded-lg border border-blue-100"
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}
                <span className="relative">
                  {v === 'day' ? 'Dzień' : v === 'week' ? 'Tydzień' : 'Miesiąc'}
                </span>
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 px-3 rounded-lg text-xs" onClick={goToday}>
              Dzisiaj
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <span className="text-sm font-semibold text-gray-700">{periodLabel}</span>
        </div>

        {/* ── Calendar card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-gray-100">
            {([
              { key: 'workers', label: 'Pracownicy', icon: Users },
              { key: 'vehicles', label: 'Pojazdy', icon: Car },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  'relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors',
                  activeTab === key ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {key === 'vehicles' && vehiclesForGantt.length > 0 && (
                  <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 font-semibold">
                    {vehiclesForGantt.length}
                  </span>
                )}
                {activeTab === key && (
                  <motion.div
                    layoutId="tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              <span className="text-sm">Ładowanie grafiku…</span>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeTab}-${toDateStr(days[0])}`}
                initial={{ opacity: 0, x: navDir * 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: navDir * -12 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {activeTab === 'workers' ? (
                  <GanttGrid
                    rows={employees}
                    days={days}
                    scheduleMap={scheduleMap}
                    compact={compact}
                    resourceLabel="Pracownik"
                    renderResourceCell={id => {
                      const emp = employees.find(e => e.id === id);
                      if (!emp) return null;
                      return (
                        <div className="flex items-center gap-2">
                          <div
                            className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                            style={{ backgroundColor: emp.region_color || '#6b7280' }}
                          >
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[12px] font-medium text-gray-800 truncate">{emp.name}</div>
                            {emp.default_vehicle_id && (
                              <div className="text-[10px] text-gray-400 truncate">
                                {vehiclePlateMap.get(emp.default_vehicle_id) || ''}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                    onCellClick={(id, dateStr) => handleCellClick(id, dateStr, true)}
                  />
                ) : (
                  <>
                    {vehiclesForGantt.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                        <Car className="h-8 w-8 text-gray-200" />
                        <p className="text-sm font-medium">Brak aktywnych pojazdów w tym okresie</p>
                        <p className="text-xs text-gray-300">Przypisz pojazd do dyżuru pracownika</p>
                      </div>
                    ) : (
                      <GanttGrid
                        rows={vehiclesForGantt}
                        days={days}
                        scheduleMap={vehicleScheduleMap}
                        compact={compact}
                        resourceLabel="Pojazd"
                        renderResourceCell={id => {
                          const veh = vehiclesForGantt.find(v => v.id === id);
                          if (!veh) return null;
                          return (
                            <div>
                              <div className="text-[12px] font-bold text-gray-800">{veh.plate_number}</div>
                              <div className="text-[10px] text-gray-400">{veh.brand} {veh.model}</div>
                            </div>
                          );
                        }}
                        onCellClick={() => {}} // vehicles read-only
                      />
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ══ Edit / Create Dialog ══════════════════════════════════════════════ */}
      <Dialog open={editDialogOpen} onOpenChange={o => { setEditDialogOpen(o); if (!o) setConflictError(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editForm.isNew ? 'Nowy dyżur' : 'Edytuj dyżur'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Employee */}
            <div className="space-y-2">
              <Label>Pracownik</Label>
              <Select value={editForm.employee_id} onValueChange={v => handleEmployeeChange(v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Początek dyżuru</Label>
                <Input type="date" value={editForm.start_date}
                  onChange={e => {
                    const s = e.target.value;
                    setEditForm(f => ({ ...f, start_date: s, end_date: toDateStr(addDaysTo(new Date(s + 'T00:00:00'), 1)) }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Godzina startu</Label>
                <Input type="time" value={editForm.start_time}
                  onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Koniec dyżuru</Label>
                <Input type="date" value={editForm.end_date}
                  onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Godzina końca</Label>
                <Input type="time" value={editForm.end_time}
                  onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))}
                />
              </div>
            </div>

            {/* Vehicle */}
            <div className="space-y-2">
              <Label>Pojazd</Label>
              <Select value={editForm.vehicle_id}
                onValueChange={v => setEditForm(f => ({ ...f, vehicle_id: v === '__none__' ? '' : (v ?? '') }))}>
                <SelectTrigger><SelectValue placeholder="Wybierz pojazd" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Brak —</SelectItem>
                  {vehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.plate_number} ({v.brand} {v.model})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Region */}
            <div className="space-y-2">
              <Label>Obszar</Label>
              <Select value={editForm.region_id}
                onValueChange={v => setEditForm(f => ({ ...f, region_id: v === '__none__' ? '' : (v ?? '') }))}>
                <SelectTrigger><SelectValue placeholder="Wybierz obszar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Brak —</SelectItem>
                  {regions.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
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
              <Textarea value={editForm.notes} rows={2} placeholder="Opcjonalne…"
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>

            {/* Conflict error */}
            <AnimatePresence>
              {conflictError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm"
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
                  <span>{conflictError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-between pt-1">
              <div>
                {!editForm.isNew && (
                  <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5" onClick={handleDeleteSchedule}>
                    <Trash2 className="h-4 w-4" /> Usuń
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Anuluj</Button>
                <Button className="bg-blue-600 hover:bg-blue-700 gap-1.5" onClick={handleSaveSchedule} disabled={savingSchedule}>
                  {savingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Zapisz
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ 48/48 Duty Dialog ════════════════════════════════════════════════ */}
      <Dialog open={dutyDialogOpen} onOpenChange={setDutyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-600" /> Generuj dyżury 48/48
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pracownicy i grupy</Label>
              <p className="text-[11px] text-gray-400">
                Grupa A — dyżur zaczyna od daty startowej. Grupa B — startuje 2 dni później.
              </p>
              <div className="max-h-52 overflow-y-auto border border-gray-100 rounded-xl p-2 space-y-1">
                {employees.map(e => {
                  const selected = !!dutyForm.employee_groups[e.id];
                  return (
                    <div key={e.id} className={cn('flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors', selected ? 'bg-emerald-50' : 'hover:bg-gray-50')}>
                      <Checkbox checked={selected} onCheckedChange={() => toggleDutyEmployee(e.id)} />
                      <span className="text-sm flex-1 font-medium">{e.name}</span>
                      {selected && (
                        <div className="flex items-center gap-1">
                          {(['A', 'B'] as const).map(g => (
                            <button
                              key={g} type="button"
                              onClick={() => setDutyGroup(e.id, g)}
                              className={cn(
                                'px-2.5 py-0.5 text-[11px] font-bold rounded-lg transition-colors',
                                dutyForm.employee_groups[e.id] === g
                                  ? g === 'A' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
                                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
                              )}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {Object.keys(dutyForm.employee_groups).length > 0 && (
                <p className="text-[11px] text-gray-400">
                  Wybrano {Object.keys(dutyForm.employee_groups).length} pracowników
                  — A: {Object.values(dutyForm.employee_groups).filter(g => g === 'A').length},
                  B: {Object.values(dutyForm.employee_groups).filter(g => g === 'B').length}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Od</Label>
                <Input type="date" value={dutyForm.from_date} onChange={e => setDutyForm(f => ({ ...f, from_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Do</Label>
                <Input type="date" value={dutyForm.to_date} onChange={e => setDutyForm(f => ({ ...f, to_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Godzina startu</Label>
                <Input type="time" value={dutyForm.start_time} onChange={e => setDutyForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Godzina końca</Label>
                <Input type="time" value={dutyForm.end_time} onChange={e => setDutyForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDutyDialogOpen(false)}>Anuluj</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                disabled={Object.keys(dutyForm.employee_groups).length === 0 || !dutyForm.from_date || !dutyForm.to_date}
                onClick={handleDutyGenerate}
              >
                <Shield className="h-4 w-4" /> Generuj
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
