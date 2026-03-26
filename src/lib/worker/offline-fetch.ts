import { enqueueEvent } from './offline-queue';

export async function workerFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (err) {
    // Network error — queue if it's a mutation (POST/PUT/DELETE)
    if (
      options.method &&
      ['POST', 'PUT', 'DELETE'].includes(options.method.toUpperCase())
    ) {
      const eventId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await enqueueEvent({
        url,
        method: options.method,
        body:
          typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body),
        timestamp: Date.now(),
        eventId,
      });

      // Return a fake "queued" response
      return new Response(JSON.stringify({ queued: true, eventId }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }
}
