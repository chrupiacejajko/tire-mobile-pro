/**
 * POST /api/worker/tasks/{id}/report-problem
 * Body: {
 *   type: 'client_absent' | 'wrong_address' | 'no_conditions' | 'equipment_failure'
 *       | 'vehicle_breakdown' | 'need_support' | 'client_cancelled' | 'other',
 *   description?: string,
 *   severity: 'low' | 'medium' | 'high',
 *   photos?: string[]
 * }
 *
 * Reports a problem with the current task.
 * For high severity: creates an alert for the dispatcher.
 * Always appends to dispatcher_notes on the order.
 *
 * Auth: worker JWT — verifies the order belongs to the calling worker.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth } from '@/lib/api/auth-guard';

const VALID_TYPES = [
  'client_absent',
  'wrong_address',
  'no_conditions',
  'equipment_failure',
  'vehicle_breakdown',
  'need_support',
  'client_cancelled',
  'other',
] as const;

const VALID_SEVERITIES = ['low', 'medium', 'high'] as const;

type ProblemType = (typeof VALID_TYPES)[number];
type Severity = (typeof VALID_SEVERITIES)[number];

// Map our severity to the alerts table severity
function mapSeverity(s: Severity): 'info' | 'warning' | 'critical' {
  switch (s) {
    case 'low':
      return 'info';
    case 'medium':
      return 'warning';
    case 'high':
      return 'critical';
  }
}

// Human-readable labels for problem types
const TYPE_LABELS: Record<ProblemType, string> = {
  client_absent: 'Klient nieobecny',
  wrong_address: 'Nieprawidłowy adres',
  no_conditions: 'Brak warunków do wykonania usługi',
  equipment_failure: 'Awaria sprzętu',
  vehicle_breakdown: 'Awaria pojazdu',
  need_support: 'Potrzebne wsparcie',
  client_cancelled: 'Klient anulował',
  other: 'Inny problem',
};

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
    const { type, description, severity, photos } = body as {
      type: string;
      description?: string;
      severity: string;
      photos?: string[];
    };

    // ── Validation ──────────────────────────────────────────────────────────
    if (!type || !VALID_TYPES.includes(type as ProblemType)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    if (!severity || !VALID_SEVERITIES.includes(severity as Severity)) {
      return NextResponse.json(
        { error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}` },
        { status: 400 },
      );
    }

    // ── Fetch order ─────────────────────────────────────────────────────────
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, employee_id, dispatcher_notes')
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

    // ── Build problem note ──────────────────────────────────────────────────
    const timestamp = new Date().toISOString();
    const label = TYPE_LABELS[type as ProblemType];
    const descLine = description ? ` — ${description}` : '';
    const photosLine =
      photos && photos.length > 0
        ? ` | Zdjęcia: ${photos.length}`
        : '';
    const problemNote = `[PROBLEM ${severity.toUpperCase()}] ${label}${descLine}${photosLine} (${timestamp})`;

    // Append to dispatcher_notes
    const existingNotes = order.dispatcher_notes || '';
    const updatedNotes = existingNotes
      ? `${existingNotes}\n${problemNote}`
      : problemNote;

    const { error: updateErr } = await supabase
      .from('orders')
      .update({ dispatcher_notes: updatedNotes })
      .eq('id', orderId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // ── For high severity: create dispatcher alert ──────────────────────────
    if (severity === 'high') {
      const alertMessage = `🚨 ${label}: zlecenie ${orderId.slice(0, 8)}…${descLine}`;

      await supabase.from('alerts').insert({
        order_id: orderId,
        employee_id: order.employee_id,
        message: alertMessage,
        severity: mapSeverity(severity as Severity),
      });
    }

    return NextResponse.json({
      success: true,
      order_id: orderId,
      problem_type: type,
      severity,
    });
  } catch (err: unknown) {
    console.error('[report-problem]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
