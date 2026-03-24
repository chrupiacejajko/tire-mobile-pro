/**
 * Satis GPS coordinate converter & data parser
 *
 * Satis GPS stores positions as Web Mercator pixel coordinates at zoom level 17.
 * ZOOM_SCALE = 2^17 * 256 = 33,554,432 (total world pixels at max zoom)
 *
 * Data sources in Satis GPS response:
 * 1. Vehicle data table (dgVehicleDevices) — has ALL vehicles with speed, RPM, fuel, odometer, coords
 * 2. Map markers (Markers[]) — has tooltips with location detail, but only for visible vehicles
 * 3. Dashboard state — has detailed data but only for the SELECTED vehicle
 *
 * We parse ALL sources and merge for complete data.
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
 * Vehicle data parsed from Satis GPS
 */
export interface SatisVehicle {
  satisId: string;
  plate: string;
  lat: number;
  lng: number;
  speed: number | null;
  direction: string | null;
  drivingTime: string | null;
  rpm: number | null;
  fuel: number | null;         // fuel level (liters or raw value)
  fuelPercent: number | null;  // fuel percentage
  odometer: number | null;     // total km
  voltage: number | null;      // battery voltage
  location: string | null;
  timestamp: string | null;
  ignitionOn: boolean | null;
  raw: any;
}

// ─── Parse vehicle data table HTML ────────────────────────────────────────────
// The data grid table (dgVehicleDevices) contains ALL vehicles regardless of map view.
// Columns: Plate | Status | Google Maps link | Last update | Speed | Driving time | RPM | Odometer | Lat | Lng | Fuel | Fuel%

/**
 * Parse the HTML data table that contains ALL vehicles.
 * This is the primary data source — works even when vehicles are outside map viewport.
 */
export function parseVehicleTable(html: string): SatisVehicle[] {
  const vehicles: SatisVehicle[] = [];

  try {
    // Extract all table rows
    const rowRegex = /<tr[^>]*val="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
      const rowIndex = match[1];
      const rowHtml = match[2];

      // Extract all <td> contents
      const cells: string[] = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        // Strip HTML tags and decode entities
        let text = cellMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
          .replace(/&amp;/g, '&')
          .trim();
        cells.push(text);
      }

      if (cells.length < 10) continue;

      const plate = cells[0].trim();
      if (!plate) continue;

      // Col 2: Google Maps link → extract lat,lng
      const coordMatch = rowHtml.match(/maps\.google\.com\/maps\?q=([\d.-]+),([\d.-]+)/);
      const lat = coordMatch ? parseFloat(coordMatch[1]) : 0;
      const lng = coordMatch ? parseFloat(coordMatch[2]) : 0;

      // Col 4: Speed — can be a number, or empty (ignition off shows image)
      const speedText = cells[4]?.replace(/[^\d]/g, '');
      const speed = speedText ? parseInt(speedText) : null;

      // Ignition detection — cell has "IngitionImage" class when ignition is off
      const ignitionOff = rowHtml.includes('IngitionImage');

      // Col 5: Driving time
      const drivingTime = cells[5]?.trim() || null;

      // Col 6: RPM (thousands separator as space/nbsp)
      const rpmText = cells[6]?.replace(/[^\d]/g, '');
      const rpm = rpmText ? parseInt(rpmText) : null;

      // Col 7: Odometer (km, thousands separator)
      const odometerText = cells[7]?.replace(/[^\d]/g, '');
      const odometer = odometerText ? parseInt(odometerText) : null;

      // Col 10: Fuel level (can have comma as decimal separator)
      const fuelText = cells[10]?.replace(',', '.');
      const fuel = fuelText ? parseFloat(fuelText) : null;

      // Col 11: Fuel %
      const fuelPctText = cells[11]?.replace(/[^\d]/g, '');
      const fuelPercent = fuelPctText ? parseInt(fuelPctText) : null;

      vehicles.push({
        satisId: rowIndex,
        plate,
        lat,
        lng,
        speed: ignitionOff ? 0 : speed,
        direction: null, // filled from markers later
        drivingTime,
        rpm: ignitionOff ? 0 : rpm,
        fuel: isNaN(fuel as number) ? null : fuel,
        fuelPercent: isNaN(fuelPercent as number) ? null : fuelPercent,
        odometer: isNaN(odometer as number) ? null : odometer,
        voltage: null,
        location: null, // filled from markers later
        timestamp: null, // filled from markers later
        ignitionOn: !ignitionOff,
        raw: { source: 'table', rowIndex },
      });
    }
  } catch (err) {
    console.error('[SatisGPS] parseVehicleTable error:', err);
  }

  return vehicles;
}

// ─── Parse map markers (existing logic, enhanced) ─────────────────────────────

export function parseMapState(stateJson: any): SatisVehicle[] {
  const vehicles: SatisVehicle[] = [];

  try {
    const markers: any[] = stateJson?.Markers ?? [];

    for (const marker of markers) {
      if (!marker.ID?.startsWith('Vehicle_')) continue;
      if (marker.ClassName?.includes('VehicleHighlight')) continue;

      const satisId = marker.ID.replace('Vehicle_', '');
      const plate = marker.Caption ?? marker.Tag ?? '';
      const { lat, lng } = satisToLatLng(marker.XOffset, marker.YOffset);

      // Find the CLOSEST MonitoredPath direction marker (has the most recent tooltip data)
      const pathMarkers = markers.filter(
        (m) => m.ID?.startsWith(`MonitoredPath_dir${satisId}`) && m.ToolTip
      );
      // Sort by ID suffix (higher = more recent) and pick last
      const latestPath = pathMarkers.length > 0 ? pathMarkers[pathMarkers.length - 1] : null;
      const dirMarker = markers.find((m) => m.ID === `VehicleDirection_${satisId}`);

      let speed: number | null = null;
      let rpm: number | null = null;
      let drivingTime: string | null = null;
      let location: string | null = null;
      let timestamp: string | null = null;
      let fuel: number | null = null;

      // Parse tooltip from the latest path marker or direction marker
      const tooltipSource = latestPath?.ToolTip ?? dirMarker?.ToolTip ?? marker.ToolTip ?? '';
      if (tooltipSource) {
        // Speed: "Prędkość:</td><td align="left">42"
        const speedMatch = tooltipSource.match(/Pr(?:ę|e)dko(?:ś|s)(?:ć|c):<\/td><td[^>]*>(\d+)/i);
        const rpmMatch = tooltipSource.match(/RPM:<\/td><td[^>]*>(\d+)/i);
        const timeMatch = tooltipSource.match(/Czas jazdy:<\/td><td[^>]*>([\d]+[hm][\s\d]*[ms]?[\s\d]*s?)/i);
        const fuelMatch = tooltipSource.match(/Paliwo:<\/td><td[^>]*>([\d.,]+)/i);
        const locationMatch = tooltipSource.match(/VehicleTooltipTableTdHeader">([^<]+),\s*20\d\d-\d\d-\d\d/);
        const tsMatch = tooltipSource.match(/(20\d\d-\d\d-\d\d,\s*\d\d:\d\d)/);

        if (speedMatch) speed = parseInt(speedMatch[1]);
        if (rpmMatch) rpm = parseInt(rpmMatch[1]);
        if (timeMatch) drivingTime = timeMatch[1].trim();
        if (fuelMatch) fuel = parseFloat(fuelMatch[1].replace(',', '.'));
        if (locationMatch) location = locationMatch[1].trim();
        if (tsMatch) timestamp = tsMatch[1].replace(/,\s*/, 'T') + ':00';
      }

      const direction = dirMarker?.ClassName?.replace('VehicleDirection_', '') ?? null;

      vehicles.push({
        satisId,
        plate,
        lat,
        lng,
        speed,
        direction,
        drivingTime,
        rpm,
        fuel,
        fuelPercent: null,
        odometer: null,
        voltage: null,
        location,
        timestamp,
        ignitionOn: null,
        raw: marker,
      });
    }
  } catch (err) {
    console.error('[SatisGPS] parseMapState error:', err);
  }

  return vehicles;
}

// ─── Parse dashboard state (for selected vehicle) ─────────────────────────────

export interface DashboardData {
  speed: number | null;
  rpm: number | null;
  fuel: number | null;
  voltage: number | null;
  heading: number | null;
}

export function parseDashboardState(controlsJson: any): DashboardData | null {
  const search = (obj: any): DashboardData | null => {
    if (typeof obj !== 'object' || obj === null) return null;

    // Dashboard state has Speed, RPM, Fuel, Voltage keys
    if (typeof obj.Speed === 'number' && typeof obj.RPM === 'number' && typeof obj.Fuel === 'number') {
      return {
        speed: obj.Speed,
        rpm: obj.RPM,
        fuel: obj.Fuel,
        voltage: obj.Voltage ?? null,
        heading: obj.Heading ?? null,
      };
    }

    if (obj.State && typeof obj.State.Speed === 'number') {
      return {
        speed: obj.State.Speed,
        rpm: obj.State.RPM ?? null,
        fuel: obj.State.Fuel ?? null,
        voltage: obj.State.Voltage ?? null,
        heading: obj.State.Heading ?? null,
      };
    }

    for (const key of Object.keys(obj)) {
      const found = search(obj[key]);
      if (found) return found;
    }
    return null;
  };

  return search(controlsJson);
}

// ─── Master parser: extract ALL data from full Satis GPS response ─────────────

/**
 * Parse the full Satis GPS response and return ALL vehicles with complete data.
 * Merges data from: vehicle table + map markers + dashboard state.
 */
export function parseFullResponse(controlsJson: any): SatisVehicle[] {
  // 1. Find and parse the vehicle data table (has ALL vehicles)
  const tableVehicles: SatisVehicle[] = [];
  const tableHtml = findContent(controlsJson, 'dgVehicleDevices');
  if (tableHtml) {
    tableVehicles.push(...parseVehicleTable(tableHtml));
  }

  // 2. Find and parse map markers (has location/direction for visible vehicles)
  const mapState = extractMapState(controlsJson);
  const markerVehicles = mapState ? parseMapState(mapState) : [];

  // 3. Find dashboard state (has detailed data for selected vehicle)
  const dashboard = parseDashboardState(controlsJson);

  // 4. Merge: start with table data (complete list), enrich with marker data
  const vehicleMap = new Map<string, SatisVehicle>();

  // Table vehicles are the base (all vehicles)
  for (const v of tableVehicles) {
    vehicleMap.set(v.plate, v);
  }

  // Enrich with marker data (direction, location, timestamp, more precise coords)
  for (const m of markerVehicles) {
    const existing = vehicleMap.get(m.plate);
    if (existing) {
      // Marker has more precise coords (from GPS, not table)
      existing.lat = m.lat;
      existing.lng = m.lng;
      existing.satisId = m.satisId;
      if (m.direction) existing.direction = m.direction;
      if (m.location) existing.location = m.location;
      if (m.timestamp) existing.timestamp = m.timestamp;
      if (m.speed !== null) existing.speed = m.speed;
      if (m.rpm !== null) existing.rpm = m.rpm;
      if (m.fuel !== null) existing.fuel = m.fuel;
      if (m.drivingTime) existing.drivingTime = m.drivingTime;
    } else {
      // New vehicle from markers not in table (shouldn't happen, but handle it)
      vehicleMap.set(m.plate, m);
    }
  }

  // If no table data found, fall back to marker-only data
  if (tableVehicles.length === 0 && markerVehicles.length > 0) {
    return markerVehicles;
  }

  return Array.from(vehicleMap.values());
}

// ─── Utility: find Content string in nested controls by ServerID fragment ─────

function findContent(obj: any, serverIdFragment: string): string | null {
  if (typeof obj !== 'object' || obj === null) return null;

  if (obj.ServerID?.includes(serverIdFragment) && obj.Content) {
    return obj.Content;
  }

  if (obj.ChildControls) {
    for (const child of obj.ChildControls) {
      const found = findContent(child, serverIdFragment);
      if (found) return found;
    }
  }

  // Also check in controls array
  if (obj.controls) {
    for (const ctrl of obj.controls) {
      const found = findContent(ctrl, serverIdFragment);
      if (found) return found;
    }
  }

  for (const key of Object.keys(obj)) {
    if (key === 'ChildControls' || key === 'controls') continue;
    if (typeof obj[key] === 'object') {
      const found = findContent(obj[key], serverIdFragment);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Deep-search nested Satis control JSON for the mapTracking state object
 */
export function extractMapState(controlsJson: any): any | null {
  if (!controlsJson) return null;

  const search = (obj: any): any | null => {
    if (typeof obj !== 'object' || obj === null) return null;

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
