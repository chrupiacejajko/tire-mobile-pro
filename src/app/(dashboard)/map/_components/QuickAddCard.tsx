'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { MapPin, User, Wrench, Clock, X, Loader2, Phone, ChevronDown, Zap, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
// Uses /api/services instead of direct Supabase to avoid schema issues

interface NearbyWorker {
  employee_id: string;
  employee_name: string;
  plate: string | null;
  status: string;
  lat: number;
  lng: number;
  distance_km: number;
  travel_minutes: number;
  orders_today: number;
}

interface ServiceOption {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

interface QuickAddCardProps {
  pin: { lat: number; lng: number; label: string };
  nearbyWorkers: NearbyWorker[];
  onClose: () => void;
  onSuccess: () => void;
  /** Open full CreateOrderPanel instead */
  onExpandToFull?: () => void;
}

export default function QuickAddCard({ pin, nearbyWorkers, onClose, onSuccess, onExpandToFull }: QuickAddCardProps) {
  // Form state
  const [clientPhone, setClientPhone] = useState('');
  const [clientName, setClientName] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(nearbyWorkers[0]?.employee_id ?? '');
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [timeMode, setTimeMode] = useState<'asap' | 'morning' | 'afternoon' | 'custom'>('asap');
  const [customTime, setCustomTime] = useState('10:00');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Client search
  const [clientResults, setClientResults] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [searchingClient, setSearchingClient] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phoneRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Load services via API (same as CreateOrderPanel)
  useEffect(() => {
    fetch('/api/services')
      .then(r => r.json())
      .then(data => {
        const list = data.services || data;
        if (Array.isArray(list)) {
          const mapped = list.map((s: any) => ({
            id: s.id,
            name: s.name,
            price: Number(s.price ?? s.base_price ?? 0),
            duration_minutes: Number(s.duration_minutes ?? 60),
          }));
          setServices(mapped);
          if (mapped.length > 0) setSelectedServiceId(mapped[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-focus phone
  useEffect(() => {
    setTimeout(() => phoneRef.current?.focus(), 200);
  }, []);

  // Client phone search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const digits = clientPhone.replace(/\D/g, '');
    if (digits.length < 4) { setClientResults([]); return; }
    setSearchingClient(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/search?phone=${encodeURIComponent(digits)}`);
        const data = await res.json();
        setClientResults(data.clients ?? []);
      } catch { setClientResults([]); }
      setSearchingClient(false);
    }, 400);
  }, [clientPhone]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    };
    // Delay to prevent immediate close from the click that opened the card
    const timeout = setTimeout(() => document.addEventListener('mousedown', handler), 200);
    return () => { clearTimeout(timeout); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  const selectClient = (c: { id: string; name: string; phone: string }) => {
    setClientPhone(c.phone);
    setClientName(c.name);
    setClientResults([]);
  };

  const selectedWorker = nearbyWorkers.find(w => w.employee_id === selectedWorkerId);
  const selectedService = services.find(s => s.id === selectedServiceId);

  const getSchedulePayload = () => {
    const today = new Date().toISOString().split('T')[0];
    switch (timeMode) {
      case 'asap':
        return { scheduling_type: 'asap', scheduled_date: today, priority: 'urgent' };
      case 'morning':
        return { scheduling_type: 'time_window', scheduled_date: today, time_window: 'morning', time_window_start: '08:00', time_window_end: '12:00', priority: 'normal' };
      case 'afternoon':
        return { scheduling_type: 'time_window', scheduled_date: today, time_window: 'afternoon', time_window_start: '12:00', time_window_end: '18:00', priority: 'normal' };
      case 'custom':
        return { scheduling_type: 'fixed_time', scheduled_date: today, scheduled_time: customTime, priority: 'normal' };
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!clientPhone.trim()) { setError('Podaj numer telefonu'); return; }
    if (!selectedServiceId) { setError('Wybierz usługę'); return; }
    setError('');
    setSubmitting(true);

    const schedule = getSchedulePayload();

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName || 'Klient',
          client_phone: clientPhone,
          address: pin.label,
          lat: pin.lat,
          lng: pin.lng,
          service_ids: [selectedServiceId],
          source: 'dispatcher',
          auto_assign: !!selectedWorkerId,
          employee_id_hint: selectedWorkerId || undefined,
          ...schedule,
        }),
      });

      const data = await res.json();
      if (data.success || data.order_id || data.id) {
        const orderId = data.order_id ?? data.id;
        // Assign worker if selected
        if (selectedWorkerId && orderId) {
          try {
            await fetch('/api/orders/assign-worker', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ order_id: orderId, employee_id: selectedWorkerId }),
            });
          } catch { /* best effort */ }
        }
        setSuccess(true);
        setTimeout(() => { onSuccess(); }, 800);
      } else {
        setError(data.error || 'Nie udało się utworzyć zlecenia');
      }
    } catch {
      setError('Błąd połączenia');
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <motion.div
        ref={cardRef}
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-[340px] bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 flex flex-col items-center gap-3"
      >
        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
        </div>
        <p className="text-sm font-semibold text-gray-900">Zlecenie utworzone</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={cardRef}
      initial={{ scale: 0.9, opacity: 0, y: 10 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.9, opacity: 0, y: 10 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="w-[340px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-50">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-900">Szybkie zlecenie</h3>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 flex-shrink-0 text-red-500" />
              {pin.label}
            </p>
          </div>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="px-4 py-3 space-y-3">
        {/* Phone + client lookup */}
        <div className="relative">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 block">
            <Phone className="h-2.5 w-2.5 inline mr-0.5" /> Telefon klienta
          </label>
          <input
            ref={phoneRef}
            type="tel"
            value={clientPhone}
            onChange={e => setClientPhone(e.target.value)}
            placeholder="np. 500 100 200"
            className="w-full h-8 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
          />
          {searchingClient && <Loader2 className="absolute right-2.5 top-7 h-3.5 w-3.5 text-orange-400 animate-spin" />}
          {clientResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
              {clientResults.map(c => (
                <button
                  key={c.id}
                  onClick={() => selectClient(c)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-orange-50 transition-colors border-b border-gray-50 last:border-0"
                >
                  <span className="font-medium text-gray-900">{c.name}</span>
                  <span className="text-gray-400 ml-2">{c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Client name (shown if phone entered and no match) */}
        {clientPhone.length >= 4 && !clientName && clientResults.length === 0 && !searchingClient && (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 block">Imię i nazwisko</label>
            <input
              type="text"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="Jan Kowalski"
              className="w-full h-8 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
            />
          </div>
        )}

        {/* Worker select */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 block">
            <User className="h-2.5 w-2.5 inline mr-0.5" /> Pracownik
          </label>
          {nearbyWorkers.length > 0 ? (
            <div className="relative">
              <select
                value={selectedWorkerId}
                onChange={e => setSelectedWorkerId(e.target.value)}
                className="w-full h-8 px-3 pr-8 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 appearance-none"
              >
                {nearbyWorkers.map((w, i) => (
                  <option key={w.employee_id} value={w.employee_id}>
                    {w.employee_name} · {w.distance_km.toFixed(1)} km {i === 0 ? '★' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">Brak pracowników w pobliżu</p>
          )}
        </div>

        {/* Service select */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 block">
            <Wrench className="h-2.5 w-2.5 inline mr-0.5" /> Usługa
          </label>
          <div className="relative">
            <select
              value={selectedServiceId}
              onChange={e => setSelectedServiceId(e.target.value)}
              className="w-full h-8 px-3 pr-8 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 appearance-none"
            >
              {services.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.duration_minutes} min · {s.price} zł
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Time quick-picks */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 block">
            <Clock className="h-2.5 w-2.5 inline mr-0.5" /> Kiedy
          </label>
          <div className="flex gap-1.5">
            {[
              { value: 'asap' as const, label: 'ASAP', icon: Zap },
              { value: 'morning' as const, label: 'Rano', icon: null },
              { value: 'afternoon' as const, label: 'Popoł.', icon: null },
              { value: 'custom' as const, label: 'Godz.', icon: null },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setTimeMode(opt.value)}
                className={cn(
                  'flex-1 h-7 rounded-lg text-xs font-medium transition-all border',
                  timeMode === opt.value
                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300',
                )}
              >
                {opt.icon && <opt.icon className="h-3 w-3 inline mr-0.5" />}
                {opt.label}
              </button>
            ))}
          </div>
          {timeMode === 'custom' && (
            <input
              type="time"
              value={customTime}
              onChange={e => setCustomTime(e.target.value)}
              className="mt-1.5 w-full h-8 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
            />
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-500 font-medium">{error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 pt-1 flex gap-2">
        {onExpandToFull && (
          <button
            onClick={onExpandToFull}
            className="h-9 px-3 rounded-xl border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Pełny formularz
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting || !clientPhone.trim()}
          className={cn(
            'flex-1 h-9 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5',
            submitting || !clientPhone.trim()
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md shadow-orange-500/25 hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]',
          )}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Dodaj zlecenie'}
        </button>
      </div>
    </motion.div>
  );
}
