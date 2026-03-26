'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { isToday as dateFnsIsToday } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useTableRealtime } from '@/hooks/use-table-realtime';
import type { WorkSchedule, ShiftDragState, ShiftDragMode } from './ShiftBlock';
import { timeStr, timeToMinutes, minutesToTime, snap15 } from './ShiftBlock';
import type { EmployeeInfo, VehicleInfo, RegionInfo, EditForm } from './ShiftDialog';
import type { DutyForm } from './BulkGenerateDialog';

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

  // Duty form
  const [dutyForm, setDutyForm] = useState<DutyForm>({
    employee_groups: {},
    from_date: '',
    to_date: '',
    start_time: '07:00',
    end_time: '07:00',
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

  // Auto-refresh when work_schedules change via Supabase Realtime
  useTableRealtime('work_schedules', fetchData);

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
    if (!forWorker) return;
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
      to_date: '',
      start_time: '07:00',
      end_time: '07:00',
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
    const durationDays = Math.ceil(durationH / 24);
    // Total days: (on + off) * count for each rotation
    const totalCycleDays = durationDays * 2 * shiftCount;
    const toDate = toDateStr(addDaysTo(new Date(dutyForm.from_date + 'T00:00:00'), totalCycleDays));

    // Group B starts after 1 full duty cycle (duration_hours offset)
    const groupBStart = toDateStr(addDaysTo(new Date(dutyForm.from_date + 'T00:00:00'), durationDays));

    // Calculate end_time from start_time + duration
    const startMin = (() => { const [h, m] = dutyForm.start_time.split(':').map(Number); return h * 60 + (m || 0); })();
    const endMin = (startMin + (durationH % 24) * 60) % 1440;
    const endTimeStr = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

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
        to_date: toDate,
        start_time: dutyForm.start_time,
        end_time: endTimeStr,
      }),
    });
    setDutyDialogOpen(false);
    fetchData();
  }

  function openNewShift() {
    setConflictError(null);
    const todayStr = toDateStr(new Date());
    setEditForm({
      employee_id: '',
      start_date: todayStr,
      start_time: '07:00',
      end_date: toDateStr(addDaysTo(new Date(), 1)),
      end_time: '07:00',
      vehicle_id: '',
      region_id: '',
      notes: '',
      isNew: true,
      originalDate: '',
    });
    setEditDialogOpen(true);
  }

  const compact = viewMode === 'month';

  // ── Shift drag-to-resize / drag-to-move ──

  const [shiftDrag, setShiftDrag] = useState<ShiftDragState | null>(null);
  const [shiftDragPreview, setShiftDragPreview] = useState<{
    scheduleId: string; start_time: string; end_time: string;
  } | null>(null);

  const handleShiftDragStart = useCallback((
    schedule: WorkSchedule,
    mode: ShiftDragMode,
    startX: number,
    cellWidth: number,
  ) => {
    setShiftDrag({
      scheduleId: schedule.id,
      mode,
      startX,
      origStartTime: timeStr(schedule.start_time),
      origEndTime: timeStr(schedule.end_time),
      cellWidth,
    });
    setShiftDragPreview(null);
  }, []);

  // Global mousemove / mouseup for shift dragging
  useEffect(() => {
    if (!shiftDrag) return;

    const TOTAL_DAY_MINUTES = 24 * 60;
    let latestPreview: { scheduleId: string; start_time: string; end_time: string } | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - shiftDrag.startX;
      const minutesDelta = snap15(Math.round((dx / shiftDrag.cellWidth) * TOTAL_DAY_MINUTES));

      const origStart = timeToMinutes(shiftDrag.origStartTime);
      const origEnd = timeToMinutes(shiftDrag.origEndTime);

      let newStart: number;
      let newEnd: number;

      if (shiftDrag.mode === 'resize-end') {
        newStart = origStart;
        newEnd = Math.max(origStart + 15, origEnd + minutesDelta);
      } else {
        const duration = origEnd - origStart;
        newStart = origStart + minutesDelta;
        newEnd = newStart + duration;
        if (newStart < 0) { newStart = 0; newEnd = duration; }
        if (newEnd > 1439) { newEnd = 1439; newStart = newEnd - duration; }
      }

      newStart = Math.max(0, Math.min(1439, newStart));
      newEnd = Math.max(0, Math.min(1439, newEnd));

      const preview = {
        scheduleId: shiftDrag.scheduleId,
        start_time: minutesToTime(newStart),
        end_time: minutesToTime(newEnd),
      };
      latestPreview = preview;
      setShiftDragPreview(preview);
    };

    const handleMouseUp = async () => {
      const preview = latestPreview;
      setShiftDrag(null);

      if (!preview) {
        setShiftDragPreview(null);
        return;
      }

      const origStart = shiftDrag.origStartTime;
      const origEnd = shiftDrag.origEndTime;
      if (preview.start_time === origStart && preview.end_time === origEnd) {
        setShiftDragPreview(null);
        return;
      }

      const sched = schedules.find(s => s.id === preview.scheduleId);
      if (!sched) { setShiftDragPreview(null); return; }

      try {
        await fetch('/api/work-schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: sched.employee_id,
            date: sched.date,
            start_time: preview.start_time,
            end_time: preview.end_time,
            vehicle_id: sched.vehicle_id || null,
            region_id: sched.region_id || null,
            notes: sched.notes || null,
          }),
        });
        fetchData();
      } catch (err) {
        console.error('[schedule] shift drag save error', err);
      }
      setShiftDragPreview(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [shiftDrag, schedules, fetchData]);

  return {
    // Data
    employees,
    vehicles,
    regions,
    schedules,
    loading,

    // View state
    viewMode,
    activeTab,
    setActiveTab,
    days,
    navDir,
    compact,
    periodLabel,

    // Maps
    scheduleMap,
    vehicleScheduleMap,
    vehiclePlateMap,
    vehiclesForGantt,

    // Navigation
    navigate,
    goToday,
    switchView,

    // Edit dialog
    editDialogOpen,
    setEditDialogOpen,
    editForm,
    setEditForm,
    conflictError,
    setConflictError,
    savingSchedule,
    handleCellClick,
    handleSaveSchedule,
    handleDeleteSchedule,
    handleEmployeeChange,
    openNewShift,

    // Duty dialog
    dutyDialogOpen,
    setDutyDialogOpen,
    dutyForm,
    setDutyForm,
    openDutyDialog,
    handleDutyGenerate,

    // Shift drag-to-resize/move
    handleShiftDragStart,
    shiftDragPreview,
  };
}
