'use client';

import { useState, useEffect, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  type CalendarOrder,
  type LayoutSlot,
  HOURS,
  GRID_START_HOUR,
  ROW_H,
  DAYS_PL,
  computeOverlapLayout,
} from './types';
import { EventBlock } from './EventBlock';

interface WeekViewProps {
  currentDate: Date;
  orders: CalendarOrder[];
  onOrderClick: (order: CalendarOrder) => void;
  onDayClick: (date: Date) => void;
}

function getWeekDates(date: Date): Date[] {
  const start = new Date(date);
  const day = start.getDay();
  start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function WeekView({ currentDate, orders, onOrderClick, onDayClick }: WeekViewProps) {
  const weekDates = getWeekDates(currentDate);
  const todayStr = new Date().toISOString().split('T')[0];

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const nowHour = now.getHours() + now.getMinutes() / 60;
  const nowTop = (nowHour - GRID_START_HOUR) * ROW_H;
  const todayIndex = weekDates.findIndex(d => d.toISOString().split('T')[0] === todayStr);

  // Pre-compute overlap layout per day
  const layoutByDay = useMemo(() => {
    const map = new Map<string, LayoutSlot[]>();
    for (const date of weekDates) {
      const ds = date.toISOString().split('T')[0];
      const dayOrders = orders.filter(o => o.scheduled_date === ds);
      map.set(ds, computeOverlapLayout(dayOrders));
    }
    return map;
  }, [orders, weekDates]);

  const getLayoutSlotsForHour = (dateFilter: string, hourNum: number): LayoutSlot[] => {
    const slots = layoutByDay.get(dateFilter) || [];
    return slots.filter(s => {
      const [h] = (s.order.scheduled_time_start || '00:00').split(':').map(Number);
      return h === hourNum;
    });
  };

  return (
    <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
      <CardContent className="p-0 overflow-auto">
        <div className="min-w-[800px]">
          {/* Day headers */}
          <div className="grid grid-cols-8 border-b bg-white/95 backdrop-blur-sm sticky top-0 z-20">
            <div className="p-3 text-center text-xs font-medium text-gray-400 border-r flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
            {weekDates.map((date, i) => {
              const ds = date.toISOString().split('T')[0];
              const isTd = ds === todayStr;
              const dayOrders = orders.filter(o => o.scheduled_date === ds);
              const isWeekend = i >= 5;
              return (
                <div
                  key={i}
                  className={`p-3 text-center border-r last:border-r-0 cursor-pointer hover:bg-gray-50 transition-colors ${
                    isTd ? 'bg-orange-50/50' : isWeekend ? 'bg-gray-50/50' : ''
                  }`}
                  onClick={() => onDayClick(date)}
                >
                  <p className="text-xs font-medium text-gray-500">{DAYS_PL[i]}</p>
                  <p
                    className={`text-lg font-bold ${
                      isTd ? 'text-orange-600' : 'text-gray-900'
                    }`}
                  >
                    {date.getDate()}
                  </p>
                  {dayOrders.length > 0 && (
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 rounded-full mt-0.5 ${
                        isTd
                          ? 'bg-orange-100 border-orange-200 text-orange-700'
                          : 'bg-gray-100 border-gray-200 text-gray-600'
                      }`}
                    >
                      {dayOrders.length}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="relative">
            {/* Current time indicator */}
            {todayIndex >= 0 && nowHour >= GRID_START_HOUR && nowHour <= GRID_START_HOUR + HOURS.length && (
              <div
                className="absolute z-30 pointer-events-none"
                style={{
                  top: `${nowTop}px`,
                  left: `calc(64px + ${todayIndex} * (100% - 64px) / 7)`,
                  width: `calc((100% - 64px) / 7)`,
                }}
              >
                <div className="flex items-center">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1" />
                  <div className="flex-1 h-[2px] bg-red-500" />
                </div>
              </div>
            )}

            {HOURS.map((hour, hourIdx) => {
              const hourNum = hourIdx + GRID_START_HOUR;
              return (
                <div
                  key={hour}
                  className="grid grid-cols-8 border-b last:border-b-0"
                  style={{ minHeight: `${ROW_H}px` }}
                >
                  <div className="px-2 text-center text-[11px] text-gray-400 border-r flex items-start justify-center pt-1.5 font-medium">
                    {hour}
                  </div>
                  {weekDates.map((date, dayIdx) => {
                    const ds = date.toISOString().split('T')[0];
                    const layoutSlots = getLayoutSlotsForHour(ds, hourNum);
                    return (
                      <div
                        key={dayIdx}
                        className="relative border-r last:border-r-0 hover:bg-orange-50/10 transition-colors"
                        style={{ minHeight: `${ROW_H}px` }}
                      >
                        {layoutSlots.map(slot => (
                          <EventBlock
                            key={slot.order.id}
                            event={slot.order}
                            showEmployee
                            columnIndex={slot.columnIndex}
                            totalColumns={slot.totalColumns}
                            onClick={onOrderClick}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
