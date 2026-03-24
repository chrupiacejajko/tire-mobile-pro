/**
 * POST /api/admin/workers/invite
 *
 * Actions (via `action` field in body):
 *   "create"  — send a new invite to a worker (default)
 *   "resend"  — resend / regenerate invite (rate-limited: 2x/hour)
 *   "revoke"  — revoke pending invite
 *
 * Body: { employee_id: string, action?: "create" | "resend" | "revoke" }
 *
 * Auth: admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth, getRequestId } from '@/lib/api/auth-guard';
import {
  generateInviteToken,
  buildInviteUrl,
  INVITE_RESEND_LIMIT,
  INVITE_RESEND_WINDOW_MS,
  INVITE_EXPIRY_HOURS,
} from '@/lib/api/invite-tokens';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  const requestId = getRequestId(request);
  const supabase = getAdminClient();

  const body = await request.json().catch(() => ({}));
  const { employee_id, action = 'create' } = body;

  if (!employee_id) {
    return NextResponse.json({ error: 'employee_id required' }, { status: 400 });
  }

  // Validate employee exists and has a user account
  const { data: employee } = await supabase
    .from('employees')
    .select('id, user_id, is_active, user:profiles(full_name, email)')
    .eq('id', employee_id)
    .maybeSingle();

  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }

  // ── REVOKE ────────────────────────────────────────────────────────────────
  if (action === 'revoke') {
    const { error } = await supabase
      .from('worker_invites')
      .update({ status: 'revoked' })
      .eq('employee_id', employee_id)
      .eq('status', 'pending');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Audit
    await supabase.from('employee_state_history').insert({
      employee_id,
      changed_field: 'account_status',
      old_value: 'invited',
      new_value: 'invited', // status unchanged, invite just revoked
      source: 'admin',
      reason: 'Invite revoked',
      changed_by: auth.userId,
      request_id: requestId,
    });

    return NextResponse.json({ ok: true, action: 'revoked' });
  }

  // ── RESEND ────────────────────────────────────────────────────────────────
  if (action === 'resend') {
    // Rate limit check
    const { data: existing } = await supabase
      .from('worker_invites')
      .select('id, resend_count, last_resent_at')
      .eq('employee_id', employee_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const windowStart = Date.now() - INVITE_RESEND_WINDOW_MS;
      const lastResent = existing.last_resent_at ? new Date(existing.last_resent_at).getTime() : 0;

      if (lastResent > windowStart && existing.resend_count >= INVITE_RESEND_LIMIT) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Wait before resending.', code: 'RESEND_RATE_LIMIT' },
          { status: 429 }
        );
      }
    }

    // Expire the old token
    await supabase
      .from('worker_invites')
      .update({ status: 'expired' })
      .eq('employee_id', employee_id)
      .eq('status', 'pending');
  }

  // ── CREATE or RESEND: generate new token ─────────────────────────────────
  const { plaintext, hash } = await generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from('worker_invites')
    .insert({
      employee_id,
      token_hash: hash,
      status: 'pending',
      invited_by: auth.userId,
      expires_at: expiresAt,
      resend_count: action === 'resend' ? 1 : 0,
      last_resent_at: action === 'resend' ? new Date().toISOString() : null,
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Ensure employee_operational_state exists with 'invited' status
  await supabase
    .from('employee_operational_state')
    .upsert(
      { employee_id, account_status: 'invited', updated_at: new Date().toISOString() },
      { onConflict: 'employee_id', ignoreDuplicates: false }
    );

  // Audit trail
  await supabase.from('employee_state_history').insert({
    employee_id,
    changed_field: 'account_status',
    old_value: null,
    new_value: 'invited',
    source: 'admin',
    reason: action === 'resend' ? 'Invite resent' : 'Invite sent',
    changed_by: auth.userId,
    request_id: requestId,
  });

  const inviteUrl = buildInviteUrl(plaintext);

  // TODO: send email here when email service is configured
  // await sendInviteEmail({ to: employee.user.email, name: employee.user.full_name, inviteUrl })

  return NextResponse.json({
    ok: true,
    action: action === 'resend' ? 'resent' : 'created',
    invite_url: inviteUrl,
    expires_at: expiresAt,
    employee_id,
  });
}
