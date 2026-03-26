'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ClipboardList, Clock, Route as RouteIcon, Coffee,
  Loader2, CheckCircle, DollarSign, AlertCircle,
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

// ── Closure code color map ─────────────────────────────────────────────────────

const CLOSURE_COLORS: Record<string, string> = {
  completed: 'bg-emerald-500',
  cancelled_client: 'bg-red-400',
  cancelled_weather: 'bg-blue-400',
  cancelled_no_parts: 'bg-amber-400',
  rescheduled: 'bg-purple-400',
  partial: 'bg-orange-400',
};

function getClosureColor(code: string): string {
  return CLOSURE_COLORS[code] ?? 'bg-gray-400';
}

function formatClosureCode(code: string): string {
  return code
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ── Stagger animation variants ─────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatHours(hours: number | null): { h: number; m: number } {
  if (hours === null || hours === undefined) return { h: 0, m: 0 };
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

// ── Stat Tile ─────────────────────────────────────────────────────────────────

function StatTile({
  icon,
  iconBg,
  tileBg,
  value,
  suffix,
  label,
}: {
  icon: React.ReactNode;
  iconBg: string;
  tileBg: string;
  value: string;
  suffix?: string;
  label: string;
}) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className={cn('rounded-2xl p-4', tileBg)}
    >
      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center mb-2', iconBg)}>
        {icon}
      </div>
      <p className="text-xl font-bold text-gray-900 tracking-tight">
        {value}
        {suffix && <span className="text-sm font-medium text-gray-500">{suffix}</span>}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DaySummaryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date') ?? new Date().toISOString().split('T')[0];

  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const meRes = await fetch('/api/worker/me');
        if (!meRes.ok) {
          setError('Nie mozna pobrac danych pracownika');
          return;
        }
        const me = await meRes.json();

        const res = await fetch(
          `/api/worker/day-summary?date=${dateParam}&employee_id=${me.employee_id}`,
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? 'Blad ladowania podsumowania');
          return;
        }
        const data: DaySummary = await res.json();
        setSummary(data);
      } catch {
        setError('Blad polaczenia');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dateParam]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        <div className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={() => router.push('/worker')}
            className="mt-4 text-sm text-orange-600 font-medium"
          >
            Wroc do strony glownej
          </button>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const { h, m } = formatHours(summary.total_hours);
  const closureEntries = Object.entries(summary.closure_codes);

  return (
    <motion.div
      className="p-4 space-y-4 max-w-lg mx-auto"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="pt-2 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="w-7 h-7 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          Podsumowanie dnia
        </h1>
        <p className="text-sm text-gray-500 mt-1 capitalize">
          {formatDatePL(summary.date)}
        </p>
      </motion.div>

      {/* Pastel stat tiles — 2x2 grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3">
        <StatTile
          icon={<ClipboardList className="w-4 h-4 text-orange-600" />}
          iconBg="bg-orange-100"
          tileBg="bg-[#FFE8D6]"
          value={`${summary.orders_completed}/${summary.orders_total}`}
          label="Zlecenia"
        />
        <StatTile
          icon={<Clock className="w-4 h-4 text-blue-600" />}
          iconBg="bg-blue-100"
          tileBg="bg-[#D6EAF8]"
          value={`${h}h ${m}min`}
          label="Czas pracy"
        />
        <StatTile
          icon={<RouteIcon className="w-4 h-4 text-emerald-600" />}
          iconBg="bg-emerald-100"
          tileBg="bg-[#D4F0E7]"
          value={summary.total_km !== null ? `${Math.round(summary.total_km)}` : '--'}
          suffix={summary.total_km !== null ? ' km' : undefined}
          label="Dystans"
        />
        <StatTile
          icon={<Coffee className="w-4 h-4 text-purple-600" />}
          iconBg="bg-purple-100"
          tileBg="bg-[#E8E0F0]"
          value={`${summary.break_minutes}`}
          suffix=" min"
          label="Przerwy"
        />
      </motion.div>

      {/* Revenue card */}
      {summary.total_revenue > 0 && (
        <motion.div
          variants={itemVariants}
          className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 text-center"
        >
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <DollarSign className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-3xl font-bold text-gray-900 tracking-tight">
            {summary.total_revenue.toLocaleString('pl-PL', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            <span className="text-base font-medium text-gray-500">PLN</span>
          </p>
          <p className="text-sm text-gray-500 mt-1">Przychod</p>
        </motion.div>
      )}

      {/* Closure codes breakdown */}
      {closureEntries.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Kody zamkniecia</h2>
          <div className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
            {closureEntries.map(([code, count], i) => (
              <div
                key={code}
                className={cn(
                  'flex items-center gap-3 p-4',
                  i < closureEntries.length - 1 && 'border-b border-gray-100',
                )}
              >
                <span className={cn('w-3 h-3 rounded-full flex-shrink-0', getClosureColor(code))} />
                <span className="flex-1 text-sm text-gray-700">{formatClosureCode(code)}</span>
                <span className="text-sm font-bold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Cancelled orders note */}
      {summary.orders_cancelled > 0 && (
        <motion.div
          variants={itemVariants}
          className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4 flex items-center gap-3"
        >
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-gray-600">
            Anulowane zlecenia: <span className="font-bold">{summary.orders_cancelled}</span>
          </p>
        </motion.div>
      )}

      {/* Done button */}
      <motion.div variants={itemVariants} className="pb-6">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/worker')}
          className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full py-4 text-base font-semibold transition-all"
          style={{ minHeight: 56 }}
        >
          <CheckCircle className="w-5 h-5" />
          Gotowe
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
