'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Shield, Car } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WorkSchedule {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_night_shift: boolean;
  notes: string | null;
  vehicle_id: string | null;
  region_id: string | null;
  vehicle_plate: string | null;
  region_name: string | null;
  region_color: string | null;
}

export type ShiftDragMode = 'move' | 'resize-end';

export interface ShiftDragState {
  scheduleId: string;
  mode: ShiftDragMode;
  startX: number;
  origStartTime: string;
  origEndTime: string;
  cellWidth: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function timeStr(t: string): string {
  return t?.slice(0, 5) ?? '';
}

/** Convert hex + alpha to rgba string for inline styles */
export function hexAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const FALLBACK_COLOR = '#3b82f6';

/** Convert "HH:MM" to total minutes */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Convert total minutes to "HH:MM" (clamped 00:00–23:59) */
export function minutesToTime(min: number): string {
  const clamped = Math.max(0, Math.min(1439, min));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Snap minutes to nearest 15-min increment */
export function snap15(min: number): number {
  return Math.round(min / 15) * 15;
}

// ─── ShiftBlock Component ───────────────────────────────────────────────────

export function ShiftBlock({
  schedule,
  compact,
  onClick,
  onDragStart,
  previewTime,
}: {
  schedule: WorkSchedule;
  compact: boolean;
  onClick: () => void;
  onDragStart?: (schedule: WorkSchedule, mode: ShiftDragMode, startX: number, cellWidth: number) => void;
  previewTime?: { start_time: string; end_time: string } | null;
}) {
  const blockRef = useRef<HTMLDivElement>(null);
  const color = schedule.region_color || FALLBACK_COLOR;
  const isDuty = schedule.notes === 'DYZUR_48_48';

  const displayStart = previewTime?.start_time ?? schedule.start_time;
  const displayEnd = previewTime?.end_time ?? schedule.end_time;
  const isPreview = !!previewTime;

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const cellWidth = blockRef.current?.parentElement?.clientWidth ?? 100;
    onDragStart?.(schedule, 'resize-end', e.clientX, cellWidth);
  };

  const handleMoveMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-resize-handle]')) return;
    e.preventDefault();
    const cellWidth = blockRef.current?.parentElement?.clientWidth ?? 100;
    onDragStart?.(schedule, 'move', e.clientX, cellWidth);
  };

  return (
    <motion.div
      ref={blockRef}
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={cn(
        'relative rounded-md overflow-hidden select-none group/block',
        compact ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
        isPreview && 'ring-2 ring-blue-400 ring-offset-1',
      )}
      style={{ height: compact ? 22 : 56 }}
      onClick={compact || !onDragStart ? onClick : undefined}
      onMouseDown={!compact && onDragStart ? handleMoveMouseDown : undefined}
      title={`${timeStr(displayStart)}\u2013${timeStr(displayEnd)}${schedule.vehicle_plate ? ' \u00b7 ' + schedule.vehicle_plate : ''}${schedule.region_name ? ' \u00b7 ' + schedule.region_name : ''}`}
    >
      {/* Background tint */}
      <div className="absolute inset-0" style={{ backgroundColor: hexAlpha(color, 0.10) }} />
      {/* Left accent border */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: color }} />
      {/* Hover highlight */}
      <div className="absolute inset-0 opacity-0 group-hover/block:opacity-100 transition-opacity" style={{ backgroundColor: hexAlpha(color, 0.08) }} />

      {compact ? (
        <div className="relative flex items-center justify-center h-full pl-1">
          <span className="text-[9px] font-bold truncate" style={{ color }}>
            {timeStr(displayStart)}
          </span>
        </div>
      ) : (
        <div className="relative pl-2.5 pr-1.5 py-1 flex flex-col justify-center h-full">
          <div className="flex items-center gap-1 min-w-0">
            {isDuty && (
              <Shield className="h-2.5 w-2.5 shrink-0" style={{ color }} />
            )}
            <span className="text-[10px] font-bold truncate" style={{ color }}>
              {timeStr(displayStart)}\u2013{timeStr(displayEnd)}
            </span>
          </div>
          {schedule.vehicle_plate && (
            <div className="flex items-center gap-1 min-w-0">
              <Car className="h-2.5 w-2.5 shrink-0 text-gray-400" />
              <span className="text-[9px] text-gray-500 truncate">{schedule.vehicle_plate}</span>
            </div>
          )}
          {schedule.region_name && (
            <span className="text-[9px] truncate" style={{ color: hexAlpha(color, 0.85) }}>
              {schedule.region_name}
            </span>
          )}
        </div>
      )}

      {/* Resize handle (right edge) — only in non-compact mode */}
      {!compact && onDragStart && (
        <div
          data-resize-handle
          className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize hover:bg-blue-400/30 transition-colors z-10"
          onMouseDown={handleResizeMouseDown}
        />
      )}
    </motion.div>
  );
}
