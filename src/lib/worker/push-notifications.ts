export async function requestPushPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  // TODO: Implement with VAPID keys when ready
  // For now, just request permission
  const granted = await requestPushPermission();
  if (!granted) return null;

  // Stub: return null until VAPID keys are configured
  console.log('[Push] Permission granted, awaiting VAPID configuration');
  return null;
}

export function showLocalNotification(title: string, body: string, tag?: string) {
  if (Notification.permission !== 'granted') return;
  new Notification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: tag || 'routetire-worker',
  } as NotificationOptions);
}
