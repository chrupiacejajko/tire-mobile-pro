'use client';

import { ROW_H, GRID_START_HOUR, timeToHours } from './types';

interface TimeWindowIndicatorProps {
  timeWindowStart: string;
  timeWindowEnd: string;
}

export function TimeWindowIndicator({ timeWindowStart, timeWindowEnd }: TimeWindowIndicatorProps) {
  const startH = timeToHours(timeWindowStart) - GRID_START_HOUR;
  const endH = timeToHours(timeWindowEnd) - GRID_START_HOUR;
  if (startH < 0 || endH <= startH) return null;

  const hourIndex = Math.floor(startH);
  const topInCell = (startH - hourIndex) * ROW_H;
  const height = (endH - startH) * ROW_H;

  return (
    <div
      className="absolute left-0 right-0 z-[1] pointer-events-none rounded-lg border border-dashed border-amber-200 bg-amber-50/25"
      style={{
        top: `${hourIndex * ROW_H + topInCell}px`,
        height: `${height}px`,
      }}
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-amber-300/50" />
      <div className="absolute inset-x-0 bottom-0 h-[1px] bg-amber-300/50" />
    </div>
  );
}
