/**
 * Worker Notifications API
 *
 * GET  /api/worker-notifications?employee_id=X&unread=true|unread_only=true  — list notifications
 * POST /api/worker-notifications  — mark as read (single or all)
 * PUT  /api/worker-notifications  — mark as read (single or all)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth } from '@/lib/api/auth-guard';
import { isUuid } from '@/lib/uuid';

export async function GET(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'worker']);
  if (!auth.ok) return auth.response;

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const requestedEmployeeId = searchParams.get('employee_id');
  const employeeId = requestedEmployeeId || auth.employeeId;
  const unreadOnly =
    searchParams.get('unread') === 'true' ||
    searchParams.get('unread_only') === 'true';
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  if (!employeeId) {
    return NextResponse.json({ error: 'employee_id is required' }, { status: 400 });
  }

  if (!isUuid(employeeId)) {
    return NextResponse.json(
      { error: 'employee_id must be a valid UUID', code: 'INVALID_EMPLOYEE_ID' },
      { status: 400 },
    );
  }

  if (auth.role === 'worker' && auth.employeeId && employeeId !== auth.employeeId) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'NOT_YOUR_EMPLOYEE_ID' },
      { status: 403 },
    );
  }

  let query = supabase
    .from('worker_notifications')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also get unread count
  const { count: unreadCount } = await supabase
    .from('worker_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('employee_id', employeeId)
    .eq('is_read', false);

  return NextResponse.json({
    notifications: data ?? [],
    unread_count: unreadCount ?? 0,
    total: unreadCount ?? 0,
  });
}

async function markNotifications(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'worker']);
  if (!auth.ok) return auth.response;

  const supabase = getAdminClient();

  try {
    const body = await request.json();

    const targetEmployeeId = body.employee_id || auth.employeeId;
    if (targetEmployeeId && !isUuid(targetEmployeeId)) {
      return NextResponse.json(
        { error: 'employee_id must be a valid UUID', code: 'INVALID_EMPLOYEE_ID' },
        { status: 400 },
      );
    }

    if (auth.role === 'worker' && auth.employeeId && targetEmployeeId !== auth.employeeId) {
      return NextResponse.json(
        { error: 'Forbidden', code: 'NOT_YOUR_EMPLOYEE_ID' },
        { status: 403 },
      );
    }

    // Mark all as read for an employee
    if (targetEmployeeId && (body.mark_all_read || body.action === 'mark_all_read')) {
      const { error } = await supabase
        .from('worker_notifications')
        .update({ is_read: true })
        .eq('employee_id', targetEmployeeId)
        .eq('is_read', false);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Mark single notification as read
    if (body.id && body.is_read !== undefined) {
      const { error } = await supabase
        .from('worker_notifications')
        .update({ is_read: body.is_read })
        .eq('id', body.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  } catch (err) {
    console.error('[worker-notifications PUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return markNotifications(request);
}

export async function PUT(request: NextRequest) {
  return markNotifications(request);
}
