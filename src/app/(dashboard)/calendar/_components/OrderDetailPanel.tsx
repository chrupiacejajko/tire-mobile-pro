'use client';

import { Clock, MapPin, Phone, User, Tag, ExternalLink, Navigation, Pencil, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  type CalendarOrder,
  type EmployeeCol,
  statusConfig,
  schedulingTypeConfig,
  formatTime,
} from './types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface OrderDetailPanelProps {
  order: CalendarOrder | null;
  employees: EmployeeCol[];
  onClose: () => void;
  onReassign: (orderId: string, employeeId: string) => void;
  onOpenFull: (orderId: string) => void;
}

// Accent bar colors (matching EventBlock)
const accentColors: Record<string, string> = {
  new:         '#2563eb',
  assigned:    '#d97706',
  in_progress: '#7c3aed',
  in_transit:  '#4f46e5',
  completed:   '#059669',
  cancelled:   '#9ca3af',
};

export function OrderDetailPanel({
  order,
  employees,
  onClose,
  onReassign,
  onOpenFull,
}: OrderDetailPanelProps) {
  if (!order) return null;

  const cfg = statusConfig[order.status] || statusConfig.new;
  const schType = schedulingTypeConfig[order.scheduling_type] || schedulingTypeConfig.fixed_time;
  const accent = accentColors[order.status] || '#94a3b8';

  return (
    <Sheet open={!!order} onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="w-[380px] sm:max-w-[380px] overflow-y-auto p-0 border-l border-gray-100 shadow-2xl">
        {/* Status accent bar */}
        <div className="h-1" style={{ backgroundColor: accent }} />

        <SheetHeader className="px-5 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <Badge className={`${cfg.bg} text-white text-[10px] px-2 py-0.5 rounded-md shadow-sm`}>
              {cfg.label}
            </Badge>
            <Badge
              variant="outline"
              className={`${schType.bgColor} ${schType.borderColor} text-[10px] px-2 py-0.5 rounded-md gap-1`}
            >
              <schType.Icon className={`h-3 w-3 ${schType.color}`} />
              <span className={schType.color}>{schType.label}</span>
            </Badge>
          </div>
          <SheetTitle className="text-xl font-bold text-gray-900">{order.client_name}</SheetTitle>
        </SheetHeader>

        {/* Quick Actions */}
        <div className="px-5 pb-3 flex items-center gap-1.5">
          {order.client_phone && (
            <QuickAction icon={<Phone className="h-3 w-3" />} label="Zadzwoń" href={`tel:${order.client_phone}`} />
          )}
          {order.address && (
            <QuickAction icon={<Navigation className="h-3 w-3" />} label="Nawiguj" href={`https://maps.google.com/?q=${encodeURIComponent(order.address)}`} />
          )}
          <QuickAction icon={<Pencil className="h-3 w-3" />} label="Edytuj" onClick={() => onOpenFull(order.id)} />
        </div>

        <div className="h-px bg-gray-100 mx-5" />

        <div className="p-5 space-y-4">
          {/* Priority */}
          {(order.priority === 'urgent' || order.priority === 'high') && (
            <div className={`rounded-lg px-3 py-2 ${order.priority === 'urgent' ? 'bg-red-50 border border-red-200/60' : 'bg-orange-50 border border-orange-200/60'}`}>
              <p className={`text-xs font-bold uppercase tracking-wide ${order.priority === 'urgent' ? 'text-red-700' : 'text-orange-700'}`}>
                {order.priority === 'urgent' ? 'PILNE' : 'Wysoki priorytet'}
              </p>
            </div>
          )}

          {/* Contact */}
          <Section icon={<Phone className="h-3.5 w-3.5" />} label="Kontakt">
            <p className="text-sm font-semibold text-gray-900">{order.client_name}</p>
            {order.client_phone && (
              <p className="text-xs text-gray-500 mt-0.5">{order.client_phone}</p>
            )}
          </Section>

          {/* Time */}
          <Section icon={<Clock className="h-3.5 w-3.5" />} label="Termin">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full border-2" style={{ borderColor: accent }} />
                  <span className="text-sm font-medium text-gray-900">{formatTime(order.scheduled_time_start)}</span>
                </div>
                <div className="h-px w-3 bg-gray-300" />
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                  <span className="text-sm font-medium text-gray-900">{formatTime(order.scheduled_time_end)}</span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400">{order.scheduled_date}</p>

              {order.scheduling_type === 'time_window' && order.time_window_start && order.time_window_end && (
                <div className="flex items-center gap-1.5 mt-1 px-2 py-1 rounded-md bg-amber-50/80 border border-amber-100/60">
                  <schType.Icon className="h-3 w-3 text-amber-500" />
                  <span className="text-[11px] text-amber-700 font-medium">
                    Okno: {formatTime(order.time_window_start)} – {formatTime(order.time_window_end)}
                  </span>
                </div>
              )}

              {order.flexibility_minutes > 0 && (
                <p className="text-[11px] text-gray-400">
                  Elastyczność: ±{order.flexibility_minutes} min
                </p>
              )}

              {order.estimated_arrival && (
                <p className="text-[11px] text-gray-400">
                  Szacowany przyjazd: {formatTime(order.estimated_arrival)}
                </p>
              )}
            </div>
          </Section>

          {/* Address */}
          <Section icon={<MapPin className="h-3.5 w-3.5" />} label="Adres">
            <p className="text-sm text-gray-900">{order.address}</p>
          </Section>

          {/* Services */}
          <Section icon={<Tag className="h-3.5 w-3.5" />} label="Usługi">
            <p className="text-sm text-gray-900">{order.service_names || 'Brak usług'}</p>
            <p className="text-sm font-bold text-gray-900 mt-1">{order.total_price} zł</p>
          </Section>

          {/* Employee */}
          <Section icon={<User className="h-3.5 w-3.5" />} label="Pracownik">
            {order.employee_name ? (
              <div className="flex items-center gap-2">
                <div
                  className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shadow-sm"
                  style={{ backgroundColor: order.employee_color }}
                >
                  {order.employee_name
                    .split(' ')
                    .map(w => w[0])
                    .join('')}
                </div>
                <span className="text-sm font-medium text-gray-900">{order.employee_name}</span>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">Nieprzydzielone</p>
            )}

            {/* Quick reassign */}
            <div className="mt-2">
              <Select
                onValueChange={v => {
                  if (v) onReassign(order.id, v as string);
                }}
              >
                <SelectTrigger className="h-8 text-xs rounded-lg border-gray-200/80">
                  <SelectValue placeholder="Zmień pracownika →" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>

          {/* Source */}
          {order.source && (
            <Section icon={<Tag className="h-3.5 w-3.5" />} label="Źródło">
              <Badge variant="outline" className="text-[10px] rounded-md gap-1">
                {order.source === 'dispatcher' && 'Dyspozytor'}
                {order.source === 'booking' && 'Rezerwacja online'}
                {order.source === 'phone' && 'Telefon'}
                {order.source === 'recurring' && 'Zlecenie cykliczne'}
                {!['dispatcher', 'booking', 'phone', 'recurring'].includes(order.source) && order.source}
              </Badge>
              {order.auto_assigned && (
                <span className="text-[10px] text-gray-400 ml-2">Auto-przydzielone</span>
              )}
            </Section>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-gray-100">
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-lg text-xs gap-2 border-gray-200/80 hover:bg-gray-50"
              onClick={() => onOpenFull(order.id)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Otwórz pełne zlecenie
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50/40 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-gray-400">{icon}</span>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </p>
      </div>
      {children}
    </div>
  );
}

function QuickAction({ icon, label, href, onClick }: { icon: React.ReactNode; label: string; href?: string; onClick?: () => void }) {
  const cls = "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors active:scale-[0.97]";

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {icon} {label}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={cls}>
      {icon} {label}
    </button>
  );
}
