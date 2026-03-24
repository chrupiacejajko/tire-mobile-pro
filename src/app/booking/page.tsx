'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wrench, Calendar, Clock, MapPin, Phone, User, ChevronRight, ChevronLeft,
  Check, Car, Sun, Sunrise, Sunset, Plus, Trash2, Zap, ShoppingBag,
  AlertCircle, Loader2, Star, Mail,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ServiceOption {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  category: string;
}

interface Vehicle {
  id: string;
  label: string;
  serviceIds: string[];
}

interface SmartWindow {
  id: string;
  label: string;
  start: string;
  end: string;
  icon: string;
  available: boolean;
  employees_available: number;
  smart_pick: boolean;
  proximity_km: number | null;
  proximity_hint: string | null;
}

// ─── HERE Autocomplete types ──────────────────────────────────────────────────
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

// ─── Upsell logic ─────────────────────────────────────────────────────────────
const UPSELL_MAP: Record<string, string[]> = {
  'wymiana opon':     ['wyważanie', 'worki na opony', 'przechowywanie'],
  'wymiana kół':      ['wyważanie', 'worki na opony'],
  'naprawa':          ['wymiana zaworu', 'plombowanie'],
  'wyważanie':        ['geometria'],
};

function getUpsellIds(services: ServiceOption[], selectedIds: Set<string>): ServiceOption[] {
  const selectedNames = services.filter(s => selectedIds.has(s.id)).map(s => s.name.toLowerCase());
  const hints = new Set<string>();
  for (const [trigger, suggests] of Object.entries(UPSELL_MAP)) {
    if (selectedNames.some(n => n.includes(trigger))) {
      suggests.forEach(s => hints.add(s));
    }
  }
  return services.filter(s =>
    !selectedIds.has(s.id) &&
    Array.from(hints).some(h => s.name.toLowerCase().includes(h))
  ).slice(0, 3);
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STEPS = ['Usługi', 'Adres', 'Termin', 'Dane', 'Potwierdzenie'];

const WINDOW_ICONS: Record<string, React.ElementType> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
};

const WINDOW_LABELS: Record<string, { label: string; start: string; end: string }> = {
  morning:   { label: 'Rano',        start: '08:00', end: '12:00' },
  afternoon: { label: 'Południe',    start: '12:00', end: '16:00' },
  evening:   { label: 'Po południu', start: '16:00', end: '20:00' },
};

// ─── Helper ───────────────────────────────────────────────────────────────────
function nextDays(n: number) {
  const out: { date: string; day: string; dayNum: number; month: string }[] = [];
  for (let i = 0; out.length < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (d.getDay() === 0) continue;
    out.push({
      date: d.toISOString().split('T')[0],
      day: d.toLocaleDateString('pl', { weekday: 'short' }),
      dayNum: d.getDate(),
      month: d.toLocaleDateString('pl', { month: 'short' }),
    });
  }
  return out;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BookingPage() {
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [services, setServices] = useState<ServiceOption[]>([]);

  // Step 0 — vehicles + services
  const [vehicles, setVehicles] = useState<Vehicle[]>([{ id: '1', label: 'Pojazd 1', serviceIds: [] }]);
  const [activeVehicle, setActiveVehicle] = useState(0);

  // Step 1 — address
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [clientLat, setClientLat] = useState<number | null>(null);
  const [clientLng, setClientLng] = useState<number | null>(null);

  // HERE Autocomplete
  const [suggestions, setSuggestions] = useState<HereSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const coordsFromAutocomplete = useRef(false);
  const addressRef = useRef<HTMLDivElement>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 2 — date / window
  const [selectedDate, setSelectedDate] = useState('');
  const [smartWindows, setSmartWindows] = useState<SmartWindow[]>([]);
  const [loadingWindows, setLoadingWindows] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState('');
  const [bookingMode, setBookingMode] = useState<'windows' | 'slots'>('windows');
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('');

  // Step 3 — contact
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderId, setOrderId] = useState('');

  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dates = nextDays(14);

  // Load services
  useEffect(() => {
    supabase.from('services').select('*').eq('is_active', true).order('category, name')
      .then(({ data }) => { if (data) setServices(data as ServiceOption[]); });
  }, []);

  // ── Close autocomplete on click outside ───────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addressRef.current && !addressRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── HERE Autocomplete fetch (debounced 300ms) ──────────────────────────
  const fetchSuggestions = useCallback((q: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/here-autocomplete?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSuggestions(data.items ?? []);
        setShowSuggestions(true);
      } catch { /* silent */ }
    }, 300);
  }, []);

  // ── Select suggestion → lookup coords ─────────────────────────────────
  const selectSuggestion = useCallback(async (s: HereSuggestion) => {
    setShowSuggestions(false);
    setSuggestions([]);
    const street = [s.address.street, s.address.houseNumber].filter(Boolean).join(' ');
    coordsFromAutocomplete.current = true;
    setAddress(street);
    setCity(s.address.city ?? '');
    setLookingUp(true);
    try {
      const res = await fetch(`/api/here-lookup?id=${encodeURIComponent(s.id)}`);
      const data = await res.json();
      if (data.lat && data.lng) { setClientLat(data.lat); setClientLng(data.lng); }
    } catch { /* silent */ }
    setLookingUp(false);
  }, []);

  // ── Geocode address when it changes (debounced 800ms, fallback) ────────
  useEffect(() => {
    if (coordsFromAutocomplete.current) { coordsFromAutocomplete.current = false; return; }
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    if (!address || !city) { setClientLat(null); setClientLng(null); return; }
    geocodeTimer.current = setTimeout(async () => {
      setGeocoding(true);
      try {
        const res = await fetch(`/api/geocode?address=${encodeURIComponent(`${address}, ${city}`)}`);
        const data = await res.json();
        if (data.lat && data.lng) { setClientLat(data.lat); setClientLng(data.lng); }
      } catch { /* silent */ }
      setGeocoding(false);
    }, 800);
  }, [address, city]);

  // ── Fetch smart windows when date or location changes ─────────────────
  useEffect(() => {
    if (!selectedDate) return;
    setLoadingWindows(true);
    setSelectedWindow('');
    setSelectedSlot('');

    const params = new URLSearchParams({ date: selectedDate });
    if (clientLat !== null) params.set('lat', String(clientLat));
    if (clientLng !== null) params.set('lng', String(clientLng));

    Promise.all([
      fetch(`/api/availability/smart?${params}`).then(r => r.json()),
      fetch(`/api/availability?date=${selectedDate}&mode=slots`).then(r => r.json()),
    ]).then(([smart, slotData]) => {
      if (smart.windows) setSmartWindows(smart.windows);
      if (slotData.all_slots) setSlots(slotData.all_slots);
    }).finally(() => setLoadingWindows(false));
  }, [selectedDate, clientLat, clientLng]);

  // ── Derived values ─────────────────────────────────────────────────────
  const allSelectedIds = new Set(vehicles.flatMap(v => v.serviceIds));
  const totalPrice = services.filter(s => allSelectedIds.has(s.id))
    .reduce((sum, s) => sum + Number(s.price) * vehicles.filter(v => v.serviceIds.includes(s.id)).length, 0);
  const totalDuration = services.filter(s => allSelectedIds.has(s.id))
    .reduce((sum, s) => sum + s.duration_minutes * vehicles.filter(v => v.serviceIds.includes(s.id)).length, 0);
  const upsells = getUpsellIds(services, allSelectedIds);

  const displayWindow = selectedWindow ? WINDOW_LABELS[selectedWindow] : null;
  const displayTime = bookingMode === 'windows' && displayWindow
    ? `${displayWindow.start}–${displayWindow.end}`
    : selectedSlot;

  const canProceed = () => {
    if (step === 0) return vehicles.some(v => v.serviceIds.length > 0);
    if (step === 1) return !!address && !!city;
    if (step === 2) {
      if (!selectedDate) return false;
      return bookingMode === 'windows' ? !!selectedWindow : !!selectedSlot;
    }
    if (step === 3) return !!form.name && !!form.phone;
    return true;
  };

  // ── Vehicle helpers ────────────────────────────────────────────────────
  const addVehicle = () => {
    const n = vehicles.length + 1;
    setVehicles([...vehicles, { id: String(n), label: `Pojazd ${n}`, serviceIds: [] }]);
    setActiveVehicle(vehicles.length);
  };

  const removeVehicle = (idx: number) => {
    if (vehicles.length === 1) return;
    const next = vehicles.filter((_, i) => i !== idx);
    setVehicles(next);
    setActiveVehicle(Math.min(activeVehicle, next.length - 1));
  };

  const toggleService = (svcId: string) => {
    setVehicles(vs => vs.map((v, i) => {
      if (i !== activeVehicle) return v;
      return {
        ...v,
        serviceIds: v.serviceIds.includes(svcId)
          ? v.serviceIds.filter(id => id !== svcId)
          : [...v.serviceIds, svcId],
      };
    }));
  };

  const addUpsell = (svcId: string) => {
    setVehicles(vs => vs.map((v, i) => {
      if (i !== activeVehicle) return v;
      if (v.serviceIds.includes(svcId)) return v;
      return { ...v, serviceIds: [...v.serviceIds, svcId] };
    }));
  };

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    const vehiclesPayload = vehicles.filter(v => v.serviceIds.length > 0).map(v => ({
      label: v.label,
      service_ids: v.serviceIds,
    }));
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: form.name,
        client_phone: form.phone,
        client_email: form.email || undefined,
        address,
        city,
        scheduled_date: selectedDate,
        scheduled_time: bookingMode === 'slots' ? selectedSlot : undefined,
        time_window: bookingMode === 'windows' ? selectedWindow : undefined,
        vehicles: vehiclesPayload,
        notes: form.notes || undefined,
        priority: 'normal',
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (data.success) { setOrderId(data.order_id); setSuccess(true); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Success screen
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900/80 backdrop-blur-xl p-8 text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
            <Check className="h-10 w-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Rezerwacja przyjęta!</h2>
          <p className="text-gray-400 mb-6 text-sm">
            Potwierdzimy termin telefonicznie. Przygotuj pojazd i będziemy u Ciebie punktualnie.
          </p>
          <motion.div
            className="rounded-xl bg-gray-800/50 p-4 text-left space-y-2.5 mb-6"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          >
            {[
              <><Calendar className="h-4 w-4 inline mr-2 text-gray-500" />{selectedDate}</>,
              displayWindow ? <><Clock className="h-4 w-4 inline mr-2 text-gray-500" />{displayWindow.label}: {displayWindow.start}–{displayWindow.end}</> : null,
              <><MapPin className="h-4 w-4 inline mr-2 text-gray-500" />{address}, {city}</>,
              <><User className="h-4 w-4 inline mr-2 text-gray-500" />{form.name} · {form.phone}</>,
            ].filter(Boolean).map((content, i) => (
              <motion.p
                key={i}
                className="text-sm text-gray-300"
                variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
              >
                {content}
              </motion.p>
            ))}
            <motion.div
              className="border-t border-gray-700 pt-2 mt-2"
              variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
            >
              {vehicles.filter(v => v.serviceIds.length > 0).map((v, i) => (
                <p key={i} className="text-xs text-gray-400">
                  <Car className="h-3 w-3 inline mr-1" />{v.label}: {v.serviceIds.map(id => services.find(s => s.id === id)?.name).filter(Boolean).join(', ')}
                </p>
              ))}
            </motion.div>
            <motion.p
              className="text-base font-bold text-orange-400 pt-1"
              variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
            >
              Łącznie: {totalPrice} zł
            </motion.p>
          </motion.div>
          <p className="text-xs text-gray-600 mb-4">Nr zlecenia: {orderId?.slice(0, 8).toUpperCase()}</p>
          {orderId && (
            <a
              href={`/tracking/${orderId}`}
              className="inline-block rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
            >
              Sledz zlecenie
            </a>
          )}
          {form.email && (
            <p className="text-xs text-gray-500 mt-3">
              Potwierdzenie wyslano na {form.email}
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/60 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <img src="/logo-full.png" alt="RouteTire" className="h-9 w-9 object-contain rounded-xl" />
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Route<span className="text-orange-500">Tire</span></h1>
            <p className="text-[11px] text-gray-500 flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span>4.9 · Ponad 2 000 rezerwacji</span>
            </p>
          </div>
          {totalPrice > 0 && (
            <div className="ml-auto text-right">
              <p className="text-xs text-gray-400">{totalDuration} min</p>
              <p className="text-sm font-bold text-orange-400">{totalPrice} zł</p>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-800/50">
        <motion.div
          className="h-full bg-gradient-to-r from-orange-500 to-orange-400"
          initial={{ width: 0 }}
          animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Progress */}
        <div className="flex items-center mb-8 gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                i < step ? 'bg-orange-500 text-white' : i === step ? 'bg-orange-500/20 border-2 border-orange-500 text-orange-400' : 'bg-gray-800 text-gray-600'
              }`}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium ml-1 hidden sm:block ${i <= step ? 'text-white' : 'text-gray-600'}`}>{s}</span>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${i < step ? 'bg-orange-500' : 'bg-gray-800'}`} />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ── Step 0: Services + Multi-vehicle ─────────────────────────── */}
          {step === 0 && (
            <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white">Wybierz usługi</h2>
                <p className="text-sm text-gray-400 mt-1">Możesz dodać kilka pojazdów do jednej wizyty.</p>
              </div>

              {/* Vehicle tabs */}
              <div className="flex items-center gap-2 flex-wrap">
                {vehicles.map((v, idx) => (
                  <button key={v.id} type="button"
                    onClick={() => setActiveVehicle(idx)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-all ${
                      activeVehicle === idx ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    <Car className="h-3.5 w-3.5" />
                    {v.label}
                    {v.serviceIds.length > 0 && (
                      <span className={`text-[10px] rounded-full px-1 ${activeVehicle === idx ? 'bg-white/20' : 'bg-orange-500/20 text-orange-400'}`}>
                        {v.serviceIds.length}
                      </span>
                    )}
                    {vehicles.length > 1 && (
                      <span onClick={e => { e.stopPropagation(); removeVehicle(idx); }}
                        className="ml-0.5 text-gray-400 hover:text-red-400 transition-colors cursor-pointer">
                        ×
                      </span>
                    )}
                  </button>
                ))}
                <button type="button" onClick={addVehicle}
                  className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm text-gray-500 border border-dashed border-gray-700 hover:border-orange-500 hover:text-orange-400 transition-all">
                  <Plus className="h-3.5 w-3.5" /> Dodaj pojazd
                </button>
              </div>

              {/* Vehicle label input */}
              <div>
                <input
                  value={vehicles[activeVehicle]?.label ?? ''}
                  onChange={e => setVehicles(vs => vs.map((v, i) => i === activeVehicle ? { ...v, label: e.target.value } : v))}
                  placeholder={`Pojazd ${activeVehicle + 1} (np. Ford Focus, BMW X5)`}
                  className="w-full rounded-xl border border-gray-700 bg-gray-800/40 py-2.5 px-3.5 text-sm text-white placeholder-gray-600 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20"
                />
              </div>

              {/* Services by category */}
              {(() => {
                const categories = [...new Set(services.map(s => s.category))];
                return categories.map(cat => (
                  <div key={cat}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-2">{cat}</p>
                    <div className="space-y-2">
                      {services.filter(s => s.category === cat).map(svc => {
                        const checked = vehicles[activeVehicle]?.serviceIds.includes(svc.id) ?? false;
                        return (
                          <label key={svc.id}
                            className={`flex items-center gap-4 rounded-xl border p-3.5 cursor-pointer transition-all ${
                              checked ? 'border-orange-500 bg-orange-500/10' : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
                            }`}
                          >
                            <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleService(svc.id)} />
                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                              checked ? 'bg-orange-500 border-orange-500' : 'border-gray-600'
                            }`}>
                              {checked && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white">{svc.name}</p>
                              {svc.description && <p className="text-xs text-gray-500 truncate mt-0.5">{svc.description}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-white">{Number(svc.price)} zł</p>
                              <p className="text-[10px] text-gray-600">{svc.duration_minutes} min</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}

              {/* Upsell suggestions */}
              {upsells.length > 0 && (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Star className="h-4 w-4 text-yellow-400" />
                    <p className="text-sm font-semibold text-yellow-400">Klienci też zamawiają</p>
                  </div>
                  <div className="space-y-2">
                    {upsells.map(svc => (
                      <div key={svc.id} className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-white">{svc.name}</p>
                          <p className="text-xs text-gray-500">{svc.duration_minutes} min · {Number(svc.price)} zł</p>
                        </div>
                        <button type="button" onClick={() => addUpsell(svc.id)}
                          className="flex items-center gap-1 rounded-lg bg-yellow-500/20 text-yellow-400 px-3 py-1 text-xs font-medium hover:bg-yellow-500/30 transition-colors">
                          <Plus className="h-3 w-3" /> Dodaj
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary bar */}
              {allSelectedIds.size > 0 && (
                <div className="rounded-xl bg-gray-800/60 p-3 flex items-center justify-between">
                  <div className="text-sm text-gray-400">
                    {vehicles.filter(v => v.serviceIds.length > 0).length} pojazd{vehicles.filter(v => v.serviceIds.length > 0).length > 1 ? 'y' : ''} · {allSelectedIds.size} usług{allSelectedIds.size > 1 ? 'i' : 'a'} · {totalDuration} min
                  </div>
                  <span className="text-sm font-bold text-white">{totalPrice} zł</span>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Step 1: Address ────────────────────────────────────────── */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white">Twoja lokalizacja</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Dzięki adresowi dobierzemy termin, gdy pracownik będzie blisko Ciebie — skróci to czas oczekiwania i dojazdu.
                </p>
              </div>

              <div className="space-y-3">
                <div ref={addressRef}>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Ulica i numer *</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                    <input
                      type="text"
                      value={address}
                      onChange={e => {
                        const val = e.target.value;
                        setAddress(val);
                        setClientLat(null);
                        setClientLng(null);
                        if (val.length >= 3) fetchSuggestions(val);
                        else { setSuggestions([]); setShowSuggestions(false); }
                      }}
                      onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                      placeholder="ul. Marszałkowska 15"
                      className="w-full rounded-xl border border-gray-700 bg-gray-800/50 py-3 pl-10 pr-10 text-sm text-white placeholder-gray-500 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                      autoComplete="off"
                    />
                    {lookingUp && (
                      <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-orange-400" />
                    )}

                    <AnimatePresence>
                      {showSuggestions && suggestions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className="absolute z-50 w-full mt-1 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl overflow-hidden"
                        >
                          {suggestions.map((s, i) => (
                            <button
                              key={s.id}
                              type="button"
                              onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
                              className={`w-full px-4 py-3 text-left hover:bg-gray-800 transition-colors ${i < suggestions.length - 1 ? 'border-b border-gray-800' : ''}`}
                            >
                              <p className="text-sm text-white font-medium">
                                {[s.address.street, s.address.houseNumber].filter(Boolean).join(' ') || s.title}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {[s.address.postalCode, s.address.city].filter(Boolean).join(' ')}
                              </p>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Miasto *</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                      type="text"
                      value={city}
                      onChange={e => { setCity(e.target.value); setClientLat(null); setClientLng(null); }}
                      placeholder="Warszawa"
                      className="w-full rounded-xl border border-gray-700 bg-gray-800/50 py-3 pl-10 pr-4 text-sm text-white placeholder-gray-500 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Geocode status */}
              {geocoding && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Szukam lokalizacji...
                </div>
              )}
              {clientLat && !geocoding && (
                <div className="flex items-center gap-2 text-sm text-emerald-500">
                  <Check className="h-4 w-4" /> Lokalizacja znaleziona — dobierzemy dla Ciebie najlepszy termin
                </div>
              )}
              {address && city && !clientLat && !geocoding && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <AlertCircle className="h-4 w-4" /> Nie udało się zlokalizować adresu — możesz kontynuować
                </div>
              )}
            </motion.div>
          )}

          {/* ── Step 2: Date & Smart Windows ──────────────────────────── */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Wybierz termin</h2>
                {clientLat && (
                  <p className="text-sm text-emerald-500 mt-1 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" /> Terminy dopasowane do Twojej lokalizacji
                  </p>
                )}
              </div>

              {/* Date picker */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Data</p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {dates.map(d => (
                    <button key={d.date} type="button"
                      onClick={() => setSelectedDate(d.date)}
                      className={`rounded-xl p-2 text-center transition-all ${
                        selectedDate === d.date ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <p className="text-[10px] uppercase">{d.day}</p>
                      <p className="text-lg font-bold leading-tight">{d.dayNum}</p>
                      <p className="text-[10px]">{d.month}</p>
                    </button>
                  ))}
                </div>
              </div>

              {selectedDate && (
                <>
                  {/* Mode toggle */}
                  <div className="flex rounded-xl bg-gray-800/50 p-1 gap-1">
                    {(['windows', 'slots'] as const).map(mode => (
                      <button key={mode} type="button"
                        onClick={() => { setBookingMode(mode); setSelectedWindow(''); setSelectedSlot(''); }}
                        className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${bookingMode === mode ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}
                      >
                        {mode === 'windows' ? 'Okno czasowe' : 'Dokładna godzina'}
                      </button>
                    ))}
                  </div>

                  {loadingWindows ? (
                    <div className="flex items-center justify-center py-8 gap-3 text-sm text-gray-500">
                      <Loader2 className="h-5 w-5 animate-spin text-orange-500" /> Sprawdzam dostępność...
                    </div>
                  ) : bookingMode === 'windows' ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Preferowane okno czasowe</p>
                      {smartWindows.map(win => {
                        const WinIcon = WINDOW_ICONS[win.id] || Clock;
                        return (
                          <button key={win.id} type="button"
                            disabled={!win.available}
                            onClick={() => setSelectedWindow(win.id)}
                            className={`w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                              !win.available
                                ? 'border-gray-800 opacity-40 cursor-not-allowed'
                                : selectedWindow === win.id
                                ? 'border-orange-500 bg-orange-500/10'
                                : win.smart_pick
                                ? 'border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60'
                                : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                            }`}
                          >
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                              selectedWindow === win.id ? 'bg-orange-500' : win.smart_pick ? 'bg-emerald-500/20' : 'bg-gray-800'
                            }`}>
                              <WinIcon className={`h-6 w-6 ${selectedWindow === win.id ? 'text-white' : win.smart_pick ? 'text-emerald-400' : 'text-gray-400'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-white">{win.label}</p>
                                {win.smart_pick && (
                                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-md">
                                    <Zap className="h-2.5 w-2.5" /> Polecane
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400">{win.start} – {win.end}</p>
                              {win.proximity_hint && (
                                <p className="text-[11px] text-emerald-400 mt-0.5">{win.proximity_hint}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              {win.available ? (
                                <>
                                  {win.employees_available === 1 ? (
                                    <p className="text-xs text-red-400 font-semibold">Ostatnie miejsce!</p>
                                  ) : (
                                    <p className="text-xs text-emerald-400 font-medium">Dostępne</p>
                                  )}
                                  <p className="text-[10px] text-gray-500">{win.employees_available} pracownik{win.employees_available === 1 ? '' : 'ów'}</p>
                                </>
                              ) : (
                                <p className="text-xs text-red-400">Zajęte</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Godzina</p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {slots.filter(s => s.available).map(slot => (
                          <button key={slot.time} type="button"
                            onClick={() => setSelectedSlot(slot.time)}
                            className={`rounded-xl py-2 text-sm font-medium transition-all ${
                              selectedSlot === slot.time ? 'bg-orange-500 text-white' : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white'
                            }`}
                          >
                            {slot.time}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* ── Step 3: Contact info ───────────────────────────────────── */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h2 className="text-xl font-bold text-white">Twoje dane</h2>
              {[
                { label: 'Imię i nazwisko', key: 'name', icon: User, type: 'text', required: true, placeholder: 'Jan Kowalski' },
                { label: 'Telefon', key: 'phone', icon: Phone, type: 'tel', required: true, placeholder: '+48 600 000 000' },
                { label: 'Email (opcjonalnie)', key: 'email', icon: Mail, type: 'email', required: false, placeholder: 'jan@example.com' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{field.label}{field.required ? ' *' : ''}</label>
                  <div className="relative">
                    <field.icon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                      type={field.type}
                      required={field.required}
                      placeholder={field.placeholder}
                      value={(form as Record<string, string>)[field.key]}
                      onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                      className="w-full rounded-xl border border-gray-700 bg-gray-800/50 py-3 pl-10 pr-4 text-sm text-white placeholder-gray-500 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Uwagi (opcjonalnie)</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Np. rozmiar opon, marka pojazdu, dostęp do podwórza..."
                  className="w-full rounded-xl border border-gray-700 bg-gray-800/50 py-3 px-4 text-sm text-white placeholder-gray-500 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
            </motion.div>
          )}

          {/* ── Step 4: Confirmation ───────────────────────────────────── */}
          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <h2 className="text-xl font-bold text-white">Podsumowanie</h2>

              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-4">
                {/* Vehicles breakdown */}
                <div>
                  <p className="text-[11px] text-gray-500 uppercase font-semibold mb-2">Pojazdy i usługi</p>
                  {vehicles.filter(v => v.serviceIds.length > 0).map((v, i) => (
                    <div key={i} className="mb-2">
                      <p className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
                        <Car className="h-3 w-3 text-gray-500" />{v.label}
                      </p>
                      {v.serviceIds.map(id => {
                        const svc = services.find(s => s.id === id);
                        if (!svc) return null;
                        return (
                          <div key={id} className="flex justify-between text-sm py-0.5 pl-4">
                            <span className="text-gray-300">{svc.name}</span>
                            <span className="text-white">{Number(svc.price)} zł</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div className="flex justify-between text-sm pt-2 mt-1 border-t border-gray-800 font-bold">
                    <span className="text-white">Razem</span>
                    <span className="text-orange-400 text-base">{totalPrice} zł</span>
                  </div>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-800">
                  <div><p className="text-[11px] text-gray-500 uppercase">Data</p><p className="text-sm text-white font-medium">{selectedDate}</p></div>
                  <div><p className="text-[11px] text-gray-500 uppercase">Okno</p><p className="text-sm text-white font-medium">{displayWindow ? `${displayWindow.label}: ${displayWindow.start}–${displayWindow.end}` : selectedSlot}</p></div>
                  <div><p className="text-[11px] text-gray-500 uppercase">Adres</p><p className="text-sm text-white font-medium">{address}, {city}</p></div>
                  <div><p className="text-[11px] text-gray-500 uppercase">Czas usługi</p><p className="text-sm text-white font-medium">{totalDuration} min</p></div>
                  <div><p className="text-[11px] text-gray-500 uppercase">Klient</p><p className="text-sm text-white font-medium">{form.name}</p></div>
                  <div><p className="text-[11px] text-gray-500 uppercase">Telefon</p><p className="text-sm text-white font-medium">{form.phone}</p></div>
                </div>
              </div>

              {/* Final upsell */}
              {upsells.length > 0 && (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingBag className="h-4 w-4 text-yellow-400" />
                    <p className="text-sm font-semibold text-yellow-400">Nie przegap — większość klientów dodaje:</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {upsells.map(svc => (
                      <button key={svc.id} type="button" onClick={() => addUpsell(svc.id)}
                        className="flex items-center gap-1.5 rounded-lg bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 px-3 py-1.5 text-xs font-medium hover:bg-yellow-500/20 transition-colors">
                        <Plus className="h-3 w-3" /> {svc.name} — {Number(svc.price)} zł
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-600 text-center">
                Rezerwując, akceptujesz warunki usługi. Potwierdzimy termin telefonicznie.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between mt-8 pb-8">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft className="h-4 w-4" /> Wstecz
          </button>
          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-orange-600 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-orange-500/20"
            >
              Dalej <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:from-emerald-600 hover:to-emerald-700 active:scale-95 disabled:opacity-50"
            >
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Rezerwuję...</> : <><Check className="h-4 w-4" /> Zarezerwuj bezpłatnie</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
