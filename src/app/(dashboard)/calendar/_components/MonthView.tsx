'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  type CalendarOrder,
  DAYS_PL,
  statusConfig,
  schedulingTypeConfig,
  formatTime,
} from './types';

interface MonthViewProps {
  currentDate: Date;
  orders: CalendarOrder[];
  onOrderClick: (order: CalendarOrder) => void;
  onDayClick: (date: Date) => void;
}

export function MonthView({ currentDate, orders, onOrderClick, onDayClick }: MonthViewProps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const startPad = new Date(year, month, 1).getDay() === 0 ? 6 : new Date(year, month, 1).getDay() - 1;
  const totalDays = new Date(year, month + 1, 0).getDate();

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(startPad).fill(null);
  for (let d = 1; d <= totalDays; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return (
    <Card className="rounded-2xl border-gray-100 shadow-sm">
      <CardContent className="p-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAYS_PL.map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((w, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {w.map((day, di) => {
              if (day === null) return <div key={di} className="min-h-[90px]" />;
              const ds = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
              const dayOrders = orders.filter(o => o.scheduled_date === ds);
              const isTd = ds === todayStr;
              const isWeekend = di >= 5;

              return (
                <div
                  key={di}
                  className={`min-h-[90px] rounded-lg border p-1.5 cursor-pointer transition-all hover:border-orange-200 hover:shadow-sm ${
                    isTd
                      ? 'border-orange-300 bg-orange-50/50 shadow-sm'
                      : isWeekend
                        ? 'border-gray-100 bg-gray-50/30'
                        : 'border-gray-100'
                  }`}
                  onClick={() => onDayClick(new Date(ds))}
                >
                  {/* Day number + order count */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-medium ${
                        isTd ? 'text-orange-600 font-bold' : 'text-gray-600'
                      }`}
                    >
                      {day}
                    </span>
                    {dayOrders.length > 0 && (
                      <Badge className="h-4 min-w-4 rounded-full px-1 text-[8px] flex items-center justify-center bg-orange-500">
                        {dayOrders.length}
                      </Badge>
                    )}
                  </div>

                  {/* Order snippets */}
                  {dayOrders.slice(0, 3).map(o => {
                    const cfg = statusConfig[o.status] || statusConfig.new;
                    const schType = schedulingTypeConfig[o.scheduling_type] || schedulingTypeConfig.fixed_time;
                    return (
                      <div
                        key={o.id}
                        className={`${cfg.bgLight} rounded px-1.5 py-0.5 mb-0.5 text-[9px] truncate border-l-2 ${cfg.border} cursor-pointer hover:opacity-80`}
                        onClick={e => {
                          e.stopPropagation();
                          onOrderClick(o);
                        }}
                      >
                        <span className={`font-medium ${cfg.text}`}>
                          {formatTime(o.scheduled_time_start)}
                        </span>{' '}
                        <span className="text-gray-600">{o.client_name}</span>
                      </div>
                    );
                  })}
                  {dayOrders.length > 3 && (
                    <p className="text-[9px] text-gray-400 text-center mt-0.5">
                      +{dayOrders.length - 3} więcej
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
