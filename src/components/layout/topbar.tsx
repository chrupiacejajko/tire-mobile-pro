'use client';

import { Bell, Search, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface TopbarProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export function Topbar({ title, subtitle, icon, actions }: TopbarProps) {
  return (
    <header className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-lg font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Szukaj..."
            className="w-56 pl-9 h-9 text-sm bg-gray-50 border-gray-200 rounded-xl focus:bg-white"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-white border border-gray-200 rounded">
            ⌘K
          </kbd>
        </div>
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl">
          <Bell className="h-[18px] w-[18px] text-gray-500" />
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            3
          </span>
        </Button>
        {/* Share */}
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
          <Share2 className="h-[18px] w-[18px] text-gray-500" />
        </Button>
        {/* Custom actions */}
        {actions}
      </div>
    </header>
  );
}
