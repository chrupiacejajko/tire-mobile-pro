'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MapPin, Clock, RefreshCw, CheckCircle2, ChevronRight, Car,
  Loader2, Wrench, Home as HomeIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrdersRealtime } from '@/hooks/use-orders-realtime';
import { AlertTriangle } from 'lucide-react';

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
  stats: {
    total: number;
    completed: number;
    remaining: number;
    progress_pct: number;
  };
  estimated_finish?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDatePL(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  return timeStr.slice(0, 5);
}

function getServiceNames(services: Task['services']): string[] {
  return services
    .map((s) => {
      if (typeof s === 'string') return s;
      return s?.name ?? '';
    })
    .filter(Boolean);
}

function getBufferColor(minutes: number | undefined): { dot: string; text: string } {
  if (minutes === undefined || minutes === null) return { dot: 'bg-gray-300', text: 'text-gray-400' };
  if (minutes === 0) return { dot: 'bg-red-500', text: 'text-red-600' };
  if (minutes <= 30) return { dot: 'bg-orange-500', text: 'text-orange-600' };
  if (minutes <= 60) return { dot: 'bg-yellow-500', text: 'text-yellow-600' };
  if (minutes <= 90) return { dot: 'bg-emerald-500', text: 'text-emerald-600' };
  return { dot: 'bg-gray-300', text: 'text-gray-400' };
}

// Left border color per status
function getLeftBorderColor(task: Task): string {
  if (task.task_type === 'return_base') return 'border-l-0 border-dashed border-gray-300';
  if (task.task_type === 'internal') return 'border-l-4 border-l-teal-500';
  if (task.status === 'in_transit') return 'border-l-4 border-l-orange-500';
  if (task.status === 'in_progress') return 'border-l-4 border-l-blue-500';
  if (task.status === 'completed' || task.status === 'cancelled') return 'border-l-4 border-l-emerald-500';
  return 'border-l-4 border-l-orange-400';
}

// ── Stagger animation ──────────────────────────────────────────────────────────

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
} as const;

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
} as const;

// ── Task Card ──────────────────────────────────────────────────────────────────

function TaskCard({ task, index, onPress }: { task: Task; index: number; onPress: () => void }) {
  const serviceNames = getServiceNames(task.services);
  const timeDisplay = task.scheduled_time_start
    ? formatTime(task.scheduled_time_start)
    : task.time_window ?? '';
  const bufferColor = getBufferColor(task.buffer_minutes);
  const isCompleted = task.status === 'completed' || task.status === 'cancelled';
  const isInternal = task.task_type === 'internal';
  const isReturn = task.task_type === 'return_base';
  const isInTransit = task.status === 'in_transit';

  return (
    <motion.button
      variants={cardVariants}
      whileTap={{ scale: 0.98 }}
      type="button"
      onClick={onPress}
      className={cn(
        'w-full text-left rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4 transition-colors relative',
        isCompleted && 'opacity-60',
        isReturn
          ? 'bg-white border-2 border-dashed border-gray-200'
          : cn('bg-white', getLeftBorderColor(task)),
        isInTransit && 'ring-2 ring-orange-200',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Sequence number */}
        <div className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
          isCompleted
            ? 'bg-emerald-100 text-emerald-600'
            : isReturn
              ? 'bg-gray-100 text-gray-500'
              : isInternal
                ? 'bg-teal-100 text-teal-700'
                : isInTransit
                  ? 'bg-orange-100 text-orange-600'
                  : task.status === 'in_progress'
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gray-900 text-white',
        )}>
          {isCompleted ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : isReturn ? (
            <HomeIcon className="w-4 h-4" />
          ) : isInternal ? (
            <Wrench className="w-4 h-4" />
          ) : isInTransit ? (
            <Car className="w-4 h-4 animate-pulse" />
          ) : (
            index
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              {timeDisplay && (
                <span className="text-sm font-bold text-gray-900">{timeDisplay}</span>
              )}
            </div>

            {/* Buffer indicator */}
            {task.buffer_minutes !== undefined && !isCompleted && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className={cn('w-1.5 h-1.5 rounded-full', bufferColor.dot)} />
                <span className={cn('text-[10px] font-medium', bufferColor.text)}>
                  {task.buffer_minutes} min
                </span>
              </div>
            )}
          </div>

          <p className={cn(
            'font-semibold text-gray-900 text-[15px] leading-tight',
            isReturn && 'text-gray-500',
          )}>
            {isReturn ? 'Powrot do bazy' : isInternal ? task.client_name || 'Zadanie wewnetrzne' : task.client_name}
          </p>

          <div className="flex items-start gap-1 text-sm text-gray-500 mt-1">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
            <span className="truncate">{task.address}</span>
          </div>

          {/* Service chips */}
          {serviceNames.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {serviceNames.slice(0, 3).map((name, i) => (
                <span
                  key={i}
                  className="inline-block bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-0.5 rounded-full"
                >
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

// ── Skeleton Card ──────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-[24px] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-200" />
        <div className="flex-1">
          <div className="flex gap-2 mb-2">
            <div className="h-4 w-12 bg-gray-200 rounded" />
            <div className="h-4 w-16 bg-gray-200 rounded-full" />
          </div>
          <div className="h-5 w-40 bg-gray-200 rounded mb-2" />
          <div className="h-4 w-52 bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function WorkerRoutePage() {
  const router = useRouter();
  const today = getTodayString();

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TasksResponse['stats'] | null>(null);
  const [estimatedFinish, setEstimatedFinish] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeBanner, setRealtimeBanner] = useState(false);

  useEffect(() => {
    async function fetchMe() {
      try {
        const res = await fetch('/api/worker/me');
        if (!res.ok) throw new Error('Nie mozna pobrac danych pracownika');
        const data = await res.json();
        setEmployeeId(data.employee_id);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Blad ladowania');
        setLoading(false);
      }
    }
    fetchMe();
  }, []);

  const fetchTasks = useCallback(
    async (showRefreshing = false) => {
      if (!employeeId) return;
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/worker/tasks?date=${today}&employee_id=${employeeId}`);
        if (!res.ok) throw new Error('Nie mozna pobrac trasy');
        const data: TasksResponse = await res.json();

        const sorted = [...(data.tasks ?? [])].sort((a, b) => {
          const ta = a.scheduled_time_start ?? '99:99';
          const tb = b.scheduled_time_start ?? '99:99';
          return ta.localeCompare(tb);
        });

        setTasks(sorted);
        setStats(data.stats ?? null);
        setEstimatedFinish(data.estimated_finish ?? null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Blad ladowania');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [employeeId, today],
  );

  useEffect(() => {
    if (employeeId) fetchTasks();
  }, [employeeId, fetchTasks]);

  // Supabase Realtime: auto-reload when orders change
  const handleOrderChange = useCallback(() => {
    setRealtimeBanner(true);
    fetchTasks(true);
    setTimeout(() => setRealtimeBanner(false), 5000);
  }, [fetchTasks]);

  useOrdersRealtime(handleOrderChange, !!employeeId && !loading);

  return (
    <div className="max-w-lg mx-auto p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 pt-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Trasa</h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">{formatDatePL(today)}</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={() => fetchTasks(true)}
          disabled={refreshing || loading}
          className="w-10 h-10 rounded-full bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex items-center justify-center disabled:opacity-50 transition-all"
        >
          <RefreshCw className={cn('w-4 h-4 text-gray-500', { 'animate-spin': refreshing })} />
        </motion.button>
      </div>

      {/* Stats summary — progress bar */}
      {stats && stats.total > 0 && !loading && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 mb-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold text-gray-700">
                {stats.completed}/{stats.total} zlecen
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">{stats.progress_pct}%</span>
              {estimatedFinish && (
                <span className="text-xs text-gray-400">
                  ~ {formatTime(estimatedFinish)}
                </span>
              )}
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
            <motion.div
              className="bg-orange-500 h-2.5 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${stats.progress_pct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </motion.div>
      )}

      {/* Realtime update banner */}
      <AnimatePresence>
        {realtimeBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-[24px] p-4 mb-4 text-sm text-amber-700"
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500" />
            <span className="font-medium">Plan zaktualizowany</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="rounded-[24px] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !error && (
        <div className="flex flex-col gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {/* Empty state */}
          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex items-center justify-center mb-4">
                <MapPin className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-base font-medium text-gray-500">Brak zadan na dzis</p>
              <p className="text-sm text-gray-400 mt-1">Trasa jest pusta</p>
            </div>
          )}

          {/* Task list */}
          {tasks.length > 0 && (
            <motion.div
              className="flex flex-col gap-3"
              variants={listVariants}
              initial="hidden"
              animate="show"
            >
              {tasks.map((task, i) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={i + 1}
                  onPress={() => router.push(`/worker/tasks/${task.id}`)}
                />
              ))}
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
