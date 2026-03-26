'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Car, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import TaskHeader from './_components/TaskHeader';
import ClientInfo from './_components/ClientInfo';
import ServiceList from './_components/ServiceList';
import TimeInfo from './_components/TimeInfo';
import DispatcherNotes from './_components/DispatcherNotes';
import MainAction from './_components/MainAction';
import CompletionForm from './_components/CompletionForm';
import ProblemButton from './_components/ProblemButton';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TaskService {
  name?: string;
  service_id?: string;
  price?: number;
  quantity?: number;
}

interface Task {
  id: string;
  status: string;
  priority: string;
  task_type?: string;
  scheduled_time_start: string | null;
  scheduled_time_end: string | null;
  time_window: string | null;
  description: string | null;
  notes: string | null;
  services: Array<TaskService | string>;
  client_name: string;
  client_phone: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  navigate_url: string | null;
  photos_taken: number;
  completed_at?: string | null;
  buffer_minutes?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDatetimePL(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function getGeolocation(): Promise<{ lat?: number; lng?: number }> {
  try {
    const pos = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        timeout: 5000,
        enableHighAccuracy: true,
      });
    });
    return { lat: pos?.coords.latitude, lng: pos?.coords.longitude };
  } catch {
    return {};
  }
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const router = useRouter();
  const today = getTodayString();

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [transitToast, setTransitToast] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // ── Fetch employee ──────────────────────────────────────────────────────────

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

  // ── Fetch task ──────────────────────────────────────────────────────────────

  const fetchTask = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/worker/tasks?date=${today}&employee_id=${employeeId}`);
      if (!res.ok) throw new Error('Nie mozna pobrac zadan');
      const data = await res.json();
      const found: Task | undefined = (data.tasks ?? []).find((t: Task) => t.id === taskId);
      if (!found) throw new Error('Zlecenie nie zostalo znalezione');
      setTask(found);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Blad ladowania');
    } finally {
      setLoading(false);
    }
  }, [employeeId, taskId, today]);

  useEffect(() => {
    if (employeeId) fetchTask();
  }, [employeeId, fetchTask]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleMainAction() {
    if (!task) return;
    setActionLoading(true);
    setActionError(null);

    try {
      const geo = await getGeolocation();

      if (task.status === 'assigned') {
        const res = await fetch(`/api/worker/tasks/${task.id}/start-driving`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geo),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? 'Blad rozpoczecia przejazdu');
        }
        setTransitToast(true);
        setTimeout(() => setTransitToast(false), 3000);
        await fetchTask();
        if (task.navigate_url) window.open(task.navigate_url, '_blank');
      } else if (task.status === 'in_transit') {
        const res = await fetch(`/api/worker/tasks/${task.id}/arrive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geo),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? 'Blad zgloszenia przyjazdu');
        }
        await fetchTask();
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Blad');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleComplete(data: { notes: string; photos: File[]; closureCodeId: string | null }) {
    if (!task) return;
    setCompleting(true);
    setCompleteError(null);

    try {
      const photoUrls: string[] = [];
      for (const file of data.photos) {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          if (uploadData.url) photoUrls.push(uploadData.url);
        }
      }

      const res = await fetch('/api/worker/tasks/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: task.id,
          notes: data.notes.trim() || undefined,
          photos: photoUrls.length > 0 ? photoUrls : undefined,
          closure_code_id: data.closureCodeId,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Blad zakonczenia zlecenia');
      }

      const resData = await res.json();
      setCompletedAt(resData.completed_at ?? new Date().toISOString());
      setTimeout(() => router.back(), 1500);
    } catch (err: unknown) {
      setCompleteError(err instanceof Error ? err.message : 'Blad zakonczenia');
    } finally {
      setCompleting(false);
    }
  }

  // ── Loading / Error ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="max-w-lg mx-auto p-4 pt-6">
        <motion.button
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex items-center justify-center mb-6"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </motion.button>
        <div className="rounded-3xl bg-red-50 border border-red-100 p-5 text-sm text-red-700 font-medium">
          {error ?? 'Nie znaleziono zlecenia'}
        </div>
      </div>
    );
  }

  const isTerminal = task.status === 'completed' || task.status === 'cancelled';

  return (
    <div className="max-w-lg mx-auto px-5 pb-32 pt-5">
      {/* Toast */}
      <AnimatePresence>
        {transitToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold flex items-center gap-2"
          >
            <Car className="w-4 h-4" />
            Rozpoczęto przejazd do klienta
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back button */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        type="button"
        onClick={() => router.back()}
        className="w-10 h-10 rounded-2xl bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] flex items-center justify-center mb-5"
      >
        <ArrowLeft className="w-5 h-5 text-gray-700" />
      </motion.button>

      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Status header */}
        <TaskHeader
          status={task.status}
          priority={task.priority}
          taskType={task.task_type}
        />

        {/* Client info — name, phone, address */}
        <ClientInfo
          clientName={task.client_name}
          clientPhone={task.client_phone}
          address={task.address}
          distanceKm={task.distance_km}
          navigateUrl={task.navigate_url}
        />

        {/* Time info */}
        <TimeInfo
          scheduledStart={task.scheduled_time_start}
          scheduledEnd={task.scheduled_time_end}
          timeWindow={task.time_window}
          bufferMinutes={task.buffer_minutes}
        />

        {/* Services */}
        <ServiceList services={task.services} />

        {/* Dispatcher notes */}
        <DispatcherNotes notes={task.notes} description={task.description} />

        {/* Action error */}
        <AnimatePresence>
          {actionError && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-3xl bg-red-50 border border-red-100 p-4 text-sm text-red-700 font-medium"
            >
              {actionError}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Completed banner */}
        {(task.status === 'completed' || completedAt) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-3xl p-5"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Zlecenie ukonczone</p>
              {(completedAt ?? task.completed_at) && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDatetimePL(completedAt ?? task.completed_at!)}
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* Completion form — only for in_progress */}
        {task.status === 'in_progress' && !completedAt && (
          <>
            <ProblemButton taskId={taskId} />
            <CompletionForm
              onComplete={handleComplete}
              completing={completing}
              error={completeError}
            />
          </>
        )}
      </motion.div>

      {/* Fixed main action button — for assigned / in_transit */}
      {!isTerminal && task.status !== 'in_progress' && (
        <MainAction
          status={task.status}
          loading={actionLoading}
          onPress={handleMainAction}
        />
      )}
    </div>
  );
}
