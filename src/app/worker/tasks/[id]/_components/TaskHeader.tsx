'use client';

import { Car, CheckCircle2, Wrench, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon?: React.ReactNode; cardBg: string }> = {
  new:         { label: 'Nowe',       bg: 'bg-gray-100', text: 'text-gray-600', cardBg: 'bg-white' },
  assigned:    { label: 'Przypisane', bg: 'bg-gray-100', text: 'text-gray-600', cardBg: 'bg-white' },
  in_transit:  { label: 'W drodze',   bg: 'bg-orange-100', text: 'text-orange-700', icon: <Car className="w-4 h-4 animate-pulse" />, cardBg: 'bg-gradient-to-br from-[#1E2A5E] to-[#3B4F8A]' },
  in_progress: { label: 'W trakcie',  bg: 'bg-blue-100', text: 'text-blue-700', icon: <Wrench className="w-4 h-4" />, cardBg: 'bg-gradient-to-br from-[#1E2A5E] to-[#3B4F8A]' },
  completed:   { label: 'Ukonczone',  bg: 'bg-emerald-100', text: 'text-emerald-700', icon: <CheckCircle2 className="w-4 h-4" />, cardBg: 'bg-gradient-to-br from-emerald-600 to-emerald-500' },
  cancelled:   { label: 'Anulowane',  bg: 'bg-red-100', text: 'text-red-700', cardBg: 'bg-white' },
};

export default function TaskHeader({
  status,
  priority,
  taskType,
}: {
  status: string;
  priority: string;
  taskType?: string;
}) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.assigned;
  const isDark = status === 'in_transit' || status === 'in_progress' || status === 'completed';

  return (
    <div className={cn(
      'relative overflow-hidden rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5',
      cfg.cardBg,
    )}>
      {/* Decorative circles for dark cards */}
      {isDark && (
        <>
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="absolute -bottom-8 -left-8 w-20 h-20 rounded-full bg-pink-500/15 blur-3xl" />
        </>
      )}

      <div className="relative z-10 flex items-center gap-2 flex-wrap">
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold',
          isDark ? 'bg-white/20 text-white' : cn(cfg.bg, cfg.text),
        )}>
          {cfg.icon}
          {cfg.label}
        </span>

        {taskType === 'internal' && (
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
            isDark ? 'bg-white/15 text-white/80' : 'bg-teal-100 text-teal-700',
          )}>
            <Wrench className="w-3 h-3" />
            Wewnetrzne
          </span>
        )}

        {(priority === 'urgent' || priority === 'asap') && (
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
            isDark ? 'bg-red-500/30 text-white' : 'bg-red-100 text-red-700',
          )}>
            <AlertTriangle className="w-3 h-3" />
            {priority === 'asap' ? 'ASAP' : 'Pilne'}
          </span>
        )}
      </div>
    </div>
  );
}
