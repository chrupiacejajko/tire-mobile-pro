'use client';

import { ChevronLeft, ChevronRight, AlertTriangle, Users, Rows3, Rows4, StretchHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  type CalendarView,
  type CalendarOrder,
  type EmployeeCol,
  type DensityLevel,
  DAYS_PL,
  statusConfig,
  schedulingTypeConfig,
  DENSITY_CONFIG,
} from './types';

interface CalendarToolbarProps {
  currentDate: Date;
  view: CalendarView;
  orders: CalendarOrder[];
  employees: EmployeeCol[];
  unassignedCount: number;
  density: DensityLevel;
  onNavigate: (dir: number) => void;
  onViewChange: (view: CalendarView) => void;
  onDensityChange: (d: DensityLevel) => void;
  onToday: () => void;
  onOpenUnassigned: () => void;
}

function getWeekDates(date: Date): Date[] {
  const start = new Date(date);
  const day = start.getDay();
  start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

const VIEW_OPTIONS: { value: CalendarView; label: string; shortLabel: string }[] = [
  { value: 'team', label: 'Zespół', shortLabel: 'Zespół' },
  { value: 'timeline', label: 'Timeline', shortLabel: 'Timeline' },
  { value: 'week', label: 'Tydzień', shortLabel: 'Tydz.' },
  { value: 'month', label: 'Miesiąc', shortLabel: 'Mies.' },
];

export function CalendarToolbar({
  currentDate,
  view,
  orders,
  employees,
  unassignedCount,
  density,
  onNavigate,
  onViewChange,
  onDensityChange,
  onToday,
  onOpenUnassigned,
}: CalendarToolbarProps) {
  const weekDates = getWeekDates(currentDate);
  const isToday = currentDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];

  const getTitle = () => {
    if (view === 'team')
      return currentDate.toLocaleDateString('pl', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    if (view === 'month')
      return currentDate.toLocaleDateString('pl', { month: 'long', year: 'numeric' });
    return `${weekDates[0].getDate()} ${weekDates[0].toLocaleDateString('pl', { month: 'short' })} – ${weekDates[6].getDate()} ${weekDates[6].toLocaleDateString('pl', { month: 'short' })} ${weekDates[6].getFullYear()}`;
  };

  // Stats for team view
  const total = orders.length;
  const completed = orders.filter(o => o.status === 'completed').length;

  return (
    <div className="space-y-3">
      {/* Main row — 3 zones */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* LEFT: Date navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-lg border-gray-200/80 hover:bg-gray-50 active:scale-[0.97] transition-all"
            onClick={() => onNavigate(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <h2 className="text-lg font-bold min-w-[240px] text-center capitalize text-gray-900 tracking-tight">
            {getTitle()}
          </h2>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-lg border-gray-200/80 hover:bg-gray-50 active:scale-[0.97] transition-all"
            onClick={() => onNavigate(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant={isToday ? 'default' : 'outline'}
            size="sm"
            className={`ml-1 h-8 rounded-lg text-xs font-semibold active:scale-[0.97] transition-all ${isToday ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm shadow-orange-500/20' : 'border-gray-200/80'}`}
            onClick={onToday}
          >
            Dziś
          </Button>
        </div>

        {/* RIGHT: Controls group */}
        <div className="flex items-center gap-2">
          {/* Unassigned badge */}
          {unassignedCount > 0 && (
            <button
              onClick={onOpenUnassigned}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-700 text-xs font-semibold hover:bg-amber-100 active:scale-[0.97] transition-all shadow-sm shadow-amber-500/5"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {unassignedCount} nieprzydzielonych
            </button>
          )}

          {/* Density presets */}
          {(view === 'team' || view === 'timeline') && (
            <div className="flex items-center bg-gray-100/60 rounded-lg p-0.5 gap-0.5">
              {(['compact', 'normal', 'comfortable'] as DensityLevel[]).map(d => {
                const active = density === d;
                const DIcon = d === 'compact' ? Rows4 : d === 'comfortable' ? StretchHorizontal : Rows3;
                return (
                  <button
                    key={d}
                    onClick={() => onDensityChange(d)}
                    className={`h-7 px-2 rounded-md text-[10px] font-medium flex items-center gap-1 transition-all active:scale-[0.97] ${
                      active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                    }`}
                    title={DENSITY_CONFIG[d].label}
                  >
                    <DIcon className="h-3.5 w-3.5" />
                    <span className="hidden 2xl:inline">{DENSITY_CONFIG[d].label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* View switcher — segmented control */}
          <div className="flex items-center bg-gray-100/60 rounded-lg p-0.5 gap-0.5">
            {VIEW_OPTIONS.map(opt => {
              const active = view === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onViewChange(opt.value)}
                  className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-all active:scale-[0.97] ${
                    active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {opt.shortLabel}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stats + legend row */}
      {view === 'team' && (
        <div className="flex items-center justify-between flex-wrap gap-2 bg-gray-50/50 rounded-lg px-3 py-2 border border-gray-100/60">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-700">
              {total} <span className="text-gray-400 font-normal">zleceń</span>
            </span>
            <span className="text-xs font-semibold text-emerald-700">
              {completed} <span className="text-emerald-500 font-normal">ukończonych</span>
            </span>
            {/* Load per employee */}
            <div className="hidden lg:flex items-center gap-3 ml-1 pl-3 border-l border-gray-200/60">
              {employees.map(e => {
                const count = orders.filter(o => o.employee_id === e.id).length;
                return (
                  <span key={e.id} className="text-[11px] text-gray-400 flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                    {e.name.split(' ')[0]}: <strong className="text-gray-600">{count}</strong>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Status + type legend */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              {Object.entries(statusConfig)
                .filter(([k]) => !['cancelled', 'in_transit'].includes(k))
                .map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1">
                    <div className={`h-2 w-2 rounded-full ${v.dot}`} />
                    <span className="text-[10px] text-gray-400">{v.label}</span>
                  </div>
                ))}
            </div>
            <div className="w-px h-3.5 bg-gray-200/60" />
            <div className="flex items-center gap-2.5">
              {Object.values(schedulingTypeConfig).map(st => (
                <div key={st.type} className="flex items-center gap-1">
                  <st.Icon className={`h-2.5 w-2.5 ${st.color}`} />
                  <span className="text-[10px] text-gray-400">{st.shortLabel}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
