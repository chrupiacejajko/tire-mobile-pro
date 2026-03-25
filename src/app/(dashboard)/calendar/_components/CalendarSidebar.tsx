'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Circle, CheckCircle2, PlayCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  type CalendarOrder,
  type EmployeeCol,
  type CalendarView,
  statusConfig,
  schedulingTypeConfig,
} from './types';

interface CalendarSidebarProps {
  currentDate: Date;
  view: CalendarView;
  orders: CalendarOrder[];
  employees: EmployeeCol[];
  filterStatuses: Set<string>;
  filterTypes: Set<string>;
  filterEmployees: Set<string>;
  onFilterStatusToggle: (status: string) => void;
  onFilterTypeToggle: (type: string) => void;
  onFilterEmployeeToggle: (empId: string) => void;
  onClearFilters: () => void;
  onDateChange: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
}

const MINI_DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

export function CalendarSidebar({
  currentDate,
  view,
  orders,
  employees,
  filterStatuses,
  filterTypes,
  filterEmployees,
  onFilterStatusToggle,
  onFilterTypeToggle,
  onFilterEmployeeToggle,
  onClearFilters,
  onDateChange,
  onViewChange,
}: CalendarSidebarProps) {
  const hasActiveFilters = filterStatuses.size > 0 || filterTypes.size > 0 || filterEmployees.size > 0;
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const selectedStr = currentDate.toISOString().split('T')[0];

  // Mini calendar month data
  const miniCalMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();

    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = Array(startPad).fill(null);
    for (let d = 1; d <= totalDays; d++) {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return { year, month, weeks };
  }, [currentDate]);

  // Orders per day (for dot indicators on mini calendar)
  const ordersByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      map.set(o.scheduled_date, (map.get(o.scheduled_date) || 0) + 1);
    }
    return map;
  }, [orders]);

  // Stats
  const stats = useMemo(() => {
    const total = orders.length;
    const byStatus = {
      new: orders.filter(o => o.status === 'new').length,
      assigned: orders.filter(o => o.status === 'assigned').length,
      in_progress: orders.filter(o => o.status === 'in_progress').length,
      completed: orders.filter(o => o.status === 'completed').length,
    };
    const byType = {
      asap: orders.filter(o => o.scheduling_type === 'asap').length,
      fixed_time: orders.filter(o => o.scheduling_type === 'fixed_time').length,
      time_window: orders.filter(o => o.scheduling_type === 'time_window').length,
      flexible: orders.filter(o => o.scheduling_type === 'flexible').length,
    };
    const unassigned = orders.filter(o => !o.employee_id).length;
    return { total, byStatus, byType, unassigned };
  }, [orders]);

  const navigateMiniMonth = (dir: number) => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + dir);
    onDateChange(d);
  };

  return (
    <div className="w-[256px] flex-shrink-0">
      {/* Single unified container */}
      <div className="bg-white rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">

        {/* ── Mini Calendar ── */}
        <div className="p-3">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => navigateMiniMonth(-1)} className="h-6 w-6 rounded-md hover:bg-gray-100 flex items-center justify-center transition-colors active:scale-[0.95]">
              <ChevronLeft className="h-3.5 w-3.5 text-gray-400" />
            </button>
            <span className="text-[12px] font-bold text-gray-900 capitalize">
              {currentDate.toLocaleDateString('pl', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={() => navigateMiniMonth(1)} className="h-6 w-6 rounded-md hover:bg-gray-100 flex items-center justify-center transition-colors active:scale-[0.95]">
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-0 mb-0.5">
            {MINI_DAYS.map(d => (
              <div key={d} className="text-center text-[9px] font-semibold text-gray-300 py-0.5 uppercase">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          {miniCalMonth.weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-0">
              {week.map((day, di) => {
                if (day === null) return <div key={di} className="h-7" />;
                const ds = `${miniCalMonth.year}-${(miniCalMonth.month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                const isToday = ds === todayStr;
                const isSelected = ds === selectedStr;
                const orderCount = ordersByDate.get(ds) || 0;

                return (
                  <button
                    key={di}
                    onClick={() => {
                      onDateChange(new Date(ds));
                      if (view !== 'team') onViewChange('team');
                    }}
                    className={`
                      h-7 w-full rounded-md text-[11px] font-medium relative transition-all active:scale-[0.95]
                      ${isSelected
                        ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/25'
                        : isToday
                          ? 'bg-orange-50 text-orange-600 font-bold'
                          : 'text-gray-600 hover:bg-gray-50'
                      }
                    `}
                  >
                    {day}
                    {orderCount > 0 && !isSelected && (
                      <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${isToday ? 'bg-orange-400' : 'bg-blue-400'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Separator */}
        <div className="h-px bg-gray-100/80 mx-3" />

        {/* ── Compact Stats Row ── */}
        <div className="px-3 py-2.5 flex items-center gap-2">
          <StatPill icon={<Circle className="h-2.5 w-2.5" />} value={stats.total} label="Zleceń" color="text-blue-600" bg="bg-blue-50/80" />
          <StatPill icon={<AlertTriangle className="h-2.5 w-2.5" />} value={stats.unassigned} label="Nieprz." color="text-amber-600" bg="bg-amber-50/80" alert={stats.unassigned > 0} />
          <StatPill icon={<PlayCircle className="h-2.5 w-2.5" />} value={stats.byStatus.in_progress} label="W toku" color="text-violet-600" bg="bg-violet-50/80" />
          <StatPill icon={<CheckCircle2 className="h-2.5 w-2.5" />} value={stats.byStatus.completed} label="Got." color="text-emerald-600" bg="bg-emerald-50/80" />
        </div>

        {/* Separator */}
        <div className="h-px bg-gray-100/80 mx-3" />

        {/* ── Employee Load ── */}
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Obłożenie</h3>
            {filterEmployees.size > 0 && (
              <button onClick={() => { for (const e of filterEmployees) onFilterEmployeeToggle(e); }} className="text-[9px] text-orange-500 font-medium hover:underline">
                Wszyscy
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {employees.map(emp => {
              const count = orders.filter(o => o.employee_id === emp.id).length;
              const maxOrders = Math.max(1, ...employees.map(e => orders.filter(o => o.employee_id === e.id).length));
              const pct = (count / maxOrders) * 100;
              const isFiltered = filterEmployees.size > 0 && !filterEmployees.has(emp.id);
              return (
                <button
                  key={emp.id}
                  onClick={() => onFilterEmployeeToggle(emp.id)}
                  className={`flex items-center gap-2 w-full text-left rounded-md px-1 py-0.5 transition-all ${isFiltered ? 'opacity-35' : 'hover:bg-gray-50/60'}`}
                >
                  <div className="h-4 w-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: emp.color }}>
                    {emp.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-medium text-gray-600 truncate">{emp.name.split(' ')[0]}</span>
                      <span className="text-[10px] font-bold text-gray-800">{count}</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: emp.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Separator */}
        <div className="h-px bg-gray-100/80 mx-3" />

        {/* ── Filters: Types + Statuses combined ── */}
        <div className="px-3 py-2.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Filtry</h3>

          {/* Scheduling types — inline chips */}
          <div className="flex flex-wrap gap-1 mb-2">
            {Object.values(schedulingTypeConfig).map(st => {
              const isFiltered = filterTypes.size > 0 && !filterTypes.has(st.type);
              const count = stats.byType[st.type as keyof typeof stats.byType] || 0;
              return (
                <button
                  key={st.type}
                  onClick={() => onFilterTypeToggle(st.type)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all active:scale-[0.97] ${
                    isFiltered
                      ? 'opacity-30 bg-gray-50'
                      : `${st.bgColor} hover:brightness-95`
                  }`}
                >
                  <st.Icon className={`h-3 w-3 ${isFiltered ? 'text-gray-400' : st.color}`} />
                  <span className={isFiltered ? 'text-gray-400' : st.color}>{st.shortLabel}</span>
                  <span className={`text-[8px] font-bold ml-0.5 ${isFiltered ? 'text-gray-300' : 'opacity-50'}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Status filters — inline chips */}
          <div className="flex flex-wrap gap-1">
            {Object.entries(statusConfig)
              .filter(([k]) => !['cancelled', 'in_transit'].includes(k))
              .map(([key, cfg]) => {
                const isFiltered = filterStatuses.size > 0 && !filterStatuses.has(key);
                const count = stats.byStatus[key as keyof typeof stats.byStatus] || 0;
                return (
                  <button
                    key={key}
                    onClick={() => onFilterStatusToggle(key)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all active:scale-[0.97] ${
                      isFiltered
                        ? 'opacity-30 bg-gray-50'
                        : `${cfg.bgLight} hover:brightness-95`
                    }`}
                  >
                    <div className={`h-2 w-2 rounded-full ${isFiltered ? 'bg-gray-300' : cfg.dot}`} />
                    <span className={isFiltered ? 'text-gray-400' : cfg.text}>{cfg.label}</span>
                    <span className={`text-[8px] font-bold ml-0.5 ${isFiltered ? 'text-gray-300' : 'opacity-50'}`}>{count}</span>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <>
            <div className="h-px bg-gray-100/80 mx-3" />
            <div className="px-3 py-2">
              <button
                onClick={onClearFilters}
                className="w-full text-center text-[11px] text-orange-500 font-semibold py-1.5 bg-orange-50/60 rounded-lg hover:bg-orange-100/60 transition-colors active:scale-[0.98]"
              >
                Wyczyść filtry
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatPill({
  icon, value, label, color, bg, alert = false,
}: {
  icon: React.ReactNode; value: number; label: string; color: string; bg: string; alert?: boolean;
}) {
  return (
    <div className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg ${bg} ${alert && value > 0 ? 'ring-1 ring-amber-300/60' : ''}`}>
      <span className={color}>{icon}</span>
      <div className="min-w-0">
        <p className={`text-sm font-black ${color} leading-none`}>{value}</p>
        <p className={`text-[7px] font-semibold uppercase tracking-wide ${color} opacity-60 leading-none mt-0.5`}>{label}</p>
      </div>
    </div>
  );
}
