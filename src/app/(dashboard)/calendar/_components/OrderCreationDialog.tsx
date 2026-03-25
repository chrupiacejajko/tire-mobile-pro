'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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
import { Clock, Timer, MapPin, AlertTriangle, Wrench } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { createClient } from '@/lib/supabase/client';
import {
  type SchedulingType,
  type ClientOption,
  type ServiceOption,
  type EmployeeCol,
  SCHEDULING_TYPE_OPTIONS,
  WINDOW_PRESETS,
  FLEXIBILITY_OPTIONS,
  FLEXIBILITY_LABELS,
  todayStr,
} from './types';

// ── HERE Autocomplete types ─────────────────────────────────────────────────

interface HereSuggestion {
  id: string;
  title: string;
  address?: {
    label?: string;
    street?: string;
    houseNumber?: string;
    city?: string;
    postalCode?: string;
  };
}

interface RegionData {
  id: string;
  name: string;
  color: string;
  polygon: [number, number][] | null;
}

// ── Point-in-polygon (ray casting) ──────────────────────────────────────────

function pointInPolygon(
  lat: number,
  lng: number,
  polygon: [number, number][]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    if (
      (yi > lng) !== (yj > lng) &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Props & Form types ──────────────────────────────────────────────────────

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

type InternalTaskType = 'pickup' | 'cleaning' | 'delivery' | 'other';

const INTERNAL_TASK_TYPE_LABELS: Record<InternalTaskType, string> = {
  pickup: 'Odbiór opon',
  cleaning: 'Sprzątanie',
  delivery: 'Dostawa',
  other: 'Inne',
};

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
  lat: number | null;
  lng: number | null;
  priority: string;
  notes: string;
  dispatcher_notes: string;
  additional_phone: string;
  service_ids: string[];
  auto_assign: boolean;
  is_internal: boolean;
  internal_task_type: InternalTaskType;
  is_paid_time: boolean;
}

const defaultForm: OrderForm = {
  client_id: '',
  scheduling_type: 'fixed_time',
  scheduled_date: '',
  scheduled_time_start: '08:00',
  flexibility_minutes: 30,
  time_window_start: '08:00',
  time_window_end: '12:00',
  window_preset: 'morning',
  employee_id: '',
  address: '',
  lat: null,
  lng: null,
  priority: 'normal',
  notes: '',
  dispatcher_notes: '',
  additional_phone: '',
  service_ids: [],
  auto_assign: false,
  is_internal: false,
  internal_task_type: 'pickup',
  is_paid_time: true,
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

  // ── HERE autocomplete state ─────────────────────────────────────────────
  const [addressSuggestions, setAddressSuggestions] = useState<HereSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const addressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressWrapperRef = useRef<HTMLDivElement>(null);

  // ── Region auto-detection state ─────────────────────────────────────────
  const [regions, setRegions] = useState<RegionData[]>([]);
  const [detectedRegion, setDetectedRegion] = useState<RegionData | null>(null);

  // Fetch regions once when dialog opens
  useEffect(() => {
    if (open && regions.length === 0) {
      fetch('/api/regions')
        .then(res => res.json())
        .then((data: RegionData[]) => {
          if (Array.isArray(data)) setRegions(data);
        })
        .catch(() => {});
    }
  }, [open, regions.length]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        addressWrapperRef.current &&
        !addressWrapperRef.current.contains(e.target as Node)
      ) {
        setShowAddressSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset form when dialog opens with new prefills
  const resetForm = useCallback(() => {
    setForm({
      ...defaultForm,
      scheduled_date: prefilledDate || todayStr(),
      scheduled_time_start: prefilledTime || '08:00',
      employee_id: prefilledEmployeeId || '',
    });
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setDetectedRegion(null);
  }, [prefilledDate, prefilledTime, prefilledEmployeeId]);

  // ── Auto-detect region from lat/lng ─────────────────────────────────────
  const detectRegion = useCallback(
    (lat: number, lng: number) => {
      for (const region of regions) {
        if (region.polygon && region.polygon.length >= 3) {
          if (pointInPolygon(lat, lng, region.polygon)) {
            setDetectedRegion(region);
            return;
          }
        }
      }
      setDetectedRegion(null);
    },
    [regions]
  );

  // ── Address input handler with debounce ─────────────────────────────────
  const handleAddressChange = useCallback(
    (value: string) => {
      setForm(prev => ({ ...prev, address: value, lat: null, lng: null }));
      setDetectedRegion(null);

      if (addressTimeoutRef.current) {
        clearTimeout(addressTimeoutRef.current);
      }

      if (value.length < 3) {
        setAddressSuggestions([]);
        setShowAddressSuggestions(false);
        return;
      }

      addressTimeoutRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/here-autocomplete?q=${encodeURIComponent(value)}`
          );
          const data = await res.json();
          const items: HereSuggestion[] = data.items ?? [];
          setAddressSuggestions(items);
          setShowAddressSuggestions(items.length > 0);
        } catch {
          setAddressSuggestions([]);
          setShowAddressSuggestions(false);
        }
      }, 300);
    },
    []
  );

  // ── Select suggestion → lookup for lat/lng ──────────────────────────────
  const handleSuggestionSelect = useCallback(
    async (suggestion: HereSuggestion) => {
      setShowAddressSuggestions(false);
      setAddressSuggestions([]);

      // Use the suggestion title as display address immediately
      setForm(prev => ({
        ...prev,
        address: suggestion.title,
      }));

      try {
        const res = await fetch(
          `/api/here-lookup?id=${encodeURIComponent(suggestion.id)}`
        );
        const data = await res.json();
        const { lat, lng, street, city, postalCode } = data;

        // Build a cleaner address from the lookup result
        const parts = [street, postalCode, city].filter(Boolean);
        const fullAddress = parts.length > 0 ? parts.join(', ') : suggestion.title;

        setForm(prev => ({
          ...prev,
          address: fullAddress,
          lat: lat ?? null,
          lng: lng ?? null,
        }));

        // Auto-detect region
        if (lat != null && lng != null) {
          detectRegion(lat, lng);
        }
      } catch {
        // Keep the suggestion title as address if lookup fails
      }
    },
    [detectRegion]
  );

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

  // ── Employee-region mismatch warning ────────────────────────────────────
  const regionMismatchWarning = useMemo(() => {
    if (!form.employee_id || !detectedRegion) return null;
    const emp = employees.find(e => e.id === form.employee_id);
    if (!emp || !emp.region_id) return null;
    if (emp.region_id !== detectedRegion.id) {
      return `Pracownik ${emp.name} jest z regionu ${emp.region}, ale adres jest w regionie ${detectedRegion.name}`;
    }
    return null;
  }, [form.employee_id, detectedRegion, employees]);

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
    const endMin = h * 60 + m + (form.is_internal ? 60 : (totalDuration || 60));
    const endTime = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`;

    const employeeId = form.employee_id || null;

    // For internal tasks, look up the placeholder client '!NIEOKRESLONY'
    let clientId: string | null = form.client_id;
    if (form.is_internal) {
      const { data: placeholderClient } = await supabase
        .from('clients')
        .select('id')
        .eq('name', '!NIEOKREŚLONY')
        .limit(1)
        .single();
      clientId = placeholderClient?.id ?? null;
    }

    const payload: Record<string, unknown> = {
      client_id: clientId,
      employee_id: employeeId,
      status: employeeId ? 'assigned' : 'new',
      priority,
      scheduled_date: scheduledDate,
      scheduled_time_start: startTime,
      scheduled_time_end: endTime,
      address: form.address || (!form.is_internal && client ? `${client.address}, ${client.city}` : ''),
      lat: form.lat,
      lng: form.lng,
      region_id: detectedRegion?.id ?? null,
      services: form.is_internal ? [] : selectedServices.map(s => ({
        service_id: s.id,
        name: s.name,
        price: Number(s.price),
        quantity: 1,
      })),
      total_price: form.is_internal ? 0 : totalPrice,
      notes: form.notes || null,
      dispatcher_notes: form.dispatcher_notes || null,
      additional_phone: form.is_internal ? null : (form.additional_phone || null),
      scheduling_type: form.scheduling_type,
      source: form.is_internal ? 'internal' : 'dispatcher',
      auto_assigned: form.auto_assign,
      internal_task_type: form.is_internal ? form.internal_task_type : null,
      is_paid_time: form.is_internal ? form.is_paid_time : null,
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
          {/* ── Order Type Toggle: Client vs Internal ── */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 block">
              Rodzaj
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateForm({ is_internal: false })}
                className={`rounded-xl border-2 p-2.5 text-center transition-all ${
                  !form.is_internal
                    ? 'border-orange-500 bg-orange-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-xs font-semibold text-gray-900">Zlecenie klienckie</p>
              </button>
              <button
                type="button"
                onClick={() => updateForm({ is_internal: true })}
                className={`rounded-xl border-2 p-2.5 text-center transition-all ${
                  form.is_internal
                    ? 'border-teal-500 bg-teal-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <Wrench className={`h-3.5 w-3.5 ${form.is_internal ? 'text-teal-600' : 'text-gray-400'}`} />
                  <p className="text-xs font-semibold text-gray-900">Zadanie wewnętrzne</p>
                </div>
              </button>
            </div>
          </div>

          {/* ── Internal Task Fields ── */}
          {form.is_internal && (
            <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Typ zadania</Label>
                <Select
                  value={form.internal_task_type}
                  onValueChange={v => updateForm({ internal_task_type: v as InternalTaskType })}
                >
                  <SelectTrigger className="h-9 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(INTERNAL_TASK_TYPE_LABELS) as [InternalTaskType, string][]).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Czas płatny</Label>
                <Switch
                  checked={form.is_paid_time}
                  onCheckedChange={v => updateForm({ is_paid_time: v })}
                />
              </div>
            </div>
          )}

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
              <div className="flex flex-wrap gap-2">
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
                    {FLEXIBILITY_LABELS[f] ?? `±${f} min`}
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

          {/* ── Step 3: Client (hidden for internal tasks) ── */}
          {!form.is_internal && (
            <>
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
                      lat: null,
                      lng: null,
                    });
                    setDetectedRegion(null);
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

              {/* ── Additional Phone ── */}
              <div className="space-y-1.5">
                <Label className="text-xs">Dodatkowy telefon kontaktowy</Label>
                <Input
                  value={form.additional_phone}
                  onChange={e => updateForm({ additional_phone: e.target.value })}
                  placeholder="+48 xxx xxx xxx"
                  className="h-9 rounded-lg"
                />
              </div>
            </>
          )}

          {/* ── Services (hidden for internal tasks) ── */}
          {!form.is_internal && <div className="space-y-1.5">
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
          </div>}

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

            {/* Employee-region mismatch warning */}
            {regionMismatchWarning && (
              <div className="flex items-start gap-1.5 mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-700">{regionMismatchWarning}</p>
              </div>
            )}
          </div>

          {/* ── Address with HERE autocomplete ── */}
          <div className="space-y-1.5">
            <Label className="text-xs">Adres</Label>
            <div ref={addressWrapperRef} className="relative">
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  value={form.address}
                  onChange={e => handleAddressChange(e.target.value)}
                  onFocus={() => {
                    if (addressSuggestions.length > 0) setShowAddressSuggestions(true);
                  }}
                  placeholder="ul. Marszałkowska 1, Warszawa"
                  className="h-9 rounded-lg pl-8"
                  autoComplete="off"
                />
              </div>

              {/* Suggestions dropdown */}
              {showAddressSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {addressSuggestions.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSuggestionSelect(s)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                    >
                      <p className="text-xs font-medium text-gray-900 truncate">
                        {s.title}
                      </p>
                      {s.address?.label && s.address.label !== s.title && (
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">
                          {s.address.label}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Geocoded coordinates badge */}
            {form.lat != null && form.lng != null && (
              <p className="text-[10px] text-gray-400 mt-1">
                {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
              </p>
            )}

            {/* Detected region badge */}
            {detectedRegion && (
              <div className="flex items-center gap-1.5 mt-1">
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: detectedRegion.color }}
                />
                <span className="text-[11px] font-medium" style={{ color: detectedRegion.color }}>
                  Region: {detectedRegion.name}
                </span>
              </div>
            )}
          </div>

          {/* ── Notes ── */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Notatka dla kierowcy</Label>
              <Textarea
                value={form.notes}
                onChange={e => updateForm({ notes: e.target.value })}
                placeholder="Uwagi widoczne dla kierowcy..."
                rows={2}
                className="rounded-lg text-sm resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notatka wewnętrzna (dyspozytor)</Label>
              <Textarea
                value={form.dispatcher_notes}
                onChange={e => updateForm({ dispatcher_notes: e.target.value })}
                placeholder="Notatki wewnętrzne, niewidoczne dla kierowcy..."
                rows={2}
                className="rounded-lg text-sm resize-none"
              />
            </div>
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
              disabled={saving || (!form.is_internal && (!form.client_id || form.service_ids.length === 0))}
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
