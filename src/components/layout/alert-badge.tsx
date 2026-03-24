'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Package, CalendarDays, AlertTriangle, Info, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

interface Alert {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  created_at: string;
  order_id?: string;
  employee_id?: string;
}

interface WorkerNotification {
  id: string;
  employee_id: string;
  order_id: string | null;
  type: 'order_assigned' | 'order_updated' | 'order_cancelled' | 'schedule_change' | 'general';
  title: string;
  body: string;
  is_read: boolean;
  channel: string;
  created_at: string;
}

type CombinedItem =
  | { kind: 'alert'; data: Alert }
  | { kind: 'notification'; data: WorkerNotification };

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return 'przed chwila';
  if (diffMin < 60) return `${diffMin} min temu`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} godz. temu`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD} dn. temu`;
}

const SEVERITY_STYLES: Record<string, { dot: string; bg: string }> = {
  info: { dot: 'bg-blue-500', bg: 'hover:bg-blue-50' },
  warning: { dot: 'bg-amber-500', bg: 'hover:bg-amber-50' },
  critical: { dot: 'bg-red-500', bg: 'hover:bg-red-50' },
};

const NOTIF_TYPE_ICON: Record<string, typeof Package> = {
  order_assigned: Package,
  order_updated: Package,
  order_cancelled: XCircle,
  schedule_change: CalendarDays,
  general: Info,
};

const NOTIF_TYPE_STYLE: Record<string, { dot: string; bg: string }> = {
  order_assigned: { dot: 'bg-emerald-500', bg: 'hover:bg-emerald-50' },
  order_updated: { dot: 'bg-blue-500', bg: 'hover:bg-blue-50' },
  order_cancelled: { dot: 'bg-red-500', bg: 'hover:bg-red-50' },
  schedule_change: { dot: 'bg-amber-500', bg: 'hover:bg-amber-50' },
  general: { dot: 'bg-gray-400', bg: 'hover:bg-gray-50' },
};

export function AlertBadge() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notifications, setNotifications] = useState<WorkerNotification[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'alerts' | 'notifications'>('alerts');
  const ref = useRef<HTMLDivElement>(null);

  // Resolve employee_id from user profile
  useEffect(() => {
    if (!user?.id || user.id === 'demo') return;
    fetch(`/api/employees?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => {
        const emps = d.employees ?? [];
        if (emps.length > 0) setEmployeeId(emps[0].id);
      })
      .catch(() => {});
  }, [user?.id]);

  const fetchAlerts = useCallback(() => {
    fetch('/api/alerts?unread_only=true')
      .then((r) => r.json())
      .then((d) => {
        setAlerts(d.alerts ?? []);
      })
      .catch(() => {});
  }, []);

  const fetchNotifications = useCallback(() => {
    if (!employeeId) return;
    fetch(`/api/worker-notifications?employee_id=${employeeId}&limit=20`)
      .then(r => r.json())
      .then(d => {
        setNotifications(d.notifications ?? []);
        setUnreadNotifCount(d.unread_count ?? 0);
      })
      .catch(() => {});
  }, [employeeId]);

  useEffect(() => {
    fetchAlerts();
    fetchNotifications();
    const iv = setInterval(() => {
      fetchAlerts();
      fetchNotifications();
    }, 60000);
    return () => clearInterval(iv);
  }, [fetchAlerts, fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const totalCount = alerts.length + unreadNotifCount;

  const markAlertRead = async (id: string) => {
    await fetch('/api/alerts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_read: true }),
    });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const markAllAlertsRead = async () => {
    await fetch('/api/alerts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all_read: true }),
    });
    setAlerts([]);
  };

  const markNotifRead = async (id: string, orderId: string | null) => {
    await fetch('/api/worker-notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_read: true }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadNotifCount(prev => Math.max(0, prev - 1));
    // Navigate to order if available
    if (orderId) {
      window.location.href = `/orders?highlight=${orderId}`;
    }
  };

  const markAllNotifsRead = async () => {
    if (!employeeId) return;
    await fetch('/api/worker-notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employeeId, mark_all_read: true }),
    });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadNotifCount(0);
  };

  const displayedAlerts = alerts.slice(0, 10);
  const displayedNotifs = notifications.slice(0, 10);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 rounded-xl"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-[18px] w-[18px] text-gray-500" />
        {totalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-xl border border-gray-200 bg-white shadow-lg z-50">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('alerts')}
              className={`flex-1 px-4 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === 'alerts'
                  ? 'text-orange-600 border-b-2 border-orange-500'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Alerty {alerts.length > 0 && `(${alerts.length})`}
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex-1 px-4 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === 'notifications'
                  ? 'text-emerald-600 border-b-2 border-emerald-500'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Powiadomienia {unreadNotifCount > 0 && `(${unreadNotifCount})`}
            </button>
          </div>

          {/* Content */}
          <div className="max-h-80 overflow-y-auto">
            {activeTab === 'alerts' ? (
              <>
                {/* Mark all read header for alerts */}
                {alerts.length > 0 && (
                  <div className="flex justify-end px-4 py-1.5 border-b border-gray-50">
                    <button
                      onClick={markAllAlertsRead}
                      className="text-[11px] text-orange-500 hover:text-orange-600 font-medium"
                    >
                      Oznacz wszystkie jako przeczytane
                    </button>
                  </div>
                )}
                {displayedAlerts.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    Brak nowych alertow
                  </div>
                ) : (
                  displayedAlerts.map((alert) => {
                    const styles = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
                    return (
                      <button
                        key={alert.id}
                        onClick={() => markAlertRead(alert.id)}
                        className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 ${styles.bg} transition-colors`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${styles.dot}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-800 leading-snug">
                              {alert.message}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {timeAgo(alert.created_at)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </>
            ) : (
              <>
                {/* Mark all read header for notifications */}
                {unreadNotifCount > 0 && (
                  <div className="flex justify-end px-4 py-1.5 border-b border-gray-50">
                    <button
                      onClick={markAllNotifsRead}
                      className="text-[11px] text-emerald-500 hover:text-emerald-600 font-medium"
                    >
                      Oznacz wszystkie jako przeczytane
                    </button>
                  </div>
                )}
                {displayedNotifs.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    Brak powiadomien
                  </div>
                ) : (
                  displayedNotifs.map((notif) => {
                    const typeStyle = NOTIF_TYPE_STYLE[notif.type] || NOTIF_TYPE_STYLE.general;
                    const Icon = NOTIF_TYPE_ICON[notif.type] || Info;
                    return (
                      <button
                        key={notif.id}
                        onClick={() => markNotifRead(notif.id, notif.order_id)}
                        className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 ${typeStyle.bg} transition-colors ${
                          notif.is_read ? 'opacity-60' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex-shrink-0">
                            <Icon className={`h-4 w-4 ${
                              notif.type === 'order_assigned' ? 'text-emerald-500' :
                              notif.type === 'order_cancelled' ? 'text-red-500' :
                              notif.type === 'schedule_change' ? 'text-amber-500' :
                              'text-blue-500'
                            }`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800 leading-snug">
                              {notif.title}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-line line-clamp-3">
                              {notif.body}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-1">
                              {timeAgo(notif.created_at)}
                              {!notif.is_read && (
                                <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              )}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {((activeTab === 'alerts' && alerts.length > 10) ||
            (activeTab === 'notifications' && notifications.length > 10)) && (
            <div className="border-t border-gray-100 px-4 py-2.5 text-center">
              <a
                href="/notifications"
                className="text-xs text-orange-500 hover:text-orange-600 font-medium"
              >
                Zobacz wszystkie
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
