/**
 * POST /api/worker/shift/break/end
 * Body: { lat?: number, lng?: number }
 *
 * Transitions: break → on_work
 * Auth: worker (own record) or admin
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkAuth, getRequestId } from '@/lib/api/auth-guard';
import { performShiftTransition } from '@/lib/worker/shift-helpers';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'worker']);
  if (!auth.ok) return auth.response;

  if (!auth.employeeId) {
    return NextResponse.json({ error: 'No employee record for this account' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { lat, lng } = body;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;

  const result = await performShiftTransition({
    auth,
    employeeId: auth.employeeId,
    targetStatus: 'on_work',
    lat: lat ?? null,
    lng: lng ?? null,
    requestId: getRequestId(request),
    ip,
  });

  return NextResponse.json(result.body, { status: result.status });
}
