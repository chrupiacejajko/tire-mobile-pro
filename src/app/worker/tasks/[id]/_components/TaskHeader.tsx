'use client';

import { Car, CheckCircle2, Wrench, AlertTriangle, ClipboardCheck, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusConfig {
  label: string;
  dark: boolean;
  gradient?: string;    // CSS gradient string (inline style)
  icon?: React.ReactNode;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  new: {
    label: 'Nowe zlecenie',
    dark: true,
    gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    icon: <ClipboardCheck className="w-4 h-4" />,
  },
  assigned: {
    label: 'Przypisane',
    dark: true,
    gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    icon: <ClipboardCheck className="w-4 h-4" />,
  },
  in_transit: {
    label: 'W drodze',
    dark: true,
    gradient: 'linear-gradient(135deg, #ea580c 0%, #f97316 60%, #fb923c 100%)',
    icon: <Car className="w-4 h-4 animate-pulse" />,
  },
  in_progress: {
    label: 'W trakcie',
    dark: true,
    gradient: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
    icon: <Wrench className="w-4 h-4" />,
  },
  completed: {
    label: 'Ukończone',
    dark: true,
    gradient: 'linear-gradient(135deg, #065f46 0%, #059669 100%)',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  cancelled: {
    label: 'Anulowane',
    dark: false,
    icon: <XCircle className="w-4 h-4" />,
  },
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

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl p-5',
        cfg.dark ? '' : 'bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)]',
      )}
      style={cfg.gradient ? { background: cfg.gradient } : undefined}
    >
      {/* Glow blobs for gradient cards */}
      {cfg.dark && (
        <>
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-8 w-28 h-28 rounded-full bg-black/10 blur-3xl pointer-events-none" />
        </>
      )}

      <div className="relative z-10 flex items-center gap-2 flex-wrap">
        {/* Status badge */}
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold',
          cfg.dark
            ? 'bg-white/[0.12] text-white'
            : 'bg-gray-100 text-gray-600',
        )}>
          {cfg.icon}
          {cfg.label}
        </span>

        {/* Internal task badge */}
        {taskType === 'internal' && (
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
            cfg.dark ? 'bg-white/[0.12] text-white/80' : 'bg-teal-100 text-teal-700',
          )}>
            <Wrench className="w-3 h-3" />
            Wewnętrzne
          </span>
        )}

        {/* Priority badge */}
        {(priority === 'urgent' || priority === 'asap') && (
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
            cfg.dark ? 'bg-red-500/30 text-white' : 'bg-red-100 text-red-700',
          )}>
            <AlertTriangle className="w-3 h-3" />
            {priority === 'asap' ? 'ASAP' : 'Pilne'}
          </span>
        )}
      </div>
    </div>
  );
}
