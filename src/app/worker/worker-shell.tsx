'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Navigation2, Bell, User, Loader2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

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
  { href: '/worker', icon: Home, label: 'Dzis' },
  { href: '/worker/route', icon: Navigation2, label: 'Trasa' },
  { href: '/worker/notifications', icon: Bell, label: 'Alerty' },
  { href: '/worker/profile', icon: User, label: 'Profil' },
];

export default function WorkerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [shellData, setShellData] = useState<ShellData | null>(null);
  const [syncStatus, setSyncStatus] = useState<'online' | 'syncing' | 'offline'>('online');

  // Auth check
  useEffect(() => {
    fetch('/api/worker/me')
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          router.replace('/login');
        } else {
          return res.json().then(data => {
            setShellData({
              work_status: data.work_status,
              current_shift: data.current_shift,
            });
            setChecking(false);
          });
        }
      })
      .catch(() => {
        setSyncStatus('offline');
        setChecking(false);
      });
  }, [router]);

  // Unread notification badge
  const fetchUnread = useCallback(async () => {
    try {
      const r = await fetch('/api/worker/notifications?unread_only=true');
      const d = await r.json();
      setUnreadCount(d.total ?? 0);
    } catch { /* offline */ }
  }, []);

  useEffect(() => {
    if (checking) return;
    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, [checking, fetchUnread]);

  // Refresh shell data periodically
  useEffect(() => {
    if (checking) return;
    const interval = setInterval(async () => {
      try {
        setSyncStatus('syncing');
        const res = await fetch('/api/worker/me');
        if (res.ok) {
          const data = await res.json();
          setShellData({
            work_status: data.work_status,
            current_shift: data.current_shift,
          });
          setSyncStatus('online');
        }
      } catch {
        setSyncStatus('offline');
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [checking]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDF6F0]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDF6F0] flex flex-col">
      {/* Sync indicator — small pill at top center */}
      {syncStatus !== 'online' && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center safe-top pt-2 pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] pointer-events-auto"
          >
            {syncStatus === 'syncing' && (
              <>
                <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
                <span className="text-[11px] text-amber-600 font-medium">Synchronizacja...</span>
              </>
            )}
            {syncStatus === 'offline' && (
              <>
                <WifiOff className="w-3 h-3 text-red-500" />
                <span className="text-[11px] text-red-600 font-medium">Offline</span>
              </>
            )}
          </motion.div>
        </div>
      )}

      {/* Page content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom tab navigation — clean white */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 safe-bottom">
        <div className="flex">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href ||
              (item.href !== '/worker' && pathname?.startsWith(item.href));
            const Icon = item.icon;
            const isNotif = item.href === '/worker/notifications';

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-[11px] transition-colors min-h-[56px]',
                  isActive ? 'text-orange-500' : 'text-gray-400'
                )}
              >
                <div className="relative">
                  <Icon
                    className={cn('w-5 h-5', isActive ? 'text-orange-500' : 'text-gray-400')}
                    strokeWidth={1.5}
                    fill={isActive ? 'currentColor' : 'none'}
                  />
                  {isNotif && unreadCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </motion.span>
                  )}
                </div>
                <span className={cn('leading-none', isActive && 'font-semibold')}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
