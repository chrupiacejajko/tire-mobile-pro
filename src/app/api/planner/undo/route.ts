/**
 * POST /api/planner/undo
 *
 * Restores orders to their state before an optimize/insert action.
 *
 * Body: { undo_token: string }
 *
 * Finds the snapshot by token, checks it's not expired,
 * restores all orders, then deletes the snapshot.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth } from '@/lib/api/auth-guard';

interface SnapshotEntry {
  order_id: string;
  employee_id: string | null;
  status: string;
  scheduled_time_start: string | null;
  scheduled_date: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { undo_token } = body;

    if (!undo_token) {
      return NextResponse.json({ error: 'undo_token is required' }, { status: 400 });
    }

    // Find the snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from('planner_snapshots')
      .select('*')
      .eq('token', undo_token)
      .single();

    if (snapshotError || !snapshot) {
      return NextResponse.json({ error: 'Nie znaleziono migawki lub już wygasła' }, { status: 404 });
    }

    // Check expiry
    if (new Date(snapshot.expires_at) < new Date()) {
      // Clean up expired snapshot
      await supabase.from('planner_snapshots').delete().eq('token', undo_token);
      return NextResponse.json({ error: 'Czas na cofnięcie minął (5 minut)' }, { status: 410 });
    }

    // Restore all orders to their previous state
    const entries = snapshot.snapshot as SnapshotEntry[];
    for (const entry of entries) {
      await supabase
        .from('orders')
        .update({
          employee_id: entry.employee_id,
          status: entry.status,
          scheduled_time_start: entry.scheduled_time_start,
          scheduled_date: entry.scheduled_date,
        })
        .eq('id', entry.order_id);
    }

    // Delete the snapshot so it can't be used again
    await supabase.from('planner_snapshots').delete().eq('token', undo_token);

    return NextResponse.json({
      success: true,
      restored: entries.length,
      message: `Przywrócono ${entries.length} zleceń do poprzedniego stanu`,
    });
  } catch (err) {
    console.error('[planner/undo]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
