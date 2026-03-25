'use client';

import { motion } from 'framer-motion';
import { MapPin, Clock, Zap, Timer, CalendarRange, Shuffle, Wrench } from 'lucide-react';
import {
  type CalendarOrder,
  ROW_H,
  getDuration,
  formatTime,
} from './types';

/* ═══════════════════════════════════════════════════════════════════
 * EVENT BLOCK v2 — Premium booking card for the dispatch planner
 *
 * 4 density levels based on available height:
 *   MICRO  (< 28px)  — solid colored pill with tooltip
 *   COMPACT (28-44px) — one-line: service + badge
 *   MEDIUM  (44-68px) — two-line: service + client/time
 *   FULL    (>= 68px) — all: service, client, address, time, avatar, badges
 *
 * v2 changes:
 *   - Gradient backgrounds (from-*-100 to-*-50) for stronger presence
 *   - 5px accent bar with darker color + inset glow
 *   - Elevated shadows (depth hierarchy)
 *   - Priority rings (urgent: red, high: orange)
 *   - Stronger selected state
 *   - No outer border — shadow + accent bar define edges
 *   - Micro pill uses solid bg for visibility
 * ═══════════════════════════════════════════════════════════════════ */

const MOTION = {
  initial: { opacity: 0, y: 4, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: 'spring' as const, stiffness: 420, damping: 30, mass: 0.7 },
  hover: { y: -2, scale: 1.02, transition: { type: 'spring' as const, stiffness: 500, damping: 22 } },
  tap: { scale: 0.98 },
};

interface EventBlockProps {
  event: CalendarOrder;
  showEmployee?: boolean;
  columnIndex?: number;
  totalColumns?: number;
  rowHeight?: number;
  selected?: boolean;
  onClick?: (event: CalendarOrder) => void;
}

// ── Internal task type labels ──
const INTERNAL_TASK_LABELS: Record<string, string> = {
  pickup: 'Odbiór opon',
  cleaning: 'Sprzątanie',
  delivery: 'Dostawa',
  other: 'Inne',
};

// ── Status → accent bar color (darker for stronger bar) ──
const accentColors: Record<string, string> = {
  new:         '#2563eb',
  assigned:    '#d97706',
  in_progress: '#7c3aed',
  in_transit:  '#4f46e5',
  completed:   '#059669',
  cancelled:   '#9ca3af',
};

// ── Status → gradient card background (no border class — shadow defines edge) ──
const cardStyles: Record<string, { bg: string; shadow: string }> = {
  new:         { bg: 'from-blue-100/90 to-blue-50/70',     shadow: '0 1px 3px rgba(37,99,235,0.10), 0 1px 2px rgba(0,0,0,0.04)' },
  assigned:    { bg: 'from-amber-100/90 to-amber-50/70',   shadow: '0 1px 3px rgba(217,119,6,0.10), 0 1px 2px rgba(0,0,0,0.04)' },
  in_progress: { bg: 'from-violet-100/90 to-violet-50/70', shadow: '0 1px 3px rgba(124,58,237,0.10), 0 1px 2px rgba(0,0,0,0.04)' },
  in_transit:  { bg: 'from-indigo-100/90 to-indigo-50/70', shadow: '0 1px 3px rgba(79,70,229,0.10), 0 1px 2px rgba(0,0,0,0.04)' },
  completed:   { bg: 'from-emerald-100/80 to-emerald-50/60', shadow: '0 1px 3px rgba(5,150,105,0.10), 0 1px 2px rgba(0,0,0,0.04)' },
  cancelled:   { bg: 'from-gray-100/70 to-gray-50/50',     shadow: '0 1px 2px rgba(0,0,0,0.05)' },
};

// ── Status → text color ──
const textColors: Record<string, string> = {
  new:         'text-blue-900',
  assigned:    'text-amber-900',
  in_progress: 'text-violet-900',
  in_transit:  'text-indigo-900',
  completed:   'text-emerald-900',
  cancelled:   'text-gray-500',
};

const subTextColors: Record<string, string> = {
  new:         'text-blue-700',
  assigned:    'text-amber-700',
  in_progress: 'text-violet-700',
  in_transit:  'text-indigo-700',
  completed:   'text-emerald-700',
  cancelled:   'text-gray-400',
};

// ── Micro pill solid backgrounds ──
const microBg: Record<string, string> = {
  new:         'bg-blue-200',
  assigned:    'bg-amber-200',
  in_progress: 'bg-violet-200',
  in_transit:  'bg-indigo-200',
  completed:   'bg-emerald-200',
  cancelled:   'bg-gray-200',
};

// ── Scheduling type → badge ──
const typeBadges: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
  asap:        { label: 'ASAP',  cls: 'bg-red-500 text-white shadow-sm shadow-red-500/20',        Icon: Zap },
  fixed_time:  { label: '',      cls: '',                              Icon: Clock },
  time_window: { label: 'Okno',  cls: 'bg-amber-100 text-amber-700 shadow-sm shadow-amber-500/10',  Icon: CalendarRange },
  flexible:    { label: 'Flex',  cls: 'bg-emerald-100 text-emerald-700 shadow-sm shadow-emerald-500/10', Icon: Shuffle },
};

export function EventBlock({
  event,
  showEmployee = false,
  columnIndex = 0,
  totalColumns = 1,
  rowHeight: RH = ROW_H,
  selected = false,
  onClick,
}: EventBlockProps) {
  const isInternal = event.source === 'internal';
  const accent = isInternal ? '#0d9488' : (accentColors[event.status] || '#94a3b8');
  const style = isInternal
    ? { bg: 'from-teal-100/90 to-cyan-50/70', shadow: '0 1px 3px rgba(13,148,136,0.10), 0 1px 2px rgba(0,0,0,0.04)' }
    : (cardStyles[event.status] || cardStyles.new);
  const titleColor = isInternal ? 'text-teal-900' : (textColors[event.status] || 'text-gray-900');
  const subColor = isInternal ? 'text-teal-700' : (subTextColors[event.status] || 'text-gray-500');
  const badge = typeBadges[event.scheduling_type] || typeBadges.fixed_time;
  const isAsap = event.scheduling_type === 'asap';
  const isUrgent = event.priority === 'urgent';
  const isHigh = event.priority === 'high';
  const internalLabel = isInternal && event.internal_task_type
    ? (INTERNAL_TASK_LABELS[event.internal_task_type] || event.internal_task_type)
    : null;

  // ── Dimensions ──
  const duration = getDuration(event.scheduled_time_start, event.scheduled_time_end);
  const startMinute = Number((event.scheduled_time_start || '00:00').split(':')[1] || 0);
  const blockH = Math.max(duration * RH - 4, 22);

  // ── Density level ──
  const isMicro = blockH < 28;
  const isCompact = blockH >= 28 && blockH < 44;
  const isMedium = blockH >= 44 && blockH < 68;
  const isFull = blockH >= 68;

  // ── Parsed data ──
  const serviceList = event.service_names ? event.service_names.split(', ') : [];
  const firstService = isInternal ? (internalLabel || 'Zadanie wewnętrzne') : (serviceList[0] || '');
  const extraCount = isInternal ? 0 : (serviceList.length - 1);
  const empInitials = event.employee_name
    ? event.employee_name.split(' ').map(w => w[0]).join('').slice(0, 2)
    : null;

  // ── Priority ring class ──
  const priorityRing = isAsap
    ? 'ring-2 ring-red-400/50 ring-offset-1 ring-offset-white/50'
    : isUrgent
      ? 'ring-2 ring-red-400/40 ring-offset-1 ring-offset-white/50'
      : isHigh
        ? 'ring-1 ring-orange-300/40'
        : '';

  // ── Shadow states ──
  const defaultShadow = style.shadow;
  const hoverShadow = `0 4px 14px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)`;
  const selectedShadow = `0 0 0 2px ${accent}, 0 8px 24px rgba(0,0,0,0.14)`;

  return (
    <motion.div
      layout
      initial={MOTION.initial}
      animate={{
        ...MOTION.animate,
        boxShadow: selected ? selectedShadow : defaultShadow,
      }}
      whileHover={{
        ...MOTION.hover,
        boxShadow: selected ? selectedShadow : hoverShadow,
      }}
      whileTap={MOTION.tap}
      transition={MOTION.transition}
      onClick={e => { e.stopPropagation(); onClick?.(event); }}
      className={`
        absolute z-10 cursor-pointer
        rounded-lg overflow-hidden
        bg-gradient-to-r ${style.bg}
        ${priorityRing}
        transition-shadow duration-150
      `}
      style={{
        height: `${blockH}px`,
        top: `${(startMinute / 60) * RH + 2}px`,
        left: `calc(${(columnIndex / totalColumns) * 100}% + 2px)`,
        width: `calc(${(1 / totalColumns) * 100}% - 4px)`,
        borderLeft: `5px solid ${accent}`,
      }}
    >
      {/* ── MICRO: solid colored pill ── */}
      {isMicro && (
        <div
          className={`px-1.5 h-full flex items-center rounded-r-md ${isInternal ? 'bg-teal-200' : (microBg[event.status] || 'bg-gray-200')}`}
          title={`${firstService || event.client_name} · ${formatTime(event.scheduled_time_start)}`}
        >
          {isInternal && <Wrench className="h-2.5 w-2.5 text-teal-700 mr-0.5 shrink-0" />}
          <span className={`text-[9px] font-extrabold ${titleColor} truncate`}>
            {(firstService || event.client_name).split(' ')[0]}
          </span>
        </div>
      )}

      {/* ── COMPACT: one line ── */}
      {isCompact && (
        <div className="px-2 h-full flex items-center gap-1 min-w-0">
          {isInternal && <Wrench className="h-3 w-3 text-teal-600 shrink-0" />}
          <p className={`text-[10px] font-bold ${titleColor} truncate flex-1 min-w-0`}>
            {firstService || event.client_name}
          </p>
          {extraCount > 0 && (
            <span className="flex-shrink-0 text-[8px] font-bold text-gray-400">+{extraCount}</span>
          )}
          {isInternal && (
            <span className="flex-shrink-0 px-1 py-px rounded text-[7px] font-bold bg-teal-100 text-teal-700">
              Wew.
            </span>
          )}
          {!isInternal && badge.label && (
            <span className={`flex-shrink-0 px-1 py-px rounded text-[7px] font-bold ${badge.cls}`}>
              {badge.label}
            </span>
          )}
          {isUrgent && !isAsap && (
            <motion.span
              className="flex-shrink-0 h-2 w-2 rounded-full bg-red-500"
              animate={{ scale: [1, 1.4, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          )}
        </div>
      )}

      {/* ── MEDIUM: two lines ── */}
      {isMedium && (
        <div className="px-2 py-1 h-full flex flex-col justify-center gap-0.5">
          <div className="flex items-center gap-1 min-w-0">
            {isInternal && <Wrench className="h-3 w-3 text-teal-600 shrink-0" />}
            <p className={`text-[11px] font-bold ${titleColor} truncate flex-1 min-w-0 leading-tight`}>
              {firstService || event.client_name}
            </p>
            {isInternal ? (
              <span className="flex-shrink-0 px-1 py-px rounded text-[7px] font-bold bg-teal-100 text-teal-700">
                Wewnętrzne
              </span>
            ) : badge.label ? (
              <span className={`flex-shrink-0 px-1 py-px rounded text-[7px] font-bold ${badge.cls}`}>
                {badge.label}
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-[9px] font-medium ${subColor} truncate`}>
              {isInternal ? 'Zadanie wewnętrzne' : event.client_name}
            </span>
            <span className={`text-[9px] ${subColor} opacity-70 flex-shrink-0 ml-1`}>
              {formatTime(event.scheduled_time_start)}
            </span>
          </div>
        </div>
      )}

      {/* ── FULL: all details ── */}
      {isFull && (
        <div className="px-2.5 py-1.5 h-full flex flex-col gap-0.5">
          {/* Title */}
          <div className="flex items-start gap-1 min-w-0">
            {isInternal && <Wrench className="h-3.5 w-3.5 text-teal-600 shrink-0 mt-px" />}
            <p className={`text-[11px] font-extrabold ${titleColor} truncate flex-1 min-w-0 leading-tight`}>
              {firstService || event.client_name}
            </p>
            {extraCount > 0 && (
              <span className="flex-shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-white/60 text-[8px] font-bold text-gray-500 shadow-sm">
                +{extraCount}
              </span>
            )}
          </div>

          {/* Client or Internal badge */}
          {isInternal ? (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[8px] font-bold bg-teal-100 text-teal-700 w-fit">
              Wewnętrzne
            </span>
          ) : firstService ? (
            <p className={`text-[9px] font-medium ${subColor} truncate leading-tight`}>{event.client_name}</p>
          ) : null}

          {/* Address */}
          {blockH >= 80 && event.address && (
            <div className="flex items-center gap-0.5">
              <MapPin className={`h-2.5 w-2.5 ${subColor} opacity-50 flex-shrink-0`} />
              <span className={`text-[8px] ${subColor} opacity-70 truncate`}>
                {event.address.length > 28 ? event.address.slice(0, 27) + '…' : event.address}
              </span>
            </div>
          )}

          {/* Time */}
          {blockH >= 90 && (
            <div className="flex items-center gap-0.5">
              <Clock className={`h-2.5 w-2.5 ${subColor} opacity-50 flex-shrink-0`} />
              <span className={`text-[8px] ${subColor} opacity-70`}>
                {formatTime(event.scheduled_time_start)}–{formatTime(event.scheduled_time_end)}
              </span>
            </div>
          )}

          {/* Bottom: avatar + badges */}
          <div className="flex items-center justify-between mt-auto pt-0.5">
            <div className="flex items-center -space-x-1">
              {empInitials && (
                <div
                  className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold ring-2 ring-white/80 shadow-sm"
                  style={{ backgroundColor: event.employee_color }}
                >
                  {empInitials}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              {badge.label && (
                <span className={`px-1.5 py-0.5 rounded text-[7px] font-bold ${badge.cls}`}>
                  {badge.label}
                </span>
              )}
              {isUrgent && !isAsap && (
                <motion.span
                  className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-sm shadow-red-500/30"
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
              {isHigh && (
                <span className="h-2.5 w-2.5 rounded-full bg-orange-400 shadow-sm shadow-orange-400/30" />
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
