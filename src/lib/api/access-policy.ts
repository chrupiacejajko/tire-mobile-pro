/**
 * API Access Policy — middleware-level route classification.
 *
 * Evaluated in src/proxy.ts (Next.js middleware) BEFORE any route handler runs.
 * Determines which authentication gate a request must pass through.
 *
 * ============================================================================
 * AUTH LEVELS (evaluated top-to-bottom in proxy.ts)
 * ============================================================================
 *
 * 1. WEBHOOK BYPASS  (isWebhookBypassPath)
 *    Skips JWT/session auth entirely. Route handlers MUST validate requests
 *    themselves (shared secret, HMAC signature, IP allowlist, etc.).
 *    Examples: /api/satisgps/webhook, /api/satisgps/cron
 *
 * 2. PUBLIC  (isPublicApiPath)
 *    No authentication required. Accessible by anonymous users / booking portal.
 *    Method-restricted where noted. Rate limiting applied in-handler.
 *    Examples: POST /api/orders (booking), GET /api/availability,
 *              GET /api/tracking/[id] (client order tracking)
 *
 * 3. WORKER  (isWorkerApiPath)
 *    Requires either a valid worker access token (JWT issued at login)
 *    OR an authenticated session with role in [admin, dispatcher, worker].
 *    Examples: /api/worker/tasks, /api/worker/shift/start,
 *              /api/worker-notifications
 *
 * 4. ADMIN / DISPATCHER  (default — everything else under /api/)
 *    Requires authenticated Supabase session with role in [admin, dispatcher].
 *    This is the most restrictive tier and the implicit default.
 *    Examples: /api/employees, /api/planner, /api/reports/*
 *
 * ============================================================================
 * SECURITY NOTES
 * ============================================================================
 *
 * - POST /api/orders: Public for booking portal / Smifybot. Protected by
 *   duplicate guard (5-min window) and IP rate limit (10 req / min).
 *
 * - GET /api/tracking/[id]: Exposes worker GPS lat/lng/speed to clients for
 *   live ETA tracking. Rate-limited (60 req / 15 min per IP+order). This is
 *   intentional — the tracking page is the customer-facing delivery view.
 *
 * - POST /api/tracking/actions: Public but token-gated (verifyTrackingActionToken)
 *   and rate-limited. Allows clients to cancel/reschedule their own orders.
 *
 * - /api/satisgps/webhook: Webhook bypass, but the handler now verifies
 *   HMAC-SHA256 signature using SATISGPS_WEBHOOK_SECRET.
 *
 * - /api/satisgps/debug: Explicitly excluded from webhook bypass and protected
 *   by admin auth. It is no longer public.
 *
 * - /api/webhooks: Webhook bypass, but the handler now validates
 *   X-Webhook-Secret against WEBHOOK_SHARED_SECRET.
 *
 * - /api/webhooks/config: ADMIN-ONLY. Removed from webhook bypass to prevent
 *   unauthenticated access to webhook configuration management.
 *
 * - /api/integrations/: No routes currently exist under this prefix. Kept in
 *   allowlist as a forward-looking placeholder for future external integrations.
 *
 * Audit date: 2026-03-28
 */

/**
 * PUBLIC_API_EXACT — paths that are publicly accessible (no auth).
 *
 * Each entry is method-restricted in isPublicApiPath() below.
 */
const PUBLIC_API_EXACT = new Set([
  /** GET — uptime / readiness probe. No sensitive data. */
  '/api/health',

  /** GET — geocoding proxy (HERE API). Used by booking form for address lookup. */
  '/api/geocode',

  /** GET — HERE address autocomplete. Used by booking form. */
  '/api/here-autocomplete',

  /** GET — HERE place lookup by ID. Used by booking form. */
  '/api/here-lookup',

  /** GET — HERE discover (nearby search). Used by booking form. */
  '/api/here-discover',

  /**
   * POST only — create a new order from the public booking portal or Smifybot.
   * GET and PUT require admin/dispatcher auth (handled in-handler via checkAuth).
   * Protected by 10 req / min IP rate limit + 5-min duplicate guard.
   */
  '/api/orders',

  /**
   * POST only — worker invite activation. Token-gated (hashed invite token)
   * and rate-limited (5 attempts/hour per IP). Worker sets initial password.
   */
  '/api/invite/accept',

  /**
   * POST only — client self-service (cancel/reschedule order).
   * Protected by verifyTrackingActionToken() and rate-limited (10 req / 15 min).
   */
  '/api/tracking/actions',
]);

/**
 * PUBLIC_API_PREFIXES — prefix-matched paths that are publicly accessible.
 */
const PUBLIC_API_PREFIXES = [
  /** /api/auth/* — Supabase auth flows (worker-login, worker-logout). */
  '/api/auth/',

  /**
   * /api/availability* — slot/window availability for the booking portal.
   * Covers /api/availability, /api/availability/smart, /api/availability/nearby-driver.
   * NOTE: /nearby-driver exposes which workers are near a location — acceptable
   * for booking UX but consider restricting if data sensitivity changes.
   */
  '/api/availability',
];

/**
 * WEBHOOK_ALLOWLIST — paths that bypass JWT/session auth entirely.
 *
 * Requests to these paths skip straight to the route handler, which MUST
 * perform its own authentication (shared secret, HMAC, IP allowlist, etc.).
 *
 * WARNING: Adding a prefix here means ALL sub-paths are unauthenticated
 * at the middleware level. Be very careful.
 */
const WEBHOOK_ALLOWLIST = [
  /**
   * /api/satisgps/* — SatisGPS vehicle tracking integration.
   *   - /webhook: receives push data from SatisGPS (HMAC-SHA256 signature required)
   *   - /sync: manual/cron sync (cron mode checks SATISGPS_WEBHOOK_SECRET)
   *   - /cron: Railway cron job (checks SATISGPS_WEBHOOK_SECRET via query param)
   */
  '/api/satisgps/',

  /**
   * /api/integrations/* — reserved prefix for future external integrations.
   * No routes currently exist. Handlers must validate via shared secret / HMAC.
   */
  '/api/integrations/',

  /**
   * /api/webhooks — generic inbound webhook receiver (Smifybot, etc.).
   * Handler validates X-Webhook-Secret against WEBHOOK_SHARED_SECRET.
 *
  * NOTE: /api/webhooks/config is explicitly EXCLUDED (see isWebhookBypassPath).
  * It manages webhook CRUD and requires admin/dispatcher auth via the default tier.
   */
  '/api/webhooks',
];

/**
 * Determines if a path should bypass JWT/session auth entirely.
 * Route handlers on these paths MUST perform their own authentication.
 */
export function isWebhookBypassPath(pathname: string): boolean {
  if (pathname.startsWith('/api/satisgps/debug')) return false;

  // /api/webhooks/config is admin-only — do NOT bypass auth for it
  if (pathname.startsWith('/api/webhooks/config')) return false;

  return WEBHOOK_ALLOWLIST.some(prefix => pathname.startsWith(prefix));
}

/**
 * Determines if a path + method combination is publicly accessible
 * (no authentication required at the middleware level).
 *
 * Note: some public endpoints still enforce in-handler auth
 * (e.g. tracking tokens, rate limits).
 */
export function isPublicApiPath(pathname: string, method: string): boolean {
  // CORS preflight is always allowed
  if (method === 'OPTIONS') return true;

  if (PUBLIC_API_EXACT.has(pathname)) {
    // Method restrictions for specific paths
    if (pathname === '/api/orders') return method === 'POST';
    if (pathname === '/api/invite/accept') return method === 'POST';
    if (pathname === '/api/tracking/actions') return method === 'POST';
    return method === 'GET' || method === 'HEAD';
  }

  // GET /api/tracking/[uuid] — public client order tracking page
  // Exposes worker GPS for ETA. Rate-limited in handler (60 req / 15 min).
  if (/^\/api\/tracking\/[^/]+$/.test(pathname)) {
    return method === 'GET' || method === 'HEAD';
  }

  return PUBLIC_API_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

/**
 * Determines if a path requires worker-level auth (worker token OR session
 * with role in [admin, dispatcher, worker]).
 */
export function isWorkerApiPath(pathname: string): boolean {
  return pathname === '/api/worker-notifications' || pathname.startsWith('/api/worker/');
}
