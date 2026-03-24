'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play, Coffee, RotateCcw, Square, MapPin, ChevronRight,
  Clock, CheckCircle, Loader2, AlertCircle, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type WorkStatus = 'off_work' | 'on_work' | 'break';

interface WorkerMe {
  employee_id: string;
  full_name: string;
  work_status: WorkStatus;
  account_status: string;
  shift_today: {
    scheduled: boolean;
    start_time: string | null;
    end_time: string | null;
    vehicle_plate: string | null;
  };
  current_shift: {
    clock_in: string | null;
    clock_out: string | null;
    break_minutes: number;
    on_break: boolean;
  };
  vehicle: { plate_number: string | null; brand: string | null; model: string | null } | null;
}

interface Task {
  id: string;
  status: string;
  client_name: string;
  address: string;
  scheduled_time_start: string | null;
  time_window: string | null;
  services: { name: string }[];
  distance_km: number | null;
  navigate_url: string | null;
}

interface TaskStats {
  total: number;
  completed: number;
  remaining: number;
  progress_pct: number;
}

const STATUS_CONFIG: Record<WorkStatus, {
  label: string;
  dot: string;
  bg: string;
  text: string;
}> = {
  off_work: { label: 'Poza zmianą',  dot: 'bg-gray-400',    bg: 'bg-gray-100',    text: 'text-gray-600' },
  on_work:  { label: 'W pracy',      dot: 'bg-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  break:    { label: 'Na przerwie',  dot: 'bg-amber-500',   bg: 'bg-amber-100',   text: 'text-amber-700' },
};

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function elapsedSince(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

export default function WorkerTodayPage() {
  const router = useRouter();
  const [me, setMe] = useState<WorkerMe | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [nextTask, setNextTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    try {
      const meRes = await fetch('/api/worker/me');
      if (!meRes.ok) return;
      const meData: WorkerMe = await meRes.json();
      setMe(meData);

      const tasksRes = await fetch(`/api/worker/tasks?date=${today}&employee_id=${meData.employee_id}`);
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setTasks(tasksData.tasks ?? []);
        setStats(tasksData.stats ?? null);
        const nextId = tasksData.next_task_id;
        if (nextId) {
          setNextTask((tasksData.tasks ?? []).find((t: Task) => t.id === nextId) ?? null);
        } else {
          setNextTask(null);
        }
      }
    } catch {
      setError('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    loadData();
    // Refresh every 2 minutes
    const interval = setInterval(loadData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function performAction(endpoint: string, label: string) {
    setActionLoading(label);
    setError(null);
    try {
      const pos = await new Promise<GeolocationPosition | null>(resolve => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 5000 });
      });

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: pos?.coords.latitude ?? null,
          lng: pos?.coords.longitude ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Wystąpił błąd');
        return;
      }
      // Refresh data after state change
      await loadData();
    } catch {
      setError('Błąd połączenia');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!me) return null;

  const statusConfig = STATUS_CONFIG[me.work_status];

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="pt-2">
        <p className="text-sm text-gray-500">
          {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mt-0.5">
          Cześć, {me.full_name.split(' ')[0]} 👋
        </h1>
      </div>

      {/* Status card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className={cn('flex items-center gap-2 px-3 py-1 rounded-full', statusConfig.bg)}>
            <span className={cn('w-2 h-2 rounded-full', statusConfig.dot)} />
            <span className={cn('text-sm font-medium', statusConfig.text)}>{statusConfig.label}</span>
          </div>
          <button onClick={loadData} className="p-1.5 text-gray-400 hover:text-gray-600">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Shift info */}
        {me.shift_today.scheduled && (
          <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{me.shift_today.start_time} – {me.shift_today.end_time}</span>
            </div>
            {me.shift_today.vehicle_plate && (
              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">
                {me.shift_today.vehicle_plate}
              </span>
            )}
          </div>
        )}

        {/* Clock-in info */}
        {me.current_shift.clock_in && (
          <div className="text-xs text-gray-500">
            Zmiana od {formatTime(me.current_shift.clock_in)}
            {' · '}{elapsedSince(me.current_shift.clock_in)}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          {me.work_status === 'off_work' && (
            <ActionButton
              onClick={() => performAction('/api/worker/shift/start', 'start')}
              loading={actionLoading === 'start'}
              icon={<Play className="w-4 h-4" />}
              label="Zacznij zmianę"
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
            />
          )}
          {me.work_status === 'on_work' && (
            <>
              <ActionButton
                onClick={() => performAction('/api/worker/shift/break/start', 'break')}
                loading={actionLoading === 'break'}
                icon={<Coffee className="w-4 h-4" />}
                label="Przerwa"
                className="bg-amber-500 hover:bg-amber-600 text-white flex-1"
              />
              <ActionButton
                onClick={() => performAction('/api/worker/shift/end', 'end')}
                loading={actionLoading === 'end'}
                icon={<Square className="w-4 h-4" />}
                label="Zakończ"
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 flex-1"
              />
            </>
          )}
          {me.work_status === 'break' && (
            <>
              <ActionButton
                onClick={() => performAction('/api/worker/shift/break/end', 'resume')}
                loading={actionLoading === 'resume'}
                icon={<RotateCcw className="w-4 h-4" />}
                label="Wróć z przerwy"
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
              />
              <ActionButton
                onClick={() => performAction('/api/worker/shift/end', 'end')}
                loading={actionLoading === 'end'}
                icon={<Square className="w-4 h-4" />}
                label="Zakończ zmianę"
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 flex-1"
              />
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Progress */}
      {stats && stats.total > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Postęp dnia</span>
            <span className="text-sm text-gray-500">{stats.completed}/{stats.total} zleceń</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${stats.progress_pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-gray-400">
            <span>{stats.completed} ukończonych</span>
            <span>{stats.remaining} pozostałych</span>
          </div>
        </div>
      )}

      {/* Next task */}
      {nextTask && (
        <div
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:border-gray-200 active:bg-gray-50 transition-colors"
          onClick={() => router.push(`/worker/tasks/${nextTask.id}`)}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Następne zlecenie</span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </div>
          <p className="font-semibold text-gray-900">{nextTask.client_name}</p>
          <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{nextTask.address}</span>
          </div>
          {(nextTask.scheduled_time_start || nextTask.distance_km) && (
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              {nextTask.scheduled_time_start && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {nextTask.scheduled_time_start}
                </span>
              )}
              {nextTask.distance_km != null && (
                <span>{nextTask.distance_km} km</span>
              )}
            </div>
          )}
          {nextTask.navigate_url && (
            <a
              href={nextTask.navigate_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-2 rounded-xl text-sm font-medium"
            >
              <MapPin className="w-4 h-4" />
              Nawiguj
            </a>
          )}
        </div>
      )}

      {/* No tasks today */}
      {stats?.total === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <CheckCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Brak zleceń na dziś</p>
        </div>
      )}

      {/* All done */}
      {stats && stats.total > 0 && stats.remaining === 0 && (
        <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="font-medium text-emerald-700">Wszystkie zlecenia ukończone!</p>
          <p className="text-sm text-emerald-600 mt-0.5">Świetna robota 🎉</p>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  onClick, loading, icon, label, className,
}: {
  onClick: () => void;
  loading: boolean;
  icon: React.ReactNode;
  label: string;
  className: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-colors disabled:opacity-50',
        className
      )}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}
