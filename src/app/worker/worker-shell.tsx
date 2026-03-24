'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Route, Bell, User, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/worker', icon: Home, label: 'Dziś' },
  { href: '/worker/route', icon: Route, label: 'Trasa' },
  { href: '/worker/notifications', icon: Bell, label: 'Powiadomienia' },
  { href: '/worker/profile', icon: User, label: 'Profil' },
];

export default function WorkerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // Auth check — redirect to /login if not authenticated or wrong role
  useEffect(() => {
    fetch('/api/worker/me')
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          router.replace('/login');
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        // Network error — allow offline access (PWA)
        setChecking(false);
      });
  }, [router]);

  // Unread notification badge
  useEffect(() => {
    if (checking) return;
    fetch('/api/worker/notifications?unread_only=true')
      .then(r => r.json())
      .then(d => setUnreadCount(d.total ?? 0))
      .catch(() => {});
  }, [checking]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Page content — scrollable above bottom nav */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-bottom z-50">
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
                  'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs transition-colors',
                  isActive ? 'text-gray-900' : 'text-gray-400'
                )}
              >
                <div className="relative">
                  <Icon className={cn('w-5 h-5', isActive && 'text-gray-900')} strokeWidth={isActive ? 2.5 : 1.5} />
                  {isNotif && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                <span className={cn('leading-none', isActive && 'font-medium')}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
