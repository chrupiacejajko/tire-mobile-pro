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
  onOrderClick?: (orderId: string) => void;
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

// ── Block color system based on time buffer status ───────────────────────────
// 5-color scheme: green (on time), yellow (tight), red (late), blue (flexible), gray (completed)

type BlockColorLevel = 'green' | 'yellow' | 'red' | 'blue' | 'gray';

interface BlockColorStyle {
  bg: string;
  border: string;
  accent: string;
  textClass: string;
  label: string;
}

const BLOCK_COLORS: Record<BlockColorLevel, BlockColorStyle> = {
  green:  { bg: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', accent: '#10B981', textClass: 'text-emerald-700', label: 'Na czas' },
  yellow: { bg: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', accent: '#F59E0B', textClass: 'text-amber-700',   label: 'Ciasno' },
  red:    { bg: 'rgba(239,68,68,0.15)',  border: '1px solid rgba(239,68,68,0.4)',   accent: '#EF4444', textClass: 'text-red-700',     label: 'Spóźnienie' },
  blue:   { bg: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.35)', accent: '#3B82F6', textClass: 'text-blue-700',    label: 'Elastyczne' },
  gray:   { bg: '#1F2937',               border: '1px solid #374151',               accent: '#9CA3AF', textClass: 'text-white',       label: 'Ukończone' },
};

function getBlockColor(stop: Stop): BlockColorStyle {
  const status = stop.order_status ?? 'pending';

  // Completed / cancelled orders -> gray
  if (status === 'completed' || status === 'cancelled') {
    return BLOCK_COLORS.gray;
  }

  // In-progress keeps gray with stripe pattern (handled separately in render)
  if (status === 'in_progress') {
    return BLOCK_COLORS.gray;
  }

  // No time window -> flexible (blue)
  if (stop.time_window_status === 'no_window') {
    return BLOCK_COLORS.blue;
  }

  // Compute buffer: flexibility_minutes is the total allowed delay,
  // delay_minutes is how late we actually are. remaining = flex - delay.
  const flexibility = stop.flexibility_minutes ?? 0;
  const delay = stop.delay_minutes ?? 0;
  const buffer = flexibility - delay;

  // Late — buffer negative or time_window_status says late
  if (stop.time_window_status === 'late' || buffer < 0) {
    return BLOCK_COLORS.red;
  }

  // Tight — buffer between 0 and 30 min, or time_window_status says tight
  if (stop.time_window_status === 'tight' || (buffer >= 0 && buffer <= 30)) {
    return BLOCK_COLORS.yellow;
  }

  // On time — comfortable buffer > 30 min
  return BLOCK_COLORS.green;
}


export function GanttView({
  routes,
  unassigned,
  date,
  onRefresh,
  onOrderClick,
}: GanttViewProps) {
  const START_HOUR = 0;
  const END_HOUR = 24;
  const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;
  const HOUR_WIDTH = 100;
  const TOTAL_WIDTH = (END_HOUR - START_HOUR) * HOUR_WIDTH;
  const ROW_HEIGHT = 64;

  // ── Local state — mirrors props, updated optimistically on drag ───────────
  const [localRoutes, setLocalRoutes] = useState<EmployeeRoute[]>(routes);
  const [localUnassigned, setLocalUnassigned] = useState<UnassignedOrder[]>(unassigned);
  // Sync from props after background refresh — but never wipe existing data with empty array
  // (prevents flashing empty state between fetch start/end)
  useEffect(() => {
    if (routes.length > 0) setLocalRoutes(routes);
    else if (localRoutes.length === 0) setLocalRoutes(routes); // ok to set empty only if already empty
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes]);
  useEffect(() => {
    setLocalUnassigned(unassigned);
  }, [unassigned]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<GanttDragState | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragSnapX, setDragSnapX] = useState<number>(0);   // snapped X in timeline px
  const [dragTargetRow, setDragTargetRow] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<GanttContextMenu | null>(null);
  const [lockedOrders, setLockedOrders] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<GanttTooltip | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragSnapXRef = useRef<number>(0); // stable ref for mouseup handler

  const SNAP_MINUTES = 15;
  const LEFT_COL_WIDTH = 192; // w-48 = 12rem = 192px

  function snapToMinutes(x: number): number {
    const pxPerMin = TOTAL_WIDTH / TOTAL_MINUTES;
    const rawMin = x / pxPerMin;
    const snapped = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
    return Math.max(0, Math.min(TOTAL_MINUTES, snapped)) * pxPerMin;
  }

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

      // Cursor-relative position: more accurate for cross-row drags
      // Falls back to delta-based if container ref isn't ready
      let rawX = dragging.origLeft + dx;
      if (containerRef.current) {
        const cRect = containerRef.current.getBoundingClientRect();
        const cursorInTimeline = e.clientX - cRect.left - LEFT_COL_WIDTH;
        // Preserve the click-offset within the block so it doesn't jump
        const clickOffset = dragging.startX - (cRect.left + LEFT_COL_WIDTH + dragging.origLeft);
        rawX = cursorInTimeline - clickOffset;
      }
      const snapped = snapToMinutes(rawX);
      setDragSnapX(snapped);
      dragSnapXRef.current = snapped;

      let targetRow: string | null = null;
      rowRefs.current.forEach((el, empId) => {
        const rect = el.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) targetRow = empId;
      });
      setDragTargetRow(targetRow);
    };
    const handleMouseUp = async (e: MouseEvent) => {
      const newTime = xToTime(dragSnapXRef.current);
      const snappedX = dragSnapXRef.current;
      const targetEmployee = dragTargetRow;
      const dx = e.clientX - dragging.startX;
      const movedEnough = Math.abs(dx) > 5 || (targetEmployee && targetEmployee !== dragging.origRow);
      // Snapshot drag state before clearing
      const { orderId, origRow, isUnassigned, blockWidth } = dragging;
      setDragging(null); setDragOffset({ x: 0, y: 0 }); setDragSnapX(0); setDragTargetRow(null);
      if (!movedEnough) return;

      // ── Optimistic updates — apply immediately so no snap-back ───────────
      if (isUnassigned && targetEmployee) {
        // Move from unassigned to employee row
        setLocalUnassigned(prev => prev.filter(o => o.id !== orderId));
        setLocalRoutes(prev => prev.map(r => {
          if (r.employee_id !== targetEmployee) return r;
          const durationMin = 60; // placeholder until real refresh
          const [sh, sm] = newTime.split(':').map(Number);
          const endMin = sh * 60 + sm + durationMin;
          const endH = Math.floor(endMin / 60), endM = endMin % 60;
          const newStop: Stop = {
            order_id: orderId, sequence: r.schedule.length + 1, client_name: '…',
            address: '', lat: 0, lng: 0, services: [], time_window: null,
            time_window_label: null, time_window_color: null, time_window_status: 'no_window',
            travel_minutes: 0, arrival_time: newTime, wait_minutes: 0, service_start: newTime,
            service_duration_minutes: durationMin, departure_time: `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`,
            delay_minutes: 0, flexibility_minutes: 0, order_status: 'assigned',
          };
          return { ...r, schedule: [...r.schedule, newStop], total_orders: r.total_orders + 1 };
        }));
      } else if (targetEmployee && targetEmployee !== origRow) {
        // Reassign between employee rows — move stop
        let movedStop: Stop | null = null;
        setLocalRoutes(prev => prev.map(r => {
          if (r.employee_id !== origRow) return r;
          const stop = r.schedule.find(s => s.order_id === orderId);
          if (stop) movedStop = { ...stop, service_start: newTime, arrival_time: newTime };
          return { ...r, schedule: r.schedule.filter(s => s.order_id !== orderId), total_orders: r.total_orders - 1 };
        }));
        if (movedStop) {
          const s = movedStop as Stop;
          setLocalRoutes(prev => prev.map(r => {
            if (r.employee_id !== targetEmployee) return r;
            const endMin = s.service_duration_minutes + parseInt(newTime.split(':')[0]) * 60 + parseInt(newTime.split(':')[1]);
            const endH = Math.floor(endMin / 60), endM = endMin % 60;
            const updated = { ...s, arrival_time: newTime, service_start: newTime, departure_time: `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}` };
            return { ...r, schedule: [...r.schedule, updated], total_orders: r.total_orders + 1 };
          }));
        }
      } else {
        // Time shift — same row
        setLocalRoutes(prev => prev.map(r => {
          if (r.employee_id !== origRow) return r;
          return {
            ...r,
            schedule: r.schedule.map(s => {
              if (s.order_id !== orderId) return s;
              const [sh, sm] = newTime.split(':').map(Number);
              const endMin = sh * 60 + sm + s.service_duration_minutes;
              const endH = Math.floor(endMin / 60), endM = endMin % 60;
              return { ...s, service_start: newTime, arrival_time: newTime, departure_time: `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}` };
            }),
          };
        }));
      }

      // ── API call + delayed sync (avoid immediate refresh overwriting optimistic update) ──
      const delayedRefresh = () => setTimeout(() => onRefresh(), 800);
      if (isUnassigned && targetEmployee) {
        fetch('/api/planner/insert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, employee_id: targetEmployee, date, scheduled_time_start: newTime }) })
          .then(delayedRefresh).catch(err => console.error('Insert failed', err));
      } else if (targetEmployee && targetEmployee !== origRow) {
        fetch('/api/planner/insert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, employee_id: targetEmployee, date, scheduled_time_start: newTime }) })
          .then(delayedRefresh).catch(err => console.error('Reassign failed', err));
      } else {
        fetch('/api/orders/update-time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, scheduled_time_start: newTime, employee_id: origRow || undefined }) })
          .then(delayedRefresh).catch(err => console.error('Time update failed', err));
      }
      void snappedX; void blockWidth; // used via dragSnapXRef / dragging.blockWidth elsewhere
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [dragging, dragTargetRow, date, onRefresh]);

  const lastMouseDown = useRef<{ x: number; y: number; orderId: string } | null>(null);

  const handleBlockMouseDown = (e: React.MouseEvent, orderId: string, employeeId: string, left: number, isUnassigned?: boolean, blockWidth?: number) => {
    if (e.button !== 0) return; e.preventDefault(); setTooltip(null);
    lastMouseDown.current = { x: e.clientX, y: e.clientY, orderId };
    const snapped = snapToMinutes(left);
    setDragSnapX(snapped);
    dragSnapXRef.current = snapped;
    setDragging({ orderId, employeeId, startX: e.clientX, startY: e.clientY, origLeft: left, origRow: employeeId, isUnassigned, blockWidth });
  };

  const handleBlockClick = (e: React.MouseEvent, orderId: string) => {
    // Only fire if mouse barely moved (was a click, not a drag)
    if (!lastMouseDown.current || lastMouseDown.current.orderId !== orderId) return;
    const dx = Math.abs(e.clientX - lastMouseDown.current.x);
    const dy = Math.abs(e.clientY - lastMouseDown.current.y);
    if (dx < 5 && dy < 5 && onOrderClick) {
      onOrderClick(orderId);
    }
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

    // Block color system (5-level: green/yellow/red/blue/gray)
    const blockColor = getBlockColor(stop);
    const level = getDelayToleranceLevel(stop.flexibility_minutes ?? 0, stop.order_status ?? 'pending');
    const isCompletedOrInProgress = level === 'completed' || level === 'in_progress';
    // In-progress gets striped pattern over gray
    const blockBg = level === 'in_progress'
      ? 'repeating-linear-gradient(45deg, #1F2937, #1F2937 4px, #4B5563 4px, #4B5563 8px)'
      : blockColor.bg;

    // ── When dragging, show origin ghost (the hole where block was) ──
    const originGhost = isDraggingThis && (
      <div
        key={`${stop.order_id}-ghost`}
        className="absolute top-1/2 -translate-y-1/2 rounded-lg pointer-events-none"
        style={{
          left: serviceStartX,
          width: serviceWidth,
          height: '42px',
          background: 'rgba(0,0,0,0.025)',
          border: '2px dashed rgba(0,0,0,0.12)',
          borderLeft: `4px solid rgba(0,0,0,0.1)`,
        }}
      />
    );

    // Dragging block uses snapped position
    const blockLeft = isDraggingThis ? dragSnapX : serviceStartX;

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
        {/* Origin ghost — shows where block came from */}
        {originGhost}
        {/* Service block — delay tolerance colored */}
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 rounded-lg cursor-grab select-none overflow-hidden',
            isDraggingThis ? 'z-50 cursor-grabbing' : 'transition-shadow hover:shadow-md hover:brightness-[1.02]',
            isLocked && 'ring-1 ring-dashed ring-orange-400',
          )}
          style={{
            left: blockLeft,
            width: serviceWidth,
            height: '42px',
            background: blockBg,
            border: blockColor.border,
            borderLeft: `4px solid ${blockColor.accent}`,
            // Smooth transition when server data updates position (not while dragging)
            transition: isDraggingThis ? 'none' : 'left 0.3s ease-out, width 0.3s ease-out',
            ...(isDraggingThis ? {
              transform: `translate(0, calc(-50% + ${offsetY}px)) scale(1.04)`,
              zIndex: 50,
              boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.12)',
              opacity: 0.92,
            } : {}),
          }}
          onMouseDown={(e) => handleBlockMouseDown(e, stop.order_id, employeeId, serviceStartX, false, serviceWidth)}
          onMouseUp={(e) => handleBlockClick(e, stop.order_id)}
          onContextMenu={(e) => handleContextMenu(e, stop.order_id, employeeId)}
          onMouseEnter={(e) => { if (!dragging) setTooltip({ x: e.clientX, y: e.clientY - 10, stop, employeeName }); }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Two-line layout for blocks ≥50px, single-line for very narrow */}
          {serviceWidth >= 50 ? (
            <div className="flex flex-col justify-center h-full px-1.5 min-w-0">
              {/* Top line: sequence + client name */}
              <div className="flex items-center gap-0.5 min-w-0">
                {isLocked && <span className="text-[9px]">🔒</span>}
                {stop.time_window_status === 'late' && !isCompletedOrInProgress && <AlertTriangle className="h-2.5 w-2.5 text-red-500 flex-shrink-0" />}
                <span className={`text-[10px] font-semibold truncate ${blockColor.textClass}`}>
                  {stop.sequence}. {stop.client_name}
                </span>
              </div>
              {/* Bottom line: time range + services */}
              <div className="flex items-center gap-1 min-w-0 mt-px">
                <span className={`text-[9px] tabular-nums opacity-70 flex-shrink-0 ${blockColor.textClass}`}>
                  {stop.service_start}–{stop.departure_time}
                </span>
                {serviceWidth > 120 && stop.services.length > 0 && (
                  <span className={`text-[8px] opacity-50 truncate ${blockColor.textClass}`}>
                    · {stop.services.map((s: any) => typeof s === 'string' ? s : s?.name).filter(Boolean).join(', ')}
                  </span>
                )}
                {serviceWidth > 120 && stop.services.length === 0 && stop.service_duration_minutes > 0 && (
                  <span className={`text-[8px] opacity-50 ${blockColor.textClass}`}>
                    ({stop.service_duration_minutes}min)
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center h-full px-1 gap-0.5 min-w-0">
              {isLocked && <span className="text-[9px]">🔒</span>}
              {stop.time_window_status === 'late' && !isCompletedOrInProgress && <AlertTriangle className="h-2.5 w-2.5 text-red-500 flex-shrink-0" />}
              <span className={`text-[9px] font-semibold truncate ${blockColor.textClass}`}>
                {stop.sequence}.
              </span>
            </div>
          )}
          {/* Buffer countdown overlay */}
          {(() => {
            const buf = getBufferDisplay(stop);
            if (!buf || serviceWidth < 80) return null;
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

  // Scroll-to-now on mount (scroll to ~1 hour before current time)
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isToday && scrollRef.current) {
      const scrollTarget = Math.max(0, nowX - HOUR_WIDTH);
      scrollRef.current.scrollLeft = scrollTarget;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} className="rounded-xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] relative">
      {/* ── Color legend ── */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-gray-100 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BLOCK_COLORS.green.accent }} /> Na czas</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BLOCK_COLORS.yellow.accent }} /> Ciasno</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BLOCK_COLORS.red.accent }} /> Spóźnienie</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BLOCK_COLORS.blue.accent }} /> Elastyczne</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BLOCK_COLORS.gray.accent }} /> Ukończone</span>
      </div>
      {/* Single horizontal scroll container — header + all rows scroll together */}
      <div ref={scrollRef} className="overflow-x-auto overflow-y-visible" style={{ position: 'relative' }}>
        <div style={{ width: LEFT_COL_WIDTH + TOTAL_WIDTH, minWidth: '100%' }}>

          {/* ── Header row: sticky employee label + time axis ── */}
          <div className="flex sticky top-0 z-10 bg-white" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
            <div
              className="flex-shrink-0 px-3 py-2 bg-white z-20 flex items-end"
              style={{ width: LEFT_COL_WIDTH, position: 'sticky', left: 0, borderRight: '1px solid rgba(0,0,0,0.06)' }}
            >
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pracownik</span>
            </div>
            <div className="relative flex-shrink-0" style={{ width: TOTAL_WIDTH }}>
              <div className="flex">
                {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => {
                  const hour = START_HOUR + i;
                  const isWorkHour = hour >= 8 && hour < 17;
                  return (
                    <div
                      key={i}
                      className="flex-shrink-0 relative"
                      style={{
                        width: HOUR_WIDTH,
                        borderRight: '1px solid rgba(0,0,0,0.06)',
                        backgroundColor: isWorkHour ? 'rgba(249,115,22,0.02)' : undefined,
                      }}
                    >
                      {/* Hour label */}
                      <div className="py-1.5 px-1 text-center">
                        <span className={cn(
                          'text-xs font-semibold tabular-nums',
                          isWorkHour ? 'text-gray-700' : 'text-gray-300',
                        )}>
                          {String(hour).padStart(2, '0')}:00
                        </span>
                      </div>
                      {/* Half-hour tick */}
                      <div
                        className="absolute bottom-0"
                        style={{ left: HOUR_WIDTH / 2, width: '1px', height: '6px', background: 'rgba(0,0,0,0.08)' }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Employee rows ── */}
          {(localRoutes ?? []).map((route, rowIdx) => {
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
                {/* Employee info — sticky left column */}
                <div
                  className="flex-shrink-0 px-3 py-2 flex items-center gap-2 bg-white z-10"
                  style={{ width: LEFT_COL_WIDTH, position: 'sticky', left: 0, borderRight: '1px solid rgba(0,0,0,0.06)' }}
                >
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
                  className={cn('relative flex-shrink-0', !isDropTarget && 'hover:bg-orange-50/10')}
                  style={{ width: TOTAL_WIDTH, height: ROW_HEIGHT }}
                >
                  {/* Hour grid lines + half-hour dashed lines */}
                  {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                    <Fragment key={i}>
                      <div className="absolute top-0 bottom-0" style={{ left: i * HOUR_WIDTH, borderRight: '1px solid rgba(0,0,0,0.04)' }} />
                      <div className="absolute top-0 bottom-0" style={{ left: i * HOUR_WIDTH + HOUR_WIDTH / 2, borderRight: '1px dashed rgba(0,0,0,0.02)' }} />
                    </Fragment>
                  ))}

                  {/* Service blocks */}
                  {route.schedule.map((stop, i) => {
                    const prevDeparture = i > 0 ? timeToX(route.schedule[i - 1].departure_time) : null;
                    if (stop.order_id === 'return_to_base') {
                      return renderReturnBlock(stop, prevDeparture);
                    }
                    return renderServiceBlock(stop, route.employee_id, route.employee_name, prevDeparture, lockedOrders.has(stop.order_id));
                  })}

                  {/* Drop target ghost — shows where block will land in THIS row */}
                  {dragging && dragTargetRow === route.employee_id && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 rounded-lg pointer-events-none z-30"
                      style={{
                        left: Math.max(0, dragSnapX),
                        width: Math.max(dragging.blockWidth ?? 80, 60),
                        height: '38px',
                        background: dragging.origRow !== route.employee_id
                          ? 'rgba(251,146,60,0.15)'
                          : 'rgba(59,130,246,0.10)',
                        border: `2px dashed ${dragging.origRow !== route.employee_id ? 'rgba(251,146,60,0.85)' : 'rgba(59,130,246,0.6)'}`,
                        borderLeft: `4px solid ${dragging.origRow !== route.employee_id ? '#f97316' : '#3b82f6'}`,
                        boxShadow: `0 0 0 1px ${dragging.origRow !== route.employee_id ? 'rgba(251,146,60,0.2)' : 'rgba(59,130,246,0.15)'}`,
                      }}
                    >
                      <div className="flex items-center justify-center h-full gap-1 px-2">
                        <span
                          className="text-[10px] font-bold whitespace-nowrap"
                          style={{ color: dragging.origRow !== route.employee_id ? '#ea580c' : '#2563eb' }}
                        >
                          {xToTime(Math.max(0, dragSnapX))}
                        </span>
                      </div>
                    </div>
                  )}

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

          {/* ── Unassigned row ── */}
          {localUnassigned.length > 0 && (
            <div
              ref={(el) => { if (el) rowRefs.current.set('__unassigned__', el); }}
              className="flex bg-gray-50/30"
              style={{ borderTop: '2px dashed rgba(0,0,0,0.08)' }}
            >
              <div
                className="flex-shrink-0 px-3 py-2 flex items-center gap-2 bg-gray-50/30 z-10"
                style={{ width: LEFT_COL_WIDTH, position: 'sticky', left: 0, borderRight: '1px solid rgba(0,0,0,0.06)' }}
              >
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                  <AlertTriangle className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-gray-500">Nieprzypisane</p>
                  <p className="text-[9px] text-red-500 font-bold">{localUnassigned.length} zlec.</p>
                </div>
              </div>
              <div className="relative flex-shrink-0 flex items-center gap-1.5 px-2 py-1" style={{ width: TOTAL_WIDTH, minHeight: ROW_HEIGHT }}>
                {localUnassigned.map((order, idx) => {
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
                      onMouseDown={(e) => handleBlockMouseDown(e, order.id, '', left, true, blockWidth)}
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

        </div>{/* end inner width wrapper */}
      </div>{/* end scroll container */}

      {/* Snap guide line — vertical line across all rows while dragging (outside scroll container, uses absolute) */}
      {dragging && dragSnapX > 0 && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-40"
          style={{ left: LEFT_COL_WIDTH + dragSnapX - (scrollRef.current?.scrollLeft ?? 0) }}
        >
          <div className="w-[1.5px] h-full bg-gradient-to-b from-orange-500/80 via-orange-400/50 to-orange-300/20" />
          <div
            className="absolute top-2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md"
            style={{ left: 0 }}
          >
            {xToTime(dragSnapX)}
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
          {onOrderClick && (
            <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors" onClick={() => { setContextMenu(null); onOrderClick(contextMenu.orderId); }}>
              <Clock className="h-3.5 w-3.5 text-blue-500" /> Otwórz zlecenie
            </button>
          )}
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
                {(localRoutes ?? []).map(r => {
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
