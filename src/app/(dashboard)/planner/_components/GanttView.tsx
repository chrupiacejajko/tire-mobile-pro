'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import {
  Clock, User, RefreshCw, Lock, Unlock, XCircle, ChevronDown,
  AlertTriangle, Zap, Home,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type Stop,
  type EmployeeRoute,
  type UnassignedOrder,
  type GanttDragState,
  type GanttContextMenu,
  type GanttTooltip,
} from './types';
import { ScoreBadge, WorkerStatusDot } from './ScoreDisplay';

/* ═══════════════════════════════════════════════════════════════════
 * GANTT VIEW v2 — Premium operational timeline
 *
 * v2 changes:
 *   - 64px rows (from 48px), 100px hour columns (from 80px)
 *   - Gradient service blocks matching calendar EventBlock v2
 *   - Travel bars: h-2 rounded-full gradient
 *   - Wait blocks: dot pattern (blue)
 *   - Score badge + km in sticky left column
 *   - Alternating row backgrounds
 *   - Lighter grid lines
 *   - Gradient current time line
 *   - Premium context menu with employee avatars
 *   - Drop target preview highlight
 * ═══════════════════════════════════════════════════════════════════ */

interface GanttViewProps {
  routes: EmployeeRoute[];
  unassigned: UnassignedOrder[];
  date: string;
  onRefresh: () => void;
}

// ── Delay tolerance color system (9 levels + 2 statuses) ─────────────────────
// Maps flexibility_minutes + order status to visual style

interface DelayToleranceStyle {
  color: string;
  label: string;
  bg: string;
  border: string;
  accent: string;
  textClass: string;
}

const DELAY_TOLERANCE_COLORS: Record<string, DelayToleranceStyle> = {
  completed:   { color: '#1F2937', label: 'Zakończone',  bg: '#1F2937',  border: '1px solid #374151', accent: '#1F2937', textClass: 'text-white' },
  in_progress: { color: '#1F2937', label: 'W realizacji', bg: 'repeating-linear-gradient(45deg, #1F2937, #1F2937 4px, #4B5563 4px, #4B5563 8px)', border: '1px solid #374151', accent: '#1F2937', textClass: 'text-white' },
  exact:       { color: '#EF4444', label: 'Na czas',     bg: 'rgba(239,68,68,0.15)',  border: '1px solid rgba(239,68,68,0.4)',  accent: '#EF4444', textClass: 'text-red-700' },
  flex_30:     { color: '#F87171', label: 'Do 30 min',   bg: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)', accent: '#F87171', textClass: 'text-red-600' },
  flex_60:     { color: '#F97316', label: 'Do 1h',       bg: 'rgba(249,115,22,0.12)',  border: '1px solid rgba(249,115,22,0.35)',  accent: '#F97316', textClass: 'text-orange-700' },
  flex_90:     { color: '#FB923C', label: 'Do 1.5h',     bg: 'rgba(251,146,60,0.12)',  border: '1px solid rgba(251,146,60,0.35)',  accent: '#FB923C', textClass: 'text-orange-600' },
  flex_120:    { color: '#22C55E', label: 'Do 2h',       bg: 'rgba(34,197,94,0.12)',   border: '1px solid rgba(34,197,94,0.35)',   accent: '#22C55E', textClass: 'text-green-700' },
  flex_150:    { color: '#4ADE80', label: 'Do 2.5h',     bg: 'rgba(74,222,128,0.12)',  border: '1px solid rgba(74,222,128,0.35)',  accent: '#4ADE80', textClass: 'text-green-600' },
  flex_180:    { color: '#3B82F6', label: 'Do 3h',       bg: 'rgba(59,130,246,0.12)',  border: '1px solid rgba(59,130,246,0.35)',  accent: '#3B82F6', textClass: 'text-blue-700' },
  flex_240:    { color: '#8B5CF6', label: 'Do 4h',       bg: 'rgba(139,92,246,0.12)',  border: '1px solid rgba(139,92,246,0.35)',  accent: '#8B5CF6', textClass: 'text-purple-700' },
  flexible:    { color: '#9CA3AF', label: 'Elastyczne',  bg: 'rgba(156,163,175,0.1)',  border: '1px solid rgba(156,163,175,0.25)', accent: '#9CA3AF', textClass: 'text-gray-600' },
};

function getDelayToleranceLevel(flexibilityMinutes: number, orderStatus: string): string {
  if (orderStatus === 'completed' || orderStatus === 'cancelled') return 'completed';
  if (orderStatus === 'in_progress') return 'in_progress';
  if (flexibilityMinutes <= 0) return 'exact';
  if (flexibilityMinutes <= 30) return 'flex_30';
  if (flexibilityMinutes <= 60) return 'flex_60';
  if (flexibilityMinutes <= 90) return 'flex_90';
  if (flexibilityMinutes <= 120) return 'flex_120';
  if (flexibilityMinutes <= 150) return 'flex_150';
  if (flexibilityMinutes <= 180) return 'flex_180';
  if (flexibilityMinutes <= 240) return 'flex_240';
  return 'flexible';
}


export function GanttView({
  routes,
  unassigned,
  date,
  onRefresh,
}: GanttViewProps) {
  const START_HOUR = 7;
  const END_HOUR = 20;
  const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;
  const HOUR_WIDTH = 100;
  const TOTAL_WIDTH = (END_HOUR - START_HOUR) * HOUR_WIDTH;
  const ROW_HEIGHT = 64;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<GanttDragState | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragTargetRow, setDragTargetRow] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<GanttContextMenu | null>(null);
  const [lockedOrders, setLockedOrders] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<GanttTooltip | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  function timeToX(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    const minutes = (h - START_HOUR) * 60 + m;
    return (minutes / TOTAL_MINUTES) * TOTAL_WIDTH;
  }

  function xToTime(x: number): string {
    const minutes = Math.round((x / TOTAL_WIDTH) * TOTAL_MINUTES);
    const clampedMinutes = Math.max(0, Math.min(TOTAL_MINUTES, minutes));
    const totalMin = START_HOUR * 60 + clampedMinutes;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const now = new Date();
  const nowMinutes = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
  const nowX = (nowMinutes / TOTAL_MINUTES) * TOTAL_WIDTH;
  const isToday = date === new Date().toISOString().split('T')[0];

  // Close context menu
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('click', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [contextMenu]);

  // Drag handlers
  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      setDragOffset({ x: dx, y: dy });
      let targetRow: string | null = null;
      rowRefs.current.forEach((el, empId) => {
        const rect = el.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) targetRow = empId;
      });
      setDragTargetRow(targetRow);
    };
    const handleMouseUp = async (e: MouseEvent) => {
      const dx = e.clientX - dragging.startX;
      const finalX = dragging.origLeft + dx;
      const newTime = xToTime(finalX);
      const targetEmployee = dragTargetRow;
      const movedEnough = Math.abs(dx) > 5 || (targetEmployee && targetEmployee !== dragging.origRow);
      setDragging(null); setDragOffset({ x: 0, y: 0 }); setDragTargetRow(null);
      if (!movedEnough) return;
      if (dragging.isUnassigned && targetEmployee) {
        try { await fetch('/api/planner/insert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: dragging.orderId, employee_id: targetEmployee, date }) }); onRefresh(); } catch (err) { console.error('Insert failed', err); }
        return;
      }
      if (targetEmployee && targetEmployee !== dragging.origRow) {
        try { await fetch('/api/planner/insert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: dragging.orderId, employee_id: targetEmployee, date }) }); onRefresh(); } catch (err) { console.error('Reassign failed', err); }
      } else {
        try { await fetch('/api/orders/update-time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: dragging.orderId, scheduled_time_start: newTime, employee_id: dragging.employeeId || undefined }) }); onRefresh(); } catch (err) { console.error('Time update failed', err); }
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [dragging, dragTargetRow, date, onRefresh]);

  const handleBlockMouseDown = (e: React.MouseEvent, orderId: string, employeeId: string, left: number, isUnassigned?: boolean) => {
    if (e.button !== 0) return; e.preventDefault(); setTooltip(null);
    setDragging({ orderId, employeeId, startX: e.clientX, startY: e.clientY, origLeft: left, origRow: employeeId, isUnassigned });
  };

  const handleContextMenu = (e: React.MouseEvent, orderId: string, employeeId: string) => {
    e.preventDefault(); e.stopPropagation(); setTooltip(null);
    setContextMenu({ x: e.clientX, y: e.clientY, orderId, employeeId });
  };

  const toggleLock = async (orderId: string) => {
    const isLocked = lockedOrders.has(orderId);
    const newLocked = new Set(lockedOrders);
    if (isLocked) newLocked.delete(orderId); else newLocked.add(orderId);
    setLockedOrders(newLocked); setContextMenu(null);
    try { await fetch('/api/orders/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, is_locked: !isLocked }) }); } catch {}
  };

  const handleReoptimize = async (employeeId: string) => {
    setContextMenu(null);
    try { await fetch('/api/planner/reoptimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: employeeId, date }) }); onRefresh(); } catch {}
  };

  const handleUnassign = async (orderId: string) => {
    setContextMenu(null);
    try { await fetch('/api/orders/unassign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId }) }); onRefresh(); } catch {}
  };

  const handleAssignTo = async (orderId: string, employeeId: string) => {
    setContextMenu(null);
    try { await fetch('/api/planner/insert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, employee_id: employeeId, date }) }); onRefresh(); } catch {}
  };

  // ── Buffer countdown helper ──
  function getBufferDisplay(stop: Stop): { text: string; colorClass: string; pulse: boolean } | null {
    const status = stop.order_status ?? 'pending';
    if (status === 'completed' || status === 'in_progress' || status === 'cancelled' || status === 'return') return null;

    const flexibility = stop.flexibility_minutes ?? 0;
    const level = getDelayToleranceLevel(flexibility, status);
    if (level === 'flexible') return { text: 'Elastyczne', colorClass: 'text-gray-400', pulse: false };

    const remaining = flexibility - (stop.delay_minutes ?? 0);

    if (remaining <= 0) {
      return { text: `\u26a0\ufe0f -${Math.abs(remaining)} min`, colorClass: 'text-red-600 font-bold', pulse: false };
    }
    if (remaining <= 15) {
      return { text: `${remaining} min luzu`, colorClass: 'text-red-500', pulse: true };
    }
    if (remaining <= 60) {
      return { text: `${remaining} min luzu`, colorClass: 'text-amber-600', pulse: false };
    }
    const hours = Math.round(remaining / 60 * 10) / 10;
    return { text: `${hours}h luzu`, colorClass: 'text-green-600', pulse: false };
  }

  // ── Render return-to-base block ──
  function renderReturnBlock(stop: Stop, prevDepartureX: number | null) {
    const arrivalX = timeToX(stop.arrival_time);
    const serviceStartX = timeToX(stop.service_start);

    return (
      <Fragment key={stop.order_id}>
        {/* Travel bar */}
        {prevDepartureX !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full"
            style={{
              left: prevDepartureX,
              width: Math.max(arrivalX - prevDepartureX, 3),
              background: 'linear-gradient(to right, rgba(209,213,219,0.5), rgba(229,231,235,0.3))',
            }}
          />
        )}
        {/* Return block — dashed border, gray bg, not draggable */}
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-lg select-none overflow-hidden"
          style={{
            left: serviceStartX,
            width: Math.max(80, 6),
            height: '36px',
            background: 'rgba(156,163,175,0.08)',
            border: '2px dashed rgba(156,163,175,0.4)',
          }}
        >
          <div className="flex items-center h-full px-1.5 gap-1 min-w-0">
            <Home className="h-3 w-3 text-gray-400 flex-shrink-0" />
            <span className="text-[9px] font-medium text-gray-500 truncate">
              Powrót ~{stop.travel_minutes} min
            </span>
          </div>
        </div>
      </Fragment>
    );
  }

  // ── Render service block ──
  function renderServiceBlock(stop: Stop, employeeId: string, employeeName: string, prevDepartureX: number | null, isLocked: boolean) {
    const arrivalX = timeToX(stop.arrival_time);
    const serviceStartX = timeToX(stop.service_start);
    const departureX = timeToX(stop.departure_time);
    const serviceWidth = Math.max(departureX - serviceStartX, 6);
    const isDraggingThis = dragging?.orderId === stop.order_id;
    const offsetX = isDraggingThis ? dragOffset.x : 0;
    const offsetY = isDraggingThis ? dragOffset.y : 0;

    // New delay tolerance color system
    const level = getDelayToleranceLevel(stop.flexibility_minutes ?? 0, stop.order_status ?? 'pending');
    const dtStyle = DELAY_TOLERANCE_COLORS[level] || DELAY_TOLERANCE_COLORS.flexible;
    const isCompletedOrInProgress = level === 'completed' || level === 'in_progress';

    return (
      <Fragment key={stop.order_id}>
        {/* Travel bar — gradient rounded pill */}
        {prevDepartureX !== null && !isDraggingThis && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full"
            style={{
              left: prevDepartureX,
              width: Math.max(arrivalX - prevDepartureX, 3),
              background: 'linear-gradient(to right, rgba(209,213,219,0.5), rgba(229,231,235,0.3))',
            }}
          />
        )}
        {/* Wait time — dot pattern */}
        {stop.wait_minutes > 0 && !isDraggingThis && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-4 rounded"
            style={{
              left: arrivalX,
              width: Math.max(serviceStartX - arrivalX, 3),
              backgroundColor: 'rgba(59,130,246,0.06)',
              border: '1px solid rgba(59,130,246,0.15)',
              backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.15) 1px, transparent 1px)',
              backgroundSize: '6px 6px',
            }}
          />
        )}
        {/* Service block — delay tolerance colored */}
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 rounded-lg cursor-grab select-none transition-shadow overflow-hidden',
            isDraggingThis ? 'z-50 shadow-lg opacity-75 cursor-grabbing' : 'hover:shadow-md hover:brightness-[1.02]',
            isLocked && 'ring-1 ring-dashed ring-orange-400',
          )}
          style={{
            left: serviceStartX + offsetX,
            width: serviceWidth,
            height: '36px',
            background: dtStyle.bg,
            border: dtStyle.border,
            borderLeft: `4px solid ${dtStyle.accent}`,
            ...(isDraggingThis ? { transform: `translate(0, calc(-50% + ${offsetY}px))`, zIndex: 50 } : {}),
          }}
          onMouseDown={(e) => handleBlockMouseDown(e, stop.order_id, employeeId, serviceStartX)}
          onContextMenu={(e) => handleContextMenu(e, stop.order_id, employeeId)}
          onMouseEnter={(e) => { if (!dragging) setTooltip({ x: e.clientX, y: e.clientY - 10, stop, employeeName }); }}
          onMouseLeave={() => setTooltip(null)}
        >
          <div className="flex items-center h-full px-1.5 gap-1 min-w-0">
            {isLocked && <span className="text-[9px]">🔒</span>}
            {stop.time_window_status === 'late' && !isCompletedOrInProgress && <AlertTriangle className="h-2.5 w-2.5 text-red-500 flex-shrink-0" />}
            <span className={`text-[10px] font-semibold truncate ${dtStyle.textClass}`}>
              {stop.sequence}. {stop.client_name}
            </span>
            {serviceWidth > 80 && (
              <span className={`text-[8px] ml-auto flex-shrink-0 opacity-60 ${dtStyle.textClass}`}>
                {stop.service_start}
              </span>
            )}
          </div>
          {/* Buffer countdown overlay */}
          {(() => {
            const buf = getBufferDisplay(stop);
            if (!buf || serviceWidth < 50) return null;
            return (
              <span
                className={cn(
                  'absolute bottom-0.5 right-1 text-[9px] leading-none',
                  buf.colorClass,
                  buf.pulse && 'animate-pulse',
                )}
              >
                {buf.text}
              </span>
            );
          })()}
        </div>
      </Fragment>
    );
  }

  return (
    <div ref={containerRef} className="rounded-xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
      {/* Header */}
      <div className="flex" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="w-48 flex-shrink-0 px-3 py-2 bg-white/98 backdrop-blur-sm">
          <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wide">Pracownik</span>
        </div>
        <div className="relative overflow-x-auto" style={{ width: TOTAL_WIDTH }}>
          <div className="flex">
            {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
              <div
                key={i}
                className="flex-shrink-0 text-center py-2"
                style={{
                  width: HOUR_WIDTH,
                  borderRight: '1px solid rgba(0,0,0,0.03)',
                  backgroundColor: i % 2 === 0 ? 'rgba(0,0,0,0.008)' : undefined,
                }}
              >
                <span className="text-[11px] font-medium text-gray-300">{String(START_HOUR + i).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Employee rows */}
      {(routes ?? []).map((route, rowIdx) => {
        const isDropTarget = dragTargetRow === route.employee_id && dragging && dragging.origRow !== route.employee_id;
        const initials = route.employee_name.split(' ').map(w => w[0]).join('').slice(0, 2);
        const hasLate = route.score.late > 0;

        return (
          <div
            key={route.employee_id}
            ref={(el) => { if (el) rowRefs.current.set(route.employee_id, el); }}
            className={cn(
              'flex transition-colors duration-100',
              isDropTarget ? 'bg-orange-50/50 ring-1 ring-inset ring-orange-300' : '',
            )}
            style={{
              borderBottom: '1px solid rgba(0,0,0,0.035)',
              backgroundColor: isDropTarget ? undefined : rowIdx % 2 === 1 ? 'rgba(0,0,0,0.008)' : undefined,
            }}
          >
            {/* Employee info — wider with score */}
            <div className="w-48 flex-shrink-0 px-3 py-2 flex items-center gap-2" style={{ borderRight: '1px solid rgba(0,0,0,0.04)' }}>
              <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 text-[9px] font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <p className="text-[11px] font-bold text-gray-800 truncate">{route.employee_name}</p>
                  <WorkerStatusDot pos={route.current_position} orders={route.total_orders} />
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <ScoreBadge score={route.score.score} />
                  <span className="text-[9px] text-gray-400">{route.total_km}km</span>
                  {hasLate && (
                    <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-red-600">
                      <AlertTriangle className="h-2.5 w-2.5" />{route.score.late}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Timeline area */}
            <div
              className={cn('relative overflow-x-auto', !isDropTarget && 'hover:bg-orange-50/10')}
              style={{ width: TOTAL_WIDTH, height: ROW_HEIGHT }}
            >
              {/* Grid lines */}
              {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                <div key={i} className="absolute top-0 bottom-0" style={{ left: i * HOUR_WIDTH, borderRight: '1px solid rgba(0,0,0,0.02)' }} />
              ))}

              {/* Service blocks */}
              {route.schedule.map((stop, i) => {
                const prevDeparture = i > 0 ? timeToX(route.schedule[i - 1].departure_time) : null;
                if (stop.order_id === 'return_to_base') {
                  return renderReturnBlock(stop, prevDeparture);
                }
                return renderServiceBlock(stop, route.employee_id, route.employee_name, prevDeparture, lockedOrders.has(stop.order_id));
              })}

              {/* Current time */}
              {isToday && nowX > 0 && nowX < TOTAL_WIDTH && (
                <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: nowX }}>
                  <div className="w-[2px] h-full bg-gradient-to-b from-red-500 via-red-400/60 to-red-300/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 absolute top-0 -translate-x-[4px] -translate-y-0.5 shadow-sm shadow-red-500/30" />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Unassigned row */}
      {unassigned.length > 0 && (
        <div
          ref={(el) => { if (el) rowRefs.current.set('__unassigned__', el); }}
          className="flex bg-gray-50/30"
          style={{ borderTop: '2px dashed rgba(0,0,0,0.08)' }}
        >
          <div className="w-48 flex-shrink-0 px-3 py-2 flex items-center gap-2" style={{ borderRight: '1px solid rgba(0,0,0,0.04)' }}>
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
              <AlertTriangle className="h-3.5 w-3.5 text-gray-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-500">Nieprzypisane</p>
              <p className="text-[9px] text-red-500 font-bold">{unassigned.length} zlec.</p>
            </div>
          </div>
          <div className="relative overflow-x-auto flex items-center gap-1.5 px-2 py-1" style={{ width: TOTAL_WIDTH, minHeight: ROW_HEIGHT }}>
            {unassigned.map((order, idx) => {
              const blockWidth = 120;
              const left = idx * (blockWidth + 6);
              const isDraggingThis = dragging?.orderId === order.id;
              const offsetX = isDraggingThis ? dragOffset.x : 0;
              const offsetY = isDraggingThis ? dragOffset.y : 0;
              const isUrgent = order.priority === 'urgent';
              const isHigh = order.priority === 'high';

              return (
                <div
                  key={order.id}
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 h-9 rounded-lg cursor-grab select-none overflow-hidden transition-shadow',
                    isDraggingThis && 'z-50 shadow-lg opacity-75 cursor-grabbing',
                    !isDraggingThis && 'hover:shadow-sm',
                    isUrgent ? 'ring-1 ring-red-400/50' : isHigh ? 'ring-1 ring-amber-300/50' : '',
                  )}
                  style={{
                    left: left + offsetX,
                    width: blockWidth,
                    background: isUrgent
                      ? 'linear-gradient(to right, rgba(254,226,226,0.9), rgba(255,241,242,0.6))'
                      : isHigh
                        ? 'linear-gradient(to right, rgba(254,243,199,0.9), rgba(255,251,235,0.6))'
                        : 'linear-gradient(to right, rgba(243,244,246,0.9), rgba(249,250,251,0.6))',
                    border: isUrgent ? '1px solid rgba(239,68,68,0.3)' : isHigh ? '1px solid rgba(245,158,11,0.3)' : '1px dashed rgba(156,163,175,0.3)',
                    borderLeft: `4px solid ${isUrgent ? '#dc2626' : isHigh ? '#d97706' : '#9ca3af'}`,
                    ...(isDraggingThis ? { transform: `translate(0, calc(-50% + ${offsetY}px))`, zIndex: 50 } : {}),
                  }}
                  onMouseDown={(e) => handleBlockMouseDown(e, order.id, '', left, true)}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, orderId: order.id, employeeId: '' }); }}
                  onMouseEnter={(e) => {
                    if (!dragging) {
                      const fakeStop: Stop = {
                        order_id: order.id, sequence: 0, client_name: order.client_name, address: order.address,
                        lat: order.lat ?? 0, lng: order.lng ?? 0, services: order.services,
                        time_window: order.time_window,
                        time_window_label: order.time_window ? (order.time_window === 'morning' ? '08:00-12:00' : order.time_window === 'afternoon' ? '12:00-16:00' : '16:00-20:00') : null,
                        time_window_color: null, time_window_status: 'no_window', travel_minutes: 0,
                        arrival_time: order.scheduled_time_start ?? '--:--', wait_minutes: 0,
                        service_start: order.scheduled_time_start ?? '--:--', service_duration_minutes: 0,
                        departure_time: '--:--', delay_minutes: 0,
                        flexibility_minutes: 0, order_status: order.status ?? 'pending',
                      };
                      setTooltip({ x: e.clientX, y: e.clientY - 10, stop: fakeStop, employeeName: 'Nieprzypisane' });
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <div className="flex items-center h-full px-2 gap-1 min-w-0">
                    {isUrgent && <Zap className="h-3 w-3 text-red-500 flex-shrink-0" />}
                    <span className={`text-[10px] font-semibold truncate ${isUrgent ? 'text-red-700' : isHigh ? 'text-amber-700' : 'text-gray-600'}`}>
                      {order.client_name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && !dragging && (
        <div
          className="fixed bg-white rounded-xl shadow-xl border border-gray-100 p-3 z-[60] pointer-events-none max-w-xs"
          style={{ left: tooltip.x + 12, top: tooltip.y - 80 }}
        >
          <p className="text-sm font-bold text-gray-900">{tooltip.stop.client_name}</p>
          {tooltip.stop.services.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {tooltip.stop.services.map((s: any, i: number) => (
                <span key={i} className="text-[9px] bg-gray-100 border border-gray-200/60 rounded-md px-1.5 py-0.5 text-gray-600">
                  {typeof s === 'string' ? s : s?.name ?? ''}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1.5 text-xs text-gray-500 space-y-0.5">
            <p><Clock className="inline h-3 w-3 mr-1 text-gray-400" />{tooltip.stop.arrival_time} — {tooltip.stop.departure_time}</p>
            {/* Delay tolerance badge */}
            {(() => {
              const ttLevel = getDelayToleranceLevel(tooltip.stop.flexibility_minutes ?? 0, tooltip.stop.order_status ?? 'pending');
              const ttStyle = DELAY_TOLERANCE_COLORS[ttLevel];
              return ttStyle ? (
                <p className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: ttStyle.color }} />
                  <span>{ttStyle.label}</span>
                  {tooltip.stop.delay_minutes > 0 && <span className="text-red-600 ml-1">+{tooltip.stop.delay_minutes} min</span>}
                </p>
              ) : null;
            })()}
            {/* Buffer info */}
            {tooltip.stop.order_status !== 'return' && tooltip.stop.flexibility_minutes > 0 && (
              <>
                <p className="text-[10px] text-gray-400">Dopuszczalne opóźnienie: {tooltip.stop.flexibility_minutes} min</p>
                <p className="text-[10px] text-gray-400">Aktualny bufor: {tooltip.stop.flexibility_minutes - (tooltip.stop.delay_minutes ?? 0)} min</p>
              </>
            )}
            {tooltip.stop.time_window_label && (
              <p className="text-[10px] text-gray-400">Okno: {tooltip.stop.time_window_label}</p>
            )}
            <p><User className="inline h-3 w-3 mr-1 text-gray-400" />{tooltip.employeeName}</p>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white rounded-xl shadow-2xl border border-gray-200/80 py-1 z-[60] min-w-[220px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors" onClick={() => toggleLock(contextMenu.orderId)}>
            {lockedOrders.has(contextMenu.orderId) ? <><Unlock className="h-3.5 w-3.5 text-gray-500" /> Odblokuj</> : <><Lock className="h-3.5 w-3.5 text-orange-500" /> Zablokuj</>}
          </button>
          <div className="relative">
            <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 justify-between transition-colors" onClick={() => setContextMenu(prev => prev ? { ...prev, showAssignSub: !prev.showAssignSub } : null)}>
              <span className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-blue-500" /> Przypisz do...</span>
              <ChevronDown className="h-3 w-3 text-gray-400" />
            </button>
            {contextMenu.showAssignSub && (
              <div className="absolute left-full top-0 bg-white rounded-xl shadow-2xl border border-gray-200/80 py-1 min-w-[200px] ml-1 z-[61]">
                {(routes ?? []).map(r => {
                  const ri = r.employee_name.split(' ').map(w => w[0]).join('').slice(0, 2);
                  return (
                    <button key={r.employee_id} className={cn('w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors', r.employee_id === contextMenu.employeeId && 'font-semibold text-orange-600')} onClick={() => handleAssignTo(contextMenu.orderId, r.employee_id)}>
                      <div className="w-5 h-5 rounded-md bg-orange-100 flex items-center justify-center text-orange-600 text-[8px] font-bold">{ri}</div>
                      <span className="flex-1">{r.employee_name}</span>
                      <span className="text-[10px] text-gray-400">{r.total_orders} zl.</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {contextMenu.employeeId && (
            <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors" onClick={() => handleReoptimize(contextMenu.employeeId)}>
              <RefreshCw className="h-3.5 w-3.5 text-blue-500" /> Przelicz trasę
            </button>
          )}
          <div className="border-t border-gray-100 my-1" />
          <button className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors" onClick={() => handleUnassign(contextMenu.orderId)}>
            <XCircle className="h-3.5 w-3.5" /> Usuń z trasy
          </button>
        </div>
      )}
    </div>
  );
}
