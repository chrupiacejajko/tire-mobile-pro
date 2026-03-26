'use client';

import { Navigation, MapPin, CheckCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const ACTION_CONFIG: Record<string, {
  label: string;
  loadingLabel: string;
  bg: string;
  icon: React.ReactNode;
}> = {
  assigned: {
    label: 'Wyjezdzam',
    loadingLabel: 'Uruchamiam...',
    bg: 'bg-orange-500 hover:bg-orange-600',
    icon: <Navigation className="w-5 h-5" />,
  },
  in_transit: {
    label: 'Na miejscu -- rozpocznij',
    loadingLabel: 'Zglaszam przyjazd...',
    bg: 'bg-blue-600 hover:bg-blue-700',
    icon: <MapPin className="w-5 h-5" />,
  },
  in_progress: {
    label: 'Zakoncz zlecenie',
    loadingLabel: 'Konczenie...',
    bg: 'bg-emerald-600 hover:bg-emerald-700',
    icon: <CheckCircle className="w-5 h-5" />,
  },
};

export default function MainAction({
  status,
  loading,
  onPress,
}: {
  status: string;
  loading: boolean;
  onPress: () => void;
}) {
  const config = ACTION_CONFIG[status];

  if (!config) {
    if (status === 'completed') {
      return (
        <div className="fixed bottom-24 left-0 right-0 z-40 px-4 pb-2 safe-bottom">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-center gap-2 w-full rounded-2xl bg-gray-100 text-gray-400 py-4 text-base font-semibold cursor-not-allowed"
              style={{ minHeight: 56 }}
            >
              <CheckCircle className="w-5 h-5" />
              Zakonczone
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="fixed bottom-24 left-0 right-0 z-40 px-4 pb-2 safe-bottom">
      <div className="max-w-lg mx-auto">
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={onPress}
          disabled={loading}
          className={cn(
            'flex items-center justify-center gap-2 w-full rounded-2xl text-white text-base font-semibold disabled:opacity-60 transition-all shadow-lg',
            config.bg,
          )}
          style={{ minHeight: 56 }}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {config.loadingLabel}
            </>
          ) : (
            <>
              {config.icon}
              {config.label}
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
