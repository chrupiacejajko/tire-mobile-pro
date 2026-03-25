'use client';

import { type Stop, STATUS_STYLES } from './types';

// 1-line 6px-height preview bar showing service blocks positioned by time
// Color-coded by time_window_status

interface MiniGanttBarProps {
  schedule: Stop[];
  startTime?: string; // e.g. "08:00"
  endTime?: string;   // e.g. "18:00"
}

function timeToFraction(time: string, startHour: number, totalHours: number): number {
  const [h, m] = time.split(':').map(Number);
  const hours = h + (m || 0) / 60;
  return Math.max(0, Math.min(1, (hours - startHour) / totalHours));
}

export function MiniGanttBar({ schedule, startTime = '07:00', endTime = '20:00' }: MiniGanttBarProps) {
  if (!schedule || schedule.length === 0) return null;

  const startH = parseInt(startTime.split(':')[0]);
  const endH = parseInt(endTime.split(':')[0]);
  const totalHours = endH - startH;

  return (
    <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
      {schedule.map((stop) => {
        const left = timeToFraction(stop.service_start, startH, totalHours);
        const right = timeToFraction(stop.departure_time, startH, totalHours);
        const width = Math.max(right - left, 0.01);
        const st = STATUS_STYLES[stop.time_window_status] || STATUS_STYLES.no_window;
        // Use dot color for the bar segments
        const colorMap: Record<string, string> = {
          ok: 'bg-emerald-400',
          early_wait: 'bg-blue-400',
          tight: 'bg-amber-400',
          late: 'bg-red-400',
          no_window: 'bg-gray-300',
        };
        const barColor = colorMap[stop.time_window_status] || 'bg-gray-300';

        return (
          <div
            key={stop.order_id}
            className={`absolute top-0 bottom-0 rounded-full ${barColor}`}
            style={{
              left: `${left * 100}%`,
              width: `${width * 100}%`,
            }}
          />
        );
      })}
    </div>
  );
}
