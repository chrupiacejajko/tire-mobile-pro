'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin, Phone, CheckCircle, Navigation, Camera, ChevronDown,
  ChevronUp, Clock, Circle, Loader2, AlertCircle, Star, ArrowRight, Play,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

// ── Shift types & helpers ────────────────────────────────────────────────────

interface Shift {
  id: string;
  employee_id: string;
  date: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
}

function formatShiftTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  status: string;
  priority: string;
  scheduled_time_start: string | null;
  time_window: string | null;
  description: string | null;
  notes: string | null;
  services: any[];
  client_name: string;
  client_phone: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  navigate_url: string | null;
  photos_taken: number;
}

interface WorkerData {
  date: string;
  employee_id: string;
  tasks: Task[];
  stats: { total: number; completed: number; remaining: number; progress_pct: number };
  next_task_id: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIME_WINDOW_LABELS: Record<string, string> = {
  morning: '08:00–12:00',
  afternoon: '12:00–16:00',
  evening: '16:00–20:00',
};

const STATUS_CONFIG = {
  pending:     { label: 'Oczekuje',   bg: 'bg-gray-100',    text: 'text-gray-600',    dot: 'bg-gray-400' },
  in_progress: { label: 'W trakcie',  bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  completed:   { label: 'Ukończone',  bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled:   { label: 'Anulowane', bg: 'bg-red-100',     text: 'text-red-600',     dot: 'bg-red-400' },
};

// ── Complete Modal ─────────────────────────────────────────────────────────────

function CompleteModal({
  task,
  onConfirm,
  onClose,
}: {
  task: Task;
  onConfirm: (notes: string, photos: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        setPhotos(prev => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(notes, photos); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-0">
      <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 space-y-4">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto" />
        <h2 className="text-lg font-bold text-gray-900">Zakończ zlecenie</h2>
        <p className="text-sm text-gray-500">{task.client_name} — {task.address}</p>

        {/* Notes */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Notatki (opcjonalne)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Opisz wykonaną pracę, uwagi..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 resize-none"
          />
        </div>

        {/* Photo */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Zdjęcia dokumentacyjne {photos.length > 0 && <span className="text-orange-500">({photos.length})</span>}
          </label>
          <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 rounded-xl py-4 flex flex-col items-center gap-2 text-gray-400 hover:border-orange-300 hover:text-orange-400 transition-colors"
          >
            <Camera className="h-6 w-6" />
            <span className="text-sm">Zrób zdjęcie lub wybierz z galerii</span>
          </button>
          {photos.length > 0 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <img key={i} src={p} alt="" className="h-16 w-16 rounded-lg object-cover flex-shrink-0" />
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 font-medium">
            Anuluj
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
            Ukończ
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  isNext,
  onComplete,
}: {
  task: Task;
  isNext: boolean;
  onComplete: (t: Task) => void;
}) {
  const [expanded, setExpanded] = useState(isNext && task.status !== 'completed');
  const cfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const done = task.status === 'completed';

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${
      done ? 'border-emerald-200 bg-emerald-50/40 opacity-70' :
      isNext ? 'border-orange-300 bg-orange-50/40 shadow-lg shadow-orange-100' :
      'border-gray-200 bg-white'
    }`}>
      {/* Header */}
      <button
        className="w-full px-4 py-4 flex items-start gap-3 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Status icon */}
        <div className="mt-0.5 flex-shrink-0">
          {done
            ? <CheckCircle className="h-6 w-6 text-emerald-500" />
            : isNext
              ? <div className="h-6 w-6 rounded-full bg-orange-500 flex items-center justify-center"><ArrowRight className="h-3.5 w-3.5 text-white" /></div>
              : <Circle className="h-6 w-6 text-gray-300" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={`font-semibold text-sm ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
              {task.client_name}
            </p>
            {task.priority === 'urgent' && (
              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">PILNE</span>
            )}
            {isNext && !done && (
              <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">NASTĘPNE</span>
            )}
          </div>
          <p className="text-xs text-gray-400 truncate flex items-center gap-1">
            <MapPin className="h-3 w-3 flex-shrink-0" />{task.address}
          </p>
          <div className="flex items-center gap-3 mt-1">
            {task.scheduled_time_start && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="h-3 w-3" />{task.scheduled_time_start}
              </span>
            )}
            {task.time_window && (
              <span className="text-xs text-blue-500">{TIME_WINDOW_LABELS[task.time_window]}</span>
            )}
            {task.distance_km !== null && !done && (
              <span className="text-xs text-gray-400">{task.distance_km} km</span>
            )}
            {task.photos_taken > 0 && (
              <span className="text-xs text-gray-400 flex items-center gap-0.5">
                <Camera className="h-3 w-3" />{task.photos_taken}
              </span>
            )}
          </div>
        </div>

        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />}
      </button>

      {/* Expanded */}
      {expanded && !done && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {task.description && (
            <p className="text-sm text-gray-600">{task.description}</p>
          )}

          {task.services.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {task.services.map((s: any, i: number) => (
                <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                  {typeof s === 'string' ? s : s?.name ?? ''}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {task.navigate_url && (
              <a
                href={task.navigate_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white font-medium text-sm"
              >
                <Navigation className="h-4 w-4" />
                Nawiguj
              </a>
            )}
            {task.client_phone && (
              <a
                href={`tel:${task.client_phone}`}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm"
              >
                <Phone className="h-4 w-4" />
                Zadzwoń
              </a>
            )}
          </div>

          <button
            onClick={() => onComplete(task)}
            className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-200"
          >
            <CheckCircle className="h-5 w-5" />
            Zakończ zlecenie
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MobilePage() {
  const { user } = useAuth();
  const [data, setData] = useState<WorkerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [completeTask, setCompleteTask] = useState<Task | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftSeconds, setShiftSeconds] = useState(0);

  // Get employee_id from user profile
  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/employees?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d?.employee_id) setEmployeeId(d.employee_id); })
      .catch(() => {});
  }, [user?.id]);

  const load = useCallback(async (empId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`/api/worker/tasks?date=${today}&employee_id=${empId}`);
    const json = await res.json();
    setData(json);
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);
    load(employeeId).finally(() => setLoading(false));
  }, [employeeId, load]);

  // Fetch shift on mount
  useEffect(() => {
    if (!employeeId) return;
    const today = new Date().toISOString().split('T')[0];
    fetch(`/api/shifts?date=${today}&employee_id=${employeeId}`)
      .then(r => r.json())
      .then(d => { if (d?.shift) setShift(d.shift); })
      .catch(() => {});
  }, [employeeId]);

  // Timer effect: tick every second while shift is active
  useEffect(() => {
    if (!shift || shift.clock_out) {
      setShiftSeconds(0);
      return;
    }
    const calcSeconds = () => {
      const elapsed = (Date.now() - new Date(shift.clock_in).getTime()) / 1000;
      return Math.max(0, Math.floor(elapsed));
    };
    setShiftSeconds(calcSeconds());
    const interval = setInterval(() => setShiftSeconds(calcSeconds()), 1000);
    return () => clearInterval(interval);
  }, [shift]);

  const handleClockIn = async () => {
    if (!employeeId) return;
    setShiftLoading(true);
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, action: 'clock_in' }),
      });
      const d = await res.json();
      if (d?.shift) setShift(d.shift);
    } catch { /* ignore */ }
    finally { setShiftLoading(false); }
  };

  const handleClockOut = async () => {
    if (!employeeId) return;
    setShiftLoading(true);
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, action: 'clock_out' }),
      });
      const d = await res.json();
      if (d?.shift) setShift(d.shift);
    } catch { /* ignore */ }
    finally { setShiftLoading(false); }
  };

  const handleBreak = async () => {
    if (!employeeId) return;
    setShiftLoading(true);
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, action: 'add_break', break_minutes: 15 }),
      });
      const d = await res.json();
      if (d?.shift) setShift(d.shift);
    } catch { /* ignore */ }
    finally { setShiftLoading(false); }
  };

  const handleComplete = async (notes: string, photos: string[]) => {
    if (!completeTask) return;
    const res = await fetch('/api/worker/tasks/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: completeTask.id, notes, photos }),
    });
    if (res.ok) {
      setSuccessId(completeTask.id);
      setCompleteTask(null);
      if (employeeId) load(employeeId);
      setTimeout(() => setSuccessId(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 text-orange-500 animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Ładowanie zleceń...</p>
        </div>
      </div>
    );
  }

  if (!employeeId || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-gray-300 mx-auto" />
          <p className="text-gray-500">Nie znaleziono profilu pracownika</p>
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen bg-gray-50 pb-safe">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-safe-top pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-400 capitalize">{today}</p>
            <h1 className="text-lg font-bold text-gray-900">Moje zlecenia</h1>
          </div>
          <button
            onClick={() => employeeId && load(employeeId)}
            className="p-2 rounded-xl bg-gray-100 text-gray-500"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{data.stats.completed} z {data.stats.total} ukończonych</span>
            <span className="font-semibold text-gray-900">{data.stats.progress_pct}%</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${data.stats.progress_pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Success toast */}
      {successId && (
        <div className="fixed top-24 left-4 right-4 z-50 bg-emerald-500 text-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="h-5 w-5" />
          <span className="font-medium">Zlecenie ukończone!</span>
        </div>
      )}

      {/* Shift section */}
      <div className="px-4 pt-4">
        {!shift || shift.clock_out ? (
          <motion.button
            onClick={handleClockIn}
            disabled={shiftLoading}
            whileTap={{ scale: 0.97 }}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-lg shadow-lg shadow-emerald-500/30 disabled:opacity-60"
          >
            {shiftLoading ? (
              <Loader2 className="h-5 w-5 inline mr-2 animate-spin" />
            ) : (
              <Play className="h-5 w-5 inline mr-2" />
            )}
            Rozpocznij zmian\u0119
          </motion.button>
        ) : (
          <div className="p-4 rounded-2xl bg-white border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Czas zmiany</p>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatShiftTime(shiftSeconds)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Przerwa</p>
                <p className="text-lg font-bold text-amber-600">{shift.break_minutes}m</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBreak}
                disabled={shiftLoading}
                className="flex-1 py-2.5 rounded-xl bg-amber-50 text-amber-700 font-semibold text-sm border border-amber-200 disabled:opacity-60"
              >
                \u2615 Przerwa +15min
              </button>
              <button
                onClick={handleClockOut}
                disabled={shiftLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-700 font-semibold text-sm border border-red-200 disabled:opacity-60"
              >
                \u23f9 Zako\u0144cz zmian\u0119
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="p-4 space-y-3">
        {data.stats.remaining === 0 && (
          <div className="text-center py-8 space-y-2">
            <div className="text-5xl">🎉</div>
            <p className="font-bold text-gray-900 text-lg">Wszystko gotowe!</p>
            <p className="text-gray-400 text-sm">Ukończyłeś wszystkie zlecenia na dziś</p>
          </div>
        )}

        {data.tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            isNext={task.id === data.next_task_id}
            onComplete={setCompleteTask}
          />
        ))}
      </div>

      {/* Complete modal */}
      {completeTask && (
        <CompleteModal
          task={completeTask}
          onConfirm={handleComplete}
          onClose={() => setCompleteTask(null)}
        />
      )}
    </div>
  );
}
