'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  MapPin,
  Users,
  UserCog,
  BarChart3,
  Settings,
  Wrench,
  LogOut,
  ChevronDown,
  Search,
  Bell,
  Truck,
  HelpCircle,
  Plus,
  Package,
  Handshake,
  Zap,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';

const mainMenu = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Zlecenia', href: '/orders', icon: ClipboardList },
  { name: 'Kalendarz', href: '/calendar', icon: Calendar },
  { name: 'Mapa', href: '/map', icon: MapPin },
  { name: 'Klienci', href: '/clients', icon: Users },
  { name: 'Pracownicy', href: '/employees', icon: UserCog },
  { name: 'Flota', href: '/fleet', icon: Truck },
  { name: 'Magazyn', href: '/warehouse', icon: Package },
  { name: 'Podwykonawcy', href: '/subcontractors', icon: Handshake },
  { name: 'Usługi', href: '/services', icon: Wrench },
  { name: 'Integracje', href: '/integrations', icon: Zap },
  { name: 'Raporty', href: '/reports', icon: BarChart3 },
];

const otherMenu = [
  { name: 'Historia GPS', href: '/gps-history', icon: MapPin },
  { name: 'Powiadomienia', href: '/notifications', icon: Bell },
  { name: 'Ustawienia', href: '/settings', icon: Settings },
];

const regions = [
  { name: 'Warszawa', color: '#3B82F6' },
  { name: 'Kraków', color: '#10B981' },
  { name: 'Gdańsk', color: '#F59E0B' },
  { name: 'Wrocław', color: '#8B5CF6' },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <>
      {/* Logo */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <img src="/logo-full.png" alt="RouteTire" className="h-9 w-9 object-contain" />
          <span className="text-[15px] font-bold tracking-tight text-gray-800">
            Route<span className="text-orange-500">Tire</span>
          </span>
        </div>
      </div>

      {/* Company */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 text-white text-sm font-bold">WM</div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-gray-900">Wulkanizacja Mobilna</p>
            <p className="text-xs text-gray-500">{user?.role === 'admin' ? 'Administrator' : 'Zespół'}</p>
          </div>
        </div>
      </div>

      {/* Main Menu */}
      <div className="px-3 pt-2">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Menu główne</p>
        <nav className="space-y-0.5">
          {mainMenu.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href} className="relative block" onClick={onNavigate}>
                <motion.div
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors relative',
                    isActive ? 'text-orange-700' : 'text-gray-600 hover:text-gray-900'
                  )}
                  whileHover={{ x: 2 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  {isActive && (
                    <motion.div className="absolute inset-0 rounded-xl bg-orange-50" layoutId="activeNav"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }} />
                  )}
                  <item.icon className={cn('h-[18px] w-[18px] relative z-10', isActive ? 'text-orange-600' : 'text-gray-400')} />
                  <span className="relative z-10">{item.name}</span>
                </motion.div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Regions */}
      <div className="px-3 pt-5">
        <div className="flex items-center justify-between px-3 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Regiony</p>
          <button className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-gray-100 text-gray-400"><Plus className="h-3.5 w-3.5" /></button>
        </div>
        <nav className="space-y-0.5">
          {regions.map((region) => (
            <Link key={region.name} href="/regions" className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-all" onClick={onNavigate}>
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: region.color }} />
              <span>{region.name}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex-1" />

      {/* Other */}
      <div className="px-3 pb-2">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Inne</p>
        <nav className="space-y-0.5">
          {otherMenu.map((item) => (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-all" onClick={onNavigate}>
              <item.icon className="h-[18px] w-[18px] text-gray-400" />
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* User */}
      <div className="border-t border-gray-100 px-3 py-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white text-sm font-bold shadow-sm">
            {user?.full_name?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{user?.full_name || 'Admin'}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email || 'admin@wulkanizacja.pl'}</p>
          </div>
          <button onClick={signOut} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Wyloguj">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        className="fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-gray-200 shadow-sm lg:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5 text-gray-700" />
      </button>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col h-screen w-[260px] bg-white border-r border-gray-100 shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="fixed inset-y-0 left-0 z-50 flex flex-col w-[280px] bg-white shadow-2xl lg:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <button
                className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
