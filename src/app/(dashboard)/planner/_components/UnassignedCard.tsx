'use client';

import { GripVertical, Clock, Zap, AlertTriangle } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { type UnassignedOrder } from './types';

interface UnassignedCardProps {
  order: UnassignedOrder;
}

const priorityStyles: Record<string, { ring: string; bg: string; badge: string; label: string }> = {
  urgent: { ring: 'ring-2 ring-red-400/50', bg: 'bg-gradient-to-r from-red-50 to-white', badge: 'bg-red-500 text-white', label: 'PILNE' },
  high:   { ring: 'ring-1 ring-orange-300/50', bg: 'bg-gradient-to-r from-amber-50/80 to-white', badge: 'bg-amber-500 text-white', label: 'Wysoki' },
  normal: { ring: '', bg: 'bg-white', badge: '', label: '' },
  low:    { ring: '', bg: 'bg-white', badge: '', label: '' },
};

function formatTimeWindow(tw: string | null): string | null {
  if (!tw) return null;
  if (tw === 'morning') return '08:00–12:00';
  if (tw === 'afternoon') return '12:00–16:00';
  if (tw === 'evening') return '16:00–20:00';
  return tw;
}

export function UnassignedCard({ order }: UnassignedCardProps) {
  const prio = priorityStyles[order.priority || 'normal'] || priorityStyles.normal;
  const isUrgent = order.priority === 'urgent';
  const isHigh = order.priority === 'high';
  const tw = formatTimeWindow(order.time_window);

  return (
    <div className={`
      flex items-start gap-2.5 p-3 rounded-xl border transition-all cursor-grab
      ${prio.ring} ${prio.bg}
      ${isUrgent ? 'border-red-200' : isHigh ? 'border-amber-200' : 'border-gray-200/80'}
      hover:border-orange-300 hover:shadow-sm group
    `}>
      <GripVertical className="h-4 w-4 text-gray-300 group-hover:text-orange-400 mt-0.5 flex-shrink-0 transition-colors" />
      <div className="flex-1 min-w-0">
        {/* Client + priority badge */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-semibold text-gray-900 truncate flex-1">{order.client_name}</p>
          {prio.badge && (
            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${prio.badge}`}>
              {prio.label}
            </span>
          )}
        </div>

        {/* Address */}
        <p className="text-[11px] text-gray-400 truncate mb-1.5">{order.address}</p>

        {/* Services */}
        {order.services?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {order.services.map((s: any, i: number) => (
              <span key={i} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md border border-gray-200/60">
                {typeof s === 'string' ? s : s?.name ?? ''}
              </span>
            ))}
          </div>
        )}

        {/* Time info row */}
        <div className="flex items-center gap-2">
          {tw && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-100">
              <Clock className="h-2.5 w-2.5" />{tw}
            </span>
          )}
          {order.scheduling_type === 'asap' && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded-md border border-red-100">
              <Zap className="h-2.5 w-2.5" />ASAP
            </span>
          )}
          {order.scheduling_type === 'flexible' && (
            <span className="text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-md border border-violet-100">
              Elastyczne
            </span>
          )}
          {order.scheduled_time_start && (
            <span className="text-[10px] text-gray-400">{order.scheduled_time_start?.slice(0, 5)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function DraggableUnassignedCard({ order }: UnassignedCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `unassigned-${order.id}`,
    data: { type: 'unassigned', order },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`transition-all duration-200 cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-30 scale-95' : ''}`}
    >
      <UnassignedCard order={order} />
    </div>
  );
}

export function DragOverlayCard({ order }: UnassignedCardProps) {
  const prio = priorityStyles[order.priority || 'normal'] || priorityStyles.normal;
  return (
    <div className={`w-64 p-3 rounded-xl border-2 border-orange-400 bg-white shadow-2xl shadow-orange-500/25 rotate-[1.5deg] pointer-events-none`}>
      <p className="text-sm font-bold text-gray-900 truncate">{order.client_name}</p>
      <p className="text-xs text-gray-400 truncate">{order.address}</p>
      <div className="flex items-center gap-1.5 mt-1">
        {order.services?.length > 0 && (
          <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">
            {typeof order.services[0] === 'string' ? order.services[0] : (order.services[0] as any)?.name}
          </span>
        )}
        {prio.badge && (
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${prio.badge}`}>{prio.label}</span>
        )}
      </div>
    </div>
  );
}
