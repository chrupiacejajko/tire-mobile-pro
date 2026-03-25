/**
 * Satis GPS Official REST API Poller
 *
 * Uses the official REST API at https://api.satisgps.com/API/rest/
 * instead of reverse-engineered ASP.NET scraping.
 *
 * Required env vars:
 *   SATISGPS_SITE       - Site name (e.g. "KRUSZWIL")
 *   SATISGPS_API_USER   - API username
 *   SATISGPS_API_PASS   - API password
 *
 * Session lifetime: SessionID is valid 15 minutes from last use.
 * Since we poll every 60s, the session stays alive indefinitely.
 */

import { SatisVehicle } from './converter';

const API_BASE = 'https://api.satisgps.com/API/rest/json';

// In-memory session cache — survives across polls within a single process
let cachedSessionId: string | null = null;
let sessionCreatedAt: number = 0;
const SESSION_MAX_AGE_MS = 12 * 60 * 1000; // Refresh proactively at 12 min (TTL is 15)

export interface PollResult {
  ok: boolean;
  vehicles: SatisVehicle[];
  raw?: any;
  error?: string;
  statusCode?: number;
  sessionExpired?: boolean;
}

/**
 * Start a new API session or return cached one
 */
async function getSessionId(): Promise<string | null> {
  // Reuse cached session if fresh enough
  if (cachedSessionId && Date.now() - sessionCreatedAt < SESSION_MAX_AGE_MS) {
    return cachedSessionId;
  }

  const site = process.env.SATISGPS_SITE || 'KRUSZWIL';
  const user = process.env.SATISGPS_API_USER;
  const pass = process.env.SATISGPS_API_PASS;

  if (!user || !pass) {
    console.error('[SatisGPS] Missing SATISGPS_API_USER or SATISGPS_API_PASS');
    return null;
  }

  try {
    const url = `${API_BASE}/StartSession/${encodeURIComponent(site)}?User=${encodeURIComponent(user)}&Password=${encodeURIComponent(pass)}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`[SatisGPS] StartSession HTTP ${res.status}`);
      cachedSessionId = null;
      return null;
    }

    const data = await res.json();
    if (data?.SessionID) {
      cachedSessionId = data.SessionID;
      sessionCreatedAt = Date.now();
      console.log(`[SatisGPS] ✓ New session: ${cachedSessionId!.slice(0, 8)}...`);
      return cachedSessionId;
    }

    console.error('[SatisGPS] StartSession: no SessionID in response', data);
    return null;
  } catch (err: any) {
    console.error('[SatisGPS] StartSession failed:', err.message);
    return null;
  }
}

/**
 * Parse Satis /Date(timestamp)/ format to ISO string
 */
function parseSatisDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/\/Date\((\d+)\)\//);
  if (match) return new Date(parseInt(match[1], 10)).toISOString();
  return null;
}

/**
 * Convert API device to SatisVehicle interface
 */
function deviceToVehicle(d: any): SatisVehicle {
  // Extract additional data
  const getAdditional = (code: string): number | null => {
    const item = d.AdditionalData?.find((a: any) => a.DataCode === code);
    return item?.Value ?? null;
  };

  return {
    satisId: String(d.DeviceID || d.ServiceDeviceID || ''),
    plate: d.VehicleOrDeviceName || d.RegistrationNo || '',
    lat: d.Latitude ?? 0,
    lng: d.Longitude ?? 0,
    speed: d.Speed ?? null,
    direction: d.Heading != null ? String(d.Heading) : null,
    drivingTime: null,
    rpm: d.RPM ?? null,
    fuel: d.Fuel ?? getAdditional('Fuel'),
    fuelPercent: d.FuelPercentage ?? null,
    odometer: d.DistanceAccumulated ?? null,
    voltage: d.BatteryVoltage ?? null,
    location: d.Location ?? null,
    timestamp: parseSatisDate(d.Time),
    ignitionOn: d.EngineOn ?? null,
    raw: d,
  };
}

/**
 * Main polling function — fetches all vehicle positions via official REST API
 */
export async function pollSatisGPS(): Promise<PollResult> {
  const sessionId = await getSessionId();
  if (!sessionId) {
    return {
      ok: false,
      vehicles: [],
      error: 'Nie można uzyskać sesji Satis GPS API. Sprawdź SATISGPS_API_USER i SATISGPS_API_PASS.',
    };
  }

  try {
    const url = `${API_BASE}/GetDeviceStatus/${encodeURIComponent(sessionId)}`;
    const res = await fetch(url);

    if (!res.ok) {
      // Session probably expired — clear cache and retry once
      if (res.status === 401 || res.status === 403 || res.status >= 500) {
        cachedSessionId = null;
        const retrySession = await getSessionId();
        if (retrySession) {
          const retryRes = await fetch(`${API_BASE}/GetDeviceStatus/${encodeURIComponent(retrySession)}`);
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            const vehicles = (retryData?.Devices || []).map(deviceToVehicle);
            console.log(`[SatisGPS] ✓ API (retry) got ${vehicles.length} vehicles`);
            return { ok: true, vehicles };
          }
        }
      }
      return {
        ok: false,
        vehicles: [],
        error: `Satis GPS API HTTP ${res.status}`,
        statusCode: res.status,
      };
    }

    const data = await res.json();

    // Handle "Resource does not exist" or malformed response
    if (!data?.Devices) {
      // Session might be invalid — clear and retry
      cachedSessionId = null;
      const retrySession = await getSessionId();
      if (retrySession) {
        const retryRes = await fetch(`${API_BASE}/GetDeviceStatus/${encodeURIComponent(retrySession)}`);
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          if (retryData?.Devices) {
            const vehicles = retryData.Devices.map(deviceToVehicle);
            console.log(`[SatisGPS] ✓ API (retry) got ${vehicles.length} vehicles`);
            return { ok: true, vehicles };
          }
        }
      }
      return {
        ok: false,
        vehicles: [],
        error: 'No Devices in API response',
        raw: data,
      };
    }

    const vehicles = data.Devices.map(deviceToVehicle);

    // Refresh session timestamp (API considers this a use)
    sessionCreatedAt = Date.now();

    console.log(`[SatisGPS] ✓ API got ${vehicles.length} vehicles`);
    return { ok: true, vehicles };

  } catch (err: any) {
    return {
      ok: false,
      vehicles: [],
      error: `Błąd połączenia z API: ${err.message}`,
    };
  }
}
