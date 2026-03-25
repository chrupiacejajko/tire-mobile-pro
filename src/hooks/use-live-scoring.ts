'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { EmployeeRoute, Stop, RouteScore } from '@/app/(dashboard)/planner/_components/types';

// ── Geo helpers (client-side, matching lib/geo.ts) ────────────────────────────

const EARTH_RADIUS_KM = 6371;
const AVG_SPEED_KMH = 50;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

function etaMinutes(distKm: number): number {
  const roadFactor = 1.35;
  return Math.round((distKm * roadFactor / AVG_SPEED_KMH) * 60);
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function parseTime(hhmm: string): number {
  if (!hhmm || hhmm === '--:--') return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Time window definitions (matching lib/planner.ts) ─────────────────────────

const TIME_WINDOWS: Record<string, { start: number; end: number }> = {
  morning:   { start: 8 * 60, end: 12 * 60 },
  afternoon: { start: 12 * 60, end: 16 * 60 },
  evening:   { start: 16 * 60, end: 20 * 60 },
};

function computeTimeWindowStatus(
  serviceStartMin: number,
  windowId: string | null,
): 'ok' | 'tight' | 'late' | 'early_wait' | 'no_window' {
  if (!windowId || !TIME_WINDOWS[windowId]) return 'no_window';
  const w = TIME_WINDOWS[windowId];
  if (serviceStartMin < w.start) return 'early_wait';
  if (serviceStartMin <= w.end - 15) return 'ok';
  if (serviceStartMin <= w.end) return 'tight';
  return 'late';
}

// ── GPS position from fleet API ───────────────────────────────────────────────

interface FleetVehicle {
  employee_id: string | null;
  lat: number;
  lng: number;
  speed: number;
  status: string;
  last_update: string;
}

async function fetchGPSPositions(): Promise<Map<string, { lat: number; lng: number }>> {
  const map = new Map<string, { lat: number; lng: number }>();
  try {
    const res = await fetch('/api/fleet/live?source=db');
    if (!res.ok) return map;
    const data = await res.json();
    for (const v of (data.vehicles || [])) {
      if (v.employee_id && v.lat && v.lng) {
        map.set(v.employee_id, { lat: v.lat, lng: v.lng });
      }
    }
  } catch {
    // Silently fail — live scoring is best-effort
  }
  return map;
}

// ── Service duration estimator ────────────────────────────────────────────────

function estimateServiceDuration(stop: Stop): number {
  return stop.service_duration_minutes || 30; // fallback 30 min
}

// ── Core: rescore a single route from live GPS ────────────────────────────────

function rescoreRoute(
  route: EmployeeRoute,
  gpsPos: { lat: number; lng: number } | undefined,
): EmployeeRoute {
  if (!gpsPos || route.schedule.length === 0) return route;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Find the first unvisited stop (not completed, not in_progress as "done")
  const firstUnvisitedIdx = route.schedule.findIndex(
    s => s.order_status !== 'completed' && s.order_status !== 'cancelled',
  );

  if (firstUnvisitedIdx < 0) return route; // all done

  // Recalculate ETAs from current GPS position forward
  const updatedSchedule: Stop[] = [...route.schedule];
  let currentLat = gpsPos.lat;
  let currentLng = gpsPos.lng;
  let currentTimeMin = nowMinutes;

  for (let i = firstUnvisitedIdx; i < updatedSchedule.length; i++) {
    const stop = { ...updatedSchedule[i] };
    const distKm = haversineKm(currentLat, currentLng, stop.lat, stop.lng);
    const travelMin = etaMinutes(distKm);

    stop.travel_minutes = travelMin;
    const arrivalMin = currentTimeMin + travelMin;
    stop.arrival_time = formatTime(arrivalMin);

    // Check time window for wait
    const tw = stop.time_window;
    const twDef = tw ? TIME_WINDOWS[tw] : null;
    let serviceStartMin = arrivalMin;
    let waitMin = 0;

    if (twDef && arrivalMin < twDef.start) {
      waitMin = twDef.start - arrivalMin;
      serviceStartMin = twDef.start;
    }

    stop.wait_minutes = waitMin;
    stop.service_start = formatTime(serviceStartMin);

    // Compute delay relative to time window
    const twStatus = computeTimeWindowStatus(serviceStartMin, tw);
    stop.time_window_status = twStatus;

    if (twDef && serviceStartMin > twDef.end) {
      stop.delay_minutes = serviceStartMin - twDef.end;
    } else {
      stop.delay_minutes = 0;
    }

    const serviceDuration = estimateServiceDuration(stop);
    stop.service_duration_minutes = serviceDuration;
    const departureMin = serviceStartMin + serviceDuration;
    stop.departure_time = formatTime(departureMin);

    updatedSchedule[i] = stop;
    currentLat = stop.lat;
    currentLng = stop.lng;
    currentTimeMin = departureMin;
  }

  // Recompute route score
  let onTime = 0;
  let tight = 0;
  let late = 0;
  let totalKm = 0;

  // Recalculate total km from GPS position
  let prevLat = gpsPos.lat;
  let prevLng = gpsPos.lng;
  for (let i = firstUnvisitedIdx; i < updatedSchedule.length; i++) {
    const s = updatedSchedule[i];
    totalKm += haversineKm(prevLat, prevLng, s.lat, s.lng);
    prevLat = s.lat;
    prevLng = s.lng;

    if (s.order_status === 'completed' || s.order_status === 'cancelled') continue;
    if (s.time_window_status === 'ok' || s.time_window_status === 'no_window' || s.time_window_status === 'early_wait') onTime++;
    else if (s.time_window_status === 'tight') tight++;
    else if (s.time_window_status === 'late') late++;
  }

  const total = onTime + tight + late;
  const score = total > 0
    ? Math.round(((onTime * 1.0 + tight * 0.5) / total) * 100)
    : 100;

  const lastStop = updatedSchedule[updatedSchedule.length - 1];
  const firstStop = updatedSchedule[0];
  const startMin = parseTime(firstStop.arrival_time);
  const endMin = parseTime(lastStop.departure_time);

  const updatedScore: RouteScore = {
    score,
    on_time: onTime,
    tight,
    late,
    total_km: Math.round(totalKm * 10) / 10,
    total_duration_min: endMin - startMin,
    finish_time: lastStop.departure_time,
  };

  return {
    ...route,
    schedule: updatedSchedule,
    total_km: Math.round(totalKm * 10) / 10,
    score: updatedScore,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface LiveScoringResult {
  routes: EmployeeRoute[];
  isLive: boolean;
  lastUpdate: Date | null;
}

export function useLiveScoring(
  routes: EmployeeRoute[],
  enabled: boolean,
  intervalMs: number = 60_000,
): LiveScoringResult {
  const [liveRoutes, setLiveRoutes] = useState<EmployeeRoute[]>(routes);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const routesRef = useRef(routes);

  // Keep ref in sync
  useEffect(() => {
    routesRef.current = routes;
    // Reset when source routes change (e.g. user navigated to different date)
    if (!enabled) {
      setLiveRoutes(routes);
      setIsLive(false);
    }
  }, [routes, enabled]);

  const runScoring = useCallback(async () => {
    const currentRoutes = routesRef.current;
    if (!currentRoutes || currentRoutes.length === 0) return;

    const gpsMap = await fetchGPSPositions();
    if (gpsMap.size === 0) return;

    const scored = currentRoutes.map(route => {
      const pos = gpsMap.get(route.employee_id);
      return rescoreRoute(route, pos);
    });

    setLiveRoutes(scored);
    setIsLive(true);
    setLastUpdate(new Date());
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLiveRoutes(routesRef.current);
      setIsLive(false);
      return;
    }

    // Run immediately
    runScoring();

    // Then every intervalMs
    const timer = setInterval(runScoring, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs, runScoring]);

  // If routes change externally while live, re-score
  useEffect(() => {
    if (enabled && routes.length > 0) {
      runScoring();
    }
  }, [routes, enabled, runScoring]);

  return {
    routes: enabled ? liveRoutes : routes,
    isLive,
    lastUpdate,
  };
}
