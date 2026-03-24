import { getAdminClient } from '@/lib/supabase/admin';

export async function fireWebhook(event: string, payload: Record<string, unknown>) {
  const supabase = getAdminClient();
  const { data: hooks } = await supabase
    .from('webhooks')
    .select('*')
    .eq('is_active', true)
    .contains('events', [event]);

  if (!hooks?.length) return;

  for (const hook of hooks) {
    try {
      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      });
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (hook.secret) {
        // HMAC-SHA256 signature
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(hook.secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
        headers['X-Webhook-Signature'] = Array.from(new Uint8Array(sig))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }

      fetch(hook.url, { method: 'POST', headers, body }).catch(() => {});
    } catch {
      /* fire and forget */
    }
  }
}
