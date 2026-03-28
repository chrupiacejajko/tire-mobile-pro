'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mail, Phone, Car, MapPin, LogOut,
  ChevronRight, Loader2, HelpCircle, Clock, Award,
  ShieldCheck,
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

const STATUS_BADGE: Record<string, { label: string; bg: string; dot: string }> = {
  active:  { label: 'Aktywne',        bg: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400' },
  invited: { label: 'Nieaktywowane',  bg: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-400'   },
  blocked: { label: 'Zablokowane',    bg: 'bg-red-100 text-red-700',        dot: 'bg-red-400'     },
};

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function WorkerProfilePage() {
  const router = useRouter();
  const [me, setMe]           = useState<WorkerMe | null>(null);
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
      await fetch('/api/auth/worker-logout', { method: 'POST' }).catch(() => {});
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/login');
    } catch { setLoggingOut(false); }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!me) return null;

  const statusBadge = STATUS_BADGE[me.account_status] ?? STATUS_BADGE.active;

  return (
    <div className="px-5 max-w-lg mx-auto pb-8 space-y-4">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="pt-5">
        <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Profil</h1>
      </div>

      {/* ── Avatar card ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-6 flex flex-col items-center text-center">
        {/* Avatar */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center flex-shrink-0 mb-3 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
        >
          {me.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatar_url} alt={me.full_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-white text-2xl font-bold">{getInitials(me.full_name)}</span>
          )}
        </div>

        <p className="font-bold text-gray-900 text-xl tracking-tight">{me.full_name}</p>
        <p className="text-sm text-gray-400 mt-0.5">RouteTire Worker</p>

        <div className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold mt-3', statusBadge.bg)}>
          <span className={cn('w-1.5 h-1.5 rounded-full', statusBadge.dot)} />
          {statusBadge.label}
        </div>
      </div>

      {/* ── Contact ───────────────────────────────────────────────────────── */}
      {(me.email || me.phone || me.phone_secondary) && (
        <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
          {me.email && (
            <ProfileRow icon={<Mail className="w-4 h-4 text-orange-400" />} label="Email" value={me.email} />
          )}
          {me.phone && (
            <ProfileRow icon={<Phone className="w-4 h-4 text-blue-400" />} label="Telefon" value={me.phone} href={`tel:${me.phone}`} />
          )}
          {me.phone_secondary && (
            <ProfileRow icon={<Phone className="w-4 h-4 text-blue-400" />} label="Tel. dodatkowy" value={me.phone_secondary} href={`tel:${me.phone_secondary}`} />
          )}
        </div>
      )}

      {/* ── Shift / Vehicle / Region ──────────────────────────────────────── */}
      {(me.shift_today.scheduled || me.vehicle?.plate_number || me.region) && (
        <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
          {me.shift_today.scheduled && (
            <ProfileRow icon={<Clock className="w-4 h-4 text-violet-400" />} label="Zmiana dziś" value={`${me.shift_today.start_time} – ${me.shift_today.end_time}`} />
          )}
          {me.vehicle?.plate_number && (
            <ProfileRow
              icon={<Car className="w-4 h-4 text-emerald-400" />}
              label="Pojazd"
              value={[me.vehicle.brand, me.vehicle.model, me.vehicle.plate_number].filter(Boolean).join(' ')}
            />
          )}
          {me.region && (
            <ProfileRow icon={<MapPin className="w-4 h-4 text-rose-400" />} label="Region" value={me.region.name} />
          )}
        </div>
      )}

      {/* ── Skills ────────────────────────────────────────────────────────── */}
      {me.skills && me.skills.length > 0 && (
        <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-4 h-4 text-gray-300" />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Umiejętności</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {me.skills.map((skill, i) => (
              <span key={i} className="bg-orange-50 text-orange-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Options ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
        <motion.button
          whileTap={{ scale: 0.99 }}
          className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50 border-b border-gray-100/80"
          onClick={() => window.open('mailto:support@routetire.pl', '_blank')}
          style={{ minHeight: 56 }}
        >
          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
            <HelpCircle className="w-4 h-4 text-blue-400" />
          </div>
          <span className="flex-1 text-sm font-semibold text-gray-800">Wsparcie techniczne</span>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.99 }}
          className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50"
          style={{ minHeight: 56 }}
        >
          <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="flex-1 text-sm font-semibold text-gray-800">Polityka prywatności</span>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </motion.button>
      </div>

      {/* ── Logout ────────────────────────────────────────────────────────── */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 py-4 rounded-3xl text-sm font-bold disabled:opacity-50 border border-red-100"
        style={{ minHeight: 56 }}
      >
        {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        Wyloguj się
      </motion.button>

      <p className="text-center text-xs text-gray-300 pb-2">RouteTire Worker v2.0</p>
    </div>
  );
}

// ── Profile Row ────────────────────────────────────────────────────────────────

function ProfileRow({ icon, label, value, href }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100/80 last:border-b-0" style={{ minHeight: 60 }}>
      <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">{value}</p>
      </div>
      {href && <ChevronRight className="w-4 h-4 text-gray-300" />}
    </div>
  );

  if (href) return <a href={href} className="block active:bg-gray-50 transition-colors">{inner}</a>;
  return <div>{inner}</div>;
}
