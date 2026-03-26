const DB_NAME = 'routetire-worker';
const STORE_NAME = 'event-queue';
const CACHE_STORE = 'data-cache';

// Simple IndexedDB wrapper
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface QueuedEvent {
  id?: number;
  url: string;
  method: string;
  body: string;
  timestamp: number;
  eventId: string; // client-generated UUID for idempotency
  retries: number;
  status: 'pending' | 'sending' | 'failed';
}

export async function enqueueEvent(
  event: Omit<QueuedEvent, 'id' | 'retries' | 'status'>
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).add({ ...event, retries: 0, status: 'pending' });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingEvents(): Promise<QueuedEvent[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () =>
      resolve(req.result.filter((e: QueuedEvent) => e.status !== 'sending'));
    req.onerror = () => reject(req.error);
  });
}

export async function removeEvent(id: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
}

export async function updateEventStatus(
  id: number,
  status: QueuedEvent['status'],
  retries?: number
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(id);
  req.onsuccess = () => {
    const event = req.result;
    if (event) {
      event.status = status;
      if (retries !== undefined) event.retries = retries;
      store.put(event);
    }
  };
}

// Data cache helpers
export async function cacheData(key: string, data: unknown): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(CACHE_STORE, 'readwrite');
  tx.objectStore(CACHE_STORE).put({ key, data, timestamp: Date.now() });
}

export async function getCachedData<T>(
  key: string
): Promise<{ data: T; timestamp: number } | null> {
  const db = await openDB();
  const tx = db.transaction(CACHE_STORE, 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore(CACHE_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

// Flush queue — called when online
export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  const events = await getPendingEvents();
  let sent = 0;
  let failed = 0;

  for (const event of events.sort((a, b) => a.timestamp - b.timestamp)) {
    try {
      await updateEventStatus(event.id!, 'sending');
      const res = await fetch(event.url, {
        method: event.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Id': event.eventId,
        },
        body: event.body,
      });
      if (res.ok || res.status === 409) {
        // 409 = conflict/duplicate, still remove from queue
        await removeEvent(event.id!);
        sent++;
      } else {
        await updateEventStatus(event.id!, 'failed', event.retries + 1);
        failed++;
      }
    } catch {
      await updateEventStatus(event.id!, 'pending', event.retries + 1);
      failed++;
    }
  }
  return { sent, failed };
}
