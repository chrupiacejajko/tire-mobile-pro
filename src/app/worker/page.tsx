'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play, Coffee, Square, MapPin,
  ChevronRight, Clock, CheckCircle, Loader2,
  AlertCircle, AlertTriangle, Wrench,
  Car, Navigation, ArrowRight, Home, Flag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { haversineKm, etaMinutes } from '@/lib/geo';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

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
  default_location?: string | null;
  default_lat?: number | null;
  default_lng?: number | null;
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
  actual_departure_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  lat: number | null;
  lng: number | null;
}

interface TaskStats {
  total: number;
  completed: number;
  remaining: number;
  progress_pct: number;
}

// ── Return-to-base analysis ─────────────────────────────────────────────────

interface ReturnToBaseAnalysis {
  hasNextOrder: boolean;
  nextOrderTime: string | null;         // HH:MM
  travelToHomeMins: number;
  travelFromHomeToNextMins: number;
  timeAtHomeMins: number;               // how long they'd have at home
  shouldReturn: boolean;                 // timeAtHomeMins >= 30
  departureFromHome: string | null;      // HH:MM when they must leave home
  wontMakeIt: boolean;                   // travel_home + travel_to_next > time_until_next
}

function analyzeReturnToBase(
  workerLat: number, workerLng: number,
  homeLat: number, homeLng: number,
  tasks: Task[],
): ReturnToBaseAnalysis {
  const pendingTasks = tasks.filter(
    t => t.status !== 'completed' && t.status !== 'cancelled' && t.scheduled_time_start && t.lat && t.lng
  );

  if (pendingTasks.length === 0) {
    return {
      hasNextOrder: false, nextOrderTime: null,
      travelToHomeMins: 0, travelFromHomeToNextMins: 0,
      timeAtHomeMins: 999, shouldReturn: true,
      departureFromHome: null, wontMakeIt: false,
    };
  }

  // Sort by scheduled_time_start to get the next one
  const sorted = [...pendingTasks].sort((a, b) =>
    (a.scheduled_time_start ?? '').localeCompare(b.scheduled_time_start ?? '')
  );
  const next = sorted[0];
  const nextLat = next.lat!;
  const nextLng = next.lng!;
  const nextTimeStr = next.scheduled_time_start!; // "HH:MM" or "HH:MM:SS"

  // Travel times
  const distToHome = haversineKm(workerLat, workerLng, homeLat, homeLng);
  const distHomeToNext = haversineKm(homeLat, homeLng, nextLat, nextLng);
  const travelToHomeMins = etaMinutes(distToHome);
  const travelFromHomeToNextMins = etaMinutes(distHomeToNext);

  // Parse next order time
  const [hh, mm] = nextTimeStr.split(':').map(Number);
  const now = new Date();
  const nextOrderDate = new Date(now);
  nextOrderDate.setHours(hh, mm, 0, 0);

  const minsUntilNextOrder = Math.max(0, (nextOrderDate.getTime() - now.getTime()) / 60000);

  // Time at home = time_until_next - travel_to_home - travel_from_home_to_next
  const timeAtHomeMins = Math.max(0, Math.round(minsUntilNextOrder - travelToHomeMins - travelFromHomeToNextMins));

  // Departure from home = next_order_time - travel_from_home_to_next
  const departureMs = nextOrderDate.getTime() - travelFromHomeToNextMins * 60000;
  const departureDate = new Date(departureMs);
  const departureFromHome = `${String(departureDate.getHours()).padStart(2, '0')}:${String(departureDate.getMinutes()).padStart(2, '0')}`;

  // Direct travel time (not going home)
  const distDirect = haversineKm(workerLat, workerLng, nextLat, nextLng);
  const directMins = etaMinutes(distDirect);

  // Won't make it: total round-trip via home > time until next order
  const wontMakeIt = (travelToHomeMins + travelFromHomeToNextMins) > minsUntilNextOrder;

  return {
    hasNextOrder: true,
    nextOrderTime: nextTimeStr.slice(0, 5),
    travelToHomeMins,
    travelFromHomeToNextMins,
    timeAtHomeMins,
    shouldReturn: timeAtHomeMins >= 30,
    departureFromHome,
    wontMakeIt,
  };
}

// ── First order departure info ──────────────────────────────────────────────

interface FirstOrderInfo {
  departureTime: string;   // HH:MM
  travelMins: number;
  orderTime: string;       // HH:MM
  clientName: string;
  address: string;
}

function calcFirstOrderDeparture(
  homeLat: number, homeLng: number,
  tasks: Task[],
): FirstOrderInfo | null {
  const pending = tasks.filter(
    t => t.status !== 'completed' && t.status !== 'cancelled' && t.scheduled_time_start && t.lat && t.lng
  );
  if (pending.length === 0) return null;

  const sorted = [...pending].sort((a, b) =>
    (a.scheduled_time_start ?? '').localeCompare(b.scheduled_time_start ?? '')
  );
  const first = sorted[0];
  const dist = haversineKm(homeLat, homeLng, first.lat!, first.lng!);
  const travelMins = etaMinutes(dist);

  const [hh, mm] = first.scheduled_time_start!.split(':').map(Number);
  const orderDate = new Date();
  orderDate.setHours(hh, mm, 0, 0);
  const departureMs = orderDate.getTime() - travelMins * 60000;
  const dep = new Date(departureMs);

  return {
    departureTime: `${String(dep.getHours()).padStart(2, '0')}:${String(dep.getMinutes()).padStart(2, '0')}`,
    travelMins,
    orderTime: first.scheduled_time_start!.slice(0, 5),
    clientName: first.client_name,
    address: first.address,
  };
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
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnAnalysis, setReturnAnalysis] = useState<ReturnToBaseAnalysis | null>(null);

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
        if (d.current_location) setCurrentLocation(d.current_location);
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

  async function performAction(endpoint: string, label: string, extraBody?: Record<string, unknown>) {
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
          ...extraBody,
        }),
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

  // ── First order departure info ──────────────────────────────────────────
  const firstOrderInfo = useMemo(() => {
    if (!me?.default_lat || !me?.default_lng) return null;
    return calcFirstOrderDeparture(me.default_lat, me.default_lng, tasks);
  }, [me?.default_lat, me?.default_lng, tasks]);

  // ── Return-to-base handler ────────────────────────────────────────────────
  function handleReturnToBase() {
    // Get worker's current position (from GPS tracking or geolocation)
    const workerLat = currentLocation?.lat;
    const workerLng = currentLocation?.lng;
    const homeLat = me?.default_lat;
    const homeLng = me?.default_lng;

    // If we don't have coordinates, just proceed with the action
    if (!workerLat || !workerLng || !homeLat || !homeLng) {
      performAction('/api/worker/shift/end', 'return-base');
      return;
    }

    const analysis = analyzeReturnToBase(workerLat, workerLng, homeLat, homeLng, tasks);
    setReturnAnalysis(analysis);

    // If no next order, just go home
    if (!analysis.hasNextOrder) {
      performAction('/api/worker/shift/end', 'return-base');
      return;
    }

    // Show the dialog with analysis
    setReturnDialogOpen(true);
  }

  function confirmReturnToBase() {
    setReturnDialogOpen(false);
    performAction('/api/worker/shift/end', 'return-base');
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

          {/* Feature 2: First order departure banner */}
          {firstOrderInfo && me.work_status === 'off_work' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-3xl p-5 text-white shadow-[0_4px_20px_rgba(37,99,235,0.25)]"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Car className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-blue-100 uppercase tracking-wider mb-1">Pierwsze zlecenie</p>
                  <p className="text-[22px] font-black leading-tight">
                    Wyjazd o {firstOrderInfo.departureTime}
                  </p>
                  <p className="text-sm text-blue-100 mt-1.5">
                    Czas dojazdu: ~{firstOrderInfo.travelMins} min do {firstOrderInfo.clientName}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-blue-200">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{firstOrderInfo.address}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-100 bg-white/10 rounded-xl px-3 py-1.5 w-fit">
                    <Clock className="w-3 h-3" />
                    <span>Zlecenie o <strong>{firstOrderInfo.orderTime}</strong></span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Stats horizontal strip */}
          {stats && <MetricStrip stats={stats} me={me} tasks={tasks} />}

          {/* Next / active task */}
          <NextTaskCard
            nextTask={nextTask}
            stats={stats}
            router={router}
            performAction={performAction}
            actionLoading={actionLoading}
            onReturnToBase={handleReturnToBase}
          />

          {/* Feature 1 & 3: Return-to-base dialog */}
          <ReturnToBaseDialog
            open={returnDialogOpen}
            onOpenChange={setReturnDialogOpen}
            analysis={returnAnalysis}
            onConfirm={confirmReturnToBase}
            actionLoading={actionLoading}
          />

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
  performAction: (e: string, l: string, extra?: Record<string, unknown>) => void;
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
  nextTask, stats, router, performAction, actionLoading, onReturnToBase,
}: {
  nextTask: Task | null;
  stats: TaskStats | null;
  router: ReturnType<typeof import('next/navigation').useRouter>;
  performAction: (endpoint: string, label: string, extra?: Record<string, unknown>) => void;
  actionLoading: string | null;
  onReturnToBase: () => void;
}) {
  // All tasks done — show "Wracam na baze" button
  if (stats && stats.total > 0 && stats.remaining === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-[0_2px_20px_rgba(0,0,0,0.08)] p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <p className="text-xl font-black text-gray-900">Wszystkie ukończone!</p>
        <p className="text-sm text-gray-400 mt-1.5 mb-5">Świetna robota</p>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={e => { e.stopPropagation(); onReturnToBase(); }}
          disabled={actionLoading === 'return-base'}
          className="w-full flex items-center justify-center gap-2.5 text-white rounded-2xl font-bold text-[15px] bg-slate-700"
          style={{ minHeight: 56 }}
        >
          {actionLoading === 'return-base'
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : <><Home className="w-5 h-5" />Wracam na bazę</>}
        </motion.button>
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

  // Determine the current step and what button to show
  const isAssigned   = nextTask.status === 'assigned';
  const isInTransit  = nextTask.status === 'in_transit';
  const isInProgress = nextTask.status === 'in_progress';

  // Button config based on sequential state
  let btnLabel: string;
  let btnIcon: React.ReactNode;
  let btnColor: string;
  let btnAction: () => void;
  let btnActionKey: string;
  let statusLabel: string;
  let taskIcon: React.ReactNode;

  if (isAssigned) {
    // Step 1: "Wyjeżdżam na zlecenie"
    btnLabel = 'Wyjeżdżam na zlecenie';
    btnIcon = <Car className="w-5 h-5" />;
    btnColor = '#f97316'; // orange
    btnActionKey = `depart-${nextTask.id}`;
    btnAction = () => performAction(`/api/worker/tasks/${nextTask.id}/start-driving`, btnActionKey);
    statusLabel = 'Następne';
    taskIcon = <Navigation className="w-5 h-5" style={{ color: btnColor }} />;
  } else if (isInTransit) {
    // Step 2: "Rozpoczynam pracę"
    btnLabel = 'Rozpoczynam pracę';
    btnIcon = <Wrench className="w-5 h-5" />;
    btnColor = '#2563eb'; // blue
    btnActionKey = `arrive-${nextTask.id}`;
    btnAction = () => performAction(`/api/worker/tasks/${nextTask.id}/arrive`, btnActionKey);
    statusLabel = 'W drodze';
    taskIcon = <Car className="w-5 h-5" style={{ color: btnColor }} />;
  } else if (isInProgress) {
    // Step 3: "Zakończyłem zlecenie"
    btnLabel = 'Zakończyłem zlecenie';
    btnIcon = <Flag className="w-5 h-5" />;
    btnColor = '#059669'; // green
    btnActionKey = `complete-${nextTask.id}`;
    btnAction = () => router.push(`/worker/tasks/${nextTask.id}`);
    statusLabel = 'W trakcie';
    taskIcon = <Wrench className="w-5 h-5" style={{ color: btnColor }} />;
  } else {
    // Fallback
    btnLabel = 'Wyjeżdżam na zlecenie';
    btnIcon = <Car className="w-5 h-5" />;
    btnColor = '#f97316';
    btnActionKey = `depart-${nextTask.id}`;
    btnAction = () => performAction(`/api/worker/tasks/${nextTask.id}/start-driving`, btnActionKey);
    statusLabel = 'Następne';
    taskIcon = <Navigation className="w-5 h-5" style={{ color: btnColor }} />;
  }

  // Step indicators for visual progress
  const steps = [
    { label: 'Wyjazd', done: isInTransit || isInProgress, active: isAssigned },
    { label: 'Praca', done: isInProgress, active: isInTransit },
    { label: 'Koniec', done: false, active: isInProgress },
  ];

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
          {/* Step indicators */}
          <div className="flex items-center gap-1 mb-4">
            {steps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-1 flex-1">
                <div className="flex-1">
                  <div
                    className="h-1 rounded-full transition-colors duration-300"
                    style={{
                      background: step.done ? btnColor : step.active ? btnColor + '60' : '#e5e7eb',
                    }}
                  />
                  <p className={cn(
                    'text-[10px] font-bold mt-1 text-center uppercase tracking-wide',
                    step.done ? 'text-gray-800' : step.active ? 'text-gray-600' : 'text-gray-300',
                  )}>
                    {step.label}
                  </p>
                </div>
                {i < steps.length - 1 && <div className="w-1" />}
              </div>
            ))}
          </div>

          {/* Task meta */}
          <div className="flex items-start gap-3 mb-5">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: btnColor + '18' }}
            >
              {taskIcon}
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
                  <span className="flex-shrink-0 font-semibold">{nextTask.distance_km} km</span>
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

          {/* Main action button */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={e => { e.stopPropagation(); btnAction(); }}
            disabled={actionLoading === btnActionKey}
            className="w-full flex items-center justify-center gap-2.5 text-white rounded-2xl font-bold text-[15px]"
            style={{ minHeight: 56, background: btnColor }}
          >
            {actionLoading === btnActionKey
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : <>{btnIcon}{btnLabel}</>}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Return-to-base Dialog ──────────────────────────────────────────────────

function ReturnToBaseDialog({
  open, onOpenChange, analysis, onConfirm, actionLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysis: ReturnToBaseAnalysis | null;
  onConfirm: () => void;
  actionLoading: string | null;
}) {
  if (!analysis) return null;

  const { shouldReturn, wontMakeIt, timeAtHomeMins, nextOrderTime, departureFromHome, travelToHomeMins, travelFromHomeToNextMins } = analysis;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl max-w-[calc(100%-2rem)] p-0 overflow-hidden">
        {/* Feature 3: Red warning if won't make it */}
        {wontMakeIt && (
          <div className="bg-red-500 px-5 py-4 text-white">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-base">Uwaga! Nie zdążysz!</p>
                <p className="text-sm text-red-100 mt-1">
                  Nie zdążysz na kolejne zlecenie o {nextOrderTime} jeśli wrócisz do bazy.
                  Dojazd do domu: ~{travelToHomeMins} min + dojazd na zlecenie: ~{travelFromHomeToNextMins} min.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-gray-900">
              {shouldReturn ? 'Wracam na bazę' : 'Nie opłaca się wracać'}
            </DialogTitle>
            <DialogDescription className="mt-2">
              {!shouldReturn ? (
                <span className="text-base text-amber-700 font-semibold leading-relaxed">
                  Nie opłaca się wracać. Kolejne zlecenie za {timeAtHomeMins + travelToHomeMins + travelFromHomeToNextMins} minut
                  {' '}&mdash; lepiej jechać bezpośrednio.
                </span>
              ) : (
                <span className="text-base text-gray-600 leading-relaxed">
                  Pamiętaj, kolejne zlecenie o <strong className="text-gray-900">{nextOrderTime}</strong>.
                  Z domu musisz wyjechać o <strong className="text-gray-900">{departureFromHome}</strong>.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Time breakdown */}
          <div className="mt-4 bg-gray-50 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Dojazd do domu</span>
              <span className="font-bold text-gray-800 tabular-nums">~{travelToHomeMins} min</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Czas w domu</span>
              <span className={cn(
                'font-bold tabular-nums',
                timeAtHomeMins < 30 ? 'text-amber-600' : 'text-emerald-600',
              )}>
                ~{timeAtHomeMins} min
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Dojazd na zlecenie</span>
              <span className="font-bold text-gray-800 tabular-nums">~{travelFromHomeToNextMins} min</span>
            </div>
            <div className="border-t pt-2.5 flex items-center justify-between text-sm">
              <span className="text-gray-500 font-semibold">Kolejne zlecenie</span>
              <span className="font-black text-gray-900 tabular-nums">{nextOrderTime}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 space-y-2.5">
            {shouldReturn ? (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onConfirm}
                disabled={actionLoading === 'return-base'}
                className="w-full flex items-center justify-center gap-2 bg-slate-700 text-white rounded-2xl font-bold text-[15px] disabled:opacity-60"
                style={{ minHeight: 52 }}
              >
                {actionLoading === 'return-base'
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <><Home className="w-5 h-5" />Tak, wracam na bazę</>}
              </motion.button>
            ) : (
              <>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onOpenChange(false)}
                  className="w-full flex items-center justify-center gap-2 bg-orange-500 text-white rounded-2xl font-bold text-[15px]"
                  style={{ minHeight: 52 }}
                >
                  <Navigation className="w-5 h-5" />
                  Jadę bezpośrednio na zlecenie
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onConfirm}
                  disabled={actionLoading === 'return-base'}
                  className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-600 rounded-2xl font-bold text-[15px] disabled:opacity-60"
                  style={{ minHeight: 52 }}
                >
                  {actionLoading === 'return-base'
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <><Home className="w-5 h-5" />Mimo to wracam na bazę</>}
                </motion.button>
              </>
            )}
            <button
              onClick={() => onOpenChange(false)}
              className="w-full text-center text-sm font-semibold text-gray-400 py-2"
            >
              Anuluj
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
