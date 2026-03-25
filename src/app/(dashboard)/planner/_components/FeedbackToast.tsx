'use client';

import { toast } from 'sonner';

// ── Types matching the enhanced API responses ──────────────────────────────

interface OptimizeResult {
  status?: 'success' | 'partial' | 'no_change' | 'warning' | 'error';
  message?: string;
  optimized?: number;
  results?: any[];
  summary?: {
    routes_changed: number;
    routes_total: number;
    score_before: number;
    score_after: number;
    km_before: number;
    km_after: number;
    late_before: number;
    late_after: number;
    reassignments: number;
    buffer_removed: number;
  };
  warnings?: Array<{ type: string; message: string }>;
}

interface InsertResult {
  status?: 'success' | 'warning' | 'error';
  insertion_index?: number;
  extra_km?: number;
  employee_id?: string;
  causes_late?: Array<{ order_id: string; client_name: string; delay_minutes: number }>;
  tight_window?: boolean;
  exceeds_schedule?: boolean;
  score_before?: number;
  score_after?: number;
  reason?: string;
}

// ── Toast functions ──────────────────────────────────────────────────────────

export function toastOptimizeAll(result: OptimizeResult | null) {
  if (!result) return;

  const status = result.status;
  const summary = result.summary;
  const count = result.optimized ?? result.results?.length ?? 0;

  // No-change: show info
  if (status === 'no_change' || count === 0) {
    toast.info(result.message ?? 'Trasy są już zoptymalizowane', { duration: 4000 });
    return;
  }

  // Build message
  let msg = result.message ?? `Zoptymalizowano ${count} tras${count === 1 ? 'ę' : count < 5 ? 'y' : ''}`;

  if (summary) {
    const scoreDelta = summary.score_after - summary.score_before;
    if (Math.abs(scoreDelta) >= 2) {
      msg += ` · Score: ${summary.score_before}→${summary.score_after}%`;
    }
    if (summary.buffer_removed > 0) {
      msg += ` · ${summary.buffer_removed} zleceń odpiętych (bufor)`;
    }
  }

  const hasWarnings = (result.warnings?.length ?? 0) > 0;

  if (status === 'warning' || hasWarnings) {
    toast.warning(msg, {
      description: result.warnings?.[0]?.message ?? 'Sprawdź szczegóły zmian',
      duration: 8000,
    });
  } else if (status === 'partial') {
    toast.success(msg, {
      description: `${summary?.routes_changed ?? '?'} z ${summary?.routes_total ?? '?'} tras zmienionych`,
      duration: 6000,
    });
  } else {
    toast.success(msg, {
      description: 'Kliknij aby zobaczyć szczegóły zmian',
      duration: 6000,
    });
  }
}

export function toastNoChange() {
  toast.info('Trasy są już zoptymalizowane', {
    description: 'Nie wykryto możliwości poprawy',
    duration: 4000,
  });
}

export function toastInsert(result: InsertResult | null, employeeName?: string) {
  if (!result) return;
  const pos = result.insertion_index !== undefined ? result.insertion_index + 1 : '?';
  const km = result.extra_km ? `+${Math.round(result.extra_km * 10) / 10} km` : '';

  if (result.status === 'warning') {
    const parts: string[] = [];
    if (result.causes_late && result.causes_late.length > 0) {
      parts.push(`${result.causes_late.length} zleceń może się spóźnić`);
    }
    if (result.tight_window) parts.push('ciasne okno');
    if (result.exceeds_schedule) parts.push('przekroczenie czasu pracy');

    toast.warning(
      `Wstawiono na poz. #${pos}${employeeName ? ` u ${employeeName}` : ''}${km ? ` · ${km}` : ''}`,
      {
        description: parts.length > 0 ? `Uwaga: ${parts.join(', ')}` : 'Sprawdź trasę',
        duration: 8000,
      },
    );
  } else {
    toast.success(`Wstawiono na pozycję #${pos}${employeeName ? ` u ${employeeName}` : ''}${km ? ` · ${km}` : ''}`);
  }
}

export function toastReassign(fromName: string, toName: string, result: { insertion_index?: number; extra_km?: number } | null) {
  const pos = result?.insertion_index !== undefined ? result.insertion_index + 1 : '?';
  const km = result?.extra_km ? `+${Math.round(result.extra_km * 10) / 10} km` : '';
  toast.success(`Przeniesiono z ${fromName} → ${toName} · Pozycja #${pos}${km ? ` · ${km}` : ''}`, {
    duration: 5000,
  });
}

export function toastReoptimize(employeeName: string, scoreDelta?: number) {
  if (scoreDelta !== undefined && Math.abs(scoreDelta) >= 2) {
    const sign = scoreDelta > 0 ? '+' : '';
    toast.success(`Trasa przeliczona: ${employeeName}`, {
      description: `Score: ${sign}${scoreDelta}%`,
      duration: 4000,
    });
  } else {
    toast.success(`Trasa przeliczona: ${employeeName}`);
  }
}

export function toastUndo(result: { restored?: number; message?: string } | null, error?: string) {
  if (error) {
    toast.error(`Cofnięcie nie powiodło się: ${error}`, { duration: 6000 });
    return;
  }
  if (!result) return;
  toast.success(result.message ?? `Przywrócono ${result.restored ?? '?'} zleceń`, {
    description: 'Zmiany zostały cofnięte',
    duration: 5000,
  });
}

export function toastError(message: string) {
  toast.error(message);
}
