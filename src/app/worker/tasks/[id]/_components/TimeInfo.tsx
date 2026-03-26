'use client';

import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  return timeStr.slice(0, 5);
}

function getBufferColor(minutes: number | undefined): string {
  if (minutes === undefined || minutes === null) return 'text-gray-400';
  if (minutes === 0) return 'text-red-600';
  if (minutes <= 30) return 'text-orange-600';
  if (minutes <= 60) return 'text-yellow-600';
  if (minutes <= 90) return 'text-emerald-600';
  return 'text-gray-400';
}

export default function TimeInfo({
  scheduledStart,
  scheduledEnd,
  timeWindow,
  bufferMinutes,
}: {
  scheduledStart: string | null;
  scheduledEnd: string | null;
  timeWindow: string | null;
  bufferMinutes?: number;
}) {
  const timeDisplay = scheduledStart
    ? formatTime(scheduledStart) + (scheduledEnd ? ' - ' + formatTime(scheduledEnd) : '')
    : timeWindow ?? '';

  if (!timeDisplay && bufferMinutes === undefined) return null;

  return (
    <div className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
        Czas
      </h2>
      <div className="space-y-2.5">
        {timeDisplay && (
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-900">{timeDisplay}</span>
          </div>
        )}
        {bufferMinutes !== undefined && (
          <div className="flex items-center gap-2.5">
            <span className={cn(
              'w-4 text-center text-xs font-bold',
              getBufferColor(bufferMinutes),
            )}>
              {bufferMinutes === 0 ? '!' : bufferMinutes}
            </span>
            <span className={cn('text-sm', getBufferColor(bufferMinutes))}>
              {bufferMinutes === 0 ? 'Brak bufora' : `${bufferMinutes} min bufora`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
