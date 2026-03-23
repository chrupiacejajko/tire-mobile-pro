/**
 * Satis GPS coordinate converter
 *
 * Satis GPS stores positions as Web Mercator pixel coordinates at zoom level 17.
 * ZOOM_SCALE = 2^17 * 256 = 33,554,432 (total world pixels at max zoom)
 *
 * Verified: XOffset=18361107, YOffset=11028304 → lat≈52.37, lng≈17.0 (Poznań ✓)
 */

const ZOOM_SCALE = Math.pow(2, 17) * 256; // 33,554,432

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Convert Satis GPS internal XOffset/YOffset to standard lat/lng
 */
export function satisToLatLng(xOffset: number, yOffset: number): LatLng {
  const lng = (xOffset / ZOOM_SCALE) * 360 - 180;
  const n = Math.PI * (1 - (2 * yOffset) / ZOOM_SCALE);
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
}

/**
 * Convert standard lat/lng back to Satis GPS XOffset/YOffset
 */
export function latLngToSatis(lat: number, lng: number): { xOffset: number; yOffset: number } {
  const xOffset = Math.round(((lng + 180) / 360) * ZOOM_SCALE);
  const latRad = (lat * Math.PI) / 180;
  const yOffset = Math.round(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * ZOOM_SCALE);
  return { xOffset, yOffset };
}

/**
 * Parse vehicle markers from a Satis GPS map state JSON blob
 * (captured from browser network tab or scraped from panel)
 */
export interface SatisVehicle {
  satisId: string;       // e.g. "92382"
  plate: string;         // e.g. "PY4836H"
  lat: number;
  lng: number;
  speed: number | null;
  direction: string | null; // "NNW", "E", "SSE", etc.
  drivingTime: string | null;
  rpm: number | null;
  location: string | null;  // human-readable address from tooltip
  timestamp: string | null;
  raw: any;
}

export function parseMapState(stateJson: any): SatisVehicle[] {
  const vehicles: SatisVehicle[] = [];

  try {
    const markers: any[] = stateJson?.Markers ?? [];

    for (const marker of markers) {
      // Only process main vehicle markers (not direction arrows or highlights)
      if (!marker.ID?.startsWith('Vehicle_')) continue;
      if (marker.ClassName?.includes('VehicleHighlight')) continue;

      const satisId = marker.ID.replace('Vehicle_', '');
      const plate = marker.Caption ?? marker.Tag ?? '';
      const { lat, lng } = satisToLatLng(marker.XOffset, marker.YOffset);

      // Find matching direction marker for speed/RPM/location data
      const dirMarker = markers.find(
        (m) =>
          m.ID?.startsWith(`VehicleDirection_${satisId}`) ||
          m.ID?.startsWith(`MonitoredPath_dir${satisId}`)
      );

      // Parse tooltip HTML for speed, RPM, driving time, location
      let speed: number | null = null;
      let rpm: number | null = null;
      let drivingTime: string | null = null;
      let location: string | null = null;
      let timestamp: string | null = null;

      const tooltipSource = dirMarker?.ToolTip ?? marker.ToolTip ?? '';
      if (tooltipSource) {
        const speedMatch = tooltipSource.match(/Prędkość:<\/td><td[^>]*>(\d+)/);
        const rpmMatch = tooltipSource.match(/RPM:<\/td><td[^>]*>(\d+)/);
        const timeMatch = tooltipSource.match(/Czas jazdy:<\/td><td[^>]*>([\d]+m[\s\d]+s)/);
        const locationMatch = tooltipSource.match(/class="VehicleTooltipTableTdHeader">([^<]+), 20\d\d-\d\d-\d\d, \d\d:\d\d<\/td>/);
        const tsMatch = tooltipSource.match(/(20\d\d-\d\d-\d\d, \d\d:\d\d)/);

        if (speedMatch) speed = parseInt(speedMatch[1]);
        if (rpmMatch) rpm = parseInt(rpmMatch[1]);
        if (timeMatch) drivingTime = timeMatch[1];
        if (locationMatch) location = locationMatch[1].trim();
        if (tsMatch) timestamp = tsMatch[1].replace(', ', 'T') + ':00';
      }

      // Extract direction from ClassName (e.g. "VehicleDirection_NNW")
      const directionMarker = markers.find((m) => m.ID === `VehicleDirection_${satisId}`);
      const direction = directionMarker?.ClassName?.replace('VehicleDirection_', '') ?? null;

      vehicles.push({
        satisId,
        plate,
        lat,
        lng,
        speed,
        direction,
        drivingTime,
        rpm,
        location,
        timestamp,
        raw: marker,
      });
    }
  } catch (err) {
    console.error('[SatisGPS] parseMapState error:', err);
  }

  return vehicles;
}

/**
 * Deep-search nested Satis control JSON for the mapTracking state object
 */
export function extractMapState(controlsJson: any): any | null {
  if (!controlsJson) return null;

  const search = (obj: any): any | null => {
    if (typeof obj !== 'object' || obj === null) return null;

    // Found it
    if (obj.id && typeof obj.Markers !== 'undefined' && typeof obj.CurrentZoom !== 'undefined') {
      return obj;
    }
    if (obj.State && obj.State.Markers) return obj.State;

    for (const key of Object.keys(obj)) {
      const found = search(obj[key]);
      if (found) return found;
    }
    return null;
  };

  return search(controlsJson);
}
