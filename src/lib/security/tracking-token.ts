import { signTokenPayload, verifyTokenPayload } from '@/lib/security/hmac-token';

const TRACKING_TOKEN_TTL_SECONDS = 60 * 60 * 6;

interface TrackingActionTokenPayload extends Record<string, unknown> {
  order_id: string;
  scope: 'tracking:self-care';
  iat: number;
  exp: number;
}

function getTrackingTokenSecret(): string {
  return (
    process.env.TRACKING_TOKEN_SECRET ||
    process.env.INTERNAL_API_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  );
}

export async function createTrackingActionToken(orderId: string, ttlSeconds = TRACKING_TOKEN_TTL_SECONDS): Promise<string> {
  const secret = getTrackingTokenSecret();
  if (!secret) throw new Error('TRACKING_TOKEN_SECRET is not configured');

  const now = Math.floor(Date.now() / 1000);
  return signTokenPayload<TrackingActionTokenPayload>(
    {
      order_id: orderId,
      scope: 'tracking:self-care',
      iat: now,
      exp: now + ttlSeconds,
    },
    secret,
  );
}

export async function verifyTrackingActionToken(token: string, orderId: string): Promise<boolean> {
  const secret = getTrackingTokenSecret();
  if (!secret) return false;

  const payload = await verifyTokenPayload<TrackingActionTokenPayload>(token, secret);
  return !!payload && payload.scope === 'tracking:self-care' && payload.order_id === orderId;
}
