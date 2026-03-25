'use client';

import { type WorkScheduleBlock, ROW_H, GRID_START_HOUR, HOURS, timeToHours } from './types';

interface DutyOverlayProps {
  employeeId: string;
  date: string;
  workSchedules: WorkScheduleBlock[];
}

export function DutyOverlay({ employeeId, date, workSchedules }: DutyOverlayProps) {
  const schedule = workSchedules.find(
    ws => ws.employee_id === employeeId && ws.date === date
  );

  if (!schedule) {
    // No schedule entry — show full off-duty background
    return (
      <div
        className="absolute inset-0 z-[0] pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 6px,
            rgba(148, 163, 184, 0.06) 6px,
            rgba(148, 163, 184, 0.06) 7px
          )`,
          backgroundColor: 'rgba(241, 245, 249, 0.4)',
        }}
      />
    );
  }

  const gridEndHour = GRID_START_HOUR + HOURS.length;
  const shiftStart = timeToHours(schedule.start_time);
  const shiftEnd = timeToHours(schedule.end_time);

  // Clamp to visible grid
  const visibleStart = Math.max(shiftStart, GRID_START_HOUR);
  const visibleEnd = Math.min(shiftEnd, gridEndHour);

  if (visibleEnd <= visibleStart) return null;

  const topPx = (visibleStart - GRID_START_HOUR) * ROW_H;
  const heightPx = (visibleEnd - visibleStart) * ROW_H;

  // Off-duty zones (before and after shift)
  const offDutyBefore = visibleStart > GRID_START_HOUR;
  const offDutyAfter = visibleEnd < gridEndHour;

  const offDutyStyle = {
    backgroundImage: `repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 6px,
      rgba(148, 163, 184, 0.06) 6px,
      rgba(148, 163, 184, 0.06) 7px
    )`,
    backgroundColor: 'rgba(241, 245, 249, 0.4)',
  };

  return (
    <>
      {/* On-duty: subtle green tint */}
      <div
        className="absolute left-0 right-0 z-[0] pointer-events-none bg-emerald-50/25"
        style={{ top: `${topPx}px`, height: `${heightPx}px` }}
      />

      {/* Off-duty before shift */}
      {offDutyBefore && (
        <div
          className="absolute left-0 right-0 z-[0] pointer-events-none"
          style={{
            top: 0,
            height: `${topPx}px`,
            ...offDutyStyle,
          }}
        />
      )}

      {/* Off-duty after shift */}
      {offDutyAfter && (
        <div
          className="absolute left-0 right-0 z-[0] pointer-events-none"
          style={{
            top: `${topPx + heightPx}px`,
            height: `${(gridEndHour - visibleEnd) * ROW_H}px`,
            ...offDutyStyle,
          }}
        />
      )}
    </>
  );
}
