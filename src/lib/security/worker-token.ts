import type { NextRequest, NextResponse } from 'next/server';
import { signTokenPayload, verifyTokenPayload } from '@/lib/security/hmac-token';

export const WORKER_TOKEN_COOKIE = 'worker_access_token';
const WORKER_TOKEN_TTL_SECONDS = 60 * 60 * 12;

export interface WorkerAccessTokenPayload extends Record<string, unknown> {
  sub: string;
  employee_id: string;
  role: 'worker';
  iat: number;
  exp: number;
}

function getWorkerTokenSecret(): string {
  return (
    process.env.WORKER_JWT_SECRET ||
    process.env.INTERNAL_API_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  );
}

export async function createWorkerAccessToken(input: {
  userId: string;
  employeeId: string;
  ttlSeconds?: number;
}): Promise<string> {
  const secret = getWorkerTokenSecret();
  if (!secret) throw new Error('WORKER_JWT_SECRET is not configured');

  const now = Math.floor(Date.now() / 1000);
  return signTokenPayload<WorkerAccessTokenPayload>(
    {
      sub: input.userId,
      employee_id: input.employeeId,
      role: 'worker',
      iat: now,
      exp: now + (input.ttlSeconds ?? WORKER_TOKEN_TTL_SECONDS),
    },
    secret,
  );
}

export async function verifyWorkerAccessToken(token: string): Promise<WorkerAccessTokenPayload | null> {
  const secret = getWorkerTokenSecret();
  if (!secret) return null;

  const payload = await verifyTokenPayload<WorkerAccessTokenPayload>(token, secret);
  if (!payload || payload.role !== 'worker' || !payload.sub || !payload.employee_id) {
    return null;
  }

  return payload;
}

export function getWorkerAccessTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  return request.cookies.get(WORKER_TOKEN_COOKIE)?.value ?? null;
}

export function setWorkerAccessTokenCookie(response: NextResponse, token: string) {
  response.cookies.set(WORKER_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: WORKER_TOKEN_TTL_SECONDS,
  });
}

export function clearWorkerAccessTokenCookie(response: NextResponse) {
  response.cookies.set(WORKER_TOKEN_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
