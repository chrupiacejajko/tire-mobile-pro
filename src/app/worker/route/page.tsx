'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MapPin, RefreshCw, CheckCircle2, ChevronRight, Car,
  Loader2, Wrench, Home as HomeIcon, AlertTriangle, Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrdersRealtime } from '@/hooks/use-orders-realtime';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  status: string;
  scheduled_time_start: string | null;
  scheduled_time_end: string | null;
  time_window: string | null;
  client_name: string;
  address: string;
  distance_km: number | null;
  services: Array<{ name?: string; service_id?: string } | string>;
  task_type?: string;
  buffer_minutes?: number;
}

interface TasksResponse {
  tasks: Task[];
  stats: { total: number; completed: number; remaining: number; progress_pct: number };
  estimated_finish?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTodayString() { return new Date().toISOString().split('T')[0]; }

function formatDatePL(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(t: string | null) { return t ? t.slice(0, 5) : ''; }

function getServiceNames(services: Task['services']): string[] {
  return services.map(s => typeof s === 'string' ? s : s?.name ?? '').filter(Boolean);
}

// ── Status config ──────────────────────────────────────────────────────────────

function getStatusConfig(task: Task) {
  const { status, task_type } = task;
  const isReturn   = task_type === 'return_base';
  const isInternal = task_type === 'internal';

  if (status === 'completed' || status === 'cancelled') {
    return {
      iconBg: 'bg-emerald-50',
      iconEl: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
      dotColor: 'bg-emerald-400',
      dimmed: true,
    };
  }
  if (isReturn) return {
    iconBg: 'bg-gray-100',
    iconEl: <HomeIcon className="w-4 h-4 text-gray-400" />,
    dotColor: 'bg-gray-300',
    dimmed: false,
  };
  if (isInternal) return {
    iconBg: 'bg-teal-50',
    iconEl: <Package className="w-4 h-4 text-teal-500" />,
    dotColor: 'bg-teal-400',
    dimmed: false,
  };
  if (status === 'in_transit') return {
    iconBg: 'bg-orange-50',
    iconEl: <Car className="w-4 h-4 text-orange-500 animate-pulse" />,
    dotColor: 'bg-orange-400',
    dimmed: false,
  };
  if (status === 'in_progress') return {
    iconBg: 'bg-blue-50',
    iconEl: <Wrench className="w-4 h-4 text-blue-500" />,
    dotColor: 'bg-blue-400',
    dimmed: false,
  };
  // default: assigned
  return {
    iconBg: 'bg-gray-900',
    iconEl: null,
    dotColor: 'bg-orange-400',
    dimmed: false,
  };
}

// Buffer badge color
function bufferBadge(minutes?: number) {
  if (minutes === undefined || minutes === null) return null;
  if (minutes === 0) return { bg: 'bg-red-100', text: 'text-red-600', label: 'Na czas' };
  if (minutes <= 30) return { bg: 'bg-orange-100', text: 'text-orange-600', label: `+${minutes} min` };
  if (minutes <= 60) return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: `+${minutes} min` };
  if (minutes <= 90) return { bg: 'bg-emerald-100', text: 'text-emerald-700', label: `+${minutes} min` };
  return { bg: 'bg-gray-100', text: 'text-gray-500', label: `+${minutes} min` };
}

// ── Task Card ──────────────────────────────────────────────────────────────────

function TaskCard({ task, index, onPress, isActive }: {
  task: Task;
  index: number;
  onPress: () => void;
  isActive: boolean;
}) {
  const serviceNames = getServiceNames(task.services);
  const sc = getStatusConfig(task);
  const bf = bufferBadge(task.buffer_minutes);
  const isReturn = task.task_type === 'return_base';
  const timeDisplay = task.scheduled_time_start ? formatTime(task.scheduled_time_start) : task.time_window ?? '';

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      type="button"
      onClick={onPress}
      className={cn(
        'w-full text-left bg-white rounded-3xl p-4 shadow-[0_2px_16px_rgba(0,0,0,0.06)] transition-all relative overflow-hidden',
        sc.dimmed && 'opacity-55',
        isActive && 'ring-2 ring-orange-400 ring-offset-2 ring-offset-[#F5F5F7]',
      )}
    >
      {/* Active glow bar */}
      {isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500 rounded-l-3xl" />
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn(
          'w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-sm font-bold',
          sc.iconBg,
        )}>
          {sc.iconEl ?? (
            <span className="text-white text-sm font-bold">{index}</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-2">
              {timeDisplay && (
                <span className="text-sm font-bold text-gray-900">{timeDisplay}</span>
              )}
              {bf && (
                <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', bf.bg, bf.text)}>
                  {bf.label}
                </span>
              )}
            </div>
            {task.distance_km !== null && task.distance_km !== undefined && !sc.dimmed && (
              <span className="text-[11px] text-gray-400 font-medium flex-shrink-0">{task.distance_km} km</span>
            )}
          </div>

          <p className={cn(
            'font-bold text-[15px] text-gray-900 leading-tight',
            isReturn && 'text-gray-500',
          )}>
            {isReturn
              ? 'Powrót do bazy'
              : task.task_type === 'internal'
                ? task.client_name || 'Zadanie wewnętrzne'
                : task.client_name}
          </p>

          <div className="flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3 text-gray-300 flex-shrink-0" />
            <span className="text-xs text-gray-400 truncate">{task.address}</span>
          </div>

          {serviceNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {serviceNames.slice(0, 3).map((name, i) => (
                <span key={i} className="bg-gray-100 text-gray-500 text-[10px] font-medium px-2.5 py-1 rounded-full">
                  {name}
                </span>
              ))}
              {serviceNames.length > 3 && (
                <span className="text-[10px] text-gray-400 self-center">+{serviceNames.length - 3}</span>
              )}
            </div>
          )}
        </div>

        <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
      </div>
    </motion.button>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-3xl bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gray-100 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <div className="h-3.5 w-10 bg-gray-100 rounded-full" />
            <div className="h-3.5 w-16 bg-gray-100 rounded-full" />
          </div>
          <div className="h-4 w-36 bg-gray-100 rounded-full" />
          <div className="h-3 w-48 bg-gray-100 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function WorkerRoutePage() {
  const router = useRouter();
  const today  = getTodayString();

  const [employeeId, setEmployeeId]   = useState<string | null>(null);
  const [tasks, setTasks]             = useState<Task[]>([]);
  const [stats, setStats]             = useState<TasksResponse['stats'] | null>(null);
  const [estimatedFinish, setEstimatedFinish] = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [realtimeBanner, setRealtimeBanner] = useState(false);

  useEffect(() => {
    fetch('/api/worker/me')
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => setEmployeeId(data.employee_id))
      .catch(() => { setLoading(false); });
  }, []);

  const fetchTasks = useCallback(async (showRefreshing = false) => {
    if (!employeeId) return;
    showRefreshing ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/worker/tasks?date=${today}&employee_id=${employeeId}`);
      if (!res.ok) throw new Error('Nie można pobrać trasy');
      const data: TasksResponse = await res.json();
      const sorted = [...(data.tasks ?? [])].sort((a, b) =>
        (a.scheduled_time_start ?? '99:99').localeCompare(b.scheduled_time_start ?? '99:99'),
      );
      setTasks(sorted);
      setStats(data.stats ?? null);
      setEstimatedFinish(data.estimated_finish ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd ładowania');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employeeId, today]);

  useEffect(() => { if (employeeId) fetchTasks(); }, [employeeId, fetchTasks]);

  const handleOrderChange = useCallback(() => {
    setRealtimeBanner(true);
    fetchTasks(true);
    setTimeout(() => setRealtimeBanner(false), 5000);
  }, [fetchTasks]);

  useOrdersRealtime(handleOrderChange, !!employeeId && !loading);

  // Find the "active" task (in_transit or in_progress)
  const activeTask = tasks.find(t => t.status === 'in_transit' || t.status === 'in_progress');

  return (
    <div className="max-w-lg mx-auto px-5">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between pt-5 mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Trasa</h1>
          <p className="text-xs font-medium text-gray-400 mt-0.5 capitalize">{formatDatePL(today)}</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={() => fetchTasks(true)}
          disabled={refreshing || loading}
          className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4 text-gray-400', refreshing && 'animate-spin')} />
        </motion.button>
      </div>

      {/* ── Progress strip ────────────────────────────────────────────────── */}
      {stats && stats.total > 0 && !loading && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-4 mb-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <span className="text-sm font-bold text-gray-900">
                {stats.completed}/{stats.total} zleceń
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">{stats.progress_pct}%</span>
              {estimatedFinish && (
                <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2.5 py-1">
                  ~{formatTime(estimatedFinish)}
                </span>
              )}
            </div>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-orange-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${stats.progress_pct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </motion.div>
      )}

      {/* ── Realtime banner ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {realtimeBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4"
          >
            <div className="w-7 h-7 rounded-xl bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <span className="text-sm font-semibold text-amber-800">Plan zaktualizowany</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Skeleton ──────────────────────────────────────────────────────── */}
      {loading && !error && (
        <div className="space-y-3">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      )}

      {/* ── Task list ─────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <>
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-3xl bg-white shadow-sm flex items-center justify-center mb-4">
                <MapPin className="w-8 h-8 text-gray-200" />
              </div>
              <p className="font-semibold text-gray-500">Brak zadań na dziś</p>
              <p className="text-sm text-gray-400 mt-1">Trasa jest pusta</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {tasks.map((task, i) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={i + 1}
                  isActive={task === activeTask}
                  onPress={() => router.push(`/worker/tasks/${task.id}`)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
