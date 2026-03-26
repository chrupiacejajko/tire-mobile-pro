'use client';
import { useState, useEffect, useCallback } from 'react';
import { getPendingEvents, flushQueue } from '@/lib/worker/offline-queue';

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>('synced');
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    setStatus('syncing');
    try {
      await flushQueue();
      const events = await getPendingEvents();
      setPendingCount(events.length);
      setStatus(events.length > 0 ? 'pending' : 'synced');
    } catch {
      setStatus('error');
    }
  }, []);

  // Track online/offline
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      flush();
    };
    const goOffline = () => {
      setIsOnline(false);
      setStatus('offline');
    };

    setIsOnline(navigator.onLine);
    if (!navigator.onLine) setStatus('offline');

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [flush]);

  // Check pending count periodically
  useEffect(() => {
    const check = async () => {
      const events = await getPendingEvents();
      setPendingCount(events.length);
      if (!navigator.onLine) {
        setStatus('offline');
      } else if (events.length > 0) {
        setStatus('pending');
      } else {
        setStatus('synced');
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  return { status, pendingCount, isOnline, flush };
}
