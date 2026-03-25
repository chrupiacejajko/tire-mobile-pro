'use client';

import { Zap, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type CalendarOrder,
  type EmployeeCol,
  statusConfig,
  schedulingTypeConfig,
  formatTime,
} from './types';

interface UnassignedOrdersDrawerProps {
  open: boolean;
  onClose: () => void;
  orders: CalendarOrder[];
  employees: EmployeeCol[];
  dateStr: string;
  onAssign: (orderId: string, employeeId: string) => void;
  onAutoAssign: () => void;
  onOrderClick: (order: CalendarOrder) => void;
}

export function UnassignedOrdersDrawer({
  open,
  onClose,
  orders,
  employees,
  dateStr,
  onAssign,
  onAutoAssign,
  onOrderClick,
}: UnassignedOrdersDrawerProps) {
  // Sort: urgent first, then by time
  const sorted = [...orders].sort((a, b) => {
    const priOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    const pa = priOrder[a.priority as keyof typeof priOrder] ?? 2;
    const pb = priOrder[b.priority as keyof typeof priOrder] ?? 2;
    if (pa !== pb) return pa - pb;
    return (a.scheduled_time_start || '').localeCompare(b.scheduled_time_start || '');
  });

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] overflow-y-auto p-0">
        <SheetHeader className="p-5 pb-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-base">Nieprzydzielone zlecenia</SheetTitle>
              <SheetDescription className="text-xs">
                {sorted.length} zleceń czeka na przydzielenie
              </SheetDescription>
            </div>
            {sorted.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg text-xs gap-1.5 border-orange-200 text-orange-700 hover:bg-orange-50"
                onClick={onAutoAssign}
              >
                <Zap className="h-3.5 w-3.5" />
                Auto-przydziel
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="p-4 space-y-2">
          {sorted.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">Wszystkie zlecenia przydzielone 🎉</p>
            </div>
          )}

          {sorted.map(order => {
            const cfg = statusConfig[order.status] || statusConfig.new;
            const schType =
              schedulingTypeConfig[order.scheduling_type] || schedulingTypeConfig.fixed_time;

            return (
              <div
                key={order.id}
                className={`rounded-xl border p-3 space-y-2 transition-colors hover:border-orange-200 ${
                  order.priority === 'urgent'
                    ? 'border-red-200 bg-red-50/30'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {/* Header: client + badges */}
                <div
                  className="flex items-start justify-between gap-2 cursor-pointer"
                  onClick={() => onOrderClick(order)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {order.client_name}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">{order.service_names}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {order.priority === 'urgent' && (
                      <Badge className="bg-red-500 text-white text-[8px] px-1.5 py-0 rounded">
                        PILNE
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={`${schType.bgColor} ${schType.borderColor} text-[8px] px-1.5 py-0 rounded gap-0.5`}
                    >
                      <schType.Icon className={`h-2.5 w-2.5 ${schType.color}`} />
                      {schType.shortLabel}
                    </Badge>
                  </div>
                </div>

                {/* Time + address */}
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(order.scheduled_time_start)}–{formatTime(order.scheduled_time_end)}
                  </span>
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{order.address}</span>
                  </span>
                </div>

                {/* Assign dropdown */}
                <Select onValueChange={v => { if (v) onAssign(order.id, v as string); }}>
                  <SelectTrigger className="h-7 text-[11px] rounded-lg border-orange-200">
                    <SelectValue placeholder="Przydziel pracownika →" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        <div className="flex items-center gap-1.5">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: e.color }}
                          />
                          {e.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
