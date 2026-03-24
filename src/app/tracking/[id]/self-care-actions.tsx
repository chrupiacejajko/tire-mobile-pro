'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface SelfCareActionsProps {
  orderId: string;
  orderStatus: string;
}

const TIME_WINDOWS = [
  { key: 'morning', label: 'Rano 8-12' },
  { key: 'afternoon', label: 'Popołudnie 12-16' },
  { key: 'evening', label: 'Wieczór 16-20' },
];

const TIME_WINDOW_LABELS: Record<string, string> = {
  morning: 'Rano (8:00-12:00)',
  afternoon: 'Popołudnie (12:00-16:00)',
  evening: 'Wieczór (16:00-20:00)',
};

function generateDates(): { date: string; label: string; dayOfWeek: number }[] {
  const dates: { date: string; label: string; dayOfWeek: number }[] = [];
  const today = new Date();
  for (let i = 1; i <= 21 && dates.length < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 0) continue; // skip Sundays
    dates.push({
      date: d.toISOString().split('T')[0],
      label: d.toLocaleDateString('pl-PL', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
      dayOfWeek: d.getDay(),
    });
  }
  return dates;
}

function formatDatePL(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('pl-PL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return dateStr;
  }
}

export function SelfCareActions({ orderId, orderStatus }: SelfCareActionsProps) {
  const router = useRouter();
  const [showReschedule, setShowReschedule] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedWindow, setSelectedWindow] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const dates = useMemo(() => generateDates(), []);

  const canReschedule = orderStatus === 'new' || orderStatus === 'assigned';
  const canCancel =
    orderStatus !== 'completed' &&
    orderStatus !== 'cancelled' &&
    orderStatus !== 'in_progress';

  if (!canReschedule && !canCancel) return null;

  const handleReschedule = async () => {
    if (!selectedDate || !selectedWindow) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/orders/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          new_date: selectedDate,
          new_time_window: selectedWindow,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Wystąpił błąd.' });
      } else {
        const windowLabel = TIME_WINDOW_LABELS[selectedWindow] || selectedWindow;
        const dateLabel = formatDatePL(selectedDate);
        setMessage({
          type: 'success',
          text: `Termin został zmieniony na ${dateLabel}, ${windowLabel}`,
        });
        setShowReschedule(false);
        setSelectedDate('');
        setSelectedWindow('');
        setTimeout(() => router.refresh(), 1500);
      }
    } catch {
      setMessage({ type: 'error', text: 'Błąd połączenia z serwerem.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          reason: cancelReason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Wystąpił błąd.' });
      } else {
        setMessage({ type: 'success', text: 'Wizyta została anulowana.' });
        setShowCancel(false);
        setCancelReason('');
        setTimeout(() => router.refresh(), 1500);
      }
    } catch {
      setMessage({ type: 'error', text: 'Błąd połączenia z serwerem.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Success/Error message */}
      {message && (
        <div
          className={`rounded-xl p-4 text-center text-sm font-medium ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-100'
              : 'bg-red-50 text-red-700 border border-red-100'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Action buttons */}
      {!showReschedule && !showCancel && (
        <div className="flex gap-3">
          {canReschedule && (
            <button
              onClick={() => { setShowReschedule(true); setShowCancel(false); setMessage(null); }}
              className="flex-1 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-600 hover:bg-orange-100 transition-colors"
            >
              Zmień termin
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => { setShowCancel(true); setShowReschedule(false); setMessage(null); }}
              className="flex-1 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              Anuluj wizytę
            </button>
          )}
        </div>
      )}

      {/* Reschedule UI */}
      {showReschedule && (
        <div className="rounded-2xl border border-orange-100 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Wybierz nowy termin</h3>
            <button
              onClick={() => { setShowReschedule(false); setSelectedDate(''); setSelectedWindow(''); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Anuluj
            </button>
          </div>

          {/* Calendar grid */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
              Data
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {dates.map((d) => (
                <button
                  key={d.date}
                  onClick={() => setSelectedDate(d.date)}
                  className={`rounded-xl px-2 py-2.5 text-xs font-medium transition-colors ${
                    selectedDate === d.date
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-50 text-gray-700 hover:bg-orange-50'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time windows */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
              Pora dnia
            </p>
            <div className="grid grid-cols-3 gap-2">
              {TIME_WINDOWS.map((tw) => (
                <button
                  key={tw.key}
                  onClick={() => setSelectedWindow(tw.key)}
                  className={`rounded-xl px-3 py-2.5 text-xs font-medium transition-colors ${
                    selectedWindow === tw.key
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-50 text-gray-700 hover:bg-orange-50'
                  }`}
                >
                  {tw.label}
                </button>
              ))}
            </div>
          </div>

          {/* Confirm */}
          <button
            onClick={handleReschedule}
            disabled={!selectedDate || !selectedWindow || submitting}
            className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Zapisywanie...' : 'Zapisz nowy termin'}
          </button>
        </div>
      )}

      {/* Cancel UI */}
      {showCancel && (
        <div className="rounded-2xl border border-red-100 bg-white p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-900 text-center">
            Czy na pewno chcesz anulować wizytę?
          </p>
          <p className="text-xs text-gray-500 text-center">
            Ta operacja jest nieodwracalna.
          </p>

          {/* Optional reason */}
          <div>
            <label htmlFor="cancel-reason" className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">
              Powód anulacji (opcjonalnie)
            </label>
            <textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Podaj powód anulacji..."
              rows={2}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-red-300 focus:ring-1 focus:ring-red-200 focus:outline-none resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setShowCancel(false); setCancelReason(''); }}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Nie, zostaw
            </button>
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="flex-1 rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Anulowanie...' : 'Tak, anuluj'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
