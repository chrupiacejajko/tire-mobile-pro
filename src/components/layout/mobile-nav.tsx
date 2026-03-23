'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { LayoutDashboard, ClipboardList, MapPin, Users, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Zlecenia', href: '/orders', icon: ClipboardList },
  { label: 'fab', href: '/orders?new=1', icon: Plus }, // center FAB
  { label: 'Mapa', href: '/map', icon: MapPin },
  { label: 'Klienci', href: '/clients', icon: Users },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white border-t border-gray-100 safe-area-pb">
      <div className="flex items-end justify-around px-2 pt-2 pb-3">
        {NAV_ITEMS.map((item) => {
          if (item.label === 'fab') {
            return (
              <Link key="fab" href={item.href} className="relative -top-4">
                <motion.div
                  whileTap={{ scale: 0.92 }}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-500/40"
                >
                  <Plus className="h-7 w-7 text-white" />
                </motion.div>
              </Link>
            );
          }

          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href} className="flex flex-col items-center gap-0.5 min-w-[56px]">
              <motion.div whileTap={{ scale: 0.9 }} className="relative flex flex-col items-center gap-0.5">
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-active"
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-1 w-6 rounded-full bg-orange-500"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <item.icon className={cn('h-6 w-6 transition-colors', isActive ? 'text-orange-500' : 'text-gray-400')} />
                <span className={cn('text-[10px] font-medium transition-colors', isActive ? 'text-orange-500' : 'text-gray-400')}>
                  {item.label}
                </span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
