/**
 * Geo utility functions — Haversine distance + route helpers
 * No external API needed — pure math based on Earth's radius
 */

const EARTH_RADIUS_KM = 6371;
const AVG_SPEED_KMH = 50; // Urban driving average (Poland)

/**
 * Haversine distance between two lat/lng points in kilometers
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Estimated travel time in minutes based on Haversine distance
 * Uses average urban speed with +30% correction for actual roads
 */
export function etaMinutes(distKm: number): number {
  const roadFactor = 1.35; // Roads are ~35% longer than straight line
  return Math.round((distKm * roadFactor / AVG_SPEED_KMH) * 60);
}

/**
 * Geo score for auto-assign: closer = higher score
 * Returns 0-25 bonus points based on distance
 */
export function geoScore(distKm: number): number {
  if (distKm < 3)  return 25;
  if (distKm < 7)  return 20;
  if (distKm < 12) return 15;
  if (distKm < 20) return 10;
  if (distKm < 35) return 5;
  return 0;
}

/**
 * Total route length for an ordered list of waypoints
 */
export function totalRouteKm(
  points: { lat: number; lng: number }[]
): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineKm(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }
  return total;
}

/**
 * How many extra km does inserting a new waypoint add to an existing route?
 * Finds the cheapest insertion position.
 */
export function insertionCostKm(
  existing: { lat: number; lng: number }[],
  newPoint: { lat: number; lng: number },
): number {
  if (existing.length === 0) return 0;
  if (existing.length === 1) {
    return haversineKm(existing[0].lat, existing[0].lng, newPoint.lat, newPoint.lng);
  }

  let minCost = Infinity;
  for (let i = 0; i < existing.length - 1; i++) {
    const current = existing[i];
    const next = existing[i + 1];
    const detour =
      haversineKm(current.lat, current.lng, newPoint.lat, newPoint.lng) +
      haversineKm(newPoint.lat, newPoint.lng, next.lat, next.lng) -
      haversineKm(current.lat, current.lng, next.lat, next.lng);
    if (detour < minCost) minCost = detour;
  }
  // Also try appending at end
  const last = existing[existing.length - 1];
  const appendCost = haversineKm(last.lat, last.lng, newPoint.lat, newPoint.lng);
  return Math.min(minCost, appendCost);
}

/**
 * Find the best position to insert a new waypoint into an existing route.
 * Returns the index (0-based, where 0 = before first stop) and the extra km cost.
 */
export function findBestInsertion(
  existing: { lat: number; lng: number }[],
  newPoint: { lat: number; lng: number },
): { index: number; costKm: number } {
  if (existing.length === 0) return { index: 0, costKm: 0 };
  if (existing.length === 1) {
    return { index: 1, costKm: haversineKm(existing[0].lat, existing[0].lng, newPoint.lat, newPoint.lng) };
  }

  let bestIndex = existing.length; // default: append
  let bestCost = haversineKm(existing[existing.length - 1].lat, existing[existing.length - 1].lng, newPoint.lat, newPoint.lng);

  for (let i = 0; i < existing.length - 1; i++) {
    const current = existing[i];
    const next = existing[i + 1];
    const detour =
      haversineKm(current.lat, current.lng, newPoint.lat, newPoint.lng) +
      haversineKm(newPoint.lat, newPoint.lng, next.lat, next.lng) -
      haversineKm(current.lat, current.lng, next.lat, next.lng);
    if (detour < bestCost) {
      bestCost = detour;
      bestIndex = i + 1; // insert after position i
    }
  }

  return { index: bestIndex, costKm: Math.round(bestCost * 10) / 10 };
}

/**
 * Point-in-polygon test using ray casting algorithm.
 * polygon is an array of [lat, lng] pairs forming a closed polygon.
 * Returns true if the point (lat, lng) is inside the polygon.
 */
export function pointInPolygon(
  lat: number,
  lng: number,
  polygon: [number, number][],
): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];

    const intersect =
      yi > lng !== yj > lng &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
