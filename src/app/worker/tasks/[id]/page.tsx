'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, MapPin, Clock, Phone, Navigation, CheckCircle2,
  Camera, X, AlertTriangle, Loader2, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  return timeStr.slice(0, 5);
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

function priceFmt(price: number): string {
  return price.toFixed(2).replace('.', ',') + ' zł';
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  new: 'Nowe',
  assigned: 'Przypisane',
  in_progress: 'W trakcie',
  completed: 'Ukończone',
  cancelled: 'Anulowane',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-sm font-medium',
        {
          'bg-gray-100 text-gray-700': status === 'new' || status === 'assigned',
          'bg-blue-100 text-blue-700': status === 'in_progress',
          'bg-green-100 text-green-700': status === 'completed',
          'bg-red-100 text-red-700': status === 'cancelled',
        },
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Photo preview ─────────────────────────────────────────────────────────────

function PhotoPreviews({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {files.map((file, i) => {
        const url = URL.createObjectURL(file);
        return (
          <div key={i} className="relative w-20 h-20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Zdjęcie ${i + 1}`}
              className="w-20 h-20 object-cover rounded-lg border border-gray-200"
              onLoad={() => URL.revokeObjectURL(url)}
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Delay form ────────────────────────────────────────────────────────────────

function DelayForm({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/worker/tasks/${taskId}/report-delay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Błąd zgłoszenia');
      }
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd zgłoszenia');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
        Opóźnienie zostało zgłoszone.{' '}
        <button type="button" onClick={onClose} className="font-medium underline">
          Zamknij
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-4">
      <p className="text-sm font-semibold text-yellow-900 mb-2">Zgłoś opóźnienie</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Powód opóźnienia..."
        className="w-full rounded-lg border border-yellow-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !reason.trim()}
          className="flex-1 rounded-lg bg-yellow-500 text-white text-sm font-medium py-2 disabled:opacity-50 active:bg-yellow-600 transition-colors"
        >
          {submitting ? 'Wysyłanie...' : 'Wyślij'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-yellow-300 text-yellow-800 text-sm font-medium px-4 py-2 active:bg-yellow-100 transition-colors"
        >
          Anuluj
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const router = useRouter();
  const today = getTodayString();

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Completion form state
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [completing, setCompleting] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [showDelayForm, setShowDelayForm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch employee ID ────────────────────────────────────────────────────

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

  // ── Fetch task ────────────────────────────────────────────────────────────

  const fetchTask = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/worker/tasks?date=${today}&employee_id=${employeeId}`);
      if (!res.ok) throw new Error('Nie można pobrać zadań');
      const data = await res.json();
      const found: Task | undefined = (data.tasks ?? []).find((t: Task) => t.id === taskId);
      if (!found) throw new Error('Zlecenie nie zostało znalezione');
      setTask(found);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd ładowania');
    } finally {
      setLoading(false);
    }
  }, [employeeId, taskId, today]);

  useEffect(() => {
    if (employeeId) {
      fetchTask();
    }
  }, [employeeId, fetchTask]);

  // ── Photo handling ────────────────────────────────────────────────────────

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPhotos((prev) => {
      const combined = [...prev, ...files];
      return combined.slice(0, 5);
    });
    // Reset input so same file can be re-added after removal
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Complete task ─────────────────────────────────────────────────────────

  async function handleComplete() {
    if (!task) return;
    setCompleting(true);
    setCompleteError(null);

    try {
      // Upload photos first if any
      const photoUrls: string[] = [];
      for (const file of photos) {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
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
          notes: notes.trim() || undefined,
          photos: photoUrls.length > 0 ? photoUrls : undefined,
          closure_code_id: null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Błąd zakończenia zlecenia');
      }

      const data = await res.json();
      setCompletedAt(data.completed_at ?? new Date().toISOString());

      // Navigate back after 1.5s
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (err: unknown) {
      setCompleteError(err instanceof Error ? err.message : 'Błąd zakończenia');
    } finally {
      setCompleting(false);
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const isTerminal = task?.status === 'completed' || task?.status === 'cancelled';
  const timeDisplay = task
    ? task.scheduled_time_start
      ? formatTime(task.scheduled_time_start) +
        (task.scheduled_time_end ? ' – ' + formatTime(task.scheduled_time_end) : '')
      : task.time_window ?? ''
    : '';

  // ── Loading / error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-lg mx-auto p-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-gray-600 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Trasa
          </button>
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error ?? 'Nie znaleziono zlecenia'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto p-4 pb-10">
        {/* Back button */}
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-600 mb-5 active:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Trasa
        </button>

        {/* Status badge */}
        <div className="mb-3">
          <StatusBadge status={task.status} />
        </div>

        {/* Client name */}
        <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-4">
          {task.client_name}
        </h1>

        {/* Details card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4 space-y-3">
          {/* Phone */}
          {task.client_phone && (
            <a
              href={`tel:${task.client_phone}`}
              className="flex items-center gap-3 text-sm"
            >
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <Phone className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-green-700 font-medium">{task.client_phone}</span>
              <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
            </a>
          )}

          {/* Address */}
          <div className="flex items-start gap-3 text-sm">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <MapPin className="w-4 h-4 text-gray-500" />
            </div>
            <div>
              <p className="text-gray-900">{task.address}</p>
              {task.distance_km !== null && (
                <p className="text-xs text-gray-400 mt-0.5">{task.distance_km} km od Ciebie</p>
              )}
            </div>
          </div>

          {/* Time */}
          {timeDisplay && (
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-gray-500" />
              </div>
              <span className="text-gray-900">{timeDisplay}</span>
            </div>
          )}
        </div>

        {/* Services */}
        {task.services.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Usługi
            </h2>
            <div className="space-y-2">
              {task.services.map((s, i) => {
                const name = typeof s === 'string' ? s : (s as TaskService).name ?? '';
                const price = typeof s !== 'string' ? (s as TaskService).price : undefined;
                const qty = typeof s !== 'string' ? (s as TaskService).quantity : undefined;
                return (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-800">
                      {name}
                      {qty && qty > 1 && (
                        <span className="text-gray-400 ml-1">× {qty}</span>
                      )}
                    </span>
                    {price !== undefined && price > 0 && (
                      <span className="text-gray-600 font-medium">{priceFmt(price)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes from dispatcher */}
        {task.notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
              Notatka dyspozytora
            </p>
            <p className="text-sm text-amber-900 leading-relaxed">{task.notes}</p>
          </div>
        )}

        {/* Description */}
        {task.description && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Opis
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{task.description}</p>
          </div>
        )}

        {/* Navigate button */}
        {task.navigate_url && (
          <a
            href={task.navigate_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-gray-900 text-white text-base font-semibold py-4 mb-5 active:bg-gray-800 transition-colors"
          >
            <Navigation className="w-5 h-5" />
            Nawiguj
          </a>
        )}

        {/* Completed banner */}
        {(task.status === 'completed' || completedAt) && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Zlecenie ukończone</p>
              {(completedAt ?? task.completed_at) && (
                <p className="text-xs text-green-600 mt-0.5">
                  {formatDatetimePL(completedAt ?? task.completed_at!)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Completion form — only shown for non-terminal statuses */}
        {!isTerminal && !completedAt && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                Zakończenie zlecenia
              </h2>

              {/* Notes textarea */}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Notatki (opcjonalnie)..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white resize-none transition-colors"
              />

              {/* Photo input */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photos.length >= 5}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2.5 text-sm text-gray-600 w-full justify-center active:bg-gray-50 transition-colors',
                    { 'opacity-40 cursor-not-allowed': photos.length >= 5 },
                  )}
                >
                  <Camera className="w-4 h-4" />
                  {photos.length === 0
                    ? 'Dodaj zdjęcia (max 5)'
                    : `Dodaj więcej (${photos.length}/5)`}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                <PhotoPreviews files={photos} onRemove={removePhoto} />
              </div>
            </div>

            {/* Delay form toggle */}
            {!showDelayForm ? (
              <button
                type="button"
                onClick={() => setShowDelayForm(true)}
                className="flex items-center gap-2 w-full text-sm text-yellow-700 font-medium py-2 justify-center"
              >
                <AlertTriangle className="w-4 h-4" />
                Zgłoś opóźnienie
              </button>
            ) : (
              <DelayForm taskId={taskId} onClose={() => setShowDelayForm(false)} />
            )}

            {/* Complete error */}
            {completeError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {completeError}
              </div>
            )}

            {/* Complete button */}
            <button
              type="button"
              onClick={handleComplete}
              disabled={completing}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-green-600 text-white text-base font-semibold py-4 disabled:opacity-60 active:bg-green-700 transition-colors"
            >
              {completing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Kończenie...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Zakończ zlecenie
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
