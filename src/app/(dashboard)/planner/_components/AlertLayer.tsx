'use client';

import { AlertTriangle, ArrowRight, Zap, Clock, Shield } from 'lucide-react';
import { type PlannerData } from './types';

interface AlertLayerProps {
  data: PlannerData | null;
  loading: boolean;
  onOptimizeAll: () => void;
  onOpenUnassigned?: () => void;
}

interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  icon: React.ReactNode;
  message: string;
  cta?: { label: string; onClick: () => void };
}

function deriveAlerts(data: PlannerData | null, actions: { onOptimizeAll: () => void; onOpenUnassigned?: () => void }): Alert[] {
  if (!data || !data.routes) return [];
  const alerts: Alert[] = [];

  // Unassigned orders
  const unassigned = data.summary?.unassigned ?? 0;
  if (unassigned > 0) {
    alerts.push({
      id: 'unassigned',
      type: 'error',
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      message: `${unassigned} zleceni${unassigned === 1 ? 'e' : unassigned < 5 ? 'a' : 'ń'} bez przypisanego pracownika`,
      cta: { label: 'Optymalizuj', onClick: actions.onOptimizeAll },
    });
  }

  // Late risks
  const totalLate = data.routes.reduce((s, r) => s + r.score.late, 0);
  if (totalLate > 0) {
    const lateEmployees = data.routes.filter(r => r.score.late > 0).map(r => r.employee_name.split(' ')[0]);
    alerts.push({
      id: 'late',
      type: 'error',
      icon: <Clock className="h-3.5 w-3.5" />,
      message: `${totalLate} ryzy${totalLate === 1 ? 'ko' : totalLate < 5 ? 'ka' : 'k'} spóźnienia: ${lateEmployees.join(', ')}`,
      cta: { label: 'Przelicz trasy', onClick: actions.onOptimizeAll },
    });
  }

  // Tight warnings
  const totalTight = data.routes.reduce((s, r) => s + r.score.tight, 0);
  if (totalTight > 2 && totalLate === 0) {
    alerts.push({
      id: 'tight',
      type: 'warning',
      icon: <Shield className="h-3.5 w-3.5" />,
      message: `${totalTight} zleceń z ciasnym oknem — reoptymalizacja może poprawić score`,
      cta: { label: 'Optymalizuj', onClick: actions.onOptimizeAll },
    });
  }

  // Low average score
  const avgScore = data.routes.length
    ? Math.round(data.routes.reduce((s, r) => s + r.score.score, 0) / data.routes.length)
    : 100;
  if (avgScore < 60 && totalLate === 0 && alerts.length === 0) {
    alerts.push({
      id: 'low-score',
      type: 'warning',
      icon: <Zap className="h-3.5 w-3.5" />,
      message: `Średni score tras ${avgScore}% — optymalizacja może znacząco poprawić plan`,
      cta: { label: 'Optymalizuj wszystko', onClick: actions.onOptimizeAll },
    });
  }

  return alerts;
}

const alertStyles = {
  error: {
    bg: 'bg-red-50/80',
    border: 'border-red-200/60',
    text: 'text-red-700',
    iconColor: 'text-red-500',
    ctaBg: 'bg-red-100 hover:bg-red-200 text-red-700',
  },
  warning: {
    bg: 'bg-amber-50/80',
    border: 'border-amber-200/60',
    text: 'text-amber-700',
    iconColor: 'text-amber-500',
    ctaBg: 'bg-amber-100 hover:bg-amber-200 text-amber-700',
  },
  info: {
    bg: 'bg-blue-50/80',
    border: 'border-blue-200/60',
    text: 'text-blue-700',
    iconColor: 'text-blue-500',
    ctaBg: 'bg-blue-100 hover:bg-blue-200 text-blue-700',
  },
};

export function AlertLayer({ data, loading, onOptimizeAll, onOpenUnassigned }: AlertLayerProps) {
  if (loading || !data) return null;

  const alerts = deriveAlerts(data, { onOptimizeAll, onOpenUnassigned });
  if (alerts.length === 0) return null;

  return (
    <div className="px-6 pb-2 flex flex-col gap-1.5">
      {alerts.map(alert => {
        const style = alertStyles[alert.type];
        return (
          <div
            key={alert.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${style.bg} ${style.border}`}
          >
            <span className={style.iconColor}>{alert.icon}</span>
            <span className={`text-xs font-medium ${style.text} flex-1`}>{alert.message}</span>
            {alert.cta && (
              <button
                onClick={alert.cta.onClick}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors active:scale-[0.97] ${style.ctaBg}`}
              >
                {alert.cta.label}
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
