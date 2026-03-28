'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home, Navigation2, Bell, User,
  Loader2, WifiOff, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { createClient } from '@/lib/supabase/client';
import { subscribeToPush } from '@/lib/worker/push-notifications';
import { isUuid } from '@/lib/uuid';

type WorkStatus = 'off_work' | 'on_work' | 'break';

interface ShellData {
  work_status: WorkStatus;
  current_shift: {
    clock_in: string | null;
    clock_out: string | null;
    on_break: boolean;
  };
}

const NAV_ITEMS = [
  { href: '/worker',               icon: Home,        label: 'Dziś'  },
  { href: '/worker/route',         icon: Navigation2, label: 'Trasa' },
  { href: '/worker/notifications', icon: Bell,        label: 'Alerty'},
  { href: '/worker/profile',       icon: User,        label: 'Profil'},
];

export default function WorkerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  /* ── Skip shell for login page ─────────────────────────────────────────── */
  const isLoginPage = pathname === '/worker/login';
  if (isLoginPage) {
    return <>{children}</>;
  }

  return <WorkerShellInner>{children}</WorkerShellInner>;
}

function WorkerShellInner({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [checking, setChecking]         = useState(true);
  const [unreadCount, setUnreadCount]   = useState(0);
  const [shellData, setShellData]       = useState<ShellData | null>(null);
  const { status: pwaSync, pendingCount } = useSyncStatus();
  const [syncedVisible, setSyncedVisible] = useState(false);
  const [employeeId, setEmployeeId]     = useState<string | null>(null);
  const pushRequested = useRef(false);

  /* ── Auth check ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    fetch('/api/worker/me')
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          router.replace('/worker/login');
        } else {
          return res.json().then(data => {
            setShellData({ work_status: data.work_status, current_shift: data.current_shift });
            setEmployeeId(data.employee_id ?? null);
            setChecking(false);
          });
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  /* ── Unread badge ───────────────────────────────────────────────────────── */
  const fetchUnread = useCallback(async () => {
    if (!isUuid(employeeId)) {
      setUnreadCount(0);
      return;
    }
    try {
      const r = await fetch(`/api/worker-notifications?employee_id=${employeeId}&unread=true`);
      if (!r.ok) {
        setUnreadCount(0);
        return;
      }
      const d = await r.json();
      setUnreadCount(d.unread_count ?? d.total ?? 0);
    } catch { /* offline */ }
  }, [employeeId]);

  useEffect(() => {
    if (checking) return;
    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, [checking, fetchUnread]);

  /* ── Periodic shell refresh ─────────────────────────────────────────────── */
  useEffect(() => {
    if (checking) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/worker/me');
        if (res.ok) {
          const data = await res.json();
          setShellData({ work_status: data.work_status, current_shift: data.current_shift });
        }
      } catch { /* offline */ }
    }, 60_000);
    return () => clearInterval(interval);
  }, [checking]);

  /* ── Realtime badge ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (checking || !isUuid(employeeId)) return;
    const supabase = createClient();
    const channel = supabase
      .channel('worker-notifications-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'worker_notifications', filter: `employee_id=eq.${employeeId}` }, () => fetchUnread())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [checking, employeeId, fetchUnread]);

  /* ── Push on first shift start ──────────────────────────────────────────── */
  useEffect(() => {
    if (pushRequested.current || !shellData) return;
    if (shellData.work_status === 'on_work' && shellData.current_shift.clock_in) {
      pushRequested.current = true;
      subscribeToPush().catch(() => {});
    }
  }, [shellData]);

  /* ── Synced flash ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (pwaSync === 'synced') {
      setSyncedVisible(true);
      const t = setTimeout(() => setSyncedVisible(false), 2000);
      return () => clearTimeout(t);
    } else {
      setSyncedVisible(false);
    }
  }, [pwaSync]);

  /* ── Loading ────────────────────────────────────────────────────────────── */
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
          <p className="text-sm text-gray-400 font-medium">Ładowanie…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col">

      {/* ── Sync indicators ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {pwaSync === 'offline' && (
          <motion.div
            key="offline-banner"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-0 left-0 right-0 z-50 bg-red-500 text-white text-center safe-top"
          >
            <div className="flex items-center justify-center gap-2 py-2 px-4">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[12px] font-medium">
                Offline — akcje zostaną wysłane po połączeniu
              </span>
            </div>
          </motion.div>
        )}

        {pwaSync === 'syncing' && (
          <motion.div
            key="syncing-pill"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-0 left-0 right-0 z-50 flex justify-center safe-top pt-2 pointer-events-none"
          >
            <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-sm">
              <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
              <span className="text-[11px] text-amber-600 font-medium">Synchronizacja…</span>
            </div>
          </motion.div>
        )}

        {pwaSync === 'pending' && pendingCount > 0 && (
          <motion.div
            key="pending-pill"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-0 left-0 right-0 z-50 flex justify-center safe-top pt-2 pointer-events-none"
          >
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[11px] text-amber-700 font-medium">
                {pendingCount} oczekujących
              </span>
            </div>
          </motion.div>
        )}

        {pwaSync === 'error' && (
          <motion.div
            key="error-pill"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-0 left-0 right-0 z-50 flex justify-center safe-top pt-2 pointer-events-none"
          >
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-full px-3 py-1.5 shadow-sm">
              <AlertCircle className="w-3 h-3 text-red-500" />
              <span className="text-[11px] text-red-600 font-medium">Błąd synchronizacji</span>
            </div>
          </motion.div>
        )}

        {pwaSync === 'synced' && syncedVisible && (
          <motion.div
            key="synced-pill"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-0 left-0 right-0 z-50 flex justify-center safe-top pt-2 pointer-events-none"
          >
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 shadow-sm">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span className="text-[11px] text-emerald-600 font-medium">Zsynchronizowano</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>

      {/* ── Bottom nav — dark premium ────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom">
        <div className="mx-4 mb-4">
          <div
            className="flex rounded-[28px] overflow-hidden"
            style={{
              background: '#111111',
              boxShadow: '0 8px 32px rgba(0,0,0,0.24), 0 2px 8px rgba(0,0,0,0.16)',
            }}
          >
            {NAV_ITEMS.map(item => {
              const isActive  = pathname === item.href ||
                (item.href !== '/worker' && pathname?.startsWith(item.href));
              const Icon      = item.icon;
              const isNotif   = item.href === '/worker/notifications';

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex-1 flex flex-col items-center justify-center py-3 gap-1 min-h-[64px] relative transition-all"
                >
                  {/* Active pill background */}
                  {isActive && (
                    <motion.div
                      layoutId="nav-pill"
                      className="absolute inset-1 rounded-[22px] bg-white/[0.08]"
                      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    />
                  )}

                  <div className="relative z-10 flex flex-col items-center gap-1">
                    <div className="relative">
                      <Icon
                        className={cn(
                          'w-5 h-5 transition-colors',
                          isActive ? 'text-orange-400' : 'text-white/35',
                        )}
                        strokeWidth={isActive ? 2 : 1.5}
                      />
                      {isNotif && unreadCount > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold px-1 leading-none"
                        >
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </motion.span>
                      )}
                    </div>
                    <span className={cn(
                      'text-[10px] leading-none font-medium transition-colors',
                      isActive ? 'text-orange-400' : 'text-white/30',
                    )}>
                      {item.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

    </div>
  );
}
