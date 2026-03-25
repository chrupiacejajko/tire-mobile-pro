'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Clock, RefreshCw, CheckCircle2, ChevronRight, Car } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

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
}

interface TasksResponse {
  tasks: Task[];
  stats: {
    total: number;
    completed: number;
    remaining: number;
    progress_pct: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  // timeStr may be "HH:MM:SS" or "HH:MM"
  return timeStr.slice(0, 5);
}

function getServiceNames(services: Task['services']): string {
  return services
    .map((s) => {
      if (typeof s === 'string') return s;
      return s?.name ?? '';
    })
    .filter(Boolean)
    .join(', ');
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  new: 'Nowe',
  assigned: 'Przypisane',
  in_transit: 'W drodze',
  in_progress: 'W trakcie',
  completed: 'Ukończone',
  cancelled: 'Anulowane',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        {
          'bg-gray-100 text-gray-700': status === 'new' || status === 'assigned',
          'bg-orange-100 text-orange-700 animate-pulse': status === 'in_transit',
          'bg-blue-100 text-blue-700': status === 'in_progress',
          'bg-green-100 text-green-700': status === 'completed',
          'bg-red-100 text-red-700': status === 'cancelled',
        },
      )}
    >
      {status === 'in_transit' && <Car className="w-3 h-3 mr-1" />}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-4 w-16 bg-gray-200 rounded-full" />
        <div className="h-4 w-20 bg-gray-200 rounded-full" />
      </div>
      <div className="h-5 w-40 bg-gray-200 rounded mb-2" />
      <div className="h-4 w-52 bg-gray-200 rounded mb-1" />
      <div className="h-4 w-32 bg-gray-200 rounded" />
    </div>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, index, onPress }: { task: Task; index: number; onPress: () => void }) {
  const serviceNames = getServiceNames(task.services);
  const timeDisplay = task.scheduled_time_start
    ? formatTime(task.scheduled_time_start)
    : task.time_window ?? '';

  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        'w-full text-left rounded-xl shadow-sm p-4 active:bg-gray-50 transition-colors',
        task.status === 'in_transit'
          ? 'bg-orange-50 border-2 border-orange-300'
          : 'bg-white border border-gray-100',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
            {index}
          </span>
          <StatusBadge status={task.status} />
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
      </div>

      <p className="font-semibold text-gray-900 text-base leading-tight mb-2">
        {task.client_name}
      </p>

      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-1.5 text-sm text-gray-600">
          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
          <span className="leading-snug">{task.address}</span>
        </div>

        {timeDisplay && (
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span>{timeDisplay}</span>
            {task.distance_km !== null && (
              <span className="ml-auto text-xs text-gray-400">{task.distance_km} km</span>
            )}
          </div>
        )}

        {!timeDisplay && task.distance_km !== null && (
          <p className="text-xs text-gray-400 text-right">{task.distance_km} km</p>
        )}

        {serviceNames && (
          <p className="text-xs text-gray-400 leading-snug mt-0.5">{serviceNames}</p>
        )}
      </div>
    </button>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: TasksResponse['stats'] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span className="text-sm font-medium text-gray-700">
            {stats.completed}/{stats.total} ukończonych
          </span>
        </div>
        <span className="text-sm font-semibold text-gray-900">{stats.progress_pct}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className="bg-green-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${stats.progress_pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WorkerRoutePage() {
  const router = useRouter();
  const today = getTodayString();

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TasksResponse['stats'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch employee ID ──────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchMe() {
      try {
        const res = await fetch('/api/worker/me');
        if (!res.ok) throw new Error('Nie można pobrać danych pracownika');
        const data = await res.json();
        setEmployeeId(data.employee_id);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Błąd ładowania');
        setLoading(false);
      }
    }
    fetchMe();
  }, []);

  // ── Fetch tasks ────────────────────────────────────────────────────────────

  const fetchTasks = useCallback(
    async (showRefreshing = false) => {
      if (!employeeId) return;
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/worker/tasks?date=${today}&employee_id=${employeeId}`,
        );
        if (!res.ok) throw new Error('Nie można pobrać trasy');
        const data: TasksResponse = await res.json();

        // Sort by scheduled_time_start ascending (API should already sort, but enforce)
        const sorted = [...(data.tasks ?? [])].sort((a, b) => {
          const ta = a.scheduled_time_start ?? '99:99';
          const tb = b.scheduled_time_start ?? '99:99';
          return ta.localeCompare(tb);
        });

        setTasks(sorted);
        setStats(data.stats ?? null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Błąd ładowania');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [employeeId, today],
  );

  useEffect(() => {
    if (employeeId) {
      fetchTasks();
    }
  }, [employeeId, fetchTasks]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Trasa</h1>
            <p className="text-sm text-gray-500 mt-0.5 capitalize">{formatDatePL(today)}</p>
          </div>
          <button
            type="button"
            onClick={() => fetchTasks(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm active:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', { 'animate-spin': refreshing })} />
            Odśwież
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 mb-4 text-sm text-red-700">
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
            {/* Stats bar */}
            {stats && stats.total > 0 && <StatsBar stats={stats} />}

            {/* Empty state */}
            {tasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <MapPin className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-base font-medium text-gray-500">Brak zadań na dziś</p>
                <p className="text-sm text-gray-400 mt-1">Trasa jest pusta</p>
              </div>
            )}

            {/* Task list */}
            {tasks.length > 0 && (
              <div className="flex flex-col gap-3">
                {tasks.map((task, i) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    index={i + 1}
                    onPress={() => router.push(`/worker/tasks/${task.id}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
