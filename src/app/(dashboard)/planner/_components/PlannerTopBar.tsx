'use client';

import {
  Route, RefreshCw, Zap, Calendar, AlertTriangle,
  CheckCircle2, Car, TrendingUp, List, BarChart3,
  MapPin,
} from 'lucide-react';
import { type PlannerData } from './types';
import { ScoreBadge } from './ScoreDisplay';

export interface Region {
  id: string;
  name: string;
  color: string;
  is_active?: boolean;
}

interface PlannerTopBarProps {
  date: string;
  data: PlannerData | null;
  loading: boolean;
  optimizing: string | null;
  bufferEnabled: boolean;
  viewMode: 'list' | 'gantt';
  overallScore: number | null;
  regions: Region[];
  selectedRegionId: string | null;
  onDateChange: (date: string) => void;
  onRefresh: () => void;
  onOptimizeAll: () => void;
  onBufferToggle: (enabled: boolean) => void;
  onViewModeChange: (mode: 'list' | 'gantt') => void;
  onRegionChange: (regionId: string | null) => void;
}

function getGlobalStatus(data: PlannerData | null): { label: string; color: string; bg: string; borderColor: string } {
  if (!data || !data.routes) return { label: 'Ładowanie...', color: 'text-gray-500', bg: 'bg-gray-50', borderColor: 'border-gray-200' };

  const totalLate = data.routes.reduce((s, r) => s + (r.score?.late ?? 0), 0);
  const hasUnassigned = (data.summary?.unassigned ?? 0) > 0;
  const avgScore = data.routes.length
    ? Math.round(data.routes.reduce((s, r) => s + (r.score?.score ?? 0), 0) / data.routes.length)
    : 100;

  if (totalLate > 0) return { label: 'Problemy', color: 'text-red-700', bg: 'bg-red-50', borderColor: 'border-red-200' };
  if (hasUnassigned || avgScore < 60) return { label: 'Uwaga', color: 'text-amber-700', bg: 'bg-amber-50', borderColor: 'border-amber-200' };
  return { label: 'OK', color: 'text-emerald-700', bg: 'bg-emerald-50', borderColor: 'border-emerald-200' };
}

export function PlannerTopBar({
  date,
  data,
  loading,
  optimizing,
  bufferEnabled,
  viewMode,
  overallScore,
  regions,
  selectedRegionId,
  onDateChange,
  onRefresh,
  onOptimizeAll,
  onBufferToggle,
  onViewModeChange,
  onRegionChange,
}: PlannerTopBarProps) {
  const summary = data?.summary;
  const totalLate = data?.routes?.reduce((s, r) => s + r.score.late, 0) ?? 0;
  const status = getGlobalStatus(data);

  // Buffer calculation: rough % of scheduled vs available (10h workday = 600 min)
  const totalScheduledMin = data?.routes?.reduce((s, r) => s + (r.score.total_duration_min || 0), 0) ?? 0;
  const totalCapacityMin = (data?.routes?.length ?? 0) * 600; // 10h per employee
  const scheduledPct = totalCapacityMin > 0 ? Math.round((totalScheduledMin / totalCapacityMin) * 100) : 0;
  const bufferPct = 100 - scheduledPct;

  return (
    <div className="bg-white border-b border-gray-200 flex-shrink-0">
      {/* Main row */}
      <div className="px-6 py-3 flex items-center justify-between">
        {/* Left: Title + status */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
            <Route className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900">Planowanie tras</h1>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${status.color} ${status.bg} ${status.borderColor}`}>
                {status.label}
              </span>
            </div>
            <p className="text-[11px] text-gray-400">Harmonogram dzienny z oknami czasowymi</p>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* Date picker */}
          <div className="flex items-center gap-1.5 bg-gray-50/80 border border-gray-200/80 rounded-lg px-2.5 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-gray-400" />
            <input
              type="date"
              value={date}
              onChange={e => onDateChange(e.target.value)}
              className="text-sm bg-transparent outline-none text-gray-700 font-medium w-[130px]"
            />
          </div>

          {/* Region filter */}
          <div className="flex items-center gap-1.5 bg-gray-50/80 border border-gray-200/80 rounded-lg px-2.5 py-1.5">
            <MapPin className="h-3.5 w-3.5 text-gray-400" />
            <select
              value={selectedRegionId ?? ''}
              onChange={e => onRegionChange(e.target.value || null)}
              className="text-sm bg-transparent outline-none text-gray-700 font-medium cursor-pointer appearance-none pr-1"
            >
              <option value="">Wszyscy</option>
              {regions.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Refresh — ghost icon */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="h-8 w-8 rounded-lg border border-gray-200/80 hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors active:scale-[0.97]"
            title="Odśwież dane"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Buffer toggle with progress */}
          <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200/80 bg-gray-50/80 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bufferEnabled}
              onChange={e => onBufferToggle(e.target.checked)}
              className="accent-orange-500 h-3.5 w-3.5"
            />
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-600 font-medium whitespace-nowrap">Bufor 40%</span>
              {data && (
                <div className="flex items-center gap-1">
                  <div className="h-1 w-12 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-400 rounded-full" style={{ width: `${Math.min(scheduledPct, 100)}%` }} />
                  </div>
                  <span className="text-[8px] text-gray-400">{scheduledPct}%</span>
                </div>
              )}
            </div>
          </label>

          {/* View toggle — segmented */}
          <div className="flex items-center bg-gray-100/60 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => onViewModeChange('list')}
              className={`h-7 px-2.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all active:scale-[0.97] ${
                viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <List className="h-3.5 w-3.5" />Lista
            </button>
            <button
              onClick={() => onViewModeChange('gantt')}
              className={`h-7 px-2.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all active:scale-[0.97] ${
                viewMode === 'gantt' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />Gantt
            </button>
          </div>

          {/* Primary CTA */}
          <button
            onClick={onOptimizeAll}
            disabled={!!optimizing || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-all disabled:opacity-50 active:scale-[0.97] shadow-sm shadow-orange-500/20"
          >
            <Zap className="h-4 w-4" />
            {optimizing === 'all' ? 'Optymalizuje...' : 'Optymalizuj wszystko'}
          </button>
        </div>
      </div>

      {/* Summary stats row */}
      {summary && !loading && (
        <div className="px-6 pb-3 flex items-center gap-3">
          <div className="flex items-center gap-4 bg-gray-50/50 rounded-lg px-3 py-1.5 border border-gray-100/60 flex-1">
            <StatInline icon={<Route className="h-3.5 w-3.5 text-gray-400" />} label="Zleceń" value={summary.total_orders} />
            <div className="w-px h-4 bg-gray-200/60" />
            <StatInline icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />} label="Przypisanych" value={summary.assigned} color="text-emerald-600" />
            <div className="w-px h-4 bg-gray-200/60" />
            {summary.unassigned > 0 ? (
              <StatInline icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />} label="Nieprzydzielonych" value={summary.unassigned} color="text-red-600" alert />
            ) : (
              <StatInline icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />} label="Nieprzydzielonych" value={0} color="text-emerald-600" />
            )}
            <div className="w-px h-4 bg-gray-200/60" />
            <StatInline icon={<Car className="h-3.5 w-3.5 text-blue-500" />} label="Busów" value={summary.active_employees} color="text-blue-600" />
            <div className="w-px h-4 bg-gray-200/60" />
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[11px] text-gray-400">Score:</span>
              {overallScore !== null ? (
                <ScoreBadge score={overallScore} showLabel />
              ) : (
                <span className="text-[11px] text-gray-400">–</span>
              )}
            </div>
            {totalLate > 0 && (
              <>
                <div className="w-px h-4 bg-gray-200/60" />
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 border border-red-200/60">
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                  <span className="text-[11px] font-semibold text-red-600">{totalLate} spóźnień</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatInline({ icon, label, value, color, alert }: { icon: React.ReactNode; label: string; value: number | string; color?: string; alert?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 ${alert ? 'animate-pulse' : ''}`}>
      {icon}
      <span className="text-[11px] text-gray-400">{label}:</span>
      <span className={`text-[12px] font-bold ${color || 'text-gray-700'}`}>{value}</span>
    </div>
  );
}
