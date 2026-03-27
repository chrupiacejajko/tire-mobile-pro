'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Route, CheckCircle, Loader2,
} from 'lucide-react';
import {
  DndContext, DragOverlay, DragStartEvent, DragEndEvent,
  closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';

import { useOrdersRealtime } from '@/hooks/use-orders-realtime';
import { useLiveScoring } from '@/hooks/use-live-scoring';
import { type PlannerData, type UnassignedOrder, type Stop, type EmployeeRoute, STATUS_STYLES } from './_components/types';
import { DraggableUnassignedCard, DragOverlayCard } from './_components/UnassignedCard';
import { DroppableRouteCard } from './_components/RouteCard';
import { AssignedDragOverlay } from './_components/StopCard';
import { GanttView } from './_components/GanttView';
import { PlannerTopBar, type Region } from './_components/PlannerTopBar';
import { AlertLayer } from './_components/AlertLayer';
import { OptimizationFeedbackModal } from './_components/OptimizationFeedbackModal';
import { toastOptimizeAll, toastInsert, toastReoptimize, toastReassign, toastError, toastUndo, toastNoChange } from './_components/FeedbackToast';

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [date, setDate] = useState(() => {
    const urlDate = searchParams.get('date');
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) return urlDate;
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  });
  const [data, setData] = useState<PlannerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState<string | null>(null);
  const [reoptimizingId, setReoptimizingId] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<UnassignedOrder | null>(null);
  const [activeStop, setActiveStop] = useState<{ stop: Stop; fromEmployeeId: string } | null>(null);
  const [inserting, setInserting] = useState(false);
  const [bufferEnabled, setBufferEnabled] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('list');
  const [optimizeResult, setOptimizeResult] = useState<{ before: EmployeeRoute[]; result: any } | null>(null);
  const [undoToken, setUndoToken] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(() => {
    return searchParams.get('region') || null;
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Fetch regions once on mount
  useEffect(() => {
    fetch('/api/regions')
      .then(res => res.ok ? res.json() : [])
      .then((data: Region[]) => setRegions(data.filter(r => r.is_active !== false)))
      .catch(() => {});
  }, []);

  const load = useCallback(async (d: string, regionId?: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: d });
      if (regionId) params.set('region_id', regionId);
      const res = await fetch(`/api/planner?${params}`);
      if (!res.ok) {
        console.error(`Planner API error: ${res.status}`);
        setData(null);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Silent load — used by GanttView D&D (no spinner, preserves mounted state)
  const silentLoad = useCallback(async (d: string, regionId?: string | null) => {
    try {
      const params = new URLSearchParams({ date: d });
      if (regionId) params.set('region_id', regionId);
      const res = await fetch(`/api/planner?${params}`);
      if (res.ok) setData(await res.json());
    } catch {}
  }, []);

  useEffect(() => { load(date, selectedRegionId); }, [date, selectedRegionId, load]);

  // Auto-refresh when any order changes via Supabase Realtime
  // Uses silentLoad when in gantt view (no loading spinner = no unmount)
  const handleRealtimeChange = useCallback(() => {
    if (viewMode === 'gantt') silentLoad(date, selectedRegionId);
    else load(date, selectedRegionId);
  }, [load, silentLoad, date, viewMode, selectedRegionId]);
  useOrdersRealtime(handleRealtimeChange);

  // Sync date and region to URL search params
  useEffect(() => {
    const currentDate = searchParams.get('date');
    const currentRegion = searchParams.get('region') || null;
    if (currentDate !== date || currentRegion !== selectedRegionId) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('date', date);
      if (selectedRegionId) {
        params.set('region', selectedRegionId);
      } else {
        params.delete('region');
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [date, selectedRegionId, searchParams, router]);

  // ── Undo handler ──────────────────────────────────────────────────────────

  const handleUndo = useCallback(async () => {
    if (!undoToken) return;
    setUndoing(true);
    try {
      const res = await fetch('/api/planner/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ undo_token: undoToken }),
      });
      const result = await res.json();
      if (res.ok) {
        toastUndo(result);
        setUndoToken(null);
        setOptimizeResult(null);
        await load(date, selectedRegionId);
      } else {
        toastUndo(null, result.error ?? 'Nieznany błąd');
      }
    } catch (e) {
      toastUndo(null, 'Błąd połączenia');
    } finally {
      setUndoing(false);
    }
  }, [undoToken, date, selectedRegionId, load]);

  // ── API handlers ──────────────────────────────────────────────────────────

  const handleOptimize = async (employeeId: string) => {
    setOptimizing(employeeId);
    try {
      const res = await fetch('/api/planner/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, employee_ids: [employeeId], commit: true }),
      });
      if (res.ok) {
        const result = await res.json();
        toastOptimizeAll(result);
        if (result.undo_token) setUndoToken(result.undo_token);
        load(date, selectedRegionId);
      } else { toastError('Optymalizacja nie powiodła się'); }
    } finally {
      setOptimizing(null);
    }
  };

  const handleOptimizeAll = async () => {
    const beforeRoutes = data?.routes ? JSON.parse(JSON.stringify(data.routes)) : [];
    setOptimizing('all');
    try {
      const res = await fetch('/api/planner/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          commit: true,
          ...(bufferEnabled ? { buffer_pct: 0.4 } : {}),
        }),
      });
      if (res.ok) {
        const result = await res.json();

        // Store undo token if provided
        if (result.undo_token) {
          setUndoToken(result.undo_token);
        }

        // If no change, show toast only — don't open modal
        if (result.status === 'no_change') {
          toastNoChange();
          return;
        }

        toastOptimizeAll(result);
        await load(date, selectedRegionId);
        setOptimizeResult({ before: beforeRoutes, result });
      } else { toastError('Optymalizacja nie powiodła się'); }
    } finally {
      setOptimizing(null);
    }
  };

  const handleReoptimize = async (employeeId: string) => {
    setReoptimizingId(employeeId);
    try {
      const res = await fetch('/api/planner/reoptimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, date }),
      });
      if (res.ok) {
        const result = await res.json();
        const empName = data?.routes?.find(r => r.employee_id === employeeId)?.employee_name ?? '';
        // Compute score delta if we have before data
        const beforeScore = data?.routes?.find(r => r.employee_id === employeeId)?.score?.score;
        const afterScore = result.score?.score;
        const scoreDelta = (beforeScore !== undefined && afterScore !== undefined)
          ? afterScore - beforeScore
          : undefined;
        toastReoptimize(empName, scoreDelta);
        load(date, selectedRegionId);
      } else { toastError('Przeliczenie trasy nie powiodło się'); }
    } finally {
      setReoptimizingId(null);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'unassigned') {
      setActiveOrder(active.data.current.order as UnassignedOrder);
      setActiveStop(null);
    } else if (active.data.current?.type === 'assigned') {
      setActiveStop({
        stop: active.data.current.stop as Stop,
        fromEmployeeId: active.data.current.employeeId as string,
      });
      setActiveOrder(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const wasAssigned = active.data.current?.type === 'assigned';
    const fromEmployeeId = wasAssigned ? (active.data.current?.employeeId as string) : null;
    setActiveOrder(null);
    setActiveStop(null);

    if (!over || !active.data.current) return;

    const targetEmployeeId = over.data.current?.employeeId;
    if (!targetEmployeeId) return;

    // For assigned orders: skip if dropping on the same employee
    if (wasAssigned && fromEmployeeId === targetEmployeeId) return;

    const orderId = wasAssigned
      ? (active.data.current.orderId as string)
      : (active.data.current.order as UnassignedOrder).id;

    setInserting(true);
    try {
      const res = await fetch('/api/planner/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, employee_id: targetEmployeeId, date }),
      });
      if (res.ok) {
        const result = await res.json();
        const toName = data?.routes?.find(r => r.employee_id === targetEmployeeId)?.employee_name;
        // Store undo token for inserts
        if (result.undo_token) setUndoToken(result.undo_token);
        if (wasAssigned) {
          const fromName = data?.routes?.find(r => r.employee_id === fromEmployeeId)?.employee_name;
          toastReassign(fromName ?? '?', toName ?? '?', result);
        } else {
          toastInsert(result, toName ?? undefined);
        }
        await load(date, selectedRegionId);
      } else { toastError(wasAssigned ? 'Przeniesienie zlecenia nie powiodło się' : 'Wstawianie zlecenia nie powiodło się'); }
    } catch (e) {
      console.error('Insert/reassign failed', e);
      toastError('Operacja nie powiodła się');
    }
    setInserting(false);
  };

  // ── Live GPS scoring (only active in Gantt view) ─────────────────────────

  const liveScoring = useLiveScoring(
    data?.routes ?? [],
    viewMode === 'gantt',
    60_000, // refresh every 60 seconds
  );

  // ── Derived state ─────────────────────────────────────────────────────────

  const summary = data?.summary;
  const overallScore = data?.routes?.length
    ? Math.round(data.routes.reduce((s, r) => s + r.score.score, 0) / data.routes.length)
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="relative flex flex-col h-full bg-gray-50/50">
        {/* Inserting overlay */}
        {inserting && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="flex items-center gap-3 bg-white rounded-2xl px-6 py-4 shadow-xl border">
              <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
              <span className="text-sm font-medium text-gray-700">Przenoszę zlecenie...</span>
            </div>
          </div>
        )}

        {/* Top bar — command center */}
        <PlannerTopBar
          date={date}
          data={data}
          loading={loading}
          optimizing={optimizing}
          bufferEnabled={bufferEnabled}
          viewMode={viewMode}
          overallScore={overallScore}
          regions={regions}
          selectedRegionId={selectedRegionId}
          onDateChange={setDate}
          onRefresh={() => load(date, selectedRegionId)}
          onOptimizeAll={handleOptimizeAll}
          onBufferToggle={setBufferEnabled}
          onViewModeChange={setViewMode}
          onRegionChange={setSelectedRegionId}
        />

        {/* Alert layer — actionable recommendations */}
        <AlertLayer
          data={data}
          loading={loading}
          onOptimizeAll={handleOptimizeAll}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Unassigned sidebar */}
          <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">Nieprzypisane</h2>
                {summary && summary.unassigned > 0 && (
                  <span className="text-[11px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
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
                [...(data?.unassigned ?? [])].sort((a, b) => {
                  const prio: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
                  return (prio[a.priority ?? 'normal'] ?? 2) - (prio[b.priority ?? 'normal'] ?? 2);
                }).map(order => (
                  <DraggableUnassignedCard key={order.id} order={order} />
                ))
              )}
            </div>
          </div>

          {/* Right: Routes / Gantt */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Legend */}
            <div className="flex items-center gap-4 mb-4">
              <span className="text-[11px] text-gray-400 font-medium">Status okna:</span>
              {Object.entries(STATUS_STYLES).map(([key, s]) => (
                <span key={key} className="flex items-center gap-1 text-[11px]">
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  <span className="text-gray-500">{s.label}</span>
                </span>
              ))}
            </div>

            {/* Route cards / Gantt */}
            {/* Gantt view — GanttView stays ALWAYS mounted while in gantt mode to prevent refresh flash */}
            {viewMode === 'gantt' ? (
              <div className="relative">
                {/* Always-mounted GanttView */}
                <div className={liveScoring.routes.length === 0 ? 'invisible h-0 overflow-hidden' : undefined}>
                  {liveScoring.isLive && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        Live GPS
                      </span>
                      {liveScoring.lastUpdate && (
                        <span className="text-[10px] text-gray-400">
                          Aktualizacja: {liveScoring.lastUpdate.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      )}
                    </div>
                  )}
                  <GanttView routes={liveScoring.routes} unassigned={data?.unassigned ?? []} date={date} onRefresh={() => silentLoad(date, selectedRegionId)} onOrderClick={(orderId) => router.push(`/orders?highlight=${orderId}`)} />
                </div>
                {/* Overlays for loading / empty states */}
                {loading && liveScoring.routes.length === 0 && (
                  <div className="space-y-4">
                    {[1,2,3].map(i => <div key={i} className="h-48 bg-white animate-pulse rounded-2xl border border-gray-200" />)}
                  </div>
                )}
                {!loading && (data?.routes?.length ?? 0) === 0 && (
                  <div className="text-center py-16">
                    <Route className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400">Brak tras na wybrany dzień</p>
                  </div>
                )}
              </div>
            ) : loading ? (
              <div className="space-y-4">
                {[1,2,3].map(i => <div key={i} className="h-48 bg-white animate-pulse rounded-2xl border border-gray-200" />)}
              </div>
            ) : (data?.routes?.length ?? 0) === 0 ? (
              <div className="text-center py-16">
                <Route className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400">Brak tras na wybrany dzień</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                {data?.routes?.map(route => (
                  <DroppableRouteCard
                    key={route.employee_id}
                    route={route}
                    onOptimize={handleOptimize}
                    onReoptimize={handleReoptimize}
                    reoptimizing={reoptimizingId === route.employee_id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeOrder ? <DragOverlayCard order={activeOrder} /> : null}
        {activeStop ? <AssignedDragOverlay stop={activeStop.stop} /> : null}
      </DragOverlay>

      {/* Optimization feedback modal */}
      {optimizeResult && (
        <OptimizationFeedbackModal
          before={optimizeResult.before}
          result={optimizeResult.result}
          after={data?.routes ?? []}
          onClose={() => setOptimizeResult(null)}
          onUndo={undoToken ? handleUndo : undefined}
          undoing={undoing}
        />
      )}
    </DndContext>
  );
}
