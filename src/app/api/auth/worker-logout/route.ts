import { NextResponse } from 'next/server';
import { clearWorkerAccessTokenCookie } from '@/lib/security/worker-token';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearWorkerAccessTokenCookie(response);
  return response;
}
