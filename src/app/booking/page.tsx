'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, Calendar, Clock, MapPin, Phone, User, ChevronRight, ChevronLeft, Check, Car } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface ServiceOption {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  category: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

const steps = ['Usługi', 'Termin', 'Dane', 'Potwierdzenie'];

export default function BookingPage() {
  const [step, setStep] = useState(0);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', address: '', city: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderId, setOrderId] = useState('');

  const supabase = createClient();

  useEffect(() => {
    supabase.from('services').select('*').eq('is_active', true).order('category, name')
      .then(({ data }) => { if (data) setServices(data as ServiceOption[]); });
  }, []);

  const totalPrice = services.filter(s => selectedServices.includes(s.id)).reduce((sum, s) => sum + Number(s.price), 0);
  const totalDuration = services.filter(s => selectedServices.includes(s.id)).reduce((sum, s) => sum + s.duration_minutes, 0);

  // Fetch real availability from API
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (!selectedDate) return;
    setLoadingSlots(true);
    fetch(`/api/availability?date=${selectedDate}`)
      .then(r => r.json())
      .then(data => {
        if (data.all_slots) {
          setTimeSlots(data.all_slots);
        } else {
          // Fallback: generate all slots
          const slots: TimeSlot[] = [];
          for (let h = 7; h <= 17; h++) {
            for (const m of [0, 30]) {
              slots.push({ time: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`, available: true });
            }
          }
          setTimeSlots(slots);
        }
        setLoadingSlots(false);
      })
      .catch(() => setLoadingSlots(false));
  }, [selectedDate]);

  // Generate next 14 days
  const dates: { date: string; day: string; dayNum: number; month: string }[] = [];
  for (let i = 1; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (d.getDay() === 0) continue; // Skip Sundays
    dates.push({
      date: d.toISOString().split('T')[0],
      day: d.toLocaleDateString('pl', { weekday: 'short' }),
      dayNum: d.getDate(),
      month: d.toLocaleDateString('pl', { month: 'short' }),
    });
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    const selectedServiceNames = services.filter(s => selectedServices.includes(s.id)).map(s => s.name);

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: form.name,
        client_phone: form.phone,
        address: form.address,
        city: form.city,
        scheduled_date: selectedDate,
        scheduled_time: selectedTime,
        service_names: selectedServiceNames,
        notes: form.notes || `Rezerwacja online: ${form.name}`,
      }),
    });

    const data = await res.json();
    setSubmitting(false);
    if (data.success) {
      setOrderId(data.order_id);
      setSuccess(true);
    }
  };

  const canProceed = () => {
    if (step === 0) return selectedServices.length > 0;
    if (step === 1) return selectedDate && selectedTime;
    if (step === 2) return form.name && form.phone;
    return true;
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900/80 backdrop-blur-xl p-8 text-center"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
            <Check className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Rezerwacja potwierdzona!</h2>
          <p className="text-gray-400 mb-6">
            Twoje zlecenie zostało utworzone. Skontaktujemy się z Tobą w celu potwierdzenia.
          </p>
          <div className="rounded-xl bg-gray-800/50 p-4 text-left space-y-2 mb-6">
            <p className="text-sm text-gray-300"><Calendar className="h-4 w-4 inline mr-2 text-gray-500" />{selectedDate}</p>
            <p className="text-sm text-gray-300"><Clock className="h-4 w-4 inline mr-2 text-gray-500" />{selectedTime}</p>
            <p className="text-sm text-gray-300"><User className="h-4 w-4 inline mr-2 text-gray-500" />{form.name}</p>
            <p className="text-sm text-white font-bold mt-2">Kwota: {totalPrice} zł</p>
          </div>
          <p className="text-xs text-gray-500">Nr zlecenia: {orderId?.slice(0, 8)}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg">
            <Wrench className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">RouteTire</h1>
            <p className="text-xs text-gray-400">Rezerwacja online</p>
          </div>
        </div>
      </div>

      {/* Progress steps */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all ${
                i <= step ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-500'
              }`}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-sm font-medium hidden sm:block ${i <= step ? 'text-white' : 'text-gray-500'}`}>{s}</span>
              {i < steps.length - 1 && <div className={`w-8 sm:w-16 h-0.5 ${i < step ? 'bg-orange-500' : 'bg-gray-800'}`} />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 0: Select Services */}
          {step === 0 && (
            <motion.div key="services" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
              <h2 className="text-xl font-bold text-white mb-4">Wybierz usługi</h2>
              {services.map(s => (
                <label key={s.id}
                  className={`flex items-center gap-4 rounded-xl border p-4 cursor-pointer transition-all ${
                    selectedServices.includes(s.id) ? 'border-orange-500 bg-orange-500/10' : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
                  }`}
                >
                  <input type="checkbox" className="hidden" checked={selectedServices.includes(s.id)}
                    onChange={e => {
                      if (e.target.checked) setSelectedServices([...selectedServices, s.id]);
                      else setSelectedServices(selectedServices.filter(id => id !== s.id));
                    }}
                  />
                  <div className={`flex h-5 w-5 items-center justify-center rounded-md border-2 ${
                    selectedServices.includes(s.id) ? 'bg-orange-500 border-orange-500' : 'border-gray-600'
                  }`}>
                    {selectedServices.includes(s.id) && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{s.name}</p>
                    {s.description && <p className="text-xs text-gray-400 mt-0.5">{s.description}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">{Number(s.price)} zł</p>
                    <p className="text-xs text-gray-500">{s.duration_minutes} min</p>
                  </div>
                </label>
              ))}
              {selectedServices.length > 0 && (
                <div className="rounded-xl bg-gray-800/50 p-3 flex justify-between">
                  <span className="text-sm text-gray-400">Razem: {totalDuration} min</span>
                  <span className="text-sm font-bold text-white">{totalPrice} zł</span>
                </div>
              )}
            </motion.div>
          )}

          {/* Step 1: Select Date & Time */}
          {step === 1 && (
            <motion.div key="datetime" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-xl font-bold text-white mb-4">Wybierz termin</h2>
              <div>
                <p className="text-sm text-gray-400 mb-3">Data</p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {dates.map(d => (
                    <button key={d.date} type="button"
                      onClick={() => setSelectedDate(d.date)}
                      className={`rounded-xl p-2 text-center transition-all ${
                        selectedDate === d.date ? 'bg-orange-500 text-white' : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <p className="text-[10px] uppercase">{d.day}</p>
                      <p className="text-lg font-bold">{d.dayNum}</p>
                      <p className="text-[10px]">{d.month}</p>
                    </button>
                  ))}
                </div>
              </div>
              {selectedDate && (
                <div>
                  <p className="text-sm text-gray-400 mb-3">Godzina</p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {timeSlots.map(slot => (
                      <button key={slot.time} type="button"
                        onClick={() => setSelectedTime(slot.time)}
                        className={`rounded-xl py-2 text-sm font-medium transition-all ${
                          selectedTime === slot.time ? 'bg-orange-500 text-white' : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white'
                        }`}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Step 2: Contact Info */}
          {step === 2 && (
            <motion.div key="contact" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h2 className="text-xl font-bold text-white mb-4">Twoje dane</h2>
              {[
                { label: 'Imię i nazwisko', key: 'name', icon: User, required: true },
                { label: 'Telefon', key: 'phone', icon: Phone, required: true },
                { label: 'Adres', key: 'address', icon: MapPin, required: false },
                { label: 'Miasto', key: 'city', icon: MapPin, required: false },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{field.label} {field.required && '*'}</label>
                  <div className="relative">
                    <field.icon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                      type="text"
                      required={field.required}
                      value={(form as Record<string, string>)[field.key]}
                      onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                      className="w-full rounded-xl border border-gray-700 bg-gray-800/50 py-3 pl-10 pr-4 text-sm text-white placeholder-gray-500 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Uwagi</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full rounded-xl border border-gray-700 bg-gray-800/50 py-3 px-4 text-sm text-white placeholder-gray-500 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  placeholder="Np. pojazd, rozmiar opon..."
                />
              </div>
            </motion.div>
          )}

          {/* Step 3: Confirmation */}
          {step === 3 && (
            <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-xl font-bold text-white mb-4">Podsumowanie</h2>
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 space-y-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1">Usługi</p>
                  {services.filter(s => selectedServices.includes(s.id)).map(s => (
                    <div key={s.id} className="flex justify-between text-sm py-1">
                      <span className="text-gray-300">{s.name}</span>
                      <span className="text-white font-medium">{Number(s.price)} zł</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm pt-2 mt-2 border-t border-gray-800 font-bold">
                    <span className="text-white">Razem</span>
                    <span className="text-orange-400">{totalPrice} zł</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div><p className="text-xs text-gray-500">Data</p><p className="text-sm text-white">{selectedDate}</p></div>
                  <div><p className="text-xs text-gray-500">Godzina</p><p className="text-sm text-white">{selectedTime}</p></div>
                  <div><p className="text-xs text-gray-500">Klient</p><p className="text-sm text-white">{form.name}</p></div>
                  <div><p className="text-xs text-gray-500">Telefon</p><p className="text-sm text-white">{form.phone}</p></div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            className={`flex items-center gap-2 text-sm font-medium transition-colors ${step === 0 ? 'text-gray-700' : 'text-gray-400 hover:text-white'}`}
            disabled={step === 0}
          >
            <ChevronLeft className="h-4 w-4" /> Wstecz
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-orange-600 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Dalej <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Rezerwuję...' : 'Zarezerwuj'} <Check className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
