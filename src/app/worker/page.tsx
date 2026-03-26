'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play, Coffee, Square, MapPin,
  ChevronRight, Clock, CheckCircle, Loader2,
  AlertCircle, AlertTriangle, Wrench,
  Car, Navigation, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ──────────────────────────────────────────────────────────────────────

type WorkStatus = 'off_work' | 'on_work' | 'break';

interface WorkerMe {
  employee_id: string;
  full_name: string;
  work_status: WorkStatus;
  shift_today: {
    scheduled: boolean;
    start_time: string | null;
    end_time: string | null;
  };
  current_shift: {
    clock_in: string | null;
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
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return { h: String(h), m: String(m).padStart(2, '0') };
}

// ── Progress ring (tiny, for on_work card) ─────────────────────────────────────

function Ring({ pct }: { pct: number }) {
  const r = 20, stroke = 3;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width={48} height={48} className="-rotate-90">
      <circle cx={24} cy={24} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={stroke} />
      <circle cx={24} cy={24} r={r} fill="none" stroke="white" strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
        className="transition-all duration-700" />
    </svg>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function WorkerTodayPage() {
  const router = useRouter();
  const [me, setMe]             = useState<WorkerMe | null>(null);
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [stats, setStats]       = useState<TaskStats | null>(null);
  const [nextTask, setNextTask] = useState<Task | null>(null);
  const [loading, setLoading]   = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [planChanged, setPlanChanged] = useState(false);
  const [elapsed, setElapsed]   = useState({ h: '0', m: '00' });

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    try {
      const meRes = await fetch('/api/worker/me');
      if (!meRes.ok) return;
      const meData: WorkerMe = await meRes.json();
      setMe(meData);

      const tasksRes = await fetch(`/api/worker/tasks?date=${today}&employee_id=${meData.employee_id}`);
      if (tasksRes.ok) {
        const d = await tasksRes.json();
        setTasks(d.tasks ?? []);
        setStats(d.stats ?? null);
        setPlanChanged(d.plan_changed ?? false);
        const nextId = d.next_task_id;
        setNextTask(nextId ? (d.tasks ?? []).find((t: Task) => t.id === nextId) ?? null : null);
      }
    } catch {
      setError('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 120_000);
    return () => clearInterval(t);
  }, [loadData]);

  useEffect(() => {
    if (!me?.current_shift.clock_in) { setElapsed({ h: '0', m: '00' }); return; }
    const update = () => setElapsed(elapsedParts(me.current_shift.clock_in));
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
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
      if (!res.ok) { setError(data.error ?? 'Błąd'); return; }
      await loadData();
    } catch {
      setError('Błąd połączenia');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-orange-500 animate-spin" />
      </div>
    );
  }
  if (!me) return null;

  const pct = stats?.progress_pct ?? 0;
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <div>
      {/* ═══════════════════════════════════════════════════════════════════════
          FULL-BLEED HERO — edge-to-edge, no card wrapper
      ════════════════════════════════════════════════════════════════════════ */}
      <HeroSection
        me={me}
        elapsed={elapsed}
        stats={stats}
        pct={pct}
        actionLoading={actionLoading}
        performAction={performAction}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          CONTENT SHEET — overlaps hero with rounded top edge
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="relative -mt-7 rounded-t-[32px] bg-[#F5F5F7] z-10 min-h-[60vh]">
        <div className="px-5 pt-6 space-y-5 pb-4">

          {/* Handle */}
          <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto -mt-1 mb-2" />

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-2xl p-3.5 text-sm text-red-600 font-medium"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Plan changed alert */}
          <AnimatePresence>
            {planChanged && (
              <motion.button
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setPlanChanged(false); router.push('/worker/route'); }}
                className="w-full flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-3xl p-4 text-left"
              >
                <div className="w-9 h-9 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-800">Trasa zaktualizowana</p>
                  <p className="text-xs text-amber-600 mt-0.5">Sprawdź nowe zlecenia</p>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-400" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Stats horizontal strip */}
          {stats && <MetricStrip stats={stats} me={me} tasks={tasks} />}

          {/* Next / active task */}
          <NextTaskCard nextTask={nextTask} stats={stats} router={router} />

          {/* Recent completions */}
          {completedTasks.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-bold text-gray-400 uppercase tracking-wider">Ukończone</p>
                <button
                  onClick={() => router.push('/worker/route')}
                  className="text-xs font-semibold text-orange-500 flex items-center gap-1"
                >
                  Wszystkie <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-2">
                {completedTasks.slice(0, 3).map(task => (
                  <motion.button
                    key={task.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => router.push(`/worker/tasks/${task.id}`)}
                    className="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 shadow-[0_1px_8px_rgba(0,0,0,0.05)] text-left"
                  >
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{task.client_name}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{task.address}</p>
                    </div>
                    {task.scheduled_time_start && (
                      <span className="text-xs font-semibold text-gray-400 tabular-nums flex-shrink-0">
                        {task.scheduled_time_start.slice(0, 5)}
                      </span>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Hero Section ───────────────────────────────────────────────────────────────

function HeroSection({
  me, elapsed, stats, pct, actionLoading, performAction,
}: {
  me: WorkerMe;
  elapsed: { h: string; m: string };
  stats: TaskStats | null;
  pct: number;
  actionLoading: string | null;
  performAction: (e: string, l: string) => void;
}) {
  const firstName = me.full_name.split(' ')[0];

  // ── OFF WORK ────────────────────────────────────────────────────────────────
  if (me.work_status === 'off_work') {
    return (
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #0f3460 100%)',
          paddingTop: 'max(20px, env(safe-area-inset-top))',
          paddingBottom: 48,
        }}
      >
        {/* Glow orbs */}
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 65%)' }} />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 65%)' }} />

        <div className="relative z-10 px-5">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-[11px] font-bold text-white/30 uppercase tracking-[0.12em] mb-0.5">
                {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <p className="text-[17px] font-bold text-white/80">{firstName}</p>
            </div>
            <div className="flex items-center gap-2 bg-white/[0.07] rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
              <span className="text-[11px] font-bold text-white/40 uppercase tracking-wider">Poza zmianą</span>
            </div>
          </div>

          {/* Big heading */}
          <div className="mb-8">
            <h1 className="text-[52px] font-black text-white leading-[1.0] tracking-tight mb-3">
              Gotowy<br/>
              <span className="text-orange-400">do pracy?</span>
            </h1>
            {me.shift_today.scheduled && (
              <div className="flex items-center gap-2 w-fit bg-white/[0.08] rounded-2xl px-4 py-2.5">
                <Clock className="w-3.5 h-3.5 text-white/40" />
                <span className="text-sm font-bold text-white/55">
                  {me.shift_today.start_time} – {me.shift_today.end_time}
                </span>
              </div>
            )}
          </div>

          {/* CTA */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => performAction('/api/worker/shift/start', 'start')}
            disabled={actionLoading === 'start'}
            className="w-full flex items-center justify-center gap-2.5 bg-orange-500 text-white rounded-2xl font-bold text-[15px] disabled:opacity-60"
            style={{ minHeight: 56 }}
          >
            {actionLoading === 'start'
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : <><Play className="w-4 h-4" fill="currentColor" />Rozpocznij dyżur</>}
          </motion.button>
        </div>
      </div>
    );
  }

  // ── ON BREAK ────────────────────────────────────────────────────────────────
  if (me.work_status === 'break') {
    return (
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #78350f 0%, #92400e 50%, #b45309 100%)',
          paddingTop: 'max(20px, env(safe-area-inset-top))',
          paddingBottom: 48,
        }}
      >
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(253,224,71,0.15) 0%, transparent 65%)' }} />

        <div className="relative z-10 px-5">
          <div className="flex items-center gap-2 mb-8">
            <Coffee className="w-4 h-4 text-amber-300/60" />
            <span className="text-[11px] font-bold text-amber-200/50 uppercase tracking-wider">Na przerwie</span>
          </div>

          {/* Time */}
          <div className="mb-2">
            <span className="text-[72px] font-black text-white tracking-tight leading-none tabular-nums">{elapsed.h}</span>
            <span className="text-[32px] font-bold text-white/40">h </span>
            <span className="text-[72px] font-black text-white tracking-tight leading-none tabular-nums">{elapsed.m}</span>
            <span className="text-[32px] font-bold text-white/40">min</span>
          </div>
          <p className="text-sm text-white/40 mb-8">czas pracy dzisiaj</p>

          <div className="flex gap-3">
            <motion.button whileTap={{ scale: 0.97 }}
              onClick={() => performAction('/api/worker/shift/break/end', 'resume')}
              disabled={actionLoading === 'resume'}
              className="flex-1 flex items-center justify-center gap-2 bg-white text-amber-900 rounded-2xl font-black text-sm"
              style={{ minHeight: 52 }}>
              {actionLoading === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Play className="w-4 h-4" fill="currentColor" />Wróć do pracy</>}
            </motion.button>
            <motion.button whileTap={{ scale: 0.97 }}
              onClick={() => performAction('/api/worker/shift/end', 'end')}
              disabled={actionLoading === 'end'}
              className="flex items-center justify-center gap-2 bg-white/15 text-white rounded-2xl font-bold text-sm px-5"
              style={{ minHeight: 52 }}>
              {actionLoading === 'end' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Square className="w-4 h-4" />Zakończ</>}
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  // ── ON WORK ────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, #9a3412 0%, #c2410c 40%, #ea580c 100%)',
        paddingTop: 'max(20px, env(safe-area-inset-top))',
        paddingBottom: 48,
      }}
    >
      {/* Glow orbs */}
      <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.20) 0%, transparent 65%)' }} />
      <div className="absolute -bottom-24 -left-16 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 65%)' }} />

      <div className="relative z-10 px-5">
        {/* Top row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-[11px] font-bold text-white/50 uppercase tracking-widest">W pracy</span>
          </div>
          <div className="relative">
            <Ring pct={pct} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[11px] font-black text-white">{pct}%</span>
            </div>
          </div>
        </div>

        {/* GIANT time */}
        <div className="mb-2">
          <span className="text-[80px] font-black text-white tracking-tight leading-none tabular-nums">{elapsed.h}</span>
          <span className="text-[36px] font-bold text-white/40">h </span>
          <span className="text-[80px] font-black text-white tracking-tight leading-none tabular-nums">{elapsed.m}</span>
          <span className="text-[36px] font-bold text-white/40">min</span>
        </div>
        <p className="text-sm text-white/40 mb-2">czas pracy dzisiaj</p>
        {stats && stats.total > 0 && (
          <p className="text-xs text-white/30 mb-8 font-semibold">
            {stats.completed} z {stats.total} zleceń ukończone
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <motion.button whileTap={{ scale: 0.97 }}
            onClick={() => performAction('/api/worker/shift/break/start', 'break')}
            disabled={actionLoading === 'break'}
            className="flex-1 flex items-center justify-center gap-2 bg-white/[0.12] backdrop-blur text-white rounded-2xl font-bold text-sm"
            style={{ minHeight: 52 }}>
            {actionLoading === 'break' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Coffee className="w-4 h-4" />Przerwa</>}
          </motion.button>
          <motion.button whileTap={{ scale: 0.97 }}
            onClick={() => performAction('/api/worker/shift/end', 'end')}
            disabled={actionLoading === 'end'}
            className="flex items-center justify-center gap-2 bg-white/[0.08] text-white/70 rounded-2xl font-semibold text-sm px-5"
            style={{ minHeight: 52 }}>
            {actionLoading === 'end' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Square className="w-4 h-4" />Zakończ</>}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ── Metric Strip ───────────────────────────────────────────────────────────────

function MetricStrip({ stats, me, tasks }: { stats: TaskStats; me: WorkerMe; tasks: Task[] }) {
  const totalKm = Math.round(tasks.reduce((s, t) => s + (t.distance_km ?? 0), 0));
  const metrics = [
    { label: 'Zlecenia', value: `${stats.completed}/${stats.total}`, color: 'bg-orange-50 text-orange-600' },
    { label: 'Dystans', value: `${totalKm} km`, color: 'bg-blue-50 text-blue-600' },
    { label: 'Postęp', value: `${stats.progress_pct}%`, color: 'bg-emerald-50 text-emerald-600' },
    ...(me.shift_today.scheduled
      ? [{ label: 'Dyżur', value: `${me.shift_today.start_time}–${me.shift_today.end_time}`, color: 'bg-violet-50 text-violet-600' }]
      : []),
  ];

  return (
    <div>
      <p className="text-[13px] font-bold text-gray-400 uppercase tracking-wider mb-3">Dzisiaj</p>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-5 px-5 scrollbar-hide">
        {metrics.map(m => (
          <div key={m.label}
            className="flex-shrink-0 bg-white rounded-2xl px-4 py-3.5 shadow-[0_1px_8px_rgba(0,0,0,0.06)] flex flex-col gap-1 min-w-[96px]">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{m.label}</p>
            <p className="text-[18px] font-black text-gray-900 leading-none tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Next Task Card ─────────────────────────────────────────────────────────────

function NextTaskCard({
  nextTask, stats, router,
}: {
  nextTask: Task | null;
  stats: TaskStats | null;
  router: ReturnType<typeof import('next/navigation').useRouter>;
}) {
  if (stats && stats.total > 0 && stats.remaining === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-[0_2px_20px_rgba(0,0,0,0.08)] p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <p className="text-xl font-black text-gray-900">Wszystkie ukończone!</p>
        <p className="text-sm text-gray-400 mt-1.5">Świetna robota 🎉</p>
      </div>
    );
  }

  if (!nextTask) {
    if (!stats || stats.total === 0) {
      return (
        <div className="bg-white rounded-3xl shadow-[0_2px_20px_rgba(0,0,0,0.08)] p-6 text-center">
          <p className="text-base font-bold text-gray-500">Brak zleceń na dziś</p>
          <p className="text-sm text-gray-400 mt-1">Czekaj na przydział</p>
        </div>
      );
    }
    return null;
  }

  const isInTransit  = nextTask.status === 'in_transit';
  const isInProgress = nextTask.status === 'in_progress';

  const btnLabel = isInTransit ? 'Dotarłem na miejsce' : isInProgress ? 'Zakończ zlecenie' : 'Wyjeżdżam';
  const btnColor = isInTransit ? '#2563eb' : isInProgress ? '#059669' : '#f97316';
  const statusLabel = isInTransit ? 'W drodze' : isInProgress ? 'W trakcie' : 'Następne';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-bold text-gray-400 uppercase tracking-wider">{statusLabel} zadanie</p>
        <button
          onClick={() => router.push('/worker/route')}
          className="text-xs font-semibold text-orange-500 flex items-center gap-1"
        >
          Cała trasa <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <motion.div
        whileTap={{ scale: 0.99 }}
        onClick={() => router.push(`/worker/tasks/${nextTask.id}`)}
        className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] overflow-hidden cursor-pointer"
      >
        {/* Top color accent */}
        <div className="h-1" style={{ background: btnColor }} />

        <div className="p-5">
          {/* Task meta */}
          <div className="flex items-start gap-3 mb-5">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: btnColor + '18' }}
            >
              {isInTransit  ? <Car className="w-5 h-5" style={{ color: btnColor }} /> :
               isInProgress ? <Wrench className="w-5 h-5" style={{ color: btnColor }} /> :
                              <span className="text-base font-black" style={{ color: btnColor }}>1</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                {nextTask.scheduled_time_start && (
                  <span className="text-[13px] font-black text-gray-400 tabular-nums">
                    {nextTask.scheduled_time_start.slice(0, 5)}
                  </span>
                )}
                <h3 className="text-[17px] font-black text-gray-900 truncate">{nextTask.client_name}</h3>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-400">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{nextTask.address}</span>
                {nextTask.distance_km && (
                  <span className="flex-shrink-0 font-semibold">• {nextTask.distance_km} km</span>
                )}
              </div>
              {nextTask.services.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {nextTask.services.slice(0, 3).map((s, i) => (
                    <span key={i} className="text-[11px] font-semibold bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CTA */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={e => { e.stopPropagation(); router.push(`/worker/tasks/${nextTask.id}`); }}
            className="w-full flex items-center justify-center gap-2.5 text-white rounded-2xl font-bold text-[15px]"
            style={{ minHeight: 56, background: btnColor }}
          >
            <Navigation className="w-4 h-4" />
            {btnLabel}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
