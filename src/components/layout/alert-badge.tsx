'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Alert {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  created_at: string;
  order_id?: string;
  employee_id?: string;
}

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

export function AlertBadge() {
  const [count, setCount] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchAlerts = () => {
    fetch('/api/alerts?unread_only=true')
      .then((r) => r.json())
      .then((d) => {
        setAlerts(d.alerts ?? []);
        setCount(d.alerts?.length ?? 0);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchAlerts();
    const iv = setInterval(fetchAlerts, 60000);
    return () => clearInterval(iv);
  }, []);

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

  const markRead = async (id: string) => {
    await fetch('/api/alerts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_read: true }),
    });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setCount((prev) => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await fetch('/api/alerts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all_read: true }),
    });
    setAlerts([]);
    setCount(0);
  };

  const displayed = alerts.slice(0, 10);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 rounded-xl"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-[18px] w-[18px] text-gray-500" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-bold text-gray-900">Alerty</h3>
            {count > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-orange-500 hover:text-orange-600 font-medium"
              >
                Oznacz wszystkie jako przeczytane
              </button>
            )}
          </div>

          {/* Alert list */}
          <div className="max-h-80 overflow-y-auto">
            {displayed.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                Brak nowych alertow
              </div>
            ) : (
              displayed.map((alert) => {
                const styles = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
                return (
                  <button
                    key={alert.id}
                    onClick={() => markRead(alert.id)}
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
          </div>

          {/* Footer */}
          {alerts.length > 10 && (
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
