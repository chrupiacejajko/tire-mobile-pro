'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { isToday as dateFnsIsToday } from 'date-fns';
import {
  ChevronLeft, ChevronRight, Plus, Shield,
  Car, Users, CalendarDays, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Topbar } from '@/components/layout/topbar';
import { cn } from '@/lib/utils';

import { ShiftBlock, type WorkSchedule } from './_components/ShiftBlock';
import { ShiftDialog } from './_components/ShiftDialog';
import { BulkGenerateDialog } from './_components/BulkGenerateDialog';
import { useScheduleData, toDateStr, type ViewMode } from './_components/useScheduleData';

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
  onShiftDragStart,
  shiftDragPreview,
}: {
  rows: { id: string }[];
  days: Date[];
  scheduleMap: Map<string, WorkSchedule>;
  compact: boolean;
  resourceLabel: string;
  renderResourceCell: (id: string) => React.ReactNode;
  onCellClick: (id: string, dateStr: string) => void;
  onShiftDragStart?: (schedule: WorkSchedule, mode: import('./_components/ShiftBlock').ShiftDragMode, startX: number, cellWidth: number) => void;
  shiftDragPreview?: { scheduleId: string; start_time: string; end_time: string } | null;
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
                          onDragStart={onShiftDragStart}
                          previewTime={
                            shiftDragPreview?.scheduleId === schedule.id
                              ? { start_time: shiftDragPreview.start_time, end_time: shiftDragPreview.end_time }
                              : null
                          }
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
  const data = useScheduleData();

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
              onClick={data.openNewShift}
            >
              <Plus className="h-4 w-4" /> Utwórz dyżur
            </Button>
            <Button
              className="h-9 rounded-xl text-sm gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={data.openDutyDialog}
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
                onClick={() => data.switchView(v)}
                className={cn(
                  'relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors z-10',
                  data.viewMode === v ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {data.viewMode === v && (
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
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => data.navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 px-3 rounded-lg text-xs" onClick={data.goToday}>
              Dzisiaj
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => data.navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <span className="text-sm font-semibold text-gray-700">{data.periodLabel}</span>
        </div>

        {/* ── Calendar card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-gray-100">
            {([
              { key: 'workers' as const, label: 'Pracownicy', icon: Users },
              { key: 'vehicles' as const, label: 'Pojazdy', icon: Car },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => data.setActiveTab(key)}
                className={cn(
                  'relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors',
                  data.activeTab === key ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {key === 'vehicles' && data.vehiclesForGantt.length > 0 && (
                  <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 font-semibold">
                    {data.vehiclesForGantt.length}
                  </span>
                )}
                {data.activeTab === key && (
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
          {data.loading ? (
            <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              <span className="text-sm">Ładowanie grafiku…</span>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${data.activeTab}-${toDateStr(data.days[0])}`}
                initial={{ opacity: 0, x: data.navDir * 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: data.navDir * -12 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {data.activeTab === 'workers' ? (
                  <GanttGrid
                    rows={data.employees}
                    days={data.days}
                    scheduleMap={data.scheduleMap}
                    compact={data.compact}
                    resourceLabel="Pracownik"
                    renderResourceCell={id => {
                      const emp = data.employees.find(e => e.id === id);
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
                                {data.vehiclePlateMap.get(emp.default_vehicle_id) || ''}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                    onCellClick={(id, dateStr) => data.handleCellClick(id, dateStr, true)}
                    onShiftDragStart={data.handleShiftDragStart}
                    shiftDragPreview={data.shiftDragPreview}
                  />
                ) : (
                  <>
                    {data.vehiclesForGantt.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                        <Car className="h-8 w-8 text-gray-200" />
                        <p className="text-sm font-medium">Brak aktywnych pojazdów w tym okresie</p>
                        <p className="text-xs text-gray-300">Przypisz pojazd do dyżuru pracownika</p>
                      </div>
                    ) : (
                      <GanttGrid
                        rows={data.vehiclesForGantt}
                        days={data.days}
                        scheduleMap={data.vehicleScheduleMap}
                        compact={data.compact}
                        resourceLabel="Pojazd"
                        renderResourceCell={id => {
                          const veh = data.vehiclesForGantt.find(v => v.id === id);
                          if (!veh) return null;
                          return (
                            <div>
                              <div className="text-[12px] font-bold text-gray-800">{veh.plate_number}</div>
                              <div className="text-[10px] text-gray-400">{veh.brand} {veh.model}</div>
                            </div>
                          );
                        }}
                        onCellClick={() => {}}
                      />
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ── Dialogs ── */}
      <ShiftDialog
        open={data.editDialogOpen}
        onOpenChange={o => { data.setEditDialogOpen(o); if (!o) data.setConflictError(null); }}
        editForm={data.editForm}
        setEditForm={data.setEditForm}
        employees={data.employees}
        vehicles={data.vehicles}
        regions={data.regions}
        conflictError={data.conflictError}
        savingSchedule={data.savingSchedule}
        onSave={data.handleSaveSchedule}
        onDelete={data.handleDeleteSchedule}
        onEmployeeChange={data.handleEmployeeChange}
      />

      <BulkGenerateDialog
        open={data.dutyDialogOpen}
        onOpenChange={data.setDutyDialogOpen}
        dutyForm={data.dutyForm}
        setDutyForm={data.setDutyForm}
        employees={data.employees}
        onGenerate={data.handleDutyGenerate}
      />
    </div>
  );
}
