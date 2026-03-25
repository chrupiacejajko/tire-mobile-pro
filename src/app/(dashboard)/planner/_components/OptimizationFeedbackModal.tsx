'use client';

import { X, TrendingUp, TrendingDown, Minus, ArrowRight, Route, Clock, MapPin, AlertTriangle, CheckCircle2, Shuffle, Undo2, Wifi, WifiOff } from 'lucide-react';
import { type EmployeeRoute } from './types';

interface Warning {
  type: string;
  employee_id?: string;
  employee_name?: string;
  score_before?: number;
  score_after?: number;
  message: string;
}

interface OptimizationFeedbackModalProps {
  before: EmployeeRoute[];
  result: {
    status?: 'success' | 'partial' | 'no_change' | 'warning' | 'error';
    optimized?: number;
    results?: Array<{
      employee_id: string;
      employee_name: string;
      score: { score: number; on_time: number; tight: number; late: number; total_km: number; finish_time: string };
      buffer_removed?: string[];
      sequence?: string[];
      score_before?: number;
      km_before?: number;
      late_before?: number;
      orders_before?: number;
      changed?: boolean;
    }>;
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
    warnings?: Warning[];
    undo_token?: string | null;
    undo_expires_at?: string | null;
    routing_source?: 'here' | 'haversine_fallback';
  };
  after: EmployeeRoute[];
  onClose: () => void;
  onUndo?: () => void;
  undoing?: boolean;
}

function ScoreDelta({ before, after, label }: { before: number; after: number; label: string }) {
  const delta = after - before;
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const color = isPositive ? 'text-emerald-600' : isNegative ? 'text-red-500' : 'text-gray-400';
  const bg = isPositive ? 'bg-emerald-50' : isNegative ? 'bg-red-50' : 'bg-gray-50';

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${bg}`}>
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <span className="text-xs text-gray-500">{label}:</span>
      <span className={`text-xs font-semibold ${color}`}>
        {before} → {after}
        {delta !== 0 && <span className="ml-1">({delta > 0 ? '+' : ''}{delta})</span>}
      </span>
    </div>
  );
}

function KmDelta({ before, after }: { before: number; after: number }) {
  const delta = after - before;
  const isGood = delta < -0.5;
  const isBad = delta > 0.5;
  const color = isGood ? 'text-emerald-600' : isBad ? 'text-red-500' : 'text-gray-500';

  return (
    <span className={`text-xs font-medium ${color}`}>
      {Math.round(before * 10) / 10} → {Math.round(after * 10) / 10} km
      {Math.abs(delta) > 0.1 && (
        <span className="ml-1">({delta > 0 ? '+' : ''}{Math.round(delta * 10) / 10})</span>
      )}
    </span>
  );
}

export function OptimizationFeedbackModal({ before, result, after, onClose, onUndo, undoing }: OptimizationFeedbackModalProps) {
  const results = result.results ?? [];
  const status = result.status ?? 'success';
  const warnings = result.warnings ?? [];
  const hasFallback = result.routing_source === 'haversine_fallback';
  const hasUndoToken = !!result.undo_token;

  // Calculate global before/after stats — prefer API summary, fall back to client-side
  const summary = result.summary;
  const beforeTotalScore = summary?.score_before ?? (before.length ? Math.round(before.reduce((s, r) => s + r.score.score, 0) / before.length) : 0);
  const afterTotalScore = summary?.score_after ?? (after.length ? Math.round(after.reduce((s, r) => s + r.score.score, 0) / after.length) : 0);
  const beforeTotalKm = summary?.km_before ?? Math.round(before.reduce((s, r) => s + r.total_km, 0) * 10) / 10;
  const afterTotalKm = summary?.km_after ?? Math.round(after.reduce((s, r) => s + r.total_km, 0) * 10) / 10;
  const beforeLate = summary?.late_before ?? before.reduce((s, r) => s + r.score.late, 0);
  const afterLate = summary?.late_after ?? after.reduce((s, r) => s + r.score.late, 0);
  const totalBufferRemoved = results.reduce((s, r) => s + (r.buffer_removed?.length ?? 0), 0);

  // Find reassigned orders (orders that changed employee)
  const beforeOrderMap = new Map<string, string>(); // orderId → employeeId
  for (const route of before) {
    for (const stop of route.schedule) {
      beforeOrderMap.set(stop.order_id, route.employee_id);
    }
  }
  const reassignments: Array<{ orderId: string; from: string; to: string; fromName: string; toName: string }> = [];
  for (const route of after) {
    for (const stop of route.schedule) {
      const prevEmp = beforeOrderMap.get(stop.order_id);
      if (prevEmp && prevEmp !== route.employee_id) {
        const fromName = before.find(r => r.employee_id === prevEmp)?.employee_name ?? '?';
        reassignments.push({
          orderId: stop.order_id,
          from: prevEmp,
          to: route.employee_id,
          fromName,
          toName: route.employee_name,
        });
      }
    }
  }

  const scoreImproved = afterTotalScore > beforeTotalScore;
  const scoreSame = afterTotalScore === beforeTotalScore;

  // Header styling based on status
  const headerConfig = {
    success: {
      bg: 'bg-emerald-100',
      Icon: TrendingUp,
      iconColor: 'text-emerald-600',
      subtitle: 'Plan ulepszony',
    },
    partial: {
      bg: 'bg-amber-100',
      Icon: TrendingUp,
      iconColor: 'text-amber-600',
      subtitle: 'Część tras zoptymalizowana',
    },
    no_change: {
      bg: 'bg-gray-100',
      Icon: Minus,
      iconColor: 'text-gray-500',
      subtitle: 'Brak zmian',
    },
    warning: {
      bg: 'bg-amber-100',
      Icon: AlertTriangle,
      iconColor: 'text-amber-600',
      subtitle: 'Sprawdź ostrzeżenia',
    },
    error: {
      bg: 'bg-red-100',
      Icon: AlertTriangle,
      iconColor: 'text-red-600',
      subtitle: 'Błąd optymalizacji',
    },
  }[status] ?? {
    bg: scoreImproved ? 'bg-emerald-100' : scoreSame ? 'bg-gray-100' : 'bg-amber-100',
    Icon: scoreImproved ? TrendingUp : scoreSame ? Minus : TrendingDown,
    iconColor: scoreImproved ? 'text-emerald-600' : scoreSame ? 'text-gray-500' : 'text-amber-600',
    subtitle: scoreImproved ? 'Plan ulepszony' : scoreSame ? 'Plan bez zmian' : 'Zmieniono plan',
  };

  const { bg: headerBg, Icon: HeaderIcon, iconColor, subtitle } = headerConfig;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${headerBg}`}>
              <HeaderIcon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Wynik optymalizacji</h2>
              <p className="text-xs text-gray-500">
                {results.length} tras{results.length === 1 ? 'a' : results.length < 5 ? 'y' : ''} · {subtitle}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Global summary */}
        <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100">
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-[11px] text-gray-400 font-medium mb-1">Score</p>
              <p className={`text-lg font-bold ${scoreImproved ? 'text-emerald-600' : 'text-gray-900'}`}>
                {beforeTotalScore} → {afterTotalScore}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[11px] text-gray-400 font-medium mb-1">Dystans</p>
              <p className="text-lg font-bold text-gray-900">
                <KmDelta before={beforeTotalKm} after={afterTotalKm} />
              </p>
            </div>
            <div className="text-center">
              <p className="text-[11px] text-gray-400 font-medium mb-1">Spóźnień</p>
              <p className={`text-lg font-bold ${afterLate < beforeLate ? 'text-emerald-600' : afterLate > beforeLate ? 'text-red-500' : 'text-gray-900'}`}>
                {beforeLate} → {afterLate}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[11px] text-gray-400 font-medium mb-1">Przeniesienia</p>
              <p className="text-lg font-bold text-gray-900">{summary?.reassignments ?? reassignments.length}</p>
            </div>
          </div>
        </div>

        {/* Per-employee details */}
        <div className="px-6 py-3 overflow-y-auto max-h-[45vh]">
          {/* Haversine fallback banner */}
          {hasFallback && (
            <div className="mb-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <WifiOff className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
              <span className="text-xs text-amber-700">
                Trasy obliczone bez HERE API (brak klucza lub błąd) — odległości przybliżone
              </span>
            </div>
          )}

          {/* Warnings section */}
          {warnings.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-gray-700">Ostrzeżenia</span>
              </div>
              <div className="space-y-1.5">
                {warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="text-amber-800">{w.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reassignments section */}
          {reassignments.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Shuffle className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-semibold text-gray-700">Przeniesione zlecenia</span>
              </div>
              <div className="space-y-1.5">
                {reassignments.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                    <span className="text-gray-500">Zlecenie</span>
                    <span className="font-mono text-gray-700">{r.orderId.slice(0, 8)}</span>
                    <span className="text-gray-400">·</span>
                    <span className="font-medium text-gray-700">{r.fromName}</span>
                    <ArrowRight className="h-3 w-3 text-blue-400" />
                    <span className="font-medium text-blue-700">{r.toName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Buffer removals */}
          {totalBufferRemoved > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-gray-700">Odpięte z powodu bufora (60:40)</span>
              </div>
              {results.filter(r => r.buffer_removed?.length).map(r => (
                <div key={r.employee_id} className="flex items-center gap-2 text-xs bg-amber-50 rounded-lg px-3 py-2 border border-amber-100 mb-1.5">
                  <span className="font-medium text-gray-700">{r.employee_name}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-amber-700">{r.buffer_removed!.length} zleceń odpiętych</span>
                </div>
              ))}
            </div>
          )}

          {/* Per-employee comparison */}
          <div className="flex items-center gap-2 mb-2">
            <Route className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs font-semibold text-gray-700">Porównanie tras</span>
          </div>
          <div className="space-y-2">
            {after.map(route => {
              const beforeRoute = before.find(r => r.employee_id === route.employee_id);
              const resultRoute = results.find(r => r.employee_id === route.employee_id);
              // Prefer API-provided before data, then fall back to client-side
              const scoreBefore = resultRoute?.score_before ?? beforeRoute?.score.score ?? route.score.score;
              const kmBefore = resultRoute?.km_before ?? beforeRoute?.total_km ?? route.total_km;
              const lateBefore = resultRoute?.late_before ?? beforeRoute?.score.late ?? route.score.late;
              const ordersBefore = resultRoute?.orders_before ?? beforeRoute?.total_orders ?? route.total_orders;
              if (!beforeRoute && !resultRoute) return null;

              return (
                <div key={route.employee_id} className={`bg-white border rounded-xl p-3 ${resultRoute?.changed === false ? 'border-gray-100 opacity-70' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{route.employee_name}</span>
                      {resultRoute?.changed === false && (
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">bez zmian</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">{ordersBefore} → {route.total_orders} zleceń</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ScoreDelta before={scoreBefore} after={route.score.score} label="Score" />
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                      <KmDelta before={kmBefore} after={route.total_km} />
                    </div>
                    <ScoreDelta before={lateBefore} after={route.score.late} label="Spóźnień" />
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50">
                      <Clock className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-xs text-gray-500">Koniec:</span>
                      <span className="text-xs font-medium text-gray-700">{route.score.finish_time}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {hasUndoToken && onUndo ? (
              <button
                onClick={onUndo}
                disabled={undoing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Undo2 className="h-3.5 w-3.5" />
                {undoing ? 'Cofam...' : 'Cofnij zmiany'}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-gray-500">Zmiany zostały zapisane</span>
              </div>
            )}
            {hasFallback && !hasUndoToken && (
              <div className="flex items-center gap-1.5">
                <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[11px] text-amber-600">Przybliżone odległości</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
