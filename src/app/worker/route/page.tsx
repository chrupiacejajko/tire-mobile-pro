'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw, CheckCircle2, Car, Loader2,
  Wrench, AlertTriangle, MapPin, ChevronRight, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useOrdersRealtime } from '@/hooks/use-orders-realtime';

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
  services: Array<{ name?: string } | string>;
  task_type?: string;
  buffer_minutes?: number;
}

interface TasksResponse {
  tasks: Task[];
  stats: { total: number; completed: number; remaining: number; progress_pct: number };
  estimated_finish?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTodayString() { return new Date().toISOString().split('T')[0]; }

function getServiceNames(services: Task['services']): string[] {
  return services.map(s => typeof s === 'string' ? s : s?.name ?? '').filter(Boolean);
}

function getNodeState(task: Task, index: number, activeIndex: number) {
  if (task.status === 'completed') return 'done';
  if (task.status === 'in_transit' || task.status === 'in_progress') return 'active';
  if (index === activeIndex) return 'next';
  return 'idle';
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function RoutePage() {
  const router = useRouter();
  const today  = getTodayString();

  const [data, setData]       = useState<TasksResponse | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchData = useCallback(async (empId?: string) => {
    const eid = empId ?? employeeId;
    if (!eid) return;
    try {
      const res = await fetch(`/api/worker/tasks?date=${today}&employee_id=${eid}`);
      if (!res.ok) throw new Error('Błąd pobierania');
      setData(await res.json());
      setError(null);
    } catch {
      setError('Nie można załadować trasy');
    }
  }, [today, employeeId]);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/worker/me');
        if (!res.ok) return;
        const me = await res.json();
        setEmployeeId(me.employee_id);
        await fetchData(me.employee_id);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [fetchData]);

  useOrdersRealtime(() => fetchData(), !!employeeId);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-gray-300 animate-spin" />
      </div>
    );
  }

  const tasks  = data?.tasks ?? [];
  const stats  = data?.stats;
  const pct    = stats?.progress_pct ?? 0;

  // Find the first non-completed task index
  const activeIndex = tasks.findIndex(t => t.status !== 'completed' && t.status !== 'cancelled');

  return (
    <div className="max-w-lg mx-auto">

      {/* ── Sticky header ───────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 px-5 pt-5 pb-4"
        style={{ background: 'rgba(245,245,247,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[22px] font-black text-gray-900 tracking-tight">Trasa</h1>
            <p className="text-[13px] text-gray-400 font-medium capitalize mt-0.5">
              {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => fetchData()}
            className="w-10 h-10 rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] flex items-center justify-center"
          >
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </motion.button>
        </div>

        {/* Progress bar */}
        {stats && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                {stats.completed} / {stats.total} zleceń
              </span>
              <span className="text-[11px] font-bold text-orange-500">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-orange-500"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-5 mb-4 flex items-center gap-2 bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600 font-medium">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Timeline ────────────────────────────────────────────────────────── */}
      {tasks.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <MapPin className="w-7 h-7 text-gray-300" />
          </div>
          <p className="font-bold text-gray-500">Brak zleceń na dziś</p>
          <p className="text-sm text-gray-400 mt-1">Sprawdź ponownie później</p>
        </div>
      ) : (
        <div className="px-5 pb-6 pt-2">
          <div className="relative">
            {/* Vertical connecting line */}
            <div className="absolute left-[20px] top-5 bottom-5 w-[2px] bg-gray-200 z-0" />

            {tasks.map((task, i) => {
              const nodeState  = getNodeState(task, i, activeIndex);
              const services   = getServiceNames(task.services);
              const timeStr    = task.scheduled_time_start?.slice(0, 5) ?? task.time_window ?? '';
              const isActive   = nodeState === 'active';
              const isDone     = nodeState === 'done';

              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  className="relative flex gap-4 mb-3 z-10"
                >
                  {/* ── Node circle ─────────────────────────────────────────── */}
                  <div className="flex-shrink-0 flex flex-col items-center">
                    <div className={cn(
                      'w-[42px] h-[42px] rounded-full flex items-center justify-center border-2 transition-all',
                      isDone  ? 'bg-emerald-500 border-emerald-500' :
                      isActive ? 'bg-orange-500 border-orange-500 shadow-[0_0_0_4px_rgba(249,115,22,0.2)]' :
                      nodeState === 'next' ? 'bg-gray-900 border-gray-900' :
                                 'bg-white border-gray-200',
                    )}>
                      {isDone ? (
                        <Check className="w-4 h-4 text-white" strokeWidth={3} />
                      ) : isActive ? (
                        task.status === 'in_transit'
                          ? <Car className="w-4 h-4 text-white" />
                          : <Wrench className="w-4 h-4 text-white" />
                      ) : (
                        <span className={cn(
                          'text-sm font-black',
                          nodeState === 'next' ? 'text-white' : 'text-gray-400',
                        )}>
                          {i + 1}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ── Task card ───────────────────────────────────────────── */}
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => router.push(`/worker/tasks/${task.id}`)}
                    className={cn(
                      'flex-1 text-left rounded-3xl overflow-hidden transition-all mb-1',
                      isActive
                        ? 'bg-white shadow-[0_4px_24px_rgba(0,0,0,0.12)] ring-2 ring-orange-400/30'
                        : isDone
                        ? 'bg-white/60 shadow-[0_1px_4px_rgba(0,0,0,0.04)]'
                        : 'bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]',
                    )}
                  >
                    {/* Status accent stripe */}
                    {isActive && (
                      <div className="h-0.5 bg-orange-500" />
                    )}

                    <div className="p-4">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <span className={cn(
                            'text-[15px] font-black tracking-tight leading-tight truncate block',
                            isDone ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-900',
                          )}>
                            {task.client_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {timeStr && (
                            <span className={cn(
                              'text-[13px] font-black tabular-nums',
                              isActive ? 'text-orange-500' : 'text-gray-400',
                            )}>
                              {timeStr}
                            </span>
                          )}
                          {task.distance_km && (
                            <span className="text-[11px] font-bold text-gray-300 bg-gray-50 px-2 py-0.5 rounded-full">
                              {task.distance_km} km
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        </div>
                      </div>

                      {/* Address */}
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <MapPin className="w-3 h-3 text-gray-300 flex-shrink-0" />
                        <span className={cn(
                          'text-[12px] truncate',
                          isDone ? 'text-gray-300' : 'text-gray-400',
                        )}>
                          {task.address}
                        </span>
                      </div>

                      {/* Services */}
                      {services.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {services.slice(0, 3).map((name, si) => (
                            <span
                              key={si}
                              className={cn(
                                'text-[10px] font-bold px-2.5 py-1 rounded-full',
                                isDone
                                  ? 'bg-gray-100 text-gray-300'
                                  : isActive
                                  ? 'bg-orange-50 text-orange-600'
                                  : 'bg-gray-100 text-gray-500',
                              )}
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Buffer warning */}
                      {task.buffer_minutes !== undefined && task.buffer_minutes <= 30 && !isDone && (
                        <div className="flex items-center gap-1.5 mt-2.5">
                          <AlertTriangle className={cn(
                            'w-3 h-3',
                            task.buffer_minutes === 0 ? 'text-red-500' : 'text-amber-500',
                          )} />
                          <span className={cn(
                            'text-[11px] font-bold',
                            task.buffer_minutes === 0 ? 'text-red-500' : 'text-amber-500',
                          )}>
                            {task.buffer_minutes === 0 ? 'Brak bufora' : `${task.buffer_minutes} min bufora`}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.button>
                </motion.div>
              );
            })}
          </div>

          {/* All done banner */}
          {stats && stats.remaining === 0 && stats.total > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-4 flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-3xl p-4"
            >
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-black text-emerald-800">Wszystkie zlecenia ukończone!</p>
                <p className="text-xs text-emerald-600 mt-0.5">Świetna robota dzisiaj 🎉</p>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
