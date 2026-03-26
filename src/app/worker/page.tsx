'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play, Coffee, Square, MapPin, ChevronRight,
  Clock, CheckCircle, Loader2, AlertCircle, RefreshCw,
  Navigation, AlertTriangle, Wrench, Car, ClipboardList,
  Timer, Route as RouteIcon, Gauge, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ──────────────────────────────────────────────────────────────────────

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
  region?: { name: string } | null;
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function elapsedParts(iso: string | null): { h: string; m: string } {
  if (!iso) return { h: '0', m: '00' };
  const diffMs = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  return { h: String(h), m: String(m).padStart(2, '0') };
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Dzień dobry';
  if (h < 18) return 'Cześć';
  return 'Dobry wieczór';
}

// ── Progress ring ──────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 56, stroke = 4 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="white" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        className="transition-all duration-700 ease-out"
      />
    </svg>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function WorkerTodayPage() {
  const router = useRouter();
  const [me, setMe]         = useState<WorkerMe | null>(null);
  const [tasks, setTasks]   = useState<Task[]>([]);
  const [stats, setStats]   = useState<TaskStats | null>(null);
  const [nextTask, setNextTask] = useState<Task | null>(null);
  const [loading, setLoading]   = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [planChanged, setPlanChanged] = useState(false);
  const [elapsed, setElapsed] = useState({ h: '0', m: '00' });

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
        setPlanChanged(tasksData.plan_changed ?? false);
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
    const interval = setInterval(loadData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    if (!me?.current_shift.clock_in) { setElapsed({ h: '0', m: '00' }); return; }
    const update = () => setElapsed(elapsedParts(me.current_shift.clock_in));
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [me?.current_shift.clock_in]);

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
        body: JSON.stringify({ lat: pos?.coords.latitude ?? null, lng: pos?.coords.longitude ?? null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Wystąpił błąd'); return; }
      await loadData();
    } catch {
      setError('Błąd połączenia');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!me) return null;

  const completedTasks = tasks.filter(t => t.status === 'completed');
  const totalKm = tasks.reduce((sum, t) => sum + (t.distance_km ?? 0), 0);
  const firstName = me.full_name.split(' ')[0];

  return (
    <div className="px-5 pb-2 max-w-lg mx-auto space-y-4">

      {/* ── Top greeting bar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-5">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">
            {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-[22px] font-bold text-gray-900 mt-0.5 tracking-tight">
            {greeting()}, {firstName} <span role="img" aria-label="wave">👋</span>
          </h1>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={loadData}
          className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </motion.button>
      </div>

      {/* ── Hero shift card ────────────────────────────────────────────────── */}
      <HeroShiftCard
        me={me}
        elapsed={elapsed}
        stats={stats}
        actionLoading={actionLoading}
        performAction={performAction}
      />

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Plan changed alert ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {planChanged && (
          <motion.button
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { setPlanChanged(false); router.push('/worker/route'); }}
            className="w-full flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">Plan zaktualizowany</p>
              <p className="text-xs text-amber-600">Sprawdź trasę</p>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-400 flex-shrink-0" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Stat row ──────────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<ClipboardList className="w-4 h-4" />}
            iconColor="text-orange-500"
            iconBg="bg-orange-50"
            value={`${stats.completed}/${stats.total}`}
            label="Zlecenia"
            accent="orange"
          />
          <StatCard
            icon={<RouteIcon className="w-4 h-4" />}
            iconColor="text-blue-500"
            iconBg="bg-blue-50"
            value={`${Math.round(totalKm)}`}
            suffix=" km"
            label="Dystans"
            accent="blue"
          />
          <StatCard
            icon={<Timer className="w-4 h-4" />}
            iconColor="text-violet-500"
            iconBg="bg-violet-50"
            value={me.shift_today.scheduled
              ? `${me.shift_today.start_time}–${me.shift_today.end_time}`
              : '–'}
            label="Dyżur"
            accent="violet"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            iconColor="text-emerald-500"
            iconBg="bg-emerald-50"
            value={`${stats.progress_pct}%`}
            label="Postęp"
            accent="emerald"
          />
        </div>
      )}

      {/* ── Next task ─────────────────────────────────────────────────────── */}
      <NextTaskSection nextTask={nextTask} stats={stats} router={router} />

      {/* ── Recent activity ───────────────────────────────────────────────── */}
      {completedTasks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900">Ostatnia aktywność</h2>
            <button
              onClick={() => router.push('/worker/route')}
              className="text-xs font-medium text-orange-500 min-h-[32px] px-2"
            >
              Zobacz wszystkie
            </button>
          </div>
          <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
            {completedTasks.slice(0, 4).map((task, i) => (
              <motion.button
                key={task.id}
                whileTap={{ scale: 0.99 }}
                onClick={() => router.push(`/worker/tasks/${task.id}`)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50',
                  i < Math.min(completedTasks.length, 4) - 1 && 'border-b border-gray-100/80',
                )}
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-4.5 h-4.5 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{task.client_name}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{task.address}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {task.scheduled_time_start && (
                    <span className="text-xs text-gray-400 font-medium">
                      {task.scheduled_time_start.slice(0, 5)}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({
  icon, iconColor, iconBg, value, suffix, label,
}: {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  value: string;
  suffix?: string;
  label: string;
  accent: string;
}) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="bg-white rounded-3xl p-4 shadow-[0_2px_16px_rgba(0,0,0,0.06)]"
    >
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-3', iconBg)}>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className="text-xl font-bold text-gray-900 tracking-tight leading-none">
        {value}
        {suffix && <span className="text-sm font-medium text-gray-400">{suffix}</span>}
      </p>
      <p className="text-xs text-gray-400 mt-1 font-medium">{label}</p>
    </motion.div>
  );
}

// ── Hero Shift Card ────────────────────────────────────────────────────────────

function HeroShiftCard({
  me, elapsed, stats, actionLoading, performAction,
}: {
  me: WorkerMe;
  elapsed: { h: string; m: string };
  stats: TaskStats | null;
  actionLoading: string | null;
  performAction: (endpoint: string, label: string) => void;
}) {
  // ── OFF WORK ──────────────────────────────────────────────────────────────
  if (me.work_status === 'off_work') {
    return (
      <div
        className="relative overflow-hidden rounded-3xl p-6"
        style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
      >
        {/* Glow blobs */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute -bottom-12 -left-8 w-36 h-36 rounded-full bg-blue-500/15 blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-2 h-2 rounded-full bg-gray-500" />
            <span className="text-xs font-medium text-white/50 uppercase tracking-widest">Poza zmianą</span>
          </div>

          {me.shift_today.scheduled && (
            <div className="flex items-center gap-2 bg-white/[0.06] rounded-2xl px-3 py-2 mb-5 w-fit">
              <Clock className="w-3.5 h-3.5 text-white/50" />
              <span className="text-sm text-white/60 font-medium">
                {me.shift_today.start_time} – {me.shift_today.end_time}
              </span>
            </div>
          )}

          <p className="text-[32px] font-bold text-white tracking-tight leading-none mb-1">
            Gotowy?
          </p>
          <p className="text-sm text-white/40 mb-7">Rozpocznij swój dyżur</p>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => performAction('/api/worker/shift/start', 'start')}
            disabled={actionLoading === 'start'}
            className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl py-4 text-[15px] font-semibold disabled:opacity-60 transition-colors"
            style={{ minHeight: 56 }}
          >
            {actionLoading === 'start'
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : <Play className="w-4 h-4" fill="currentColor" />}
            Rozpocznij dyżur
          </motion.button>
        </div>
      </div>
    );
  }

  // ── ON BREAK ──────────────────────────────────────────────────────────────
  if (me.work_status === 'break') {
    return (
      <div
        className="relative overflow-hidden rounded-3xl p-6"
        style={{ background: 'linear-gradient(135deg, #92400e 0%, #b45309 100%)' }}
      >
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-yellow-300/20 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <Coffee className="w-4 h-4 text-amber-300/80" />
            <span className="text-xs font-medium text-amber-200/70 uppercase tracking-widest">Na przerwie</span>
          </div>

          <p className="text-[42px] font-bold text-white tracking-tight leading-none mb-1">
            {elapsed.h}
            <span className="text-2xl font-medium text-white/60">h</span>
            {' '}{elapsed.m}
            <span className="text-2xl font-medium text-white/60">min</span>
          </p>
          <p className="text-sm text-white/40 mb-6">Czas pracy</p>

          <div className="flex gap-3">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => performAction('/api/worker/shift/break/end', 'resume')}
              disabled={actionLoading === 'resume'}
              className="flex-1 flex items-center justify-center gap-2 bg-white text-amber-900 rounded-2xl py-3.5 text-sm font-bold disabled:opacity-60"
              style={{ minHeight: 52 }}
            >
              {actionLoading === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" fill="currentColor" />}
              Wróć do pracy
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => performAction('/api/worker/shift/end', 'end')}
              disabled={actionLoading === 'end'}
              className="flex items-center justify-center gap-2 bg-white/15 text-white rounded-2xl py-3.5 px-5 text-sm font-medium disabled:opacity-60"
              style={{ minHeight: 52 }}
            >
              {actionLoading === 'end' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              Zakończ
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  // ── ON WORK ────────────────────────────────────────────────────────────────
  const pct = stats?.progress_pct ?? 0;
  return (
    <div
      className="relative overflow-hidden rounded-3xl p-6"
      style={{ background: 'linear-gradient(135deg, #ea580c 0%, #f97316 50%, #fb923c 100%)' }}
    >
      {/* Glow */}
      <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-yellow-300/20 blur-3xl" />
      <div className="absolute -bottom-12 -left-8 w-36 h-36 rounded-full bg-red-500/20 blur-3xl" />

      <div className="relative z-10">
        {/* Status row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-xs font-medium text-white/70 uppercase tracking-widest">W pracy</span>
          </div>
          {/* Progress ring */}
          <div className="relative">
            <ProgressRing pct={pct} size={48} stroke={4} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[11px] font-bold text-white">{pct}%</span>
            </div>
          </div>
        </div>

        {/* Big time display */}
        <p className="text-[48px] font-bold text-white tracking-tight leading-none mb-1">
          {elapsed.h}
          <span className="text-2xl font-medium text-white/60">h</span>
          {' '}{elapsed.m}
          <span className="text-2xl font-medium text-white/60">min</span>
        </p>
        <p className="text-sm text-white/50 mb-6">
          Czas pracy
          {stats && stats.total > 0 && (
            <span className="ml-2 text-white/60">• {stats.completed}/{stats.total} zleceń</span>
          )}
        </p>

        {/* Action buttons */}
        <div className="flex gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => performAction('/api/worker/shift/break/start', 'break')}
            disabled={actionLoading === 'break'}
            className="flex-1 flex items-center justify-center gap-2 bg-white/20 backdrop-blur-sm text-white rounded-2xl py-3.5 text-sm font-semibold disabled:opacity-60"
            style={{ minHeight: 52 }}
          >
            {actionLoading === 'break' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coffee className="w-4 h-4" />}
            Przerwa
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => performAction('/api/worker/shift/end', 'end')}
            disabled={actionLoading === 'end'}
            className="flex-1 flex items-center justify-center gap-2 bg-white/15 text-white/90 rounded-2xl py-3.5 text-sm font-medium disabled:opacity-60"
            style={{ minHeight: 52 }}
          >
            {actionLoading === 'end' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
            Zakończ
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ── Next Task Section ──────────────────────────────────────────────────────────

function NextTaskSection({
  nextTask, stats, router,
}: {
  nextTask: Task | null;
  stats: TaskStats | null;
  router: ReturnType<typeof import('next/navigation').useRouter>;
}) {
  // All done
  if (stats && stats.total > 0 && stats.remaining === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-6 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="w-7 h-7 text-emerald-500" />
        </div>
        <p className="font-bold text-gray-900 text-lg">Wszystkie zlecenia</p>
        <p className="font-bold text-emerald-600 text-lg">ukończone! 🎉</p>
        <p className="text-sm text-gray-400 mt-1">Świetna robota dzisiaj</p>
      </div>
    );
  }

  // No tasks
  if (!nextTask && stats?.total === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-6 text-center">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <Clock className="w-7 h-7 text-gray-300" />
        </div>
        <p className="text-gray-600 font-semibold">Czekaj na przydział</p>
        <p className="text-xs text-gray-400 mt-1">Brak zleceń na dziś</p>
      </div>
    );
  }

  if (!nextTask) return null;

  const isInTransit  = nextTask.status === 'in_transit';
  const isInProgress = nextTask.status === 'in_progress';

  const sectionTitle = isInTransit ? 'W drodze' : isInProgress ? 'W trakcie' : 'Następne zadanie';
  const btnLabel = isInTransit ? 'Dotarłem na miejsce' : isInProgress ? 'Zakończ zlecenie' : 'Wyjeżdżam';
  const btnIcon  = isInTransit ? <MapPin className="w-4 h-4" /> : isInProgress ? <CheckCircle className="w-4 h-4" /> : <Navigation className="w-4 h-4" />;
  const btnColor = isInTransit ? 'bg-blue-600 hover:bg-blue-700' : isInProgress ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-gray-900">{sectionTitle}</h2>
        <button
          onClick={() => router.push('/worker/route')}
          className="text-xs font-medium text-orange-500 min-h-[32px] px-2"
        >
          Cała trasa
        </button>
      </div>

      <motion.div
        whileTap={{ scale: 0.99 }}
        onClick={() => router.push(`/worker/tasks/${nextTask.id}`)}
        className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-5 cursor-pointer"
      >
        {/* Task info */}
        <div className="flex items-start gap-3 mb-4">
          <div className={cn(
            'w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-sm font-bold',
            isInTransit  ? 'bg-blue-50 text-blue-600' :
            isInProgress ? 'bg-orange-50 text-orange-600' :
                          'bg-gray-900 text-white',
          )}>
            {isInTransit  ? <Car className="w-5 h-5 animate-pulse" /> :
             isInProgress ? <Wrench className="w-5 h-5" /> :
                           <span>1</span>}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              {nextTask.scheduled_time_start && (
                <span className="text-sm font-bold text-gray-900">
                  {nextTask.scheduled_time_start.slice(0, 5)}
                </span>
              )}
              <span className="text-[15px] font-bold text-gray-900 truncate">
                {nextTask.client_name}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-400">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{nextTask.address}</span>
            </div>
            {nextTask.services.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {nextTask.services.slice(0, 3).map((s, i) => (
                  <span key={i} className="bg-gray-100 text-gray-600 text-[11px] font-medium px-2.5 py-1 rounded-full">
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
        </div>

        {/* CTA button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={e => { e.stopPropagation(); router.push(`/worker/tasks/${nextTask.id}`); }}
          className={cn(
            'w-full flex items-center justify-center gap-2 text-white rounded-2xl py-4 text-[15px] font-semibold transition-colors',
            btnColor,
          )}
          style={{ minHeight: 56 }}
        >
          {btnIcon}
          {btnLabel}
        </motion.button>
      </motion.div>
    </div>
  );
}
