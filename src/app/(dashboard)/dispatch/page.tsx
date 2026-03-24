'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Phone, User, MapPin, Clock, Zap, Calendar,
  Check, Loader2, AlertCircle, Truck, ChevronDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ServiceOption {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  category: string;
}

interface ClientResult {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

interface HereSuggestion {
  id: string;
  title: string;
  address: {
    label?: string;
    street?: string;
    houseNumber?: string;
    city?: string;
    postalCode?: string;
  };
}

interface WorkerSuggestion {
  employee_id: string;
  employee_name: string;
  plate: string | null;
  current_orders: number;
  gps_distance_km: number | null;
  is_driving: boolean;
  is_nearby: boolean;
}

type SchedulingType = 'asap' | 'fixed_time' | 'time_window' | 'flexible';
type Priority = 'normal' | 'high' | 'urgent';
type TimeWindowPreset = 'morning' | 'afternoon' | 'evening' | 'custom';

// ─── Constants ────────────────────────────────────────────────────────────────
const WINDOW_PRESETS: Record<string, { label: string; start: string; end: string }> = {
  morning:   { label: 'Rano 8-12',         start: '08:00', end: '12:00' },
  afternoon: { label: 'Popoudnie 12-16', start: '12:00', end: '16:00' },
  evening:   { label: 'Wieczor 16-20',    start: '16:00', end: '20:00' },
};

const FLEXIBILITY_OPTIONS = [0, 15, 30];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function groupByCategory(services: ServiceOption[]) {
  const groups: Record<string, ServiceOption[]> = {};
  for (const s of services) {
    const cat = s.category || 'Inne';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  }
  return groups;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function DispatchPage() {
  // ── Client ──────────────────────────────────────────────────────────────
  const [phoneInput, setPhoneInput] = useState('');
  const [clientResults, setClientResults] = useState<ClientResult[]>([]);
  const [searchingClient, setSearchingClient] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');

  // HERE Autocomplete
  const [addressSuggestions, setAddressSuggestions] = useState<HereSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const addressContainerRef = useRef<HTMLDivElement>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Services ────────────────────────────────────────────────────────────
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());

  // ── Scheduling ──────────────────────────────────────────────────────────
  const [schedulingType, setSchedulingType] = useState<SchedulingType>('time_window');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [selectedTime, setSelectedTime] = useState('10:00');
  const [flexibility, setFlexibility] = useState(0);
  const [windowPreset, setWindowPreset] = useState<TimeWindowPreset>('morning');
  const [customWindowStart, setCustomWindowStart] = useState('08:00');
  const [customWindowEnd, setCustomWindowEnd] = useState('12:00');

  // ── Details ─────────────────────────────────────────────────────────────
  const [priority, setPriority] = useState<Priority>('normal');
  const [notes, setNotes] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');

  // ── Worker suggestions ──────────────────────────────────────────────────
  const [workerSuggestions, setWorkerSuggestions] = useState<WorkerSuggestion[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [autoAssign, setAutoAssign] = useState(false);

  // ── Submission ──────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resultOrderId, setResultOrderId] = useState('');
  const [resultEmployee, setResultEmployee] = useState('');
  const [error, setError] = useState('');

  // ── Refs ────────────────────────────────────────────────────────────────
  const phoneRef = useRef<HTMLInputElement>(null);
  const clientSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-focus phone on mount ───────────────────────────────────────────
  useEffect(() => {
    phoneRef.current?.focus();
  }, []);

  // ── Load services ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/services')
      .then(r => r.json())
      .then(data => {
        const list = data.services || data;
        if (Array.isArray(list)) setServices(list);
      })
      .catch(() => {});
  }, []);

  // ── Client search (debounce 500ms, 4+ digits) ──────────────────────────
  useEffect(() => {
    if (clientSearchTimer.current) clearTimeout(clientSearchTimer.current);
    const digits = phoneInput.replace(/\D/g, '');
    if (digits.length < 4) {
      setClientResults([]);
      return;
    }
    setSearchingClient(true);
    clientSearchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/search?phone=${encodeURIComponent(digits)}`);
        const data = await res.json();
        setClientResults(data.clients ?? []);
      } catch {
        setClientResults([]);
      }
      setSearchingClient(false);
    }, 500);
  }, [phoneInput]);

  // ── Select existing client ──────────────────────────────────────────────
  const selectClient = useCallback((c: ClientResult) => {
    setSelectedClient(c);
    setPhoneInput(c.phone);
    setClientName(c.name || '');
    setClientEmail(c.email || '');
    setAddress(c.address || '');
    setCity(c.city || '');
    setClientResults([]);
  }, []);

  // ── HERE address autocomplete (debounced 300ms) ─────────────────────────
  const fetchAddressSuggestions = useCallback((q: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (q.length < 3) { setAddressSuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/here-autocomplete?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setAddressSuggestions(data.items ?? []);
        setShowAddressSuggestions(true);
      } catch { /* silent */ }
    }, 300);
  }, []);

  const selectAddressSuggestion = useCallback(async (s: HereSuggestion) => {
    setShowAddressSuggestions(false);
    setAddressSuggestions([]);
    const street = [s.address.street, s.address.houseNumber].filter(Boolean).join(' ');
    setAddress(street);
    setCity(s.address.city ?? '');
  }, []);

  // Close address suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addressContainerRef.current && !addressContainerRef.current.contains(e.target as Node)) {
        setShowAddressSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Toggle service ──────────────────────────────────────────────────────
  const toggleService = (id: string) => {
    setSelectedServiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Auto-set for ASAP ──────────────────────────────────────────────────
  useEffect(() => {
    if (schedulingType === 'asap') {
      setSelectedDate(todayStr());
      setPriority('urgent');
      setAutoAssign(true);
    }
  }, [schedulingType]);

  // ── Fetch worker suggestions ────────────────────────────────────────────
  // We need an order_id to call suggest-insert, but we haven't created the order yet.
  // Instead, we create a lightweight endpoint or skip worker suggestions until
  // we have enough info. For now, we will show workers after order creation or
  // use a separate approach. Since the spec says "auto-fetch suggest-insert when
  // address is filled + date is selected", we'll create a temporary order approach
  // or just show employee list. Let's use the employee list with GPS for now.

  useEffect(() => {
    if (!address || !selectedDate) {
      setWorkerSuggestions([]);
      return;
    }
    // Debounce worker fetch
    const timer = setTimeout(async () => {
      setLoadingWorkers(true);
      try {
        // Fetch employees with their GPS and order counts for the date
        const res = await fetch(`/api/dispatcher/workers?date=${selectedDate}&address=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}`);
        const data = await res.json();
        if (data.suggestions) {
          setWorkerSuggestions(data.suggestions);
        }
      } catch {
        // Fallback: no suggestions
        setWorkerSuggestions([]);
      }
      setLoadingWorkers(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [address, city, selectedDate]);

  // ── Computed ────────────────────────────────────────────────────────────
  const selectedServices = services.filter(s => selectedServiceIds.has(s.id));
  const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);
  const grouped = groupByCategory(services);

  // ── Resolve time window ─────────────────────────────────────────────────
  function getTimeWindowValues() {
    if (schedulingType === 'time_window') {
      if (windowPreset === 'custom') {
        return { start: customWindowStart, end: customWindowEnd };
      }
      const preset = WINDOW_PRESETS[windowPreset];
      return preset ? { start: preset.start, end: preset.end } : { start: '08:00', end: '12:00' };
    }
    return { start: null, end: null };
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);

    const tw = getTimeWindowValues();
    const timeWindowName = schedulingType === 'time_window' && windowPreset !== 'custom'
      ? windowPreset : undefined;

    const payload: Record<string, unknown> = {
      client_name: clientName,
      client_phone: phoneInput,
      client_email: clientEmail || undefined,
      address,
      city,
      scheduled_date: selectedDate,
      service_ids: Array.from(selectedServiceIds),
      notes: [notes, vehicleInfo ? `Pojazd: ${vehicleInfo}` : ''].filter(Boolean).join('\n') || undefined,
      priority,
      scheduling_type: schedulingType,
      source: 'dispatcher',
      auto_assign: autoAssign,
    };

    // Scheduling-type-specific fields
    if (schedulingType === 'fixed_time') {
      payload.scheduled_time = selectedTime;
      payload.flexibility_minutes = flexibility;
    } else if (schedulingType === 'time_window') {
      payload.time_window = timeWindowName;
      payload.time_window_start = tw.start;
      payload.time_window_end = tw.end;
    }

    // If manually selected a worker, assign after creation
    if (selectedWorker && !autoAssign) {
      payload.auto_assign = false;
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        // If we manually selected a worker, assign now
        if (selectedWorker && !autoAssign) {
          try {
            const supabaseRes = await fetch('/api/orders/assign-worker', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ order_id: data.order_id, employee_id: selectedWorker }),
            });
            const assignData = await supabaseRes.json();
            if (assignData.employee_name) {
              setResultEmployee(assignData.employee_name);
            }
          } catch { /* best effort */ }
        } else if (data.assigned_employee) {
          setResultEmployee(data.assigned_employee);
        }

        setResultOrderId(data.order_id);
        setSuccess(true);
      } else {
        setError(data.error || 'Nie udalo sie utworzyc zlecenia');
      }
    } catch {
      setError('Blad serwera');
    }
    setSubmitting(false);
  };

  // ── Reset form ──────────────────────────────────────────────────────────
  const resetForm = () => {
    setPhoneInput('');
    setClientResults([]);
    setSelectedClient(null);
    setClientName('');
    setClientEmail('');
    setAddress('');
    setCity('');
    setSelectedServiceIds(new Set());
    setSchedulingType('time_window');
    setSelectedDate(todayStr());
    setSelectedTime('10:00');
    setFlexibility(0);
    setWindowPreset('morning');
    setPriority('normal');
    setNotes('');
    setVehicleInfo('');
    setWorkerSuggestions([]);
    setSelectedWorker(null);
    setAutoAssign(false);
    setSuccess(false);
    setResultOrderId('');
    setResultEmployee('');
    setError('');
    phoneRef.current?.focus();
  };

  // ─── SUCCESS SCREEN ─────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Zlecenie utworzone!</h2>
          <p className="text-sm text-gray-600 mb-4">
            Nr: <span className="font-mono font-bold">{resultOrderId?.slice(0, 8).toUpperCase()}</span>
          </p>
          {resultEmployee && (
            <p className="text-sm text-gray-700 mb-4">
              Przypisano do: <span className="font-semibold">{resultEmployee}</span>
            </p>
          )}
          <div className="flex gap-3 justify-center mt-6">
            <button
              onClick={resetForm}
              className="rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
            >
              Nowe zlecenie
            </button>
            <a
              href={`/orders`}
              className="rounded-xl bg-gray-100 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Lista zlecen
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── FORM ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Nowe zlecenie</h1>
        <p className="text-sm text-gray-500">Szybkie tworzenie zlecenia z rozmowy telefonicznej</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── LEFT COLUMN (60%) ─────────────────────────────────────────── */}
        <div className="flex-1 lg:w-[60%] space-y-6">

          {/* SECTION 1: KLIENT */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Phone className="h-4 w-4 text-orange-500" /> Klient
            </h2>

            {/* Phone input */}
            <div className="relative mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Telefon</label>
              <input
                ref={phoneRef}
                type="tel"
                value={phoneInput}
                onChange={e => { setPhoneInput(e.target.value); setSelectedClient(null); }}
                placeholder="Wpisz numer telefonu..."
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
              />
              {searchingClient && (
                <Loader2 className="absolute right-3 top-8 h-4 w-4 animate-spin text-gray-400" />
              )}
              {/* Client search results dropdown */}
              {clientResults.length > 0 && !selectedClient && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                  {clientResults.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectClient(c)}
                      className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-gray-100 last:border-0"
                    >
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.phone} {c.address ? `- ${c.address}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Name + Email row */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Imie i nazwisko</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="Jan Kowalski"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email (opcjonalnie)</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)}
                  placeholder="jan@example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>

            {/* Address with HERE autocomplete */}
            <div className="relative mb-3" ref={addressContainerRef}>
              <label className="block text-xs font-medium text-gray-600 mb-1">Adres</label>
              <input
                type="text"
                value={address}
                onChange={e => { setAddress(e.target.value); fetchAddressSuggestions(e.target.value); }}
                placeholder="ul. Marszalkowska 1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
              />
              {showAddressSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                  {addressSuggestions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => selectAddressSuggestion(s)}
                      className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-gray-100 last:border-0 text-sm text-gray-700"
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Miasto</label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="Warszawa"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
              />
            </div>
          </section>

          {/* SECTION 2: USLUGI */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-500" /> Uslugi
            </h2>

            {Object.entries(grouped).map(([cat, svcs]) => (
              <div key={cat} className="mb-4 last:mb-0">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{cat}</p>
                <div className="space-y-1">
                  {svcs.map(s => {
                    const selected = selectedServiceIds.has(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                          selected ? 'bg-orange-50 border border-orange-200' : 'hover:bg-gray-50 border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleService(s.id)}
                          className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                        />
                        <span className="flex-1 text-sm text-gray-800">{s.name}</span>
                        <span className="text-xs text-gray-500">{s.duration_minutes} min</span>
                        <span className="text-sm font-semibold text-gray-900">{Number(s.price)} zl</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            {selectedServiceIds.size > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm text-gray-600">{selectedServiceIds.size} uslug, {totalDuration} min</span>
                <span className="text-base font-bold text-orange-600">{totalPrice} zl</span>
              </div>
            )}
          </section>

          {/* SECTION 3: TERMIN */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-orange-500" /> Termin
            </h2>

            {/* Scheduling type selector — 4 cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
              {([
                { type: 'asap' as const, label: 'Na juz (ASAP)', icon: '🔴', desc: 'Dzisiaj, jak najszybciej' },
                { type: 'fixed_time' as const, label: 'Konkretna godzina', icon: '🕐', desc: 'Dokladny czas' },
                { type: 'time_window' as const, label: 'Okno czasowe', icon: '📅', desc: 'Zakres godzin' },
                { type: 'flexible' as const, label: 'Elastyczny', icon: '🔄', desc: 'System wybiera' },
              ]).map(opt => (
                <button
                  key={opt.type}
                  onClick={() => setSchedulingType(opt.type)}
                  className={`rounded-lg border-2 p-3 text-left transition-colors ${
                    schedulingType === opt.type
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg">{opt.icon}</span>
                  <p className="text-xs font-semibold text-gray-900 mt-1">{opt.label}</p>
                  <p className="text-[10px] text-gray-500">{opt.desc}</p>
                </button>
              ))}
            </div>

            {/* Conditional fields based on scheduling type */}
            {schedulingType !== 'asap' && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Data</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  min={todayStr()}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                />
              </div>
            )}

            {schedulingType === 'fixed_time' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Godzina</label>
                  <input
                    type="time"
                    value={selectedTime}
                    onChange={e => setSelectedTime(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Elastycznosc</label>
                  <div className="flex gap-2">
                    {FLEXIBILITY_OPTIONS.map(f => (
                      <button
                        key={f}
                        onClick={() => setFlexibility(f)}
                        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                          flexibility === f
                            ? 'bg-orange-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {f === 0 ? 'Dokladnie' : `+/-${f} min`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {schedulingType === 'time_window' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Okno czasowe</label>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {(['morning', 'afternoon', 'evening', 'custom'] as const).map(w => (
                      <button
                        key={w}
                        onClick={() => setWindowPreset(w)}
                        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          windowPreset === w
                            ? 'bg-orange-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {w === 'custom' ? 'Wlasne' : WINDOW_PRESETS[w].label}
                      </button>
                    ))}
                  </div>
                </div>
                {windowPreset === 'custom' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Od</label>
                      <input
                        type="time"
                        value={customWindowStart}
                        onChange={e => setCustomWindowStart(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Do</label>
                      <input
                        type="time"
                        value={customWindowEnd}
                        onChange={e => setCustomWindowEnd(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {schedulingType === 'asap' && (
              <p className="text-sm text-orange-600 font-medium">
                Zlecenie na dzisiaj ({todayStr()}), priorytet: pilny
              </p>
            )}
          </section>

          {/* SECTION 4: SZCZEGOLY */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500" /> Szczegoly
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Priorytet</label>
                <div className="flex gap-2">
                  {([
                    { value: 'normal' as const, label: 'Normalny' },
                    { value: 'high' as const, label: 'Wysoki' },
                    { value: 'urgent' as const, label: 'Pilny' },
                  ]).map(p => (
                    <button
                      key={p.value}
                      onClick={() => setPriority(p.value)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        priority === p.value
                          ? p.value === 'urgent' ? 'bg-red-500 text-white' : p.value === 'high' ? 'bg-yellow-500 text-white' : 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notatki</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Dodatkowe informacje..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pojazd (opcjonalnie)</label>
                <input
                  type="text"
                  value={vehicleInfo}
                  onChange={e => setVehicleInfo(e.target.value)}
                  placeholder="Marka, model, nr rejestracyjny"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>
          </section>
        </div>

        {/* ── RIGHT COLUMN (40%) ────────────────────────────────────────── */}
        <div className="lg:w-[40%] space-y-6">

          {/* Order Summary */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 sticky top-4">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Check className="h-4 w-4 text-orange-500" /> Podglad i przypisanie
            </h2>

            {/* Summary card */}
            <div className="rounded-lg bg-gray-50 p-4 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Podsumowanie</p>
              {selectedServices.length > 0 ? (
                <div className="space-y-1 mb-3">
                  {selectedServices.map(s => (
                    <div key={s.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">{s.name}</span>
                      <span className="text-gray-900 font-medium">{Number(s.price)} zl</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-3">Brak wybranych uslug</p>
              )}
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="text-sm font-semibold text-gray-700">
                  Lacznie ({totalDuration} min)
                </span>
                <span className="text-lg font-bold text-orange-600">{totalPrice} zl</span>
              </div>
            </div>

            {/* Worker suggestions panel */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase">Sugerowani pracownicy</p>
                {loadingWorkers && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
              </div>

              {!address || !selectedDate ? (
                <p className="text-xs text-gray-400">Wypelnij adres i date, aby zobaczyc sugestie</p>
              ) : workerSuggestions.length === 0 && !loadingWorkers ? (
                <p className="text-xs text-gray-400">Brak dostepnych pracownikow</p>
              ) : (
                <div className="space-y-2">
                  {workerSuggestions.slice(0, 3).map(w => (
                    <div
                      key={w.employee_id}
                      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                        selectedWorker === w.employee_id
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => { setSelectedWorker(w.employee_id); setAutoAssign(false); }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{w.employee_name}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                            {w.plate && (
                              <span className="flex items-center gap-1">
                                <Truck className="h-3 w-3" /> {w.plate}
                              </span>
                            )}
                            {w.gps_distance_km !== null && (
                              <span>{w.gps_distance_km} km</span>
                            )}
                            <span>{w.current_orders} zlecen</span>
                          </div>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedWorker(w.employee_id); setAutoAssign(false); }}
                          className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                            selectedWorker === w.employee_id
                              ? 'bg-orange-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-orange-100'
                          }`}
                        >
                          {selectedWorker === w.employee_id ? 'Wybrany' : 'Przypisz'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Auto-assign toggle */}
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAssign}
                  onChange={e => { setAutoAssign(e.target.checked); if (e.target.checked) setSelectedWorker(null); }}
                  className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-xs text-gray-700">Automatycznie przypisz najlepszego</span>
              </label>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={submitting || !phoneInput || !clientName || selectedServiceIds.size === 0}
              className="w-full rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Tworzenie...
                </>
              ) : (
                'Utworz zlecenie'
              )}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
