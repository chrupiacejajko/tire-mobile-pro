'use client';

import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clock, Timer } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  type SchedulingType,
  type ClientOption,
  type ServiceOption,
  type EmployeeCol,
  SCHEDULING_TYPE_OPTIONS,
  WINDOW_PRESETS,
  FLEXIBILITY_OPTIONS,
  todayStr,
} from './types';

interface OrderCreationDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  prefilledDate?: string;
  prefilledTime?: string;
  prefilledEmployeeId?: string;
  clients: ClientOption[];
  services: ServiceOption[];
  employees: EmployeeCol[];
}

interface OrderForm {
  client_id: string;
  scheduling_type: SchedulingType;
  scheduled_date: string;
  scheduled_time_start: string;
  flexibility_minutes: number;
  time_window_start: string;
  time_window_end: string;
  window_preset: string;
  employee_id: string;
  address: string;
  priority: string;
  notes: string;
  service_ids: string[];
  auto_assign: boolean;
}

const defaultForm: OrderForm = {
  client_id: '',
  scheduling_type: 'fixed_time',
  scheduled_date: '',
  scheduled_time_start: '08:00',
  flexibility_minutes: 15,
  time_window_start: '08:00',
  time_window_end: '12:00',
  window_preset: 'morning',
  employee_id: '',
  address: '',
  priority: 'normal',
  notes: '',
  service_ids: [],
  auto_assign: false,
};

export function OrderCreationDialog({
  open,
  onClose,
  onCreated,
  prefilledDate,
  prefilledTime,
  prefilledEmployeeId,
  clients,
  services,
  employees,
}: OrderCreationDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OrderForm>(() => ({
    ...defaultForm,
    scheduled_date: prefilledDate || todayStr(),
    scheduled_time_start: prefilledTime || '08:00',
    employee_id: prefilledEmployeeId || '',
  }));

  // Reset form when dialog opens with new prefills
  const resetForm = useCallback(() => {
    setForm({
      ...defaultForm,
      scheduled_date: prefilledDate || todayStr(),
      scheduled_time_start: prefilledTime || '08:00',
      employee_id: prefilledEmployeeId || '',
    });
  }, [prefilledDate, prefilledTime, prefilledEmployeeId]);

  // Computed duration from selected services
  const totalDuration = useMemo(() => {
    return services
      .filter(s => form.service_ids.includes(s.id))
      .reduce((sum, s) => sum + s.duration_minutes, 0);
  }, [services, form.service_ids]);

  const totalPrice = useMemo(() => {
    return services
      .filter(s => form.service_ids.includes(s.id))
      .reduce((sum, s) => sum + Number(s.price), 0);
  }, [services, form.service_ids]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const selectedServices = services.filter(s => form.service_ids.includes(s.id));
    const client = clients.find(c => c.id === form.client_id);

    // Calculate end time from start + duration
    let startTime = form.scheduled_time_start;
    let scheduledDate = form.scheduled_date || todayStr();
    let priority = form.priority;

    if (form.scheduling_type === 'asap') {
      scheduledDate = todayStr();
      startTime = new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' });
      priority = 'urgent';
    }

    const [h, m] = startTime.split(':').map(Number);
    const endMin = h * 60 + m + (totalDuration || 60);
    const endTime = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`;

    const employeeId = form.employee_id || null;

    const payload: Record<string, unknown> = {
      client_id: form.client_id,
      employee_id: employeeId,
      status: employeeId ? 'assigned' : 'new',
      priority,
      scheduled_date: scheduledDate,
      scheduled_time_start: startTime,
      scheduled_time_end: endTime,
      address: form.address || (client ? `${client.address}, ${client.city}` : ''),
      services: selectedServices.map(s => ({
        service_id: s.id,
        name: s.name,
        price: Number(s.price),
        quantity: 1,
      })),
      total_price: totalPrice,
      notes: form.notes || null,
      scheduling_type: form.scheduling_type,
      source: 'dispatcher',
      auto_assigned: form.auto_assign,
    };

    // Scheduling type specific fields
    if (form.scheduling_type === 'fixed_time') {
      payload.flexibility_minutes = form.flexibility_minutes;
    } else if (form.scheduling_type === 'time_window') {
      payload.time_window_start = form.time_window_start;
      payload.time_window_end = form.time_window_end;
    } else if (form.scheduling_type === 'flexible') {
      payload.flexibility_minutes = 120;
    }

    await supabase.from('orders').insert(payload);

    setSaving(false);
    resetForm();
    onClose();
    onCreated();
  };

  const updateForm = (patch: Partial<OrderForm>) => setForm(prev => ({ ...prev, ...patch }));

  const selectWindowPreset = (preset: string) => {
    if (preset === 'custom') {
      updateForm({ window_preset: 'custom' });
    } else {
      const p = WINDOW_PRESETS[preset];
      if (p) {
        updateForm({
          window_preset: preset,
          time_window_start: p.start,
          time_window_end: p.end,
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { resetForm(); onClose(); } }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Nowe zlecenie</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── Step 1: Scheduling Type ── */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 block">
              Typ zlecenia
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {SCHEDULING_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => updateForm({ scheduling_type: opt.type })}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    form.scheduling_type === opt.type
                      ? 'border-orange-500 bg-orange-50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <opt.Icon
                    className={`h-5 w-5 ${
                      form.scheduling_type === opt.type ? 'text-orange-500' : opt.color
                    }`}
                  />
                  <p className="text-xs font-semibold text-gray-900 mt-1.5">{opt.label}</p>
                  <p className="text-[10px] text-gray-500">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* ── Step 2: Conditional Time Fields ── */}
          {form.scheduling_type === 'asap' && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-sm text-red-700 font-medium">
                Zlecenie na dziś ({todayStr()}), priorytet: pilny
              </p>
            </div>
          )}

          {form.scheduling_type !== 'asap' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data</Label>
                <Input
                  type="date"
                  value={form.scheduled_date}
                  onChange={e => updateForm({ scheduled_date: e.target.value })}
                  min={todayStr()}
                  className="h-9 rounded-lg"
                />
              </div>
              {form.scheduling_type === 'fixed_time' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Godzina</Label>
                  <Input
                    type="time"
                    value={form.scheduled_time_start}
                    onChange={e => updateForm({ scheduled_time_start: e.target.value })}
                    className="h-9 rounded-lg"
                  />
                </div>
              )}
              {form.scheduling_type === 'flexible' && (
                <div className="flex items-end">
                  <p className="text-xs text-violet-600 font-medium pb-2">
                    System dopasuje optymalny czas
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Fixed time: flexibility */}
          {form.scheduling_type === 'fixed_time' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Elastyczność</Label>
              <div className="flex gap-2">
                {FLEXIBILITY_OPTIONS.map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => updateForm({ flexibility_minutes: f })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      form.flexibility_minutes === f
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {f === 0 ? 'Dokładnie' : `±${f} min`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Time window: presets + custom */}
          {form.scheduling_type === 'time_window' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Okno czasowe</Label>
                <div className="grid grid-cols-4 gap-2">
                  {['morning', 'afternoon', 'evening', 'custom'].map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => selectWindowPreset(w)}
                      className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                        form.window_preset === w
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {w === 'custom' ? 'Własne' : WINDOW_PRESETS[w].label}
                    </button>
                  ))}
                </div>
              </div>
              {form.window_preset === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Od</Label>
                    <Input
                      type="time"
                      value={form.time_window_start}
                      onChange={e => updateForm({ time_window_start: e.target.value })}
                      className="h-9 rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Do</Label>
                    <Input
                      type="time"
                      value={form.time_window_end}
                      onChange={e => updateForm({ time_window_end: e.target.value })}
                      className="h-9 rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Client ── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Klient</Label>
              <button
                type="button"
                className="text-[10px] text-orange-500 hover:text-orange-600 font-medium"
                onClick={() => {
                  const name = prompt('Imię i nazwisko / Firma:');
                  const phone = prompt('Telefon:');
                  const address = prompt('Adres:');
                  const city = prompt('Miasto:');
                  if (name && phone && address && city) {
                    supabase
                      .from('clients')
                      .insert({ name, phone, address, city, vehicles: [] })
                      .select('id')
                      .single()
                      .then(({ data }) => {
                        if (data) {
                          updateForm({
                            client_id: data.id,
                            address: `${address}, ${city}`,
                          });
                        }
                      });
                  }
                }}
              >
                + Nowy klient
              </button>
            </div>
            <Select
              value={form.client_id}
              onValueChange={v => {
                const c = clients.find(cl => cl.id === v);
                updateForm({
                  client_id: v ?? '',
                  address: c ? `${c.address}, ${c.city}` : '',
                });
              }}
            >
              <SelectTrigger className="h-9 rounded-lg">
                <SelectValue placeholder="Wybierz klienta" />
              </SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.city})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Services ── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Usługi</Label>
              {totalDuration > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-gray-500">
                  <Timer className="h-3 w-3" />
                  {totalDuration} min · {totalPrice} zł
                </span>
              )}
            </div>
            <div className="max-h-36 overflow-y-auto border rounded-xl p-2 space-y-0.5">
              {services.map(s => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.service_ids.includes(s.id)}
                    onChange={e => {
                      if (e.target.checked)
                        updateForm({ service_ids: [...form.service_ids, s.id] });
                      else
                        updateForm({
                          service_ids: form.service_ids.filter(id => id !== s.id),
                        });
                    }}
                    className="rounded"
                  />
                  <span className="flex-1 text-xs">{s.name}</span>
                  <span className="text-xs text-gray-400">{s.duration_minutes} min</span>
                  <span className="text-xs text-gray-500 font-medium">{Number(s.price)} zł</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── Employee ── */}
          <div className="space-y-1.5">
            <Label className="text-xs">Pracownik</Label>
            <Select
              value={form.employee_id}
              onValueChange={v => updateForm({ employee_id: v ?? '' })}
            >
              <SelectTrigger className="h-9 rounded-lg">
                <SelectValue placeholder="Opcjonalnie — auto-przydziel" />
              </SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: e.color }}
                      />
                      {e.name} ({e.region})
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Address ── */}
          <div className="space-y-1.5">
            <Label className="text-xs">Adres</Label>
            <Input
              value={form.address}
              onChange={e => updateForm({ address: e.target.value })}
              placeholder="ul. Marszałkowska 1, Warszawa"
              className="h-9 rounded-lg"
            />
          </div>

          {/* ── Notes ── */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notatki</Label>
            <Textarea
              value={form.notes}
              onChange={e => updateForm({ notes: e.target.value })}
              placeholder="Opcjonalne uwagi..."
              rows={2}
              className="rounded-lg text-sm resize-none"
            />
          </div>

          {/* ── Actions ── */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => {
                resetForm();
                onClose();
              }}
            >
              Anuluj
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !form.client_id || form.service_ids.length === 0}
              className="rounded-xl bg-orange-500 hover:bg-orange-600"
            >
              {saving ? 'Tworzenie...' : 'Utwórz zlecenie'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
