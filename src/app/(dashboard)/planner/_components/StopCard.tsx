'use client';

import { MapPin, Clock, Navigation, AlertTriangle, GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { type Stop, STATUS_STYLES } from './types';

interface StopCardProps {
  stop: Stop;
  isLast: boolean;
  employeeId?: string;
  draggable?: boolean;
}

export function StopCard({ stop, isLast, employeeId, draggable = false }: StopCardProps) {
  const st = STATUS_STYLES[stop.time_window_status];
  return (
    <div className="flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${st.border} ${st.bg} ${st.text}`}>
          {stop.sequence}
        </div>
        <span className="text-[10px] text-gray-400 font-medium mt-0.5 leading-none">{stop.arrival_time}</span>
        {!isLast && <div className="w-0.5 bg-gray-200 flex-1 my-1" />}
      </div>

      {/* Content */}
      <div className={`flex-1 mb-4 rounded-xl border p-3 ${st.bg} ${st.border} transition-all ${draggable ? 'group/stop hover:shadow-md hover:border-orange-300 cursor-grab active:cursor-grabbing' : ''}`}>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {draggable && (
              <GripVertical className="h-4 w-4 text-gray-300 group-hover/stop:text-orange-400 mt-0.5 flex-shrink-0 transition-colors" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm">{stop.client_name}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <MapPin className="h-3 w-3" />{stop.address}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {stop.time_window_status !== 'no_window' ? (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${st.bg} ${st.border}`}>
                <Clock className={`h-3 w-3 ${st.text} flex-shrink-0`} />
                <div className="flex flex-col items-end">
                  <span className={`text-[11px] font-semibold leading-tight ${st.text}`}>
                    {st.label}
                  </span>
                  {stop.time_window_label && (
                    <span className="text-[10px] text-gray-500 font-medium leading-tight">
                      {stop.time_window_label}
                    </span>
                  )}
                </div>
              </div>
            ) : stop.service_start && stop.departure_time ? (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 rounded-lg border border-gray-200">
                <Clock className="h-3 w-3 text-gray-400" />
                <span className="text-[10px] text-gray-500 font-medium">
                  {stop.service_start}–{stop.departure_time}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Time row */}
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <Navigation className="h-3 w-3 text-gray-400" />
            {stop.travel_minutes} min jazdy
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-gray-400" />
            Przyjazd: <strong className="text-gray-900">{stop.arrival_time}</strong>
          </span>
          {stop.wait_minutes > 0 && (
            <span className="text-blue-600">Czeka {stop.wait_minutes} min</span>
          )}
          <span>
            Serwis: <strong className="text-gray-900">{stop.service_start}–{stop.departure_time}</strong>
          </span>
        </div>

        {stop.delay_minutes > 0 && (
          <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Spóźnienie: {stop.delay_minutes} min po zamknięciu okna
          </p>
        )}

        {stop.services.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {stop.services.map((s: any, i: number) => (
              <span key={i} className="text-[10px] bg-white border border-gray-200 rounded-md px-1.5 py-0.5 text-gray-600">
                {typeof s === 'string' ? s : s?.name ?? JSON.stringify(s)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Draggable wrapper — the whole card is the drag handle
export function DraggableStopCard({ stop, isLast, employeeId }: StopCardProps & { employeeId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `assigned-${stop.order_id}`,
    data: { type: 'assigned', orderId: stop.order_id, employeeId, stop },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`transition-all duration-200 ${isDragging ? 'opacity-30 scale-[0.97]' : ''}`}
    >
      <StopCard stop={stop} isLast={isLast} employeeId={employeeId} draggable />
    </div>
  );
}

// Floating drag overlay card — follows cursor
export function AssignedDragOverlay({ stop }: { stop: Stop }) {
  const st = STATUS_STYLES[stop.time_window_status];
  return (
    <div className="w-80 p-3 rounded-xl border-2 border-orange-400 bg-white shadow-2xl shadow-orange-500/25 rotate-[1.5deg] pointer-events-none">
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 truncate">{stop.client_name}</p>
          <p className="text-xs text-gray-400 truncate flex items-center gap-1">
            <MapPin className="h-3 w-3" />{stop.address}
          </p>
        </div>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border flex-shrink-0 ${st.bg} ${st.border} ${st.text}`}>
          {st.label}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-500">
        <span>{stop.service_start}–{stop.departure_time}</span>
        {stop.services.length > 0 && (
          <span className="truncate">{stop.services.map((s: any) => typeof s === 'string' ? s : s?.name).filter(Boolean).join(', ')}</span>
        )}
      </div>
    </div>
  );
}

// Ghost preview shown in drop zone
export function StopCardGhost({ employeeName }: { employeeName: string }) {
  return (
    <div className="mx-4 mb-3 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/60 p-3 flex items-center justify-center gap-2 animate-pulse">
      <div className="w-6 h-6 rounded-full bg-orange-200 flex items-center justify-center">
        <MapPin className="h-3 w-3 text-orange-500" />
      </div>
      <p className="text-xs font-medium text-orange-600">
        Upuść tutaj aby przypisać do {employeeName}
      </p>
    </div>
  );
}
