/**
 * Worker Notifications API
 *
 * GET  /api/worker-notifications?employee_id=X&unread=true  — list notifications
 * PUT  /api/worker-notifications  — mark as read (single or all)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employee_id');
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  if (!employeeId) {
    return NextResponse.json({ error: 'employee_id is required' }, { status: 400 });
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
  });
}

export async function PUT(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();

    // Mark all as read for an employee
    if (body.employee_id && body.mark_all_read) {
      const { error } = await supabase
        .from('worker_notifications')
        .update({ is_read: true })
        .eq('employee_id', body.employee_id)
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
