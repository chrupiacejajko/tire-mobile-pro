'use client';

// ── Score Display Components v2 ─────────────────────────────────────────────
// Score badge with semantic label, score bar, worker status dot

export function getScoreLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: 'Świetny', color: 'text-emerald-600', bg: 'bg-emerald-50' };
  if (score >= 60) return { label: 'Dobry', color: 'text-amber-600', bg: 'bg-amber-50' };
  return { label: 'Do poprawy', color: 'text-red-600', bg: 'bg-red-50' };
}

export function ScoreBadge({ score, showLabel = false }: { score: number; showLabel?: boolean }) {
  const { label, color, bg } = getScoreLabel(score);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${color} ${bg}`}>
      {score}%
      {showLabel && <span className="font-semibold">{label}</span>}
    </span>
  );
}

export function ScoreBreakdown({ onTime, tight, late }: { onTime: number; tight: number; late: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium">
      <span className="text-emerald-600">{onTime}✓</span>
      {tight > 0 && <span className="text-amber-600">{tight}⚠</span>}
      {late > 0 && <span className="text-red-600">{late}✗</span>}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
    </div>
  );
}

export function WorkerStatusDot({ pos, orders }: { pos: { lat: number; lng: number; status: string | null } | null; orders: number }) {
  let color: string;
  let label: string;
  if (pos === null) {
    color = 'bg-yellow-400';
    label = 'Brak GPS';
  } else if (orders === 0) {
    color = 'bg-gray-400';
    label = 'Brak zleceń';
  } else {
    color = 'bg-emerald-500';
    label = 'Aktywny';
  }
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`}
      title={label}
    />
  );
}
