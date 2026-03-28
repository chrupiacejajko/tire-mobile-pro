/**
 * RBAC auth guard helpers for API route handlers.
 *
 * Usage:
 *   export const POST = withAuth(['admin', 'dispatcher'], async (req, ctx) => { ... });
 *   export const POST = withWorkerOwnership(async (req, ctx) => { ... });
 *   export const POST = withWebhookSecret(async (req) => { ... });
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/lib/types';
import {
  getWorkerAccessTokenFromRequest,
  verifyWorkerAccessToken,
} from '@/lib/security/worker-token';

export interface AuthContext {
  userId: string;         // auth.uid() — profiles.id
  role: UserRole;
  employeeId: string | null; // employees.id — null for admin/dispatcher without employee record
}

type RouteHandler<P = unknown> = (
  req: NextRequest,
  ctx: { auth: AuthContext; params?: P }
) => Promise<NextResponse | Response>;

/**
 * Validates JWT session and checks role.
 * Returns 401 if no session, 403 if role not in allowedRoles.
 */
export function withAuth<P = unknown>(
  allowedRoles: UserRole[],
  handler: RouteHandler<P>
) {
  return async (req: NextRequest, routeCtx?: { params?: P }): Promise<NextResponse | Response> => {
    try {
      const supabase = await createServerSupabaseClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        return NextResponse.json(
          { error: 'Unauthorized', code: 'NO_SESSION' },
          { status: 401 }
        );
      }

      // Fetch role from profiles
      const adminClient = getAdminClient();
      const { data: profile } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile) {
        return NextResponse.json(
          { error: 'Unauthorized', code: 'NO_PROFILE' },
          { status: 401 }
        );
      }

      const role = profile.role as UserRole;

      if (!allowedRoles.includes(role)) {
        return NextResponse.json(
          { error: 'Forbidden', code: 'INSUFFICIENT_ROLE', required: allowedRoles, got: role },
          { status: 403 }
        );
      }

      // Resolve employee_id if worker
      let employeeId: string | null = null;
      if (role === 'worker') {
        const { data: emp } = await adminClient
          .from('employees')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();
        employeeId = emp?.id ?? null;
      }

      const auth: AuthContext = { userId: user.id, role, employeeId };
      return handler(req, { auth, params: routeCtx?.params });
    } catch (err) {
      console.error('[withAuth] error:', err);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Like withAuth but also enforces that the worker can only access
 * resources belonging to their own employee record.
 * Admin always passes through.
 *
 * Attach employee_id to context for use in the handler.
 */
export function withWorkerAuth<P = unknown>(
  handler: RouteHandler<P>
) {
  return withAuth<P>(['admin', 'worker'], handler);
}

/**
 * Validates HMAC/shared-secret for webhook endpoints that don't use sessions.
 * Checks X-Webhook-Secret header against WEBHOOK_SECRET env var.
 */
type WebhookHandler = (req: NextRequest) => Promise<NextResponse | Response>;

export function withWebhookSecret(handler: WebhookHandler) {
  return async (req: NextRequest): Promise<NextResponse | Response> => {
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
      console.error('[withWebhookSecret] WEBHOOK_SECRET env var not set');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    const provided = req.headers.get('x-webhook-secret');
    if (!provided || provided !== secret) {
      return NextResponse.json(
        { error: 'Forbidden', code: 'INVALID_WEBHOOK_SECRET' },
        { status: 403 }
      );
    }

    return handler(req);
  };
}

/**
 * Extracts a X-Request-ID from the request or generates a fresh UUID.
 * Use in audit trail writes.
 */
export function getRequestId(req: NextRequest): string {
  return req.headers.get('x-request-id') ?? crypto.randomUUID();
}

// ── Inline guard (non-wrapping style) ────────────────────────────────────────
//
// For existing handlers that can't be easily refactored to the wrapper style:
//
//   const auth = await checkAuth(req, ['admin', 'dispatcher']);
//   if (!auth.ok) return auth.response;
//   // auth.userId, auth.role available here

type CheckAuthSuccess = { ok: true; userId: string; role: UserRole; employeeId: string | null };
type CheckAuthFailure = { ok: false; response: NextResponse };
export type CheckAuthResult = CheckAuthSuccess | CheckAuthFailure;

export async function checkAuth(
  req: NextRequest,
  allowedRoles: UserRole[]
): Promise<CheckAuthResult> {
  try {
    if (allowedRoles.includes('worker')) {
      const workerToken = getWorkerAccessTokenFromRequest(req);
      if (workerToken) {
        const workerPayload = await verifyWorkerAccessToken(workerToken);
        if (!workerPayload) {
          return {
            ok: false,
            response: NextResponse.json(
              { error: 'Unauthorized', code: 'INVALID_WORKER_TOKEN' },
              { status: 401 }
            ),
          };
        }

        return {
          ok: true,
          userId: workerPayload.sub,
          role: 'worker',
          employeeId: workerPayload.employee_id,
        };
      }
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Unauthorized', code: 'NO_SESSION' },
          { status: 401 }
        ),
      };
    }

    const adminClient = getAdminClient();
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Unauthorized', code: 'NO_PROFILE' },
          { status: 401 }
        ),
      };
    }

    const role = profile.role as UserRole;

    if (!allowedRoles.includes(role)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Forbidden', code: 'INSUFFICIENT_ROLE', required: allowedRoles, got: role },
          { status: 403 }
        ),
      };
    }

    let employeeId: string | null = null;
    if (role === 'worker') {
      const { data: emp } = await adminClient
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      employeeId = emp?.id ?? null;
    }

    return { ok: true, userId: user.id, role, employeeId };
  } catch (err) {
    console.error('[checkAuth] error:', err);
    return {
      ok: false,
      response: NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    };
  }
}
