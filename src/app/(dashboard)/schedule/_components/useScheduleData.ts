'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTableRealtime } from '@/hooks/use-table-realtime';
import type { WorkSchedule, DayShiftSlice } from './ShiftBlock';
import type { EmployeeInfo, VehicleInfo, RegionInfo, EditForm } from './ShiftDialog';
import type { DutyForm } from './BulkGenerateDialog';
import { getShiftTimesForDate } from '@/lib/schedule-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ViewMode = 'day' | 'week' | 'month';
export type ActiveTab = 'workers' | 'vehicles';

// ─── Helpers ────────────────────────────────────────────────────────────────

export function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function addDaysTo(d: Date, n: number): Date {
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

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useScheduleData() {
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
  const [editForm, setEditForm] = useState<EditForm>({
    id: '',
    employee_id: '',
    start_at: '',
    duration_hours: 24,
    vehicle_id: '',
    region_id: '',
    notes: '',
    isNew: true,
  });

  // Duty form
  const [dutyForm, setDutyForm] = useState<DutyForm>({
    employee_groups: {},
    from_date: '',
    start_time: '07:00',
    duration_hours: '48',
    shift_count: '4',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.from, dateRange.to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh when work_schedules change
  useTableRealtime('work_schedules', fetchData);

  // ── Maps — DayShiftSlice approach ──

  const scheduleMap = useMemo(() => {
    const m = new Map<string, DayShiftSlice>();
    for (const shift of schedules) {
      // For each day in the view, check if this shift covers it
      for (const day of days) {
        const dateStr = toDateStr(day);
        const times = getShiftTimesForDate(shift.start_at, shift.duration_minutes, dateStr);
        if (!times) continue;

        const shiftStart = new Date(shift.start_at);
        const shiftStartDate = toDateStr(shiftStart);
        const shiftEnd = new Date(new Date(shift.start_at).getTime() + shift.duration_minutes * 60_000);
        const shiftEndDate = toDateStr(shiftEnd);

        m.set(`${shift.employee_id}:${dateStr}`, {
          shift,
          dayStart: times.start,
          dayEnd: times.end,
          isFirstDay: dateStr === shiftStartDate,
          isLastDay: dateStr === shiftEndDate || (dateStr === toDateStr(addDaysTo(shiftEnd, -1)) && shiftEnd.getHours() === 0 && shiftEnd.getMinutes() === 0),
        });
      }
    }
    return m;
  }, [schedules, days]);

  const vehicleScheduleMap = useMemo(() => {
    const m = new Map<string, DayShiftSlice>();
    for (const shift of schedules) {
      if (!shift.vehicle_id) continue;
      for (const day of days) {
        const dateStr = toDateStr(day);
        const times = getShiftTimesForDate(shift.start_at, shift.duration_minutes, dateStr);
        if (!times) continue;

        const shiftStart = new Date(shift.start_at);
        const shiftStartDate = toDateStr(shiftStart);
        const shiftEnd = new Date(new Date(shift.start_at).getTime() + shift.duration_minutes * 60_000);
        const shiftEndDate = toDateStr(shiftEnd);

        m.set(`${shift.vehicle_id}:${dateStr}`, {
          shift,
          dayStart: times.start,
          dayEnd: times.end,
          isFirstDay: dateStr === shiftStartDate,
          isLastDay: dateStr === shiftEndDate,
        });
      }
    }
    return m;
  }, [schedules, days]);

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
    if (!forWorker) return;
    const slice = scheduleMap.get(`${resourceId}:${dateStr}`);
    const emp = employees.find(e => e.id === resourceId);
    setConflictError(null);

    if (slice) {
      // Edit existing shift
      const s = slice.shift;
      const startAt = new Date(s.start_at);
      setEditForm({
        id: s.id,
        employee_id: s.employee_id,
        start_at: toLocalDateTimeStr(startAt),
        duration_hours: Math.round(s.duration_minutes / 60 * 10) / 10,
        vehicle_id: s.vehicle_id || emp?.default_vehicle_id || '',
        region_id: s.region_id || emp?.region_id || '',
        notes: s.notes || '',
        isNew: false,
      });
    } else {
      // New shift
      const startAt = new Date(dateStr + 'T07:00:00');
      setEditForm({
        id: '',
        employee_id: resourceId,
        start_at: toLocalDateTimeStr(startAt),
        duration_hours: 24,
        vehicle_id: emp?.default_vehicle_id || '',
        region_id: emp?.region_id || '',
        notes: '',
        isNew: true,
      });
    }
    setEditDialogOpen(true);
  }

  // ── Save / delete ──

  async function handleSaveSchedule() {
    setSavingSchedule(true);
    setConflictError(null);

    const startAtISO = new Date(editForm.start_at).toISOString();
    const durationMinutes = Math.round(editForm.duration_hours * 60);

    const res = await fetch('/api/work-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: editForm.employee_id,
        start_at: startAtISO,
        duration_minutes: durationMinutes,
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

    setSavingSchedule(false);
    setEditDialogOpen(false);
    fetchData();
  }

  async function handleDeleteSchedule() {
    if (!editForm.id) return;
    await fetch('/api/work-schedules', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editForm.id }),
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

  // ── Duty generation ──

  function openDutyDialog() {
    const todayStr = toDateStr(new Date());
    setDutyForm({
      employee_groups: {},
      from_date: todayStr,
      start_time: '07:00',
      duration_hours: '48',
      shift_count: '4',
    });
    setDutyDialogOpen(true);
  }

  async function handleDutyGenerate() {
    const selected = Object.entries(dutyForm.employee_groups);
    if (selected.length === 0) return;

    const durationH = Number(dutyForm.duration_hours) || 48;
    const shiftCount = Number(dutyForm.shift_count) || 1;
    const onDays = Math.ceil(durationH / 24);
    const groupBStart = toDateStr(addDaysTo(new Date(dutyForm.from_date + 'T00:00:00'), onDays));

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
        start_time: dutyForm.start_time,
        duration_hours: durationH,
        shift_count: shiftCount,
      }),
    });
    setDutyDialogOpen(false);
    fetchData();
  }

  function openNewShift() {
    setConflictError(null);
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(7);
    setEditForm({
      id: '',
      employee_id: '',
      start_at: toLocalDateTimeStr(now),
      duration_hours: 24,
      vehicle_id: '',
      region_id: '',
      notes: '',
      isNew: true,
    });
    setEditDialogOpen(true);
  }

  const compact = viewMode === 'month';

  return {
    employees, vehicles, regions, schedules, loading,
    viewMode, activeTab, setActiveTab, days, navDir, compact, periodLabel,
    scheduleMap, vehicleScheduleMap, vehiclePlateMap, vehiclesForGantt,
    navigate, goToday, switchView,
    editDialogOpen, setEditDialogOpen, editForm, setEditForm,
    conflictError, setConflictError, savingSchedule,
    handleCellClick, handleSaveSchedule, handleDeleteSchedule, handleEmployeeChange, openNewShift,
    dutyDialogOpen, setDutyDialogOpen, dutyForm, setDutyForm, openDutyDialog, handleDutyGenerate,
  };
}

/** Format Date to datetime-local input value (YYYY-MM-DDTHH:MM) */
function toLocalDateTimeStr(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da}T${h}:${mi}`;
}
