'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ClipboardList, Clock, Route as RouteIcon, Coffee,
  Loader2, CheckCircle2, Banknote, AlertCircle, ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DaySummary {
  date: string;
  shift_start: string | null;
  shift_end: string | null;
  total_hours: number | null;
  break_minutes: number;
  orders_total: number;
  orders_completed: number;
  orders_cancelled: number;
  total_km: number | null;
  total_revenue: number;
  closure_codes: Record<string, number>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatHours(hours: number | null): { h: number; m: number } {
  if (!hours) return { h: 0, m: 0 };
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return { h, m };
}

function formatDatePL(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatClosureCode(code: string): string {
  return code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const CLOSURE_DOT: Record<string, string> = {
  completed:            'bg-emerald-500',
  cancelled_client:     'bg-red-400',
  cancelled_weather:    'bg-blue-400',
  cancelled_no_parts:   'bg-amber-400',
  rescheduled:          'bg-violet-400',
  partial:              'bg-orange-400',
};
function closureDot(code: string) { return CLOSURE_DOT[code] ?? 'bg-gray-400'; }

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon, iconBg, iconColor, value, suffix, label,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  value: string;
  suffix?: string;
  label: string;
}) {
  return (
    <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-4">
      <div className={cn('w-9 h-9 rounded-2xl flex items-center justify-center mb-3', iconBg)}>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className="text-[22px] font-bold text-gray-900 tracking-tight leading-none">
        {value}
        {suffix && <span className="text-sm font-medium text-gray-400 ml-0.5">{suffix}</span>}
      </p>
      <p className="text-xs text-gray-400 mt-1 font-medium">{label}</p>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DaySummaryPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const dateParam    = searchParams.get('date') ?? new Date().toISOString().split('T')[0];

  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const meRes = await fetch('/api/worker/me');
        if (!meRes.ok) { setError('Nie można pobrać danych pracownika'); return; }
        const me = await meRes.json();

        const res = await fetch(`/api/worker/day-summary?date=${dateParam}&employee_id=${me.employee_id}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? 'Błąd ładowania podsumowania');
          return;
        }
        setSummary(await res.json());
      } catch {
        setError('Błąd połączenia');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dateParam]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-gray-300 animate-spin" />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="max-w-lg mx-auto p-5 pt-6">
        <motion.button
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={() => router.push('/worker')}
          className="w-10 h-10 rounded-2xl bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] flex items-center justify-center mb-5"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </motion.button>
        <div className="bg-red-50 border border-red-100 rounded-3xl p-5 text-sm text-red-700 font-medium">
          {error}
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const { h, m }         = formatHours(summary.total_hours);
  const closureEntries   = Object.entries(summary.closure_codes);
  const completionRate   = summary.orders_total > 0
    ? Math.round((summary.orders_completed / summary.orders_total) * 100)
    : 0;

  return (
    <div className="max-w-lg mx-auto px-5 pb-10 pt-5 space-y-4">

      {/* ── Back button ─────────────────────────────────────────────────────── */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        type="button"
        onClick={() => router.push('/worker')}
        className="w-10 h-10 rounded-2xl bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] flex items-center justify-center"
      >
        <ArrowLeft className="w-5 h-5 text-gray-700" />
      </motion.button>

      {/* ── Hero card — emerald gradient ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-3xl p-6"
        style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 60%, #34d399 100%)' }}
      >
        {/* Glow blob */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-10 -left-8 w-36 h-36 rounded-full bg-teal-300/20 blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-white/70" />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-widest">
              Podsumowanie dnia
            </span>
          </div>

          <p className="text-[36px] font-bold text-white tracking-tight leading-none mb-1">
            {summary.orders_completed}
            <span className="text-xl font-medium text-white/50">/{summary.orders_total}</span>
          </p>
          <p className="text-sm text-white/50 mb-5">Zleceń ukończonych</p>

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-white/20 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${completionRate}%` }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
              className="h-full rounded-full bg-white"
            />
          </div>
          <p className="text-xs text-white/40 mt-1.5">{completionRate}% ukończone</p>

          {/* Date */}
          <p className="text-sm text-white/40 mt-4 capitalize">
            {formatDatePL(summary.date)}
          </p>
        </div>
      </motion.div>

      {/* ── Stat grid ───────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="grid grid-cols-2 gap-3"
      >
        <StatCard
          icon={<Clock className="w-4.5 h-4.5" />}
          iconBg="bg-blue-50"
          iconColor="text-blue-500"
          value={`${h}h ${m}m`}
          label="Czas pracy"
        />
        <StatCard
          icon={<RouteIcon className="w-4.5 h-4.5" />}
          iconBg="bg-orange-50"
          iconColor="text-orange-500"
          value={summary.total_km !== null ? `${Math.round(summary.total_km)}` : '--'}
          suffix={summary.total_km !== null ? ' km' : undefined}
          label="Dystans"
        />
        <StatCard
          icon={<Coffee className="w-4.5 h-4.5" />}
          iconBg="bg-violet-50"
          iconColor="text-violet-500"
          value={`${summary.break_minutes}`}
          suffix=" min"
          label="Przerwy"
        />
        <StatCard
          icon={<ClipboardList className="w-4.5 h-4.5" />}
          iconBg="bg-gray-100"
          iconColor="text-gray-500"
          value={`${summary.orders_cancelled}`}
          label="Anulowane"
        />
      </motion.div>

      {/* ── Revenue card (conditional) ──────────────────────────────────────── */}
      {summary.total_revenue > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-5 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Banknote className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Przychód</p>
            <p className="text-[28px] font-bold text-gray-900 tracking-tight leading-none">
              {summary.total_revenue.toLocaleString('pl-PL', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              <span className="text-sm font-medium text-gray-400 ml-1.5">PLN</span>
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Closure code breakdown ──────────────────────────────────────────── */}
      {closureEntries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
        >
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 px-1">
            Kody zamknięcia
          </p>
          <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
            {closureEntries.map(([code, count], i) => (
              <div
                key={code}
                className={cn(
                  'flex items-center gap-3 px-5 py-4',
                  i < closureEntries.length - 1 && 'border-b border-gray-100/80',
                )}
              >
                <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', closureDot(code))} />
                <span className="flex-1 text-sm text-gray-700 font-medium">
                  {formatClosureCode(code)}
                </span>
                <span className="text-sm font-bold text-gray-900 tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Done button ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2 }}
        className="pt-2"
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/worker')}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white rounded-2xl py-4 text-base font-semibold transition-colors active:bg-gray-800"
          style={{ minHeight: 56 }}
        >
          <CheckCircle2 className="w-5 h-5" />
          Zakończ dzień
        </motion.button>
      </motion.div>

    </div>
  );
}
