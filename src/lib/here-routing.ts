/**
 * HERE Routing API v8 — real road distance + live traffic ETA
 * Automatically falls back to Haversine if API key missing or request fails.
 */

import { haversineKm, etaMinutes } from './geo';

const HERE_API_KEY = process.env.HERE_API_KEY;
const ROUTER_URL = 'https://router.hereapi.com/v8/routes';

export interface RouteInfo {
  distance_km: number;
  duration_minutes: number;             // with live traffic
  duration_no_traffic_minutes: number;  // base (no traffic)
  source: 'here' | 'haversine';
}

// ── In-memory cache (key → result + expiry) ─────────────────────────────────
const _cache = new Map<string, { result: RouteInfo; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes — traffic changes, don't cache too long

function _cacheKey(oLat: number, oLng: number, dLat: number, dLng: number): string {
  // 3 decimal places ≈ 110m precision — good enough for routing cache
  return `${oLat.toFixed(3)},${oLng.toFixed(3)}->${dLat.toFixed(3)},${dLng.toFixed(3)}`;
}

function _haversineFallback(oLat: number, oLng: number, dLat: number, dLng: number): RouteInfo {
  const straight = haversineKm(oLat, oLng, dLat, dLng);
  const roadKm = Math.round(straight * 1.35 * 10) / 10; // +35% road correction
  return {
    distance_km: roadKm,
    duration_minutes: etaMinutes(straight),
    duration_no_traffic_minutes: etaMinutes(straight),
    source: 'haversine',
  };
}

/**
 * Returns road distance + traffic-aware ETA between two points.
 * Uses HERE Routing API with 5-min cache. Falls back to Haversine on error.
 */
export async function getRouteInfo(
  originLat: number, originLng: number,
  destLat: number, destLng: number,
): Promise<RouteInfo> {
  if (!HERE_API_KEY) return _haversineFallback(originLat, originLng, destLat, destLng);

  const key = _cacheKey(originLat, originLng, destLat, destLng);
  const cached = _cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;

  try {
    const url = new URL(ROUTER_URL);
    url.searchParams.set('transportMode', 'car');
    url.searchParams.set('origin', `${originLat},${originLng}`);
    url.searchParams.set('destination', `${destLat},${destLng}`);
    url.searchParams.set('return', 'summary');
    url.searchParams.set('departureTime', 'now'); // live traffic
    url.searchParams.set('apikey', HERE_API_KEY);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HERE ${res.status}`);

    const data = await res.json();
    const summary = data.routes?.[0]?.sections?.[0]?.summary;
    if (!summary) throw new Error('No route');

    const result: RouteInfo = {
      distance_km: Math.round((summary.length / 1000) * 10) / 10,
      duration_minutes: Math.ceil(summary.duration / 60),
      duration_no_traffic_minutes: Math.ceil((summary.baseDuration ?? summary.duration) / 60),
      source: 'here',
    };

    _cache.set(key, { result, expires: Date.now() + CACHE_TTL });
    return result;
  } catch {
    return _haversineFallback(originLat, originLng, destLat, destLng);
  }
}

/**
 * Fetches route info from one origin to multiple destinations in parallel.
 * Returns a Map keyed by the id you passed in.
 */
export async function getMultiRouteInfo(
  originLat: number,
  originLng: number,
  destinations: { id: string; lat: number; lng: number }[],
): Promise<Map<string, RouteInfo>> {
  const entries = await Promise.all(
    destinations.map(async d => ({
      id: d.id,
      info: await getRouteInfo(originLat, originLng, d.lat, d.lng),
    })),
  );
  return new Map(entries.map(e => [e.id, e.info]));
}

/**
 * geoScore based on real road distance (replaces Haversine-based version in geo.ts).
 */
export function geoScoreFromKm(distKm: number): number {
  if (distKm < 4)  return 25;
  if (distKm < 9)  return 20;
  if (distKm < 15) return 15;
  if (distKm < 25) return 10;
  if (distKm < 40) return 5;
  return 0;
}
