/**
 * Worker shift state machine.
 *
 * Enforces valid work_status transitions.
 * Applied in all /api/worker/shift/* endpoints.
 */

export type WorkStatus = 'off_work' | 'on_work' | 'break';

// Valid transitions: current → allowed next values
const ALLOWED_TRANSITIONS: Record<WorkStatus, WorkStatus[]> = {
  off_work: ['on_work'],                   // can only start shift
  on_work:  ['break', 'off_work'],         // can break or end shift
  break:    ['on_work', 'off_work'],       // can resume or emergency-end shift
};

export interface TransitionResult {
  ok: boolean;
  error?: string;
}

export function validateTransition(current: WorkStatus, next: WorkStatus): TransitionResult {
  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed) {
    return { ok: false, error: `Nieznany status: ${current}` };
  }
  if (!allowed.includes(next)) {
    const labels: Record<WorkStatus, string> = {
      off_work: 'poza zmianą',
      on_work:  'w pracy',
      break:    'na przerwie',
    };
    return {
      ok: false,
      error: `Przejście niemożliwe: status "${labels[current]}" → "${labels[next]}". Dozwolone: ${allowed.map(s => labels[s]).join(', ')}.`,
    };
  }
  return { ok: true };
}

/**
 * Human-readable label for UI display.
 */
export function workStatusLabel(status: WorkStatus): string {
  const labels: Record<WorkStatus, string> = {
    off_work: 'Poza zmianą',
    on_work:  'W pracy',
    break:    'Na przerwie',
  };
  return labels[status] ?? status;
}

export function workStatusColor(status: WorkStatus): string {
  const colors: Record<WorkStatus, string> = {
    off_work: 'text-gray-500 bg-gray-100',
    on_work:  'text-emerald-700 bg-emerald-100',
    break:    'text-amber-700 bg-amber-100',
  };
  return colors[status] ?? 'text-gray-500 bg-gray-100';
}
