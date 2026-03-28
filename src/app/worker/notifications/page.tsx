'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell, CheckCheck, MapPin, Loader2,
  Zap, XCircle, ArrowRightCircle, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { showLocalNotification } from '@/lib/worker/push-notifications';
import { isUuid } from '@/lib/uuid';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WorkerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  sent_at: string;
  order_id: string | null;
}

// ── Type config ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
  order_assigned:  { icon: <MapPin className="w-4 h-4" />,          bg: 'bg-blue-50',   color: 'text-blue-500'   },
  order_cancelled: { icon: <XCircle className="w-4 h-4" />,         bg: 'bg-red-50',    color: 'text-red-500'    },
  order_changed:   { icon: <ArrowRightCircle className="w-4 h-4" />, bg: 'bg-amber-50',  color: 'text-amber-500'  },
  order_asap:      { icon: <Zap className="w-4 h-4" />,             bg: 'bg-violet-50', color: 'text-violet-500' },
  default:         { icon: <Bell className="w-4 h-4" />,            bg: 'bg-gray-100',  color: 'text-gray-400'   },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'przed chwilą';
  if (diff < 3600)  return `${Math.floor(diff / 60)} min temu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h temu`;
  return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

function getDateGroup(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Dziś';
  if (date.toDateString() === yesterday.toDateString()) return 'Wczoraj';
  return 'Wcześniej';
}

function groupNotifications(notifications: WorkerNotification[]): Map<string, WorkerNotification[]> {
  const groups = new Map<string, WorkerNotification[]>();
  for (const n of notifications) {
    const g = getDateGroup(n.sent_at);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(n);
  }
  const sorted = new Map<string, WorkerNotification[]>();
  for (const key of ['Dziś', 'Wczoraj', 'Wcześniej']) {
    if (groups.has(key)) sorted.set(key, groups.get(key)!);
  }
  return sorted;
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<WorkerNotification[]>([]);
  const [loading, setLoading]   = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const employeeIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const meRes = await fetch('/api/worker/me');
      if (!meRes.ok) return;
      const me = await meRes.json();
      employeeIdRef.current = isUuid(me.employee_id) ? me.employee_id : null;
      if (!isUuid(me.employee_id)) {
        setNotifications([]);
        return;
      }
      const res = await fetch(`/api/worker-notifications?employee_id=${me.employee_id}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;
    async function setup() {
      try {
        const meRes = await fetch('/api/worker/me');
        if (!meRes.ok) return;
        const me = await meRes.json();
        if (!isUuid(me.employee_id)) return;
        const supabase = createClient();
        channel = supabase
          .channel('worker-notifications-page')
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'worker_notifications',
            filter: `employee_id=eq.${me.employee_id}`,
          }, (payload) => {
            const n = payload.new as WorkerNotification;
            setNotifications(prev => [n, ...prev]);
            setNewIds(prev => new Set(prev).add(n.id));
            showLocalNotification(n.title, n.body, `notif-${n.id}`);
            setTimeout(() => setNewIds(prev => { const next = new Set(prev); next.delete(n.id); return next; }), 1000);
          })
          .subscribe();
      } catch { /* offline */ }
    }
    setup();
    return () => {
      if (channel) { const supabase = createClient(); supabase.removeChannel(channel); }
    };
  }, []);

  async function markAllRead() {
    setMarkingAll(true);
    try {
      const meRes = await fetch('/api/worker/me');
      if (!meRes.ok) return;
      const me = await meRes.json();
      if (!isUuid(me.employee_id)) return;
      await fetch('/api/worker-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read', employee_id: me.employee_id }),
      });
      await load();
    } finally {
      setMarkingAll(false);
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const grouped = groupNotifications(notifications);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="px-5 max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between pt-5 mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Powiadomienia</h1>
          {unreadCount > 0 && (
            <p className="text-xs font-medium text-gray-400 mt-0.5">
              {unreadCount} nieprzeczytanych
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={markAllRead}
            disabled={markingAll}
            className="flex items-center gap-1.5 bg-orange-50 text-orange-600 text-sm font-semibold rounded-2xl px-3.5 py-2 min-h-[40px] disabled:opacity-50"
          >
            {markingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
            Wszystkie
          </motion.button>
        )}
      </div>

      {/* Empty state */}
      {notifications.length === 0 ? (
        <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-14 text-center">
          <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Bell className="w-7 h-7 text-gray-300" />
          </div>
          <p className="font-bold text-gray-700">Brak powiadomień</p>
          <p className="text-sm text-gray-400 mt-1">Powiadomienia pojawią się tutaj</p>
        </div>
      ) : (
        <div className="space-y-5 pb-4">
          {Array.from(grouped.entries()).map(([groupName, items]) => (
            <div key={groupName}>
              {/* Group label */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{groupName}</span>
                <div className="flex-1 h-px bg-gray-200/70" />
              </div>

              {/* Items card */}
              <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
                {items.map((n, i) => {
                  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.default;
                  const isNew = newIds.has(n.id);

                  return (
                    <AnimatePresence key={n.id}>
                      <motion.button
                        initial={isNew ? { opacity: 0, y: -8 } : undefined}
                        animate={isNew ? { opacity: 1, y: 0 } : undefined}
                        whileTap={{ scale: 0.99 }}
                        type="button"
                        onClick={() => { if (n.order_id) router.push(`/worker/tasks/${n.order_id}`); }}
                        className={cn(
                          'w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors active:bg-gray-50',
                          i < items.length - 1 && 'border-b border-gray-100/80',
                          !n.is_read && 'bg-orange-50/30',
                          n.order_id && 'cursor-pointer',
                        )}
                        style={{ minHeight: 60 }}
                      >
                        {/* Icon circle */}
                        <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg)}>
                          <span className={cfg.color}>{cfg.icon}</span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'text-sm leading-snug',
                            n.is_read ? 'text-gray-600' : 'font-semibold text-gray-900',
                          )}>
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                          )}
                          <p className="text-[11px] text-gray-300 mt-1 font-medium">{timeAgo(n.sent_at)}</p>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
                          {!n.is_read && (
                            <span className="w-2 h-2 rounded-full bg-orange-400" />
                          )}
                          {n.order_id && <ChevronRight className="w-4 h-4 text-gray-300" />}
                        </div>
                      </motion.button>
                    </AnimatePresence>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
