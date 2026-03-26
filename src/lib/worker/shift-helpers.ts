/**
 * Shared logic for all /api/worker/shift/* endpoints.
 * Performs the state transition, updates operational state, writes audit.
 */

import { getAdminClient } from '@/lib/supabase/admin';
import { validateTransition, type WorkStatus } from './state-machine';
import type { AuthContext } from '@/lib/api/auth-guard';

interface ShiftTransitionOptions {
  auth: AuthContext;
  employeeId: string;
  targetStatus: WorkStatus;
  lat?: number | null;
  lng?: number | null;
  reason?: string;
  requestId?: string;
  ip?: string;
}

interface ShiftTransitionResult {
  ok: boolean;
  status?: number;
  body?: Record<string, unknown>;
}

export async function performShiftTransition(
  opts: ShiftTransitionOptions
): Promise<ShiftTransitionResult> {
  const {
    auth,
    employeeId,
    targetStatus,
    lat,
    lng,
    reason,
    requestId,
    ip,
  } = opts;

  const supabase = getAdminClient();

  // Get current state
  const { data: currentState } = await supabase
    .from('employee_operational_state')
    .select('work_status, account_status')
    .eq('employee_id', employeeId)
    .maybeSingle();

  // If no state row exists yet, treat as off_work
  const currentWorkStatus: WorkStatus = (currentState?.work_status as WorkStatus) ?? 'off_work';

  // Check account is active
  if (currentState?.account_status === 'blocked') {
    return {
      ok: false,
      status: 403,
      body: { error: 'Konto zablokowane.', code: 'ACCOUNT_BLOCKED' },
    };
  }

  // Validate transition
  const transition = validateTransition(currentWorkStatus, targetStatus);
  if (!transition.ok) {
    return {
      ok: false,
      status: 409,
      body: { error: transition.error, code: 'INVALID_TRANSITION', current: currentWorkStatus, target: targetStatus },
    };
  }

  const now = new Date().toISOString();

  // Update operational state
  const stateUpdate: Record<string, unknown> = {
    work_status: targetStatus,
    last_activity_at: now,
    updated_at: now,
  };
  if (lat != null && lng != null) {
    stateUpdate.gps_lat = lat;
    stateUpdate.gps_lng = lng;
    stateUpdate.last_gps_at = now;
  }

  await supabase
    .from('employee_operational_state')
    .upsert({ employee_id: employeeId, ...stateUpdate }, { onConflict: 'employee_id' });

  // Audit trail
  await supabase.from('employee_state_history').insert({
    employee_id: employeeId,
    changed_field: 'work_status',
    old_value: currentWorkStatus,
    new_value: targetStatus,
    source: auth.role === 'admin' ? 'admin' : 'worker',
    reason: reason ?? null,
    changed_by: auth.userId,
    request_id: requestId ?? null,
    ip_address: ip ?? null,
  });

  // Handle shifts table (clock in / clock out / break tracking)
  const today = new Date().toISOString().split('T')[0];

  if (targetStatus === 'on_work' && currentWorkStatus === 'off_work') {
    // Clock in — upsert today's shift row
    await supabase.from('shifts').upsert(
      { employee_id: employeeId, date: today, clock_in: now },
      { onConflict: 'employee_id,date', ignoreDuplicates: false }
    );
  } else if (targetStatus === 'off_work') {
    // Clock out — update shift with end time
    await supabase
      .from('shifts')
      .update({ clock_out: now })
      .eq('employee_id', employeeId)
      .eq('date', today)
      .is('clock_out', null);
  }

  return {
    ok: true,
    status: 200,
    body: {
      work_status: targetStatus,
      previous_status: currentWorkStatus,
      timestamp: now,
      employee_id: employeeId,
    },
  };
}

/**
 * Dynamically compute shift_plan_status from work_schedules.
 * Never stored — always fresh from DB. (Korekta 5 z planu)
 */
export async function getShiftPlanStatus(
  employeeId: string,
  date: string
): Promise<'scheduled' | 'unscheduled'> {
  const supabase = getAdminClient();
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;
  const { count } = await supabase
    .from('work_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeId)
    .lt('start_at', dayEnd)
    .gt('end_at', dayStart);

  return (count ?? 0) > 0 ? 'scheduled' : 'unscheduled';
}
