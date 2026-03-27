'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  ExternalLink, RefreshCw, Zap, ChevronDown, ChevronUp,
  Copy, Car, MapPin, AlertTriangle, MoreHorizontal, Navigation,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type EmployeeRoute, type Stop, copyToClipboard } from './types';
import { ScoreBadge, ScoreBreakdown, ScoreBar, WorkerStatusDot } from './ScoreDisplay';
import { StopCard, DraggableStopCard, StopCardGhost } from './StopCard';
import { MiniGanttBar } from './MiniGanttBar';

// ── Gap indicator between stops ───────────────────────────────────────────────

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function formatGap(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function StopGapIndicator({ prevStop, nextStop }: { prevStop: Stop; nextStop: Stop }) {
  const prevDepart = parseTime(prevStop.departure_time);
  const nextArrive = parseTime(nextStop.arrival_time);
  const gapMinutes = nextArrive - prevDepart;

  // Don't show gap if zero or negative (back-to-back / overlap)
  if (gapMinutes <= 0) return null;

  // Subtract travel time to get actual free/break time
  const freeMinutes = gapMinutes - nextStop.travel_minutes;
  const travelMin = nextStop.travel_minutes;

  // Color coding
  const isShort = freeMinutes > 0 && freeMinutes < 30;
  const isLong = freeMinutes >= 60;

  // Bar width proportional to gap (max 100%)
  const barPercent = Math.min(100, Math.max(8, (gapMinutes / 180) * 100));
  const travelPercent = gapMinutes > 0 ? (travelMin / gapMinutes) * 100 : 0;

  return (
    <div className="flex gap-3 my-1">
      {/* Align with the timeline column */}
      <div className="flex flex-col items-center w-7">
        <div className="w-px border-l border-dashed border-gray-300 flex-1" />
      </div>
      {/* Gap visualization */}
      <div className="flex-1 max-w-sm mx-auto">
        <div className={cn(
          'rounded-lg px-3 py-2 border',
          isShort ? 'bg-amber-50/70 border-amber-200/60' :
          isLong ? 'bg-blue-50/50 border-blue-200/50' :
          'bg-emerald-50/50 border-emerald-200/50'
        )}>
          {/* Time bar */}
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mb-1.5" style={{ maxWidth: `${barPercent}%` }}>
            <div className="h-full rounded-full flex">
              {travelMin > 0 && (
                <div
                  className={cn('h-full', isShort ? 'bg-amber-300' : isLong ? 'bg-blue-300' : 'bg-emerald-300')}
                  style={{ width: `${travelPercent}%` }}
                />
              )}
              <div
                className={cn('h-full', isShort ? 'bg-amber-100' : isLong ? 'bg-blue-100' : 'bg-emerald-100')}
                style={{ width: `${100 - travelPercent}%` }}
              />
            </div>
          </div>
          {/* Labels */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {freeMinutes > 0 && (
                <span className={cn(
                  'text-[11px] font-semibold',
                  isShort ? 'text-amber-600' : isLong ? 'text-blue-600' : 'text-emerald-600'
                )}>
                  {formatGap(freeMinutes)} wolnego
                </span>
              )}
              {travelMin > 0 && (
                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                  <Navigation className="h-2.5 w-2.5" />
                  {travelMin} min
                </span>
              )}
            </div>
            <span className="text-[10px] text-gray-400">
              {prevStop.departure_time} → {nextStop.arrival_time}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RouteCardProps {
  route: EmployeeRoute;
  onOptimize: (id: string) => void;
  onReoptimize: (id: string) => void;
  reoptimizing?: boolean;
}

export function RouteCard({ route, onOptimize, onReoptimize, reoptimizing }: RouteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { score } = route;
  const hasLate = score.late > 0;
  const initials = route.employee_name.split(' ').map(w => w[0]).join('').slice(0, 2);

  return (
    <div className={`bg-white rounded-xl border overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] ${hasLate ? 'border-red-200' : 'border-gray-200/80'}`}>
      {/* Compact Header */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Employee avatar */}
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 text-[11px] font-bold flex-shrink-0">
            {initials}
          </div>

          {/* Name + plate */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-gray-900 truncate">{route.employee_name}</p>
              <WorkerStatusDot pos={route.current_position} orders={route.total_orders} />
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-400">
              {route.plate && <span className="font-mono">{route.plate}</span>}
              <span>{route.total_orders} zleceń</span>
              <span>·</span>
              <span>~{score.total_km} km</span>
              {score.finish_time !== '--:--' && (
                <>
                  <span>·</span>
                  <span>koniec {score.finish_time}</span>
                </>
              )}
            </div>
          </div>

          {/* Score + late badge */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasLate && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 border border-red-200/60 text-[10px] font-bold text-red-600">
                <AlertTriangle className="h-3 w-3" />{score.late}
              </span>
            )}
            <ScoreBadge score={score.score} showLabel />
            <ScoreBreakdown onTime={score.on_time} tight={score.tight} late={score.late} />
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0 transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Mini Gantt Bar (visible when collapsed) */}
        {!expanded && route.schedule.length > 0 && (
          <div className="mt-2.5 mb-0.5">
            <MiniGanttBar schedule={route.schedule} />
            <div className="flex justify-between text-[9px] text-gray-300 mt-0.5 px-0.5">
              <span>{route.start_time || '08:00'}</span>
              <span>{score.finish_time}</span>
            </div>
          </div>
        )}

        {/* Action buttons row */}
        {expanded && (
          <div className="mt-3 flex items-center gap-2">
            {/* Primary: Przelicz */}
            <button
              onClick={() => onReoptimize(route.employee_id)}
              disabled={reoptimizing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium border border-blue-200/60 transition-colors disabled:opacity-50 active:scale-[0.97]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reoptimizing ? 'animate-spin' : ''}`} />
              Przelicz trasę
            </button>

            <button
              onClick={() => onOptimize(route.employee_id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-medium border border-orange-200/60 transition-colors active:scale-[0.97]"
            >
              <Zap className="h-3.5 w-3.5" />
              Optymalizuj
            </button>

            {/* Secondary actions */}
            {route.google_maps_url && (
              <a
                href={route.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-50 text-xs transition-colors border border-gray-200/60"
              >
                <Navigation className="h-3 w-3" />
                Maps
              </a>
            )}
            {route.google_maps_url && (
              <button
                onClick={() => copyToClipboard(route.google_maps_url!)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 transition-colors border border-gray-200/60"
                title="Kopiuj link do Google Maps"
              >
                <Copy className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Expanded Timeline */}
      {expanded && (
        <div className="px-4 pt-2 pb-3 border-t border-gray-100">
          {route.schedule.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Brak zleceń na ten dzień</p>
          ) : (
            route.schedule.map((stop, i) => (
              <div key={stop.order_id}>
                {i > 0 && (
                  <StopGapIndicator prevStop={route.schedule[i - 1]} nextStop={stop} />
                )}
                <DraggableStopCard stop={stop} isLast={i === route.schedule.length - 1} employeeId={route.employee_id} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function DroppableRouteCard({ route, onOptimize, onReoptimize, reoptimizing }: RouteCardProps) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `route-${route.employee_id}`,
    data: { type: 'route', employeeId: route.employee_id },
  });

  // Don't highlight if dragging from the same employee
  const isDraggingFromSelf = active?.data?.current?.employeeId === route.employee_id;
  const showDropZone = isOver && !isDraggingFromSelf;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl transition-all duration-200',
        showDropZone && 'ring-2 ring-orange-400 ring-offset-2 scale-[1.01] shadow-lg shadow-orange-500/10',
      )}
    >
      <RouteCard route={route} onOptimize={onOptimize} onReoptimize={onReoptimize} reoptimizing={reoptimizing} />
      {/* Ghost insertion preview */}
      {showDropZone && (
        <StopCardGhost employeeName={route.employee_name.split(' ')[0]} />
      )}
    </div>
  );
}
