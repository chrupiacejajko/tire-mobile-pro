'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mail, Phone, Car, MapPin, LogOut,
  ChevronRight, Loader2, HelpCircle, Clock, Award,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WorkerMe {
  full_name: string;
  email: string | null;
  phone: string | null;
  phone_secondary: string | null;
  avatar_url: string | null;
  account_status: string;
  work_status: string;
  region: { name: string; color: string } | null;
  vehicle: { plate_number: string | null; brand: string | null; model: string | null } | null;
  shift_today: { scheduled: boolean; start_time: string | null; end_time: string | null };
  skills?: string[];
}

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  active:  { label: 'Aktywne', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  invited: { label: 'Nieaktywowane', bg: 'bg-amber-100', text: 'text-amber-700' },
  blocked: { label: 'Zablokowane', bg: 'bg-red-100', text: 'text-red-700' },
};

// Pastel badge colors for skills
const SKILL_COLORS = [
  'bg-[#FFE8D6] text-orange-700',
  'bg-[#D4F0E7] text-emerald-700',
  'bg-[#E8E0F0] text-purple-700',
  'bg-[#D6EAF8] text-blue-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ── Stagger animation ──────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
} as const;

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function WorkerProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<WorkerMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch('/api/worker/me')
      .then(r => r.json())
      .then(setMe)
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/login');
    } catch {
      setLoggingOut(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!me) return null;

  const statusBadge = STATUS_BADGE[me.account_status] ?? STATUS_BADGE.active;

  return (
    <motion.div
      className="p-4 max-w-lg mx-auto space-y-4 pb-8"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="pt-2">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Profil</h1>
      </motion.div>

      {/* Avatar + name card */}
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 flex flex-col items-center text-center"
      >
        {/* Large avatar — 80px orange gradient */}
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-lg shadow-orange-500/20 mb-3">
          {me.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatar_url} alt={me.full_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-white text-2xl font-bold">{getInitials(me.full_name)}</span>
          )}
        </div>
        <p className="font-bold text-gray-900 text-xl tracking-tight">{me.full_name}</p>
        <span className={cn(
          'inline-flex text-xs font-semibold px-3 py-1 rounded-full mt-2',
          statusBadge.bg, statusBadge.text,
        )}>
          {statusBadge.label}
        </span>
      </motion.div>

      {/* Contact info */}
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden"
      >
        {me.email && (
          <ProfileRow
            icon={<Mail className="w-4 h-4 text-gray-400" />}
            label="Email"
            value={me.email}
          />
        )}
        {me.phone && (
          <ProfileRow
            icon={<Phone className="w-4 h-4 text-gray-400" />}
            label="Telefon"
            value={me.phone}
            href={`tel:${me.phone}`}
          />
        )}
        {me.phone_secondary && (
          <ProfileRow
            icon={<Phone className="w-4 h-4 text-gray-400" />}
            label="Tel. dodatkowy"
            value={me.phone_secondary}
            href={`tel:${me.phone_secondary}`}
          />
        )}
      </motion.div>

      {/* Shift info card */}
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden"
      >
        {me.shift_today.scheduled && (
          <ProfileRow
            icon={<Clock className="w-4 h-4 text-gray-400" />}
            label="Zmiana dzis"
            value={`${me.shift_today.start_time} - ${me.shift_today.end_time}`}
          />
        )}
        {me.vehicle?.plate_number && (
          <ProfileRow
            icon={<Car className="w-4 h-4 text-gray-400" />}
            label="Pojazd"
            value={`${me.vehicle.brand ?? ''} ${me.vehicle.model ?? ''} ${me.vehicle.plate_number}`.trim()}
          />
        )}
        {me.region && (
          <ProfileRow
            icon={<MapPin className="w-4 h-4 text-gray-400" />}
            label="Region"
            value={me.region.name}
          />
        )}
      </motion.div>

      {/* Skills badges — pastel colors */}
      {me.skills && me.skills.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Umiejetnosci</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {me.skills.map((skill, i) => (
              <span
                key={i}
                className={cn(
                  'inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium',
                  SKILL_COLORS[i % SKILL_COLORS.length],
                )}
              >
                {skill}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Support */}
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden"
      >
        <button
          className="w-full flex items-center gap-3 p-4 text-left active:bg-gray-50 transition-colors min-h-[56px]"
          onClick={() => window.open('mailto:support@routetire.pl', '_blank')}
        >
          <HelpCircle className="w-4 h-4 text-gray-400" />
          <span className="flex-1 text-sm text-gray-700 font-medium">Wsparcie techniczne</span>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </button>
      </motion.div>

      {/* Logout */}
      <motion.div variants={itemVariants}>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 py-3.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 border-2 border-red-200 hover:bg-red-100"
          style={{ minHeight: 48 }}
        >
          {loggingOut ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <LogOut className="w-4 h-4" />
          )}
          Wyloguj sie
        </motion.button>
      </motion.div>

      {/* Version */}
      <motion.p
        variants={itemVariants}
        className="text-center text-xs text-gray-300 pb-2"
      >
        RouteTire Worker v2.0
      </motion.p>
    </motion.div>
  );
}

// ── Profile Row ────────────────────────────────────────────────────────────────

function ProfileRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 last:border-b-0" style={{ minHeight: 56 }}>
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-sm text-gray-900 font-medium truncate mt-0.5">{value}</p>
      </div>
      {href && <ChevronRight className="w-4 h-4 text-gray-300" />}
    </div>
  );

  if (href) {
    return <a href={href} className="block active:bg-gray-50 transition-colors">{content}</a>;
  }
  return <div>{content}</div>;
}
