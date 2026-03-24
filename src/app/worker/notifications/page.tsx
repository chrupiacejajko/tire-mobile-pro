'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, MapPin, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  sent_at: string;
  order_id: string | null;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  order_assigned:   <MapPin className="w-4 h-4 text-blue-500" />,
  order_cancelled:  <AlertCircle className="w-4 h-4 text-red-500" />,
  order_changed:    <Clock className="w-4 h-4 text-amber-500" />,
  default:          <Bell className="w-4 h-4 text-gray-400" />,
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'przed chwilą';
  if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h temu`;
  return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<WorkerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const meRes = await fetch('/api/worker/me');
      if (!meRes.ok) return;
      const me = await meRes.json();

      const res = await fetch(`/api/worker-notifications?employee_id=${me.employee_id}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function markAllRead() {
    setMarkingAll(true);
    try {
      const meRes = await fetch('/api/worker/me');
      if (!meRes.ok) return;
      const me = await meRes.json();

      await fetch('/api/worker-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read', employee_id: me.employee_id }),
      });
      await load();
    } finally {
      setMarkingAll(false);
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pt-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Powiadomienia</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500">{unreadCount} nieprzeczytanych</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={markingAll}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            {markingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCheck className="w-4 h-4" />
            )}
            Oznacz wszystkie
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <Bell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Brak powiadomień</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div
              key={n.id}
              className={cn(
                'bg-white rounded-2xl border p-4 transition-colors',
                n.is_read ? 'border-gray-100' : 'border-blue-200 bg-blue-50/30'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {TYPE_ICONS[n.type] ?? TYPE_ICONS.default}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn('text-sm', n.is_read ? 'text-gray-700' : 'font-semibold text-gray-900')}>
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{n.body}</p>
                  <p className="text-xs text-gray-400 mt-1">{timeAgo(n.sent_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
