'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Clock, Zap, CalendarRange } from 'lucide-react';
import {
  type CalendarOrder,
  type EmployeeCol,
  type WorkScheduleBlock,
  HOURS,
  GRID_START_HOUR,
  ROW_H,
  timeToHours,
  formatTime,
  splitOrderLayers,
} from './types';

/* ═══════════════════════════════════════════════════════════════════
 * HORIZONTAL TIMELINE VIEW v2 (Gantt-style)
 *
 * v2 changes:
 *   - Gradient card backgrounds (matching EventBlock v2)
 *   - 5px accent bar with darker colors
 *   - Dot pattern for time windows (matching TeamView v2)
 *   - Frosted header in time windows
 *   - Wyciszone grid lines
 *   - Alternating row backgrounds
 *   - Premium container (no Card wrapper)
 *   - Stronger shadows and hover states
 * ═══════════════════════════════════════════════════════════════════ */

const COL_W = 120;
const ROW_HEIGHT = 72;

// Status → accent bar color (darker, matching EventBlock v2)
const accentColors: Record<string, string> = {
  new:         '#2563eb',
  assigned:    '#d97706',
  in_progress: '#7c3aed',
  in_transit:  '#4f46e5',
  completed:   '#059669',
  cancelled:   '#9ca3af',
};

// Status → gradient backgrounds (matching EventBlock v2)
const cardGradients: Record<string, string> = {
  new:         'linear-gradient(to right, rgba(219,234,254,0.9), rgba(239,246,255,0.7))',
  assigned:    'linear-gradient(to right, rgba(254,243,199,0.9), rgba(255,251,235,0.7))',
  in_progress: 'linear-gradient(to right, rgba(237,233,254,0.9), rgba(245,243,255,0.7))',
  in_transit:  'linear-gradient(to right, rgba(224,231,255,0.9), rgba(238,242,255,0.7))',
  completed:   'linear-gradient(to right, rgba(209,250,229,0.8), rgba(236,253,245,0.6))',
  cancelled:   'linear-gradient(to right, rgba(243,244,246,0.7), rgba(249,250,251,0.5))',
};

// Status → shadow tints
const cardShadows: Record<string, string> = {
  new:         '0 1px 3px rgba(37,99,235,0.10), 0 1px 2px rgba(0,0,0,0.04)',
  assigned:    '0 1px 3px rgba(217,119,6,0.10), 0 1px 2px rgba(0,0,0,0.04)',
  in_progress: '0 1px 3px rgba(124,58,237,0.10), 0 1px 2px rgba(0,0,0,0.04)',
  in_transit:  '0 1px 3px rgba(79,70,229,0.10), 0 1px 2px rgba(0,0,0,0.04)',
  completed:   '0 1px 3px rgba(5,150,105,0.10), 0 1px 2px rgba(0,0,0,0.04)',
  cancelled:   '0 1px 2px rgba(0,0,0,0.05)',
};

const textColors: Record<string, string> = {
  new:         '#1e3a8a',
  assigned:    '#78350f',
  in_progress: '#4c1d95',
  in_transit:  '#312e81',
  completed:   '#064e3b',
  cancelled:   '#6b7280',
};

const subColors: Record<string, string> = {
  new:         '#1d4ed8',
  assigned:    '#b45309',
  in_progress: '#6d28d9',
  in_transit:  '#4338ca',
  completed:   '#047857',
  cancelled:   '#9ca3af',
};

// Window accents (matching TeamView v2 — dot pattern)
const windowAccents: Record<string, { bg: string; bgHover: string; border: string; dot: string; text: string; headerBg: string }> = {
  new:         { bg: 'rgba(59,130,246,0.07)', bgHover: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.20)', dot: 'rgba(59,130,246,0.10)', text: 'text-blue-600', headerBg: 'rgba(255,255,255,0.65)' },
  assigned:    { bg: 'rgba(245,158,11,0.07)', bgHover: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.20)', dot: 'rgba(245,158,11,0.10)', text: 'text-amber-600', headerBg: 'rgba(255,255,255,0.65)' },
  in_progress: { bg: 'rgba(139,92,246,0.07)', bgHover: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.20)', dot: 'rgba(139,92,246,0.10)', text: 'text-violet-600', headerBg: 'rgba(255,255,255,0.65)' },
  completed:   { bg: 'rgba(16,185,129,0.06)', bgHover: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.20)', dot: 'rgba(16,185,129,0.08)', text: 'text-emerald-600', headerBg: 'rgba(255,255,255,0.65)' },
};

interface TimelineViewProps {
  currentDate: Date;
  orders: CalendarOrder[];
  employees: EmployeeCol[];
  workSchedules: WorkScheduleBlock[];
  selectedOrderId?: string | null;
  onSlotClick: (time: string, employeeId: string) => void;
  onOrderClick: (order: CalendarOrder) => void;
}

export function TimelineView({
  currentDate,
  orders,
  employees,
  workSchedules,
  selectedOrderId,
  onSlotClick,
  onOrderClick,
}: TimelineViewProps) {
  const dateStr = currentDate.toISOString().split('T')[0];
  const isToday = dateStr === new Date().toISOString().split('T')[0];

  // Current time
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const nowLeft = (nowHour - GRID_START_HOUR) * COL_W;

  // Layers per employee
  const layersByEmployee = useMemo(() => {
    const map = new Map<string, { windowRanges: CalendarOrder[]; bookings: CalendarOrder[] }>();
    for (const emp of employees) {
      const empOrders = orders.filter(o => o.employee_id === emp.id);
      const { windowRanges, bookingSlots } = splitOrderLayers(empOrders);
      map.set(emp.id, {
        windowRanges,
        bookings: bookingSlots.map(s => s.order),
      });
    }
    return map;
  }, [orders, employees]);

  // Find selected order's employee for row highlight
  const selectedEmployeeId = useMemo(() => {
    if (!selectedOrderId) return null;
    const order = orders.find(o => o.id === selectedOrderId);
    return order?.employee_id || null;
  }, [selectedOrderId, orders]);

  const totalWidth = HOURS.length * COL_W;

  return (
    <div className="rounded-xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="p-0 overflow-auto">
        <div style={{ minWidth: `${totalWidth + 180}px` }}>
          {/* ── Header: hour columns ── */}
          <div className="flex bg-white/98 backdrop-blur-md sticky top-0 z-20 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {/* Employee label column */}
            <div className="w-[180px] flex-shrink-0 p-3 flex items-center">
              <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wide">Pracownik</span>
            </div>
            {/* Hour columns */}
            <div className="flex relative">
              {HOURS.map((hour, i) => (
                <div
                  key={hour}
                  className="flex-shrink-0 text-center py-2.5"
                  style={{
                    width: `${COL_W}px`,
                    backgroundColor: i % 2 === 0 ? 'rgba(0,0,0,0.008)' : undefined,
                  }}
                >
                  <span className="text-[11px] font-medium text-gray-300">{hour}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Employee rows ── */}
          {employees.map((emp, empIdx) => {
            const layers = layersByEmployee.get(emp.id);
            const initials = emp.name.split(' ').map(w => w[0]).join('').slice(0, 2);
            const orderCount = orders.filter(o => o.employee_id === emp.id).length;
            const isHighlighted = selectedEmployeeId === emp.id;

            return (
              <div
                key={emp.id}
                className={`flex transition-colors duration-100 ${isHighlighted ? 'bg-orange-50/25' : ''}`}
                style={{
                  minHeight: `${ROW_HEIGHT}px`,
                  borderBottom: '1px solid rgba(0,0,0,0.035)',
                  backgroundColor: isHighlighted ? undefined : empIdx % 2 === 1 ? 'rgba(0,0,0,0.008)' : undefined,
                }}
              >
                {/* Employee info */}
                <div className="w-[180px] flex-shrink-0 p-3 flex items-center gap-2.5" style={{ borderRight: '1px solid rgba(0,0,0,0.04)' }}>
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: emp.color }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate leading-tight">{emp.name}</p>
                    <p className="text-[10px] text-gray-400">{emp.region} · {orderCount} zleceń</p>
                  </div>
                </div>

                {/* Timeline area */}
                <div className="relative flex-1" style={{ minHeight: `${ROW_HEIGHT}px` }}>
                  {/* Hour grid lines (subtle) */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {HOURS.map((_, i) => (
                      <div
                        key={i}
                        className="flex-shrink-0"
                        style={{
                          width: `${COL_W}px`,
                          borderRight: '1px solid rgba(0,0,0,0.025)',
                        }}
                      />
                    ))}
                  </div>

                  {/* Current time vertical line */}
                  {isToday && nowHour >= GRID_START_HOUR && nowHour <= GRID_START_HOUR + HOURS.length && (
                    <motion.div
                      className="absolute top-0 bottom-0 z-20 pointer-events-none"
                      style={{ left: `${nowLeft}px` }}
                      animate={{ left: nowLeft }}
                      transition={{ type: 'spring', stiffness: 100, damping: 30 }}
                    >
                      <div className="w-[2px] h-full bg-gradient-to-b from-red-500 via-red-400/60 to-red-300/20" />
                    </motion.div>
                  )}

                  {/* Layer 2: Time window ranges (dot pattern, matching TeamView v2) */}
                  {(layers?.windowRanges || []).map(order => {
                    if (!order.time_window_start || !order.time_window_end) return null;
                    const startH = timeToHours(order.time_window_start);
                    const endH = timeToHours(order.time_window_end);
                    const left = (startH - GRID_START_HOUR) * COL_W;
                    const width = (endH - startH) * COL_W;
                    const accent = windowAccents[order.status] || windowAccents.assigned;
                    const isSelected = selectedOrderId === order.id;

                    return (
                      <motion.div
                        key={`tw-${order.id}`}
                        initial={{ opacity: 0, scaleX: 0.9 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        whileHover={{ backgroundColor: accent.bgHover }}
                        className={`absolute z-[3] cursor-pointer rounded-lg overflow-hidden origin-left ${isSelected ? 'ring-1 ring-offset-1' : ''}`}
                        style={{
                          left: `${left}px`,
                          width: `${width}px`,
                          top: '4px',
                          bottom: '4px',
                          backgroundColor: accent.bg,
                          border: `1px solid ${accent.border}`,
                          backgroundImage: `radial-gradient(circle, ${accent.dot} 1px, transparent 1px)`,
                          backgroundSize: '12px 12px',
                        }}
                        onClick={e => { e.stopPropagation(); onOrderClick(order); }}
                      >
                        {/* Frosted header strip */}
                        <div
                          className="px-2 py-1 flex items-center gap-1.5 h-full backdrop-blur-[1px]"
                          style={{ backgroundColor: accent.headerBg }}
                        >
                          <CalendarRange className={`h-3 w-3 flex-shrink-0 ${accent.text} opacity-60`} />
                          <span className={`text-[9px] font-semibold ${accent.text} truncate`}>
                            {order.client_name}
                          </span>
                          <span className={`text-[8px] ${accent.text} opacity-50 flex-shrink-0 ml-auto`}>
                            {order.time_window_start?.slice(0,5)}–{order.time_window_end?.slice(0,5)}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Layer 3: Booking cards (gradient backgrounds, matching EventBlock v2) */}
                  {(layers?.bookings || []).map(order => {
                    const startH = timeToHours(order.scheduled_time_start);
                    const endH = timeToHours(order.scheduled_time_end);
                    const left = (startH - GRID_START_HOUR) * COL_W;
                    const width = Math.max((endH - startH) * COL_W, 40);
                    const accent = accentColors[order.status] || '#94a3b8';
                    const gradient = cardGradients[order.status] || cardGradients.new;
                    const shadow = cardShadows[order.status] || cardShadows.new;
                    const titleClr = textColors[order.status] || '#1f2937';
                    const subClr = subColors[order.status] || '#6b7280';
                    const isAsap = order.scheduling_type === 'asap';
                    const isUrgent = order.priority === 'urgent';
                    const isHigh = order.priority === 'high';
                    const isSelected = selectedOrderId === order.id;

                    const serviceList = order.service_names ? order.service_names.split(', ') : [];
                    const firstService = serviceList[0] || order.client_name;

                    const priorityRing = isAsap || isUrgent
                      ? 'ring-2 ring-red-400/50 ring-offset-1 ring-offset-white/50'
                      : isHigh
                        ? 'ring-1 ring-orange-300/40'
                        : '';

                    return (
                      <motion.div
                        key={order.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{
                          opacity: 1,
                          x: 0,
                          boxShadow: isSelected ? `0 0 0 2px ${accent}, 0 8px 24px rgba(0,0,0,0.14)` : shadow,
                        }}
                        whileHover={{
                          scale: 1.02,
                          zIndex: 20,
                          y: -1,
                          boxShadow: isSelected
                            ? `0 0 0 2px ${accent}, 0 8px 24px rgba(0,0,0,0.14)`
                            : '0 4px 14px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)',
                        }}
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                        className={`absolute z-10 cursor-pointer rounded-lg overflow-hidden transition-shadow duration-150 ${priorityRing}`}
                        style={{
                          left: `${left}px`,
                          width: `${width}px`,
                          top: '6px',
                          bottom: '6px',
                          borderLeft: `5px solid ${accent}`,
                          background: gradient,
                        }}
                        onClick={e => { e.stopPropagation(); onOrderClick(order); }}
                      >
                        <div className="px-2 py-1 h-full flex flex-col justify-center gap-0.5">
                          <p className="text-[10px] font-bold truncate leading-tight" style={{ color: titleClr }}>
                            {firstService}
                          </p>
                          {width >= 80 && (
                            <p className="text-[9px] truncate" style={{ color: subClr }}>{order.client_name}</p>
                          )}
                          {width >= 120 && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5 opacity-50" style={{ color: subClr }} />
                              <span className="text-[8px] opacity-70" style={{ color: subClr }}>
                                {formatTime(order.scheduled_time_start)}–{formatTime(order.scheduled_time_end)}
                              </span>
                              {isAsap && (
                                <span className="px-1 py-px rounded bg-red-500 text-white text-[7px] font-bold ml-auto shadow-sm shadow-red-500/20">ASAP</span>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Double-click to create */}
                  <div
                    className="absolute inset-0 z-[1]"
                    onDoubleClick={e => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const hour = Math.floor(x / COL_W) + GRID_START_HOUR;
                      const minutes = Math.round(((x % COL_W) / COL_W) * 60 / 15) * 15;
                      onSlotClick(`${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`, emp.id);
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
