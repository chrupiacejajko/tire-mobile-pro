/**
 * POST /api/worker/tasks/{id}/report-delay
 * Body: { reason: string, estimated_delay_minutes?: number }
 *
 * Reports a delay for the current task.
 * Appends to dispatcher_notes and creates an alert for the dispatcher.
 *
 * Auth: worker JWT — verifies the order belongs to the calling worker.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth } from '@/lib/api/auth-guard';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;

  const auth = await checkAuth(request, ['admin', 'worker']);
  if (!auth.ok) return auth.response;

  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { reason, estimated_delay_minutes } = body as {
      reason: string;
      estimated_delay_minutes?: number;
    };

    // ── Validation ──────────────────────────────────────────────────────────
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'reason is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    if (
      estimated_delay_minutes !== undefined &&
      (typeof estimated_delay_minutes !== 'number' || estimated_delay_minutes < 0)
    ) {
      return NextResponse.json(
        { error: 'estimated_delay_minutes must be a non-negative number' },
        { status: 400 },
      );
    }

    // ── Fetch order ─────────────────────────────────────────────────────────
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, employee_id, dispatcher_notes, flexibility_minutes')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // ── Ownership check ─────────────────────────────────────────────────────
    if (auth.role === 'worker' && order.employee_id !== auth.employeeId) {
      return NextResponse.json(
        { error: 'Forbidden', code: 'NOT_YOUR_ORDER' },
        { status: 403 },
      );
    }

    // ── Build delay note ────────────────────────────────────────────────────
    const timestamp = new Date().toISOString();
    const delayInfo = estimated_delay_minutes
      ? ` (~${estimated_delay_minutes} min)`
      : '';
    const delayNote = `[DELAY${delayInfo}] ${reason.trim()} (${timestamp})`;

    const existingNotes = order.dispatcher_notes || '';
    const updatedNotes = existingNotes
      ? `${existingNotes}\n${delayNote}`
      : delayNote;

    // ── Update order ────────────────────────────────────────────────────────
    const updateData: Record<string, unknown> = {
      dispatcher_notes: updatedNotes,
    };

    // If estimated_delay_minutes provided, add to flexibility_minutes
    if (estimated_delay_minutes && estimated_delay_minutes > 0) {
      const currentFlex =
        typeof order.flexibility_minutes === 'number'
          ? order.flexibility_minutes
          : 0;
      updateData.flexibility_minutes = currentFlex + estimated_delay_minutes;
    }

    const { error: updateErr } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // ── Create dispatcher alert ─────────────────────────────────────────────
    const alertMessage = `Opóźnienie${delayInfo}: zlecenie ${orderId.slice(0, 8)}… — ${reason.trim()}`;

    await supabase.from('alerts').insert({
      order_id: orderId,
      employee_id: order.employee_id,
      message: alertMessage,
      severity: estimated_delay_minutes && estimated_delay_minutes > 30
        ? 'warning'
        : 'info',
    });

    return NextResponse.json({
      success: true,
      order_id: orderId,
      delay_note: delayNote,
      estimated_delay_minutes: estimated_delay_minutes ?? null,
    });
  } catch (err: unknown) {
    console.error('[report-delay]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
