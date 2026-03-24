/**
 * PUT /api/admin/workers/[id]/operational-state
 *
 * Admin override for employee operational state.
 * All changes are fully audited.
 *
 * Body: {
 *   work_status?: 'off_work' | 'on_work' | 'break',
 *   planner_status?: 'available' | 'unavailable' | 'forced_available' | 'forced_unavailable',
 *   account_status?: 'active' | 'blocked',
 *   reason: string  -- REQUIRED for all admin overrides
 * }
 *
 * Auth: admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth, getRequestId } from '@/lib/api/auth-guard';
import { validateTransition, type WorkStatus } from '@/lib/worker/state-machine';

type AccountStatus = 'invited' | 'active' | 'blocked';
type PlannerStatus = 'available' | 'unavailable' | 'forced_available' | 'forced_unavailable';

const VALID_WORK_STATUSES: WorkStatus[] = ['off_work', 'on_work', 'break'];
const VALID_PLANNER_STATUSES: PlannerStatus[] = ['available', 'unavailable', 'forced_available', 'forced_unavailable'];
const VALID_ACCOUNT_STATUSES: AccountStatus[] = ['active', 'blocked'];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await checkAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  const { id: employeeId } = await params;
  const requestId = getRequestId(request);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;

  const body = await request.json().catch(() => ({}));
  const { work_status, planner_status, account_status, reason } = body;

  // Reason is required for all admin overrides
  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    return NextResponse.json(
      { error: 'reason is required (min 3 characters)', code: 'REASON_REQUIRED' },
      { status: 400 }
    );
  }

  // Validate at least one field is being changed
  if (!work_status && !planner_status && !account_status) {
    return NextResponse.json(
      { error: 'At least one field must be provided: work_status, planner_status, or account_status' },
      { status: 400 }
    );
  }

  // Validate field values
  if (work_status && !VALID_WORK_STATUSES.includes(work_status)) {
    return NextResponse.json({ error: `Invalid work_status: ${work_status}` }, { status: 400 });
  }
  if (planner_status && !VALID_PLANNER_STATUSES.includes(planner_status)) {
    return NextResponse.json({ error: `Invalid planner_status: ${planner_status}` }, { status: 400 });
  }
  if (account_status && !VALID_ACCOUNT_STATUSES.includes(account_status)) {
    return NextResponse.json({ error: `Invalid account_status: ${account_status}` }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Verify employee exists
  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .maybeSingle();

  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }

  // Get current state
  const { data: currentState } = await supabase
    .from('employee_operational_state')
    .select('work_status, planner_status, account_status')
    .eq('employee_id', employeeId)
    .maybeSingle();

  const now = new Date().toISOString();
  const historyRows: Record<string, unknown>[] = [];
  const stateUpdate: Record<string, unknown> = { updated_at: now };

  // ── work_status change ──
  if (work_status) {
    const current: WorkStatus = (currentState?.work_status as WorkStatus) ?? 'off_work';

    // Admin overrides can bypass normal transition rules (forced intervention)
    // but we validate and log the bypass
    const transition = validateTransition(current, work_status as WorkStatus);
    if (!transition.ok) {
      // Admin can still force it — but we note it's a bypass
      console.warn(`[admin override] Forcing invalid transition: ${current} → ${work_status} for employee ${employeeId}`);
    }

    stateUpdate.work_status = work_status;
    stateUpdate.last_activity_at = now;

    historyRows.push({
      employee_id: employeeId,
      changed_field: 'work_status',
      old_value: current,
      new_value: work_status,
      source: 'admin',
      reason: reason.trim(),
      changed_by: auth.userId,
      request_id: requestId,
      ip_address: ip ?? null,
    });
  }

  // ── planner_status change ──
  if (planner_status) {
    const current = currentState?.planner_status ?? 'available';
    stateUpdate.planner_status = planner_status;

    historyRows.push({
      employee_id: employeeId,
      changed_field: 'planner_status',
      old_value: current,
      new_value: planner_status,
      source: 'admin',
      reason: reason.trim(),
      changed_by: auth.userId,
      request_id: requestId,
      ip_address: ip ?? null,
    });
  }

  // ── account_status change ──
  if (account_status) {
    const current = currentState?.account_status ?? 'active';
    stateUpdate.account_status = account_status;

    // Sync employees.is_active if blocking/unblocking
    if (account_status === 'blocked') {
      await supabase.from('employees').update({ is_active: false }).eq('id', employeeId);
    } else if (account_status === 'active' && current === 'blocked') {
      await supabase.from('employees').update({ is_active: true }).eq('id', employeeId);
    }

    historyRows.push({
      employee_id: employeeId,
      changed_field: 'account_status',
      old_value: current,
      new_value: account_status,
      source: 'admin',
      reason: reason.trim(),
      changed_by: auth.userId,
      request_id: requestId,
      ip_address: ip ?? null,
    });
  }

  // Apply state update
  await supabase
    .from('employee_operational_state')
    .upsert({ employee_id: employeeId, ...stateUpdate }, { onConflict: 'employee_id' });

  // Write audit trail (all changes in one batch)
  if (historyRows.length > 0) {
    await supabase.from('employee_state_history').insert(historyRows);
  }

  // Return updated state
  const { data: updatedState } = await supabase
    .from('employee_operational_state')
    .select('account_status, work_status, planner_status, updated_at')
    .eq('employee_id', employeeId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    employee_id: employeeId,
    state: updatedState,
    changes: historyRows.map(r => ({
      field: r.changed_field,
      from: r.old_value,
      to: r.new_value,
    })),
    request_id: requestId,
  });
}
