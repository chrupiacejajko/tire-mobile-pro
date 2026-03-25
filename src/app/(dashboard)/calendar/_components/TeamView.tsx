'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CalendarRange, ChevronsLeftRight } from 'lucide-react';
import {
  type CalendarOrder,
  type EmployeeCol,
  type WorkScheduleBlock,
  type LayoutSlot,
  HOURS,
  GRID_START_HOUR,
  ROW_H,
  timeToHours,
  splitOrderLayers,
} from './types';
import { EventBlock } from './EventBlock';
import { DutyOverlay } from './DutyOverlay';

interface TeamViewProps {
  currentDate: Date;
  orders: CalendarOrder[];
  employees: EmployeeCol[];
  workSchedules: WorkScheduleBlock[];
  rowHeight?: number;
  selectedOrderId?: string | null;
  onSlotClick: (time: string, employeeId: string) => void;
  onOrderClick: (order: CalendarOrder) => void;
}

export function TeamView({
  currentDate,
  orders,
  employees,
  workSchedules,
  rowHeight: rowHeightProp,
  selectedOrderId,
  onSlotClick,
  onOrderClick,
}: TeamViewProps) {
  const [zoomOverride, setZoomOverride] = useState<number | null>(null);
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const gridRef = useRef<HTMLDivElement>(null);
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const RH = zoomOverride ?? rowHeightProp ?? ROW_H;
  const dateStr = currentDate.toISOString().split('T')[0];
  const isToday = dateStr === new Date().toISOString().split('T')[0];

  // Ctrl+Scroll zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoomOverride(prev => {
      const current = prev ?? rowHeightProp ?? ROW_H;
      return Math.min(96, Math.max(40, current - Math.sign(e.deltaY) * 4));
    });
    setShowZoomIndicator(true);
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => setShowZoomIndicator(false), 1200);
  }, [rowHeightProp]);

  // Toggle column collapse
  const toggleCollapse = (empId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  };

  // Compute grid template columns (with collapsed support)
  const gridCols = useMemo(() => {
    const cols = employees.map(emp =>
      collapsed.has(emp.id) ? '42px' : '1fr'
    );
    return `64px ${cols.join(' ')}`;
  }, [employees, collapsed]);

  // Current time indicator
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const nowHour = now.getHours() + now.getMinutes() / 60;
  const nowTop = (nowHour - GRID_START_HOUR) * RH;

  // Index orders by employee
  const ordersByEmployee = useMemo(() => {
    const map = new Map<string, CalendarOrder[]>();
    for (const emp of employees) map.set(emp.id, []);
    for (const order of orders) {
      if (order.employee_id && map.has(order.employee_id)) {
        map.get(order.employee_id)!.push(order);
      }
    }
    return map;
  }, [orders, employees]);

  // Split into Layer 2 (window ranges) and Layer 3 (booking cards) per employee
  const layersByEmployee = useMemo(() => {
    const map = new Map<string, { windowRanges: CalendarOrder[]; bookingSlots: LayoutSlot[] }>();
    for (const emp of employees) {
      const empOrders = ordersByEmployee.get(emp.id) || [];
      map.set(emp.id, splitOrderLayers(empOrders));
    }
    return map;
  }, [employees, ordersByEmployee]);

  // Get booking layout slots for a specific hour
  const getBookingSlotsForHour = (empId: string, hourNum: number): LayoutSlot[] => {
    const layers = layersByEmployee.get(empId);
    if (!layers) return [];
    return layers.bookingSlots.filter(s => {
      const [h] = (s.order.scheduled_time_start || '00:00').split(':').map(Number);
      return h === hourNum;
    });
  };

  // Get window ranges that START in a specific hour (rendered once from first hour cell)
  const getWindowRangesForFirstHour = (empId: string): CalendarOrder[] => {
    const layers = layersByEmployee.get(empId);
    return layers?.windowRanges || [];
  };

  // Find which employee the selected order belongs to (for column highlight)
  const selectedEmployeeId = useMemo(() => {
    if (!selectedOrderId) return null;
    const order = orders.find(o => o.id === selectedOrderId);
    return order?.employee_id || null;
  }, [selectedOrderId, orders]);

  return (
    <div className="rounded-xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden relative">
      {/* Zoom indicator */}
      <AnimatePresence>
        {showZoomIndicator && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-3 right-3 z-50 bg-gray-900/80 text-white text-xs font-bold px-3 py-1.5 rounded-lg backdrop-blur-sm pointer-events-none"
          >
            Zoom: {RH}px ({Math.round((RH / ROW_H) * 100)}%)
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-0 overflow-auto" onWheel={handleWheel}>
        <div className="min-w-[700px]" ref={gridRef}>
          {/* Sticky header */}
          <div
            className="grid bg-white/98 backdrop-blur-md sticky top-0 z-20 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="p-3 text-center text-xs font-medium text-gray-300 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
            {employees.map(emp => {
              const isCollapsed = collapsed.has(emp.id);
              const empOrderCount = (ordersByEmployee.get(emp.id) || []).length;
              const initials = emp.name.split(' ').map(w => w[0]).join('').slice(0, 2);
              const isHighlighted = selectedEmployeeId === emp.id;
              return (
                <div
                  key={emp.id}
                  className={`text-center ${isCollapsed ? 'p-1' : 'p-3'} transition-colors duration-150 ${isHighlighted ? 'bg-orange-50/40' : ''}`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => toggleCollapse(emp.id)}
                      title={isCollapsed ? 'Rozwiń kolumnę' : 'Zwiń kolumnę'}
                      className="relative group"
                    >
                      <div
                        className={`rounded-full flex items-center justify-center text-white text-[10px] font-bold transition-all ${isCollapsed ? 'h-6 w-6' : 'h-7 w-7'} group-hover:ring-2 group-hover:ring-orange-300 shadow-sm`}
                        style={{ backgroundColor: emp.color }}
                      >
                        {initials}
                      </div>
                      <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronsLeftRight className="h-2 w-2 text-gray-500" />
                      </div>
                    </button>
                    {!isCollapsed && (
                      <div className="text-left">
                        <p className="text-sm font-bold text-gray-900 leading-tight">{emp.name}</p>
                        <p className="text-[10px] text-gray-400">{emp.region} · {empOrderCount} zleceń</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time grid body */}
          <div className="relative">
            {/* Current time line (Layer 4) — spring-animated position */}
            {isToday && nowHour >= GRID_START_HOUR && nowHour <= GRID_START_HOUR + HOURS.length && (
              <motion.div
                className="absolute left-0 right-0 z-30 pointer-events-none"
                initial={{ top: nowTop }}
                animate={{ top: nowTop }}
                transition={{ type: 'spring', stiffness: 100, damping: 30 }}
              >
                <div className="flex items-center">
                  <motion.div
                    className="h-3 w-3 rounded-full bg-red-500 -ml-1.5 shadow-lg shadow-red-500/30"
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <div className="flex-1 h-[2px] bg-gradient-to-r from-red-500 via-red-400/60 to-red-300/20" />
                </div>
              </motion.div>
            )}

            {HOURS.map((hour, hourIdx) => {
              const hourNum = hourIdx + GRID_START_HOUR;
              const isEvenHour = hourIdx % 2 === 0;
              return (
                <div
                  key={hour}
                  className="grid"
                  style={{
                    gridTemplateColumns: gridCols,
                    minHeight: `${RH}px`,
                  }}
                >
                  {/* Hour label */}
                  <div className="px-2 text-center text-[11px] text-gray-300 flex items-start justify-center pt-1.5 font-medium select-none">
                    {hour}
                  </div>

                  {/* Employee cells */}
                  {employees.map((emp, empIdx) => {
                    const isCollapsed = collapsed.has(emp.id);
                    const bookingSlots = isCollapsed ? [] : getBookingSlotsForHour(emp.id, hourNum);
                    const isFirstHour = hourIdx === 0;
                    const windowRanges = (isFirstHour && !isCollapsed) ? getWindowRangesForFirstHour(emp.id) : [];
                    const isOddCol = empIdx % 2 === 1;
                    const isHighlighted = selectedEmployeeId === emp.id;

                    return (
                      <div
                        key={emp.id}
                        className={`
                          relative transition-colors duration-100
                          ${isCollapsed ? 'bg-gray-50/50' : 'cursor-pointer'}
                          ${!isCollapsed && !isHighlighted ? 'hover:bg-orange-50/15' : ''}
                          ${isHighlighted ? 'bg-orange-50/25' : ''}
                        `}
                        style={{
                          minHeight: `${RH}px`,
                          backgroundColor: isHighlighted
                            ? undefined
                            : isCollapsed
                              ? undefined
                              : isEvenHour && isOddCol
                                ? 'rgba(0,0,0,0.015)'
                                : isEvenHour
                                  ? 'rgba(0,0,0,0.008)'
                                  : isOddCol
                                    ? 'rgba(0,0,0,0.008)'
                                    : undefined,
                          borderBottom: '1px solid rgba(0,0,0,0.035)',
                          borderRight: empIdx < employees.length - 1 ? '1px solid rgba(0,0,0,0.02)' : undefined,
                        }}
                        onDoubleClick={() => {
                          if (!isCollapsed) onSlotClick(`${hourNum.toString().padStart(2, '0')}:00`, emp.id);
                        }}
                      >
                        {/* Duty overlay — only on first hour cell */}
                        {isFirstHour && (
                          <DutyOverlay
                            employeeId={emp.id}
                            date={dateStr}
                            workSchedules={workSchedules}
                          />
                        )}

                        {/* ═══ LAYER 2: Time Window Ranges (background) ═══ */}
                        {windowRanges.map(order => (
                          <TimeWindowRange
                            key={`tw-${order.id}`}
                            order={order}
                            rowHeight={RH}
                            selected={selectedOrderId === order.id}
                            onClick={onOrderClick}
                          />
                        ))}

                        {/* ═══ LAYER 3: Booking Cards (foreground, side-by-side) ═══ */}
                        {bookingSlots.map(slot => (
                          <EventBlock
                            key={slot.order.id}
                            event={slot.order}
                            columnIndex={slot.columnIndex}
                            totalColumns={slot.totalColumns}
                            rowHeight={RH}
                            selected={selectedOrderId === slot.order.id}
                            onClick={onOrderClick}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * LAYER 2 COMPONENT: Time Window Range v2
 * Full-width background strip showing allowed execution window.
 * v2: dot pattern, frosted header, solid border, better hierarchy.
 * ═══════════════════════════════════════════════════════════════════════ */

const WINDOW_MOTION = {
  initial: { opacity: 0, scaleY: 0.92 },
  animate: { opacity: 1, scaleY: 1 },
  transition: { type: 'spring' as const, stiffness: 200, damping: 25, mass: 1.2 },
};

// Status-based accent palette (stronger than v1)
const windowAccents: Record<string, { bg: string; bgHover: string; border: string; dot: string; text: string; headerBg: string }> = {
  new:         { bg: 'rgba(59,130,246,0.07)',  bgHover: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.20)', dot: 'rgba(59,130,246,0.10)', text: 'text-blue-600', headerBg: 'rgba(255,255,255,0.65)' },
  assigned:    { bg: 'rgba(245,158,11,0.07)',  bgHover: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.20)', dot: 'rgba(245,158,11,0.10)', text: 'text-amber-600', headerBg: 'rgba(255,255,255,0.65)' },
  in_progress: { bg: 'rgba(139,92,246,0.07)',  bgHover: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.20)', dot: 'rgba(139,92,246,0.10)', text: 'text-violet-600', headerBg: 'rgba(255,255,255,0.65)' },
  completed:   { bg: 'rgba(16,185,129,0.06)',  bgHover: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.20)', dot: 'rgba(16,185,129,0.08)', text: 'text-emerald-600', headerBg: 'rgba(255,255,255,0.65)' },
  cancelled:   { bg: 'rgba(156,163,175,0.04)', bgHover: 'rgba(156,163,175,0.08)', border: 'rgba(156,163,175,0.15)', dot: 'rgba(156,163,175,0.06)', text: 'text-gray-500', headerBg: 'rgba(255,255,255,0.65)' },
};

function TimeWindowRange({
  order,
  rowHeight = 64,
  selected = false,
  onClick,
}: {
  order: CalendarOrder;
  rowHeight?: number;
  selected?: boolean;
  onClick?: (order: CalendarOrder) => void;
}) {
  if (!order.time_window_start || !order.time_window_end) return null;

  const startH = timeToHours(order.time_window_start);
  const endH = timeToHours(order.time_window_end);
  const topPx = (startH - GRID_START_HOUR) * rowHeight;
  const heightPx = (endH - startH) * rowHeight;
  const accent = windowAccents[order.status] || windowAccents.assigned;

  return (
    <motion.div
      initial={WINDOW_MOTION.initial}
      animate={WINDOW_MOTION.animate}
      transition={WINDOW_MOTION.transition}
      whileHover={{
        backgroundColor: accent.bgHover,
        boxShadow: `inset 0 0 0 1px ${accent.border}`,
      }}
      onClick={e => { e.stopPropagation(); onClick?.(order); }}
      className={`absolute z-[5] cursor-pointer rounded-lg overflow-hidden origin-top ${selected ? 'ring-1 ring-offset-1' : ''}`}
      style={{
        top: `${topPx}px`,
        height: `${heightPx}px`,
        left: '3px',
        right: '3px',
        backgroundColor: accent.bg,
        border: `1px solid ${accent.border}`,
        boxShadow: selected ? `0 0 0 1px ${accent.border}` : undefined,
        backgroundImage: `radial-gradient(circle, ${accent.dot} 1px, transparent 1px)`,
        backgroundSize: '12px 12px',
      }}
    >
      {/* Frosted header strip */}
      <div
        className="px-2 py-1 flex items-center gap-1.5 backdrop-blur-[2px]"
        style={{
          backgroundColor: accent.headerBg,
          borderBottom: `1px solid ${accent.border}`,
        }}
      >
        <CalendarRange className={`h-3 w-3 flex-shrink-0 ${accent.text} opacity-60`} />
        <p className={`text-[10px] font-semibold ${accent.text} truncate leading-tight flex-1`}>
          {order.client_name}
        </p>
        <span className={`text-[8px] font-medium ${accent.text} opacity-50 flex-shrink-0`}>
          {order.time_window_start?.slice(0,5)}–{order.time_window_end?.slice(0,5)}
        </span>
      </div>

      {/* Center range label (only for tall windows) */}
      {heightPx >= 120 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none pt-8">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-medium ${accent.text} opacity-40`}
            style={{ backgroundColor: accent.headerBg }}
          >
            {order.time_window_start?.slice(0,5)} – {order.time_window_end?.slice(0,5)}
          </span>
        </div>
      )}

      {/* Bottom service hint */}
      {heightPx >= 140 && order.service_names && (
        <div
          className="absolute bottom-0 left-0 right-0 px-2 py-1 pointer-events-none backdrop-blur-[1px]"
          style={{ backgroundColor: accent.headerBg }}
        >
          <p className="text-[9px] text-gray-400 truncate">
            {order.service_names.split(', ')[0]}
          </p>
        </div>
      )}
    </motion.div>
  );
}
