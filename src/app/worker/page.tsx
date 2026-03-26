'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play, Coffee, Square, MapPin, ChevronRight,
  Clock, CheckCircle, Loader2, AlertCircle, RefreshCw,
  Navigation, AlertTriangle, Wrench, Car, ClipboardList,
  Timer, Route as RouteIcon, Gauge,
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

function elapsedSince(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

function elapsedParts(iso: string | null): { h: string; m: string } {
  if (!iso) return { h: '0', m: '00' };
  const diffMs = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  return { h: String(h), m: String(m).padStart(2, '0') };
}

// ── Stagger animation variants ─────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 1, y: 0 },
  show: { opacity: 1, y: 0 },
} as const;

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function WorkerTodayPage() {
  const router = useRouter();
  const [me, setMe] = useState<WorkerMe | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [nextTask, setNextTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      setError('Blad polaczenia');
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Update elapsed clock
  useEffect(() => {
    if (!me?.current_shift.clock_in) {
      setElapsed({ h: '0', m: '00' });
      return;
    }
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
        body: JSON.stringify({
          lat: pos?.coords.latitude ?? null,
          lng: pos?.coords.longitude ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Wystapil blad');
        return;
      }
      await loadData();
    } catch {
      setError('Blad polaczenia');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!me) return null;

  const completedTasks = tasks.filter(t => t.status === 'completed');
  const totalKm = tasks.reduce((sum, t) => sum + (t.distance_km ?? 0), 0);

  return (
    <motion.div
      className="p-4 space-y-4 max-w-lg mx-auto"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Greeting + date */}
      <motion.div variants={itemVariants} className="pt-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">
              {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="text-2xl font-bold text-gray-900 mt-0.5 tracking-tight">
              Czesc, {me.full_name.split(' ')[0]} <span role="img" aria-label="wave">&#128075;</span>
            </h1>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={loadData}
            className="w-10 h-10 rounded-full bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex items-center justify-center"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </motion.button>
        </div>
      </motion.div>

      {/* Hero shift card */}
      <motion.div variants={itemVariants}>
        <HeroShiftCard
          me={me}
          elapsed={elapsed}
          actionLoading={actionLoading}
          performAction={performAction}
        />
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4 text-sm text-red-600"
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
            exit={{ opacity: 0, y: -8 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { setPlanChanged(false); router.push('/worker/route'); }}
            className="w-full flex items-center gap-2 bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4 text-sm text-amber-700"
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500" />
            <span className="font-medium">Plan zaktualizowany</span>
            <span className="text-amber-500 ml-auto text-xs">sprawdz trase &rarr;</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Pastel stat tiles — 2x2 grid */}
      {stats && (
        <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3">
          <StatTile
            icon={<ClipboardList className="w-4 h-4 text-orange-600" />}
            iconBg="bg-orange-100"
            tileBg="bg-[#FFE8D6]"
            value={`${stats.completed}/${stats.total}`}
            label="Zlecenia"
          />
          <StatTile
            icon={<RouteIcon className="w-4 h-4 text-emerald-600" />}
            iconBg="bg-emerald-100"
            tileBg="bg-[#D4F0E7]"
            value={`${Math.round(totalKm)}`}
            suffix=" km"
            label="Dystans"
          />
          <StatTile
            icon={<Timer className="w-4 h-4 text-blue-600" />}
            iconBg="bg-blue-100"
            tileBg="bg-[#D6EAF8]"
            value={me.shift_today.scheduled ? `${me.shift_today.start_time}-${me.shift_today.end_time}` : '--'}
            label="Dyzur"
          />
          <StatTile
            icon={<Gauge className="w-4 h-4 text-purple-600" />}
            iconBg="bg-purple-100"
            tileBg="bg-[#E8E0F0]"
            value={`${stats.progress_pct}%`}
            label="Postep"
          />
        </motion.div>
      )}

      {/* Next task section */}
      <motion.div variants={itemVariants}>
        <NextTaskSection nextTask={nextTask} stats={stats} router={router} />
      </motion.div>

      {/* Recent activity section */}
      {completedTasks.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Ostatnia aktywnosc</h2>
          <div className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
            {completedTasks.slice(0, 4).map((task, i) => (
              <motion.button
                key={task.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push(`/worker/tasks/${task.id}`)}
                className={cn(
                  'w-full flex items-center gap-3 p-4 text-left transition-colors active:bg-gray-50',
                  i < completedTasks.length - 1 && i < 3 && 'border-b border-gray-100',
                )}
                style={{ minHeight: 56 }}
              >
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{task.client_name}</p>
                  <p className="text-xs text-gray-400 truncate">{task.address}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-400">
                    {task.scheduled_time_start ? task.scheduled_time_start.slice(0, 5) : ''}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
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

// ── Hero Shift Card ───────────────────────────────────────────────────────────

function HeroShiftCard({
  me,
  elapsed,
  actionLoading,
  performAction,
}: {
  me: WorkerMe;
  elapsed: { h: string; m: string };
  actionLoading: string | null;
  performAction: (endpoint: string, label: string) => void;
}) {
  // OFF WORK
  if (me.work_status === 'off_work') {
    return (
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1E2A5E] to-[#3B4F8A] p-6">
        {/* Decorative circles */}
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-28 h-28 rounded-full bg-pink-500/15 blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-sm font-medium text-white/60">Poza zmiana</span>
          </div>

          {me.shift_today.scheduled && (
            <div className="flex items-center gap-2 text-white/40 text-sm mb-4">
              <Clock className="w-4 h-4" />
              <span>Zaplanowana: {me.shift_today.start_time} - {me.shift_today.end_time}</span>
            </div>
          )}

          <p className="text-3xl font-bold text-white tracking-tight mb-1">Gotowy?</p>
          <p className="text-sm text-white/50 mb-6">Rozpocznij swoj dyzur</p>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => performAction('/api/worker/shift/start', 'start')}
            disabled={actionLoading === 'start'}
            className="w-full flex items-center justify-center gap-3 bg-orange-500 hover:bg-orange-600 text-white rounded-full py-4 text-base font-semibold disabled:opacity-60 transition-all"
            style={{ minHeight: 56 }}
          >
            {actionLoading === 'start' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            Rozpocznij dyzur
          </motion.button>
        </div>
      </div>
    );
  }

  // ON BREAK
  if (me.work_status === 'break') {
    return (
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-amber-600 to-amber-500 p-6">
        {/* Decorative circles */}
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-yellow-300/30 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-28 h-28 rounded-full bg-orange-400/20 blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Coffee className="w-4 h-4 text-white/80" />
            <span className="text-sm font-medium text-white/80">Na przerwie</span>
          </div>

          <p className="text-4xl font-bold text-white tracking-tight mb-1">
            {elapsed.h}h {elapsed.m}min
          </p>
          <p className="text-sm text-white/50 mb-5">Czas pracy</p>

          <div className="flex gap-3">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => performAction('/api/worker/shift/break/end', 'resume')}
              disabled={actionLoading === 'resume'}
              className="flex-1 flex items-center justify-center gap-2 bg-white/20 backdrop-blur-sm text-white rounded-full py-3 text-sm font-semibold disabled:opacity-60"
              style={{ minHeight: 48 }}
            >
              {actionLoading === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Wroc do pracy
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => performAction('/api/worker/shift/end', 'end')}
              disabled={actionLoading === 'end'}
              className="flex items-center justify-center gap-2 bg-white/10 text-white/80 rounded-full py-3 px-5 text-sm font-medium disabled:opacity-60"
              style={{ minHeight: 48 }}
            >
              {actionLoading === 'end' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              Zakoncz
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  // ON WORK
  return (
    <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1E2A5E] to-[#3B4F8A] p-6">
      {/* Decorative circles */}
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-orange-500/20 blur-3xl" />
      <div className="absolute -bottom-10 -left-10 w-28 h-28 rounded-full bg-pink-500/15 blur-3xl" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-medium text-white/80">W pracy</span>
          </div>
          <Clock className="w-4 h-4 text-white/40" />
        </div>

        <p className="text-4xl font-bold text-white tracking-tight mb-1">
          {elapsed.h}h {elapsed.m}min
        </p>
        <p className="text-sm text-white/50 mb-5">Czas pracy</p>

        <div className="flex gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => performAction('/api/worker/shift/break/start', 'break')}
            disabled={actionLoading === 'break'}
            className="flex-1 flex items-center justify-center gap-2 bg-white/20 backdrop-blur-sm text-white rounded-full py-3 text-sm font-semibold disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {actionLoading === 'break' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coffee className="w-4 h-4" />}
            Przerwa
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => performAction('/api/worker/shift/end', 'end')}
            disabled={actionLoading === 'end'}
            className="flex-1 flex items-center justify-center gap-2 bg-white/10 text-white/80 rounded-full py-3 text-sm font-medium disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {actionLoading === 'end' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
            Zakoncz
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ── Next Task Section ─────────────────────────────────────────────────────────

function NextTaskSection({
  nextTask,
  stats,
  router,
}: {
  nextTask: Task | null;
  stats: TaskStats | null;
  router: ReturnType<typeof useRouter>;
}) {
  // All done
  if (stats && stats.total > 0 && stats.remaining === 0) {
    return (
      <div className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 text-center">
        <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
        <p className="font-semibold text-emerald-700 text-lg">Wszystkie zlecenia ukonczone!</p>
        <p className="text-sm text-gray-400 mt-1">Swietna robota</p>
      </div>
    );
  }

  // No tasks
  if (!nextTask && stats?.total === 0) {
    return (
      <div className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <Clock className="w-6 h-6 text-gray-300" />
        </div>
        <p className="text-gray-500 font-medium">Czekaj na przydzial</p>
        <p className="text-xs text-gray-400 mt-1">Brak zlecen na dzis</p>
      </div>
    );
  }

  // Waiting
  if (!nextTask) {
    return (
      <div className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 text-center">
        <Loader2 className="w-8 h-8 text-gray-300 mx-auto mb-2 animate-spin" />
        <p className="text-gray-500 font-medium">Czekaj na przydzial</p>
      </div>
    );
  }

  const isInTransit = nextTask.status === 'in_transit';
  const isInProgress = nextTask.status === 'in_progress';

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">
        {isInTransit ? 'W drodze' : isInProgress ? 'W trakcie' : 'Nastepne zadanie'}
      </h2>
      <motion.div
        whileTap={{ scale: 0.98 }}
        onClick={() => router.push(`/worker/tasks/${nextTask.id}`)}
        className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 cursor-pointer"
      >
        <div className="flex items-start gap-3">
          {/* Sequence circle */}
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold',
            isInTransit
              ? 'bg-orange-100 text-orange-600'
              : isInProgress
                ? 'bg-blue-100 text-blue-600'
                : 'bg-gray-900 text-white',
          )}>
            {isInTransit ? <Car className="w-5 h-5 animate-pulse" /> : isInProgress ? <Wrench className="w-5 h-5" /> : '1'}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {nextTask.scheduled_time_start && (
                <span className="text-sm font-bold text-gray-900">
                  {nextTask.scheduled_time_start.slice(0, 5)}
                </span>
              )}
              <span className="text-sm font-semibold text-gray-900 truncate">{nextTask.client_name}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
              <span className="truncate">{nextTask.address}</span>
            </div>

            {/* Service chips */}
            {nextTask.services.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {nextTask.services.slice(0, 3).map((s, i) => (
                  <span
                    key={i}
                    className="inline-block bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-0.5 rounded-full"
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0 mt-2" />
        </div>

        {/* CTA button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={(e) => { e.stopPropagation(); router.push(`/worker/tasks/${nextTask.id}`); }}
          className={cn(
            'w-full flex items-center justify-center gap-2 text-white rounded-full py-3.5 mt-4 text-sm font-semibold',
            isInTransit
              ? 'bg-blue-600'
              : isInProgress
                ? 'bg-emerald-600'
                : 'bg-orange-500 hover:bg-orange-600',
          )}
          style={{ minHeight: 48 }}
        >
          {isInTransit ? (
            <><MapPin className="w-4 h-4" /> Na miejscu</>
          ) : isInProgress ? (
            <><CheckCircle className="w-4 h-4" /> Zakoncz zlecenie</>
          ) : (
            <><Navigation className="w-4 h-4" /> Wyjezdzam</>
          )}
        </motion.button>
      </motion.div>
    </div>
  );
}
