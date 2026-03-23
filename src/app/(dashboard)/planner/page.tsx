'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Route, ExternalLink, RefreshCw, Zap, Clock, MapPin,
  CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp,
  Navigation, Calendar, Copy, Car, User, TrendingUp,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Stop {
  order_id: string;
  sequence: number;
  client_name: string;
  address: string;
  lat: number;
  lng: number;
  services: string[];
  time_window: string | null;
  time_window_label: string | null;
  time_window_color: string | null;
  time_window_status: 'ok' | 'tight' | 'late' | 'early_wait' | 'no_window';
  travel_minutes: number;
  arrival_time: string;
  wait_minutes: number;
  service_start: string;
  service_duration_minutes: number;
  departure_time: string;
  delay_minutes: number;
}

interface RouteScore {
  score: number;
  on_time: number;
  tight: number;
  late: number;
  total_km: number;
  total_duration_min: number;
  finish_time: string;
}

interface EmployeeRoute {
  employee_id: string;
  employee_name: string;
  plate: string | null;
  current_position: { lat: number; lng: number; status: string | null } | null;
  schedule: Stop[];
  total_orders: number;
  total_km: number;
  score: RouteScore;
  google_maps_url: string | null;
  start_time: string;
}

interface UnassignedOrder {
  id: string;
  status: string;
  priority: string | null;
  scheduled_time_start: string | null;
  time_window: string | null;
  services: string[];
  client_name: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

interface PlannerData {
  date: string;
  routes: EmployeeRoute[];
  unassigned: UnassignedOrder[];
  summary: {
    total_orders: number;
    assigned: number;
    unassigned: number;
    active_employees: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  ok:         { bg: 'bg-emerald-50',  border: 'border-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Na czas' },
  early_wait: { bg: 'bg-blue-50',     border: 'border-blue-200',   dot: 'bg-blue-400',    text: 'text-blue-700',    label: 'Czeka' },
  tight:      { bg: 'bg-amber-50',    border: 'border-amber-200',  dot: 'bg-amber-500',   text: 'text-amber-700',   label: 'Ciasno' },
  late:       { bg: 'bg-red-50',      border: 'border-red-200',    dot: 'bg-red-500',     text: 'text-red-700',     label: 'Za późno' },
  no_window:  { bg: 'bg-gray-50',     border: 'border-gray-200',   dot: 'bg-gray-400',    text: 'text-gray-600',    label: 'Brak okna' },
};

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-emerald-600 bg-emerald-50' : score >= 50 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>{score}%</span>;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
    </div>
  );
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

// ── Stop Card ─────────────────────────────────────────────────────────────────

function StopCard({ stop, isLast }: { stop: Stop; isLast: boolean }) {
  const st = STATUS_STYLES[stop.time_window_status];
  return (
    <div className="flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${st.border} ${st.bg} ${st.text}`}>
          {stop.sequence}
        </div>
        {!isLast && <div className="w-0.5 bg-gray-200 flex-1 my-1" />}
      </div>

      {/* Content */}
      <div className={`flex-1 mb-4 rounded-xl border p-3 ${st.bg} ${st.border}`}>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div>
            <p className="font-semibold text-gray-900 text-sm">{stop.client_name}</p>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <MapPin className="h-3 w-3" />{stop.address}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${st.bg} ${st.border} ${st.text}`}>
              {st.label}
            </span>
            {stop.time_window_label && (
              <span className="text-[10px] text-gray-400">{stop.time_window_label}</span>
            )}
          </div>
        </div>

        {/* Time row */}
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <Navigation className="h-3 w-3 text-gray-400" />
            {stop.travel_minutes} min jazdy
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-gray-400" />
            Przyjazd: <strong className="text-gray-900">{stop.arrival_time}</strong>
          </span>
          {stop.wait_minutes > 0 && (
            <span className="text-blue-600">Czeka {stop.wait_minutes} min</span>
          )}
          <span>
            Serwis: <strong className="text-gray-900">{stop.service_start}–{stop.departure_time}</strong>
          </span>
        </div>

        {stop.delay_minutes > 0 && (
          <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Spóźnienie: {stop.delay_minutes} min po zamknięciu okna
          </p>
        )}

        {stop.services.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {stop.services.map((s: string, i: number) => (
              <span key={i} className="text-[10px] bg-white border border-gray-200 rounded-md px-1.5 py-0.5 text-gray-600">{s}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Route Panel ───────────────────────────────────────────────────────────────

function RoutePanel({ route, onOptimize }: { route: EmployeeRoute; onOptimize: (id: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const { score } = route;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
              <Car className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{route.employee_name}</p>
              <p className="text-xs text-gray-400">{route.plate ?? 'Brak tablicy'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ScoreBadge score={score.score} />
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-2.5 grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Zlecenia', value: route.total_orders },
            { label: 'Na czas', value: score.on_time, color: 'text-emerald-600' },
            { label: 'Ciasno', value: score.tight, color: 'text-amber-600' },
            { label: 'Spóźnione', value: score.late, color: score.late > 0 ? 'text-red-600' : 'text-gray-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-lg py-1.5">
              <p className={`text-base font-bold ${s.color ?? 'text-gray-900'}`}>{s.value}</p>
              <p className="text-[10px] text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-2">
          <ScoreBar score={score.score} />
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>Start {route.start_time}</span>
            <span>~{score.total_km} km</span>
            <span>Koniec {score.finish_time}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-2.5 flex gap-2">
          {route.google_maps_url && (
            <a
              href={route.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium transition-colors border border-blue-200"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Otwórz w Google Maps
            </a>
          )}
          {route.google_maps_url && (
            <button
              onClick={() => copyToClipboard(route.google_maps_url!)}
              className="px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500 text-xs border border-gray-200 transition-colors"
              title="Kopiuj link"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onOptimize(route.employee_id)}
            className="px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-medium border border-orange-200 transition-colors flex items-center gap-1"
          >
            <Zap className="h-3.5 w-3.5" />
            Optymalizuj
          </button>
        </div>
      </div>

      {/* Timeline */}
      {expanded && (
        <div className="px-4 pt-4 pb-2">
          {route.schedule.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Brak zleceń na ten dzień</p>
          ) : (
            route.schedule.map((stop, i) => (
              <StopCard key={stop.order_id} stop={stop} isLast={i === route.schedule.length - 1} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Unassigned Order Card ─────────────────────────────────────────────────────

function UnassignedCard({ order }: { order: UnassignedOrder }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-dashed border-gray-300 hover:border-orange-300 hover:bg-orange-50/30 transition-colors group">
      <div className="w-2 h-2 rounded-full bg-gray-300 group-hover:bg-orange-400 mt-1.5 flex-shrink-0 transition-colors" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{order.client_name}</p>
        <p className="text-xs text-gray-400 truncate">{order.address}</p>
        <div className="flex items-center gap-2 mt-1">
          {order.time_window && (
            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              {order.time_window === 'morning' ? '08–12' : order.time_window === 'afternoon' ? '12–16' : '16–20'}
            </span>
          )}
          {order.scheduled_time_start && (
            <span className="text-[10px] text-gray-400">{order.scheduled_time_start}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<PlannerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/planner?date=${d}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const handleOptimize = async (employeeId: string) => {
    setOptimizing(employeeId);
    try {
      const res = await fetch('/api/planner/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, employee_ids: [employeeId], commit: true }),
      });
      if (res.ok) load(date);
    } finally {
      setOptimizing(null);
    }
  };

  const handleOptimizeAll = async () => {
    setOptimizing('all');
    try {
      const res = await fetch('/api/planner/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, commit: true }),
      });
      if (res.ok) load(date);
    } finally {
      setOptimizing(null);
    }
  };

  const summary = data?.summary;
  const overallScore = data?.routes?.length
    ? Math.round(data.routes.reduce((s, r) => s + r.score.score, 0) / data.routes.length)
    : null;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
            <Route className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Planowanie tras</h1>
            <p className="text-xs text-gray-400">Harmonogram dzienny z oknami czasowymi</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Date picker */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="text-sm bg-transparent outline-none text-gray-700 font-medium"
            />
          </div>

          <button
            onClick={() => load(date)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm text-gray-600 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Odśwież
          </button>

          <button
            onClick={handleOptimizeAll}
            disabled={!!optimizing || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Zap className="h-4 w-4" />
            {optimizing === 'all' ? 'Optymalizuję...' : 'Optymalizuj wszystko'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Unassigned */}
        <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Nieprzypisane</h2>
              {summary && (
                <span className="text-xs font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                  {summary.unassigned}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />)}
              </div>
            ) : data?.unassigned?.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Wszystkie zlecenia przypisane</p>
              </div>
            ) : (
              data?.unassigned?.map(order => (
                <UnassignedCard key={order.id} order={order} />
              ))
            )}
          </div>
        </div>

        {/* Right: Routes */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary bar */}
          {summary && !loading && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Wszystkich zleceń', value: summary.total_orders, icon: Route, color: 'text-gray-900', bg: 'bg-white' },
                { label: 'Przypisanych', value: summary.assigned, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Aktywnych busów', value: summary.active_employees, icon: Car, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Wynik harmonogramu', value: overallScore !== null ? `${overallScore}%` : '–', icon: TrendingUp,
                  color: overallScore !== null ? (overallScore >= 80 ? 'text-emerald-600' : overallScore >= 50 ? 'text-amber-600' : 'text-red-600') : 'text-gray-400',
                  bg: 'bg-white' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-2xl border border-gray-200 p-4 flex items-center gap-3`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                  <div>
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-400">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 mb-4">
            <span className="text-xs text-gray-400 font-medium">Status okna:</span>
            {Object.entries(STATUS_STYLES).map(([key, s]) => (
              <span key={key} className="flex items-center gap-1 text-xs">
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                <span className="text-gray-500">{s.label}</span>
              </span>
            ))}
          </div>

          {/* Route cards */}
          {loading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <div key={i} className="h-48 bg-white animate-pulse rounded-2xl border border-gray-200" />)}
            </div>
          ) : data?.routes?.length === 0 ? (
            <div className="text-center py-16">
              <Route className="h-12 w-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">Brak tras na wybrany dzień</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data?.routes?.map(route => (
                <RoutePanel
                  key={route.employee_id}
                  route={route}
                  onOptimize={handleOptimize}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
