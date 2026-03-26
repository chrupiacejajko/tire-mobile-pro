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

// ── Type icon config ───────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; bg: string }> = {
  order_assigned:   { icon: <MapPin className="w-4 h-4 text-blue-600" />, bg: 'bg-blue-100' },
  order_cancelled:  { icon: <XCircle className="w-4 h-4 text-red-600" />, bg: 'bg-red-100' },
  order_changed:    { icon: <ArrowRightCircle className="w-4 h-4 text-amber-600" />, bg: 'bg-amber-100' },
  order_asap:       { icon: <Zap className="w-4 h-4 text-purple-600" />, bg: 'bg-purple-100' },
  default:          { icon: <Bell className="w-4 h-4 text-gray-500" />, bg: 'bg-gray-100' },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'przed chwila';
  if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h temu`;
  return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

function getDateGroup(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Dzis';
  if (date.toDateString() === yesterday.toDateString()) return 'Wczoraj';
  return 'Wczesniej';
}

function groupNotifications(notifications: WorkerNotification[]): Map<string, WorkerNotification[]> {
  const groups = new Map<string, WorkerNotification[]>();
  const order = ['Dzis', 'Wczoraj', 'Wczesniej'];

  for (const n of notifications) {
    const group = getDateGroup(n.sent_at);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(n);
  }

  const sorted = new Map<string, WorkerNotification[]>();
  for (const key of order) {
    if (groups.has(key)) sorted.set(key, groups.get(key)!);
  }
  return sorted;
}

// ── Stagger animation ──────────────────────────────────────────────────────────

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' as const } },
} as const;

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<WorkerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const meRes = await fetch('/api/worker/me');
      if (!meRes.ok) return;
      const me = await meRes.json();

      const res = await fetch(`/api/worker-notifications?employee_id=${me.employee_id}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const employeeIdRef = useRef<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // Supabase Realtime: subscribe for instant notification updates
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;

    async function setupRealtime() {
      try {
        const meRes = await fetch('/api/worker/me');
        if (!meRes.ok) return;
        const me = await meRes.json();
        employeeIdRef.current = me.employee_id;

        const supabase = createClient();
        channel = supabase
          .channel('worker-notifications-page')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'worker_notifications',
              filter: `employee_id=eq.${me.employee_id}`,
            },
            (payload) => {
              const newNotif = payload.new as WorkerNotification;
              // Add to the beginning of the list with fade-in animation
              setNotifications(prev => [newNotif, ...prev]);
              setNewIds(prev => new Set(prev).add(newNotif.id));
              // Show local notification
              showLocalNotification(newNotif.title, newNotif.body, `notif-${newNotif.id}`);
              // Remove from newIds after animation
              setTimeout(() => {
                setNewIds(prev => {
                  const next = new Set(prev);
                  next.delete(newNotif.id);
                  return next;
                });
              }, 1000);
            },
          )
          .subscribe();
      } catch {
        // Silently ignore realtime setup failures
      }
    }

    setupRealtime();

    return () => {
      if (channel) {
        const supabase = createClient();
        supabase.removeChannel(channel);
      }
    };
  }, []);

  async function markAllRead() {
    setMarkingAll(true);
    try {
      const meRes = await fetch('/api/worker/me');
      if (!meRes.ok) return;
      const me = await meRes.json();

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
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 pt-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Powiadomienia</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">{unreadCount} nieprzeczytanych</p>
          )}
        </div>
        {unreadCount > 0 && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={markAllRead}
            disabled={markingAll}
            className="flex items-center gap-1.5 text-sm text-orange-600 font-medium hover:text-orange-700 disabled:opacity-50 min-h-[44px] px-2"
          >
            {markingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCheck className="w-4 h-4" />
            )}
            Oznacz wszystkie
          </motion.button>
        )}
      </div>

      {/* Empty state */}
      {notifications.length === 0 ? (
        <div className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Bell className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">Brak powiadomien</p>
          <p className="text-sm text-gray-400 mt-1">Powiadomienia pojawia sie tutaj</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([groupName, items]) => (
            <div key={groupName}>
              {/* Group header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{groupName}</span>
                <div className="flex-1 h-px bg-gray-200/60" />
              </div>

              {/* Items in one white card */}
              <motion.div
                className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden"
                variants={listVariants}
                initial="hidden"
                animate="show"
              >
                {items.map((n, i) => {
                  const typeCfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.default;
                  const isNew = newIds.has(n.id);

                  return (
                    <motion.button
                      key={n.id}
                      variants={itemVariants}
                      initial={isNew ? { opacity: 0, y: -12, backgroundColor: 'rgba(251, 191, 36, 0.15)' } : undefined}
                      animate={isNew ? { opacity: 1, y: 0, backgroundColor: 'rgba(251, 191, 36, 0)' } : undefined}
                      transition={isNew ? { duration: 0.5, backgroundColor: { duration: 1.5 } } : undefined}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => {
                        if (n.order_id) router.push(`/worker/tasks/${n.order_id}`);
                      }}
                      className={cn(
                        'w-full text-left flex items-center gap-3 p-4 transition-all',
                        i < items.length - 1 && 'border-b border-gray-100',
                        !n.is_read && 'bg-blue-50/30',
                        n.order_id && 'cursor-pointer active:bg-gray-50',
                      )}
                      style={{ minHeight: 56 }}
                    >
                      {/* Type icon */}
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0', typeCfg.bg)}>
                        {typeCfg.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-sm leading-snug',
                          n.is_read ? 'text-gray-700' : 'font-semibold text-gray-900',
                        )}>
                          {n.title}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{n.body}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-xs text-gray-400">{timeAgo(n.sent_at)}</span>
                        {n.order_id && <ChevronRight className="w-4 h-4 text-gray-300" />}
                        {!n.is_read && !n.order_id && (
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
