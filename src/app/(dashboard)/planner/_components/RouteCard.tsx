'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  ExternalLink, RefreshCw, Zap, ChevronDown, ChevronUp,
  Copy, Car, MapPin, AlertTriangle, MoreHorizontal, Navigation,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type EmployeeRoute, copyToClipboard } from './types';
import { ScoreBadge, ScoreBreakdown, ScoreBar, WorkerStatusDot } from './ScoreDisplay';
import { StopCard, DraggableStopCard, StopCardGhost } from './StopCard';
import { MiniGanttBar } from './MiniGanttBar';

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
              <DraggableStopCard key={stop.order_id} stop={stop} isLast={i === route.schedule.length - 1} employeeId={route.employee_id} />
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
