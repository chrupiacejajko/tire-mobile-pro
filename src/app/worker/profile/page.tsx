'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  User, Mail, Phone, Car, MapPin, LogOut,
  ChevronRight, Loader2, Shield, HelpCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

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
}

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  active:  { label: 'Aktywne', class: 'bg-emerald-100 text-emerald-700' },
  invited: { label: 'Nieaktywowane', class: 'bg-amber-100 text-amber-700' },
  blocked: { label: 'Zablokowane', class: 'bg-red-100 text-red-700' },
};

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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!me) return null;

  const statusBadge = STATUS_BADGE[me.account_status] ?? STATUS_BADGE.active;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-gray-900">Profil</h1>
      </div>

      {/* Avatar + name */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {me.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatar_url} alt={me.full_name} className="w-full h-full object-cover" />
          ) : (
            <User className="w-7 h-7 text-gray-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-lg truncate">{me.full_name}</p>
          <span className={cn('inline-flex text-xs font-medium px-2 py-0.5 rounded-full mt-1', statusBadge.class)}>
            {statusBadge.label}
          </span>
        </div>
      </div>

      {/* Contact info */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {me.email && (
          <ProfileRow icon={<Mail className="w-4 h-4 text-gray-400" />} label="Email" value={me.email} />
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
        {me.region && (
          <ProfileRow
            icon={<MapPin className="w-4 h-4 text-gray-400" />}
            label="Region"
            value={me.region.name}
          />
        )}
        {me.vehicle?.plate_number && (
          <ProfileRow
            icon={<Car className="w-4 h-4 text-gray-400" />}
            label="Pojazd"
            value={`${me.vehicle.brand ?? ''} ${me.vehicle.model ?? ''} · ${me.vehicle.plate_number}`.trim()}
          />
        )}
        {me.shift_today.scheduled && (
          <ProfileRow
            icon={<Shield className="w-4 h-4 text-gray-400" />}
            label="Zmiana dziś"
            value={`${me.shift_today.start_time} – ${me.shift_today.end_time}`}
          />
        )}
      </div>

      {/* Support */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <button
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 rounded-2xl transition-colors"
          onClick={() => window.open('mailto:support@routetire.pl', '_blank')}
        >
          <HelpCircle className="w-4 h-4 text-gray-400" />
          <span className="flex-1 text-sm text-gray-700">Wsparcie techniczne</span>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </button>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 py-3 rounded-2xl text-sm font-medium transition-colors disabled:opacity-50"
      >
        {loggingOut ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <LogOut className="w-4 h-4" />
        )}
        Wyloguj się
      </button>

      {/* Version */}
      <p className="text-center text-xs text-gray-300 pb-2">RouteTire Worker v1.0</p>
    </div>
  );
}

function ProfileRow({
  icon, label, value, href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="flex items-center gap-3 p-4">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm text-gray-900 truncate">{value}</p>
      </div>
    </div>
  );

  if (href) {
    return <a href={href} className="block hover:bg-gray-50 transition-colors">{content}</a>;
  }
  return <div>{content}</div>;
}
