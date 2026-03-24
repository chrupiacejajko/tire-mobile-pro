/**
 * Secure invite token utilities.
 *
 * - Plaintext token: sent in the invite URL, NEVER stored in DB.
 * - Hash (SHA-256): stored in worker_invites.token_hash.
 *
 * This means even a full DB dump cannot be used to reconstruct invite URLs.
 */

/**
 * Generate a cryptographically secure random token (32 bytes = 64 hex chars).
 * Returns { plaintext, hash } — store hash, send plaintext.
 */
export async function generateInviteToken(): Promise<{ plaintext: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const plaintext = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const hash = await hashToken(plaintext);
  return { plaintext, hash };
}

/**
 * SHA-256 hash a token string. Used both for storage and for lookup.
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build the full invite URL for emailing to the worker.
 */
export function buildInviteUrl(plaintext: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.routetire.pl';
  return `${base}/invite/${plaintext}`;
}

/** Rate limit config for resend */
export const INVITE_RESEND_LIMIT = 2;      // max resends
export const INVITE_RESEND_WINDOW_MS = 60 * 60 * 1000; // 1 hour window
export const INVITE_EXPIRY_HOURS = 72;
