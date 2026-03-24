/**
 * POST /api/invite/accept
 * Body: { token: string, password: string }
 *
 * Validates invite token and activates the worker account.
 * Single-use: token status becomes 'accepted' after first use.
 *
 * Auth: public endpoint (no session — worker doesn't have one yet).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { hashToken } from '@/lib/api/invite-tokens';

const PASSWORD_MIN_LENGTH = 8;
const MAX_ATTEMPTS_PER_HOUR = 5;

// Simple in-memory rate limiter (per-deployment; fine for this use case)
const attemptMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attemptMap.get(ip);
  if (!entry || now > entry.resetAt) {
    attemptMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS_PER_HOUR) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.', code: 'RATE_LIMIT' },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { token, password } = body;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'password required' }, { status: 400 });
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`, code: 'PASSWORD_TOO_SHORT' },
      { status: 422 }
    );
  }

  const supabase = getAdminClient();

  // Look up invite by token hash
  const tokenHash = await hashToken(token);
  const { data: invite } = await supabase
    .from('worker_invites')
    .select('id, employee_id, status, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  // Generic error to avoid leaking info about valid/invalid tokens
  const invalidResponse = NextResponse.json(
    { error: 'Link jest nieważny lub wygasł.', code: 'INVALID_TOKEN' },
    { status: 410 }
  );

  if (!invite) return invalidResponse;

  // Check status
  if (invite.status === 'accepted') {
    return NextResponse.json(
      { error: 'Konto zostało już aktywowane. Zaloguj się.', code: 'ALREADY_ACCEPTED' },
      { status: 410 }
    );
  }
  if (invite.status === 'revoked') return invalidResponse;
  if (invite.status === 'expired') return invalidResponse;
  if (invite.status !== 'pending') return invalidResponse;

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    // Mark as expired in DB
    await supabase
      .from('worker_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id);
    return invalidResponse;
  }

  // Get employee → user_id
  const { data: employee } = await supabase
    .from('employees')
    .select('id, user_id')
    .eq('id', invite.employee_id)
    .maybeSingle();

  if (!employee?.user_id) {
    return NextResponse.json({ error: 'Account setup error. Contact support.' }, { status: 500 });
  }

  // Set password via Supabase Admin API
  const { error: pwError } = await supabase.auth.admin.updateUserById(
    employee.user_id,
    { password }
  );

  if (pwError) {
    console.error('[invite/accept] password set error:', pwError);
    return NextResponse.json({ error: 'Failed to set password. Try again.' }, { status: 500 });
  }

  // Mark invite as accepted (single-use)
  await supabase
    .from('worker_invites')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      ip_accepted: ip,
    })
    .eq('id', invite.id);

  // Activate the account
  await supabase
    .from('employee_operational_state')
    .upsert(
      {
        employee_id: invite.employee_id,
        account_status: 'active',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'employee_id', ignoreDuplicates: false }
    );

  // Audit trail
  await supabase.from('employee_state_history').insert({
    employee_id: invite.employee_id,
    changed_field: 'account_status',
    old_value: 'invited',
    new_value: 'active',
    source: 'system',
    reason: 'Invite accepted — account activated',
    ip_address: ip,
  });

  return NextResponse.json({ ok: true, redirect: '/worker' });
}
