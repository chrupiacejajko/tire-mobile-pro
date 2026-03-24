/**
 * Satis GPS Automatic Poller
 *
 * Reverse-engineered from browser DevTools network capture.
 * Uses the exact POST format that maps.satisgps.com/KRUSZWIL uses internally.
 *
 * Required env vars:
 *   SATISGPS_COOKIE     - Cookie header (from browser DevTools, stays alive while polling)
 *   SATISGPS_URL        - https://satisgps.com/KRUSZWIL/View/Localization.GPSTracking/
 *   SATISGPS_USER       - Login username (for auto-re-login when session expires)
 *   SATISGPS_PASS       - Login password (for auto-re-login when session expires)
 *
 * Session lifetime: ASP.NET session expires after ~20min of INACTIVITY.
 * Since we poll every 60s, the session stays alive 24/7 indefinitely.
 * If it does expire (server restart etc), SATISGPS_USER/PASS enables auto-relogin.
 */

import { extractMapState, parseMapState, parseFullResponse, parseVehicleTable, SatisVehicle } from './converter';

const BASE_URL = process.env.SATISGPS_URL || 'https://satisgps.com/KRUSZWIL/View/Localization.GPSTracking/';

// Map area covering entire Poland — ensures all vehicles are included in the response
const POLAND_CENTER_X = 18340336;
const POLAND_CENTER_Y = 11028405;
const MAP_ZOOM = 6; // Zoom out to see whole country

export interface PollResult {
  ok: boolean;
  vehicles: SatisVehicle[];
  raw?: any;
  error?: string;
  statusCode?: number;
  sessionExpired?: boolean;
}

/**
 * Detect the current __PAGESTATE_KEY by GETting the tracking page HTML.
 * Satis GPS changes this key per session (S2, S7, S9, S12, etc.)
 */
async function detectPageStateKey(cookie: string): Promise<string> {
  try {
    const res = await fetch(BASE_URL, {
      headers: {
        'cookie': cookie,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml',
      },
    });
    const html = await res.text();
    // Look for hidden input: <input type="hidden" name="__PAGESTATE_KEY" value="S9" />
    const match = html.match(/__PAGESTATE_KEY['":\s]+([A-Z]\d+)/);
    if (match) {
      console.log(`[SatisGPS] Detected page state key: ${match[1]}`);
      return match[1];
    }
  } catch {
    // fall through to default
  }
  return 'S2';
}

/**
 * Build POST body using !!internalTick on masterTimer (what browser actually sends for periodic refresh)
 */
function buildTickBody(pageStateKey: string): string {
  const ajaxEventParams = JSON.stringify({
    controlID: '_0.masterTimer',
    eventName: '!!internalTick',
  });
  return `__PAGESTATE_KEY=${pageStateKey}&ajaxEventParams=${encodeURIComponent(ajaxEventParams)}&_=`;
}

/**
 * Build the exact POST body used by Satis GPS panel for map refresh
 * Reverse-engineered from: __PAGESTATE_KEY=S2&ajaxEventParams={...}!!internalrefresh
 */
function buildRefreshBody(pageStateKey = 'S2', centerX = POLAND_CENTER_X, centerY = POLAND_CENTER_Y): string {
  const controlID = '_0.asMaster.asCph.pnlMain._1.as.pnlMainBottom.vs.hs.asMap.vsExt.asMapContainer.mapTracking';

  const ajaxEventParams = JSON.stringify({
    controlID,
    eventName: '!!internalrefresh',
  });

  const mapData = JSON.stringify({
    movedMarkers: [],
    width: 1920,
    height: 1080,
    zoom: MAP_ZOOM,
    currentX: centerX,
    currentY: centerY,
    operatingMode: 1,
    DynamicToolTipLoaded: true,
  });

  const eventParams = JSON.stringify([
    {
      ID: controlID,
      data: mapData,
    },
  ]);

  return `__PAGESTATE_KEY=${pageStateKey}&ajaxEventParams=${encodeURIComponent(ajaxEventParams)}&eventParams=${encodeURIComponent(eventParams)}&_=`;
}

/**
 * Auto-relogin when session expires
 * Returns new cookie string or null on failure
 */
async function relogin(): Promise<string | null> {
  const user = process.env.SATISGPS_USER;
  const pass = process.env.SATISGPS_PASS;
  const loginUrl = BASE_URL.replace('/View/Localization.GPSTracking/', '/Account/Login.aspx');

  if (!user || !pass) return null;

  try {
    // GET login page to get tokens
    const getRes = await fetch(loginUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    const html = await getRes.text();
    const sessionCookie = getRes.headers.get('set-cookie')?.match(/ASP\.NET_SessionId=[^;]+/)?.[0] ?? '';

    // Extract ASP.NET tokens
    const viewState = html.match(/<input[^>]+name="__VIEWSTATE"[^>]+value="([^"]*)"/)?.[1] ?? '';
    const eventVal = html.match(/<input[^>]+name="__EVENTVALIDATION"[^>]+value="([^"]*)"/)?.[1] ?? '';

    // POST login
    const loginBody = new URLSearchParams({
      __VIEWSTATE: viewState,
      __EVENTVALIDATION: eventVal,
      'ctl00$cphMain$txtLogin': user,
      'ctl00$cphMain$txtPassword': pass,
      'ctl00$cphMain$btnLogin': 'Zaloguj',
    });

    const postRes = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: sessionCookie,
        'User-Agent': 'Mozilla/5.0',
      },
      body: loginBody.toString(),
      redirect: 'manual',
    });

    if (postRes.status === 302) {
      const newCookie = postRes.headers.get('set-cookie')?.match(/ASP\.NET_SessionId=[^;]+/)?.[0] ?? '';
      if (newCookie) {
        console.log('[SatisGPS] Re-login successful, new session obtained');
        return newCookie;
      }
    }
  } catch (err) {
    console.error('[SatisGPS] Re-login failed:', err);
  }
  return null;
}

/**
 * Extract JSON state from Satis GPS HTML page source.
 * Vehicle markers are embedded directly in the initial GET response HTML.
 */
function extractStateFromHtml(html: string): any | null {
  // The map state JSON is embedded in the HTML as part of a larger JS/state object
  // Look for the JSON blob containing both "Markers" and "CurrentZoom"
  const patterns = [
    /(\{"id":[^{]*"Markers"\s*:\s*\[[\s\S]*?"CurrentZoom"\s*:\s*\d+[\s\S]*?\})\s*(?:,|\}|<)/,
    /(\{[^{]*"Markers"\s*:\s*\[[\s\S]{10,}?"CurrentZoom"[\s\S]*?\})\s*(?:",|<\/)/,
    /"State"\s*:\s*(\{[^{}]*"Markers"\s*:\s*\[[\s\S]*?\})\s*(?:,|\})/,
  ];

  // Primary: brace-counting extraction — finds the JSON object containing Markers
  const markerIdx = html.indexOf('"Markers":[{');
  if (markerIdx > 0) {
    // Walk backward to find the opening { of the containing object
    let start = markerIdx;
    let depth = 0;
    for (let i = markerIdx; i >= 0; i--) {
      if (html[i] === '}') depth++;
      else if (html[i] === '{') {
        if (depth === 0) { start = i; break; }
        depth--;
      }
    }
    // Walk forward to find the matching closing }
    let end = start;
    depth = 0;
    for (let i = start; i < html.length; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    try {
      // JSON.parse handles \uXXXX escapes natively — do NOT pre-unescape
      const parsed = JSON.parse(html.slice(start, end));
      if (parsed?.Markers?.length > 0) return parsed;
    } catch {}
  }

  return null;
}

/**
 * Main polling function — fetches all vehicle positions from Satis GPS
 * Primary method: GET page HTML (vehicle markers are embedded in initial page load)
 * Fallback: POST with various page state keys
 */
export async function pollSatisGPS(retryOnExpiry = true): Promise<PollResult> {
  const cookie = process.env.SATISGPS_COOKIE;

  if (!cookie) {
    return { ok: false, vehicles: [], error: 'SATISGPS_COOKIE env var not set. Skopiuj cookie z DevTools.' };
  }

  const BASE_HEADERS = {
    'cookie': cookie,
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'accept-language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    'referer': BASE_URL,
  };

  try {
    // PRIMARY METHOD: GET the page — vehicle markers are in the initial HTML
    const getRes = await fetch(BASE_URL, {
      headers: { ...BASE_HEADERS, 'accept': 'text/html,application/xhtml+xml' },
    });

    if (getRes.status === 302 || getRes.redirected) {
      if (retryOnExpiry) {
        console.log('[SatisGPS] Session expired, attempting re-login...');
        const newCookie = await relogin();
        if (newCookie) {
          process.env.SATISGPS_COOKIE = newCookie;
          return pollSatisGPS(false);
        }
      }
      return {
        ok: false, vehicles: [], sessionExpired: true, statusCode: 302,
        error: 'Sesja Satis GPS wygasła. Zaktualizuj SATISGPS_COOKIE w Railway.',
      };
    }

    if (getRes.ok) {
      const html = await getRes.text();

      // Try table parser first — has ALL vehicles with speed/RPM/fuel
      const tableVehicles = parseVehicleTable(html);
      if (tableVehicles.length > 0) {
        // Also try to get marker data for enrichment (direction, location)
        const mapState = extractStateFromHtml(html);
        if (mapState) {
          const markerVehicles = parseMapState(mapState);
          // Merge marker data into table data
          const plateMap = new Map(tableVehicles.map(v => [v.plate, v]));
          for (const m of markerVehicles) {
            const existing = plateMap.get(m.plate);
            if (existing) {
              existing.lat = m.lat;
              existing.lng = m.lng;
              existing.satisId = m.satisId;
              if (m.direction) existing.direction = m.direction;
              if (m.location) existing.location = m.location;
              if (m.timestamp) existing.timestamp = m.timestamp;
              if (m.drivingTime) existing.drivingTime = m.drivingTime;
            }
          }
        }
        console.log(`[SatisGPS] ✓ GET HTML table got ${tableVehicles.length} vehicles (all)`);
        return { ok: true, vehicles: tableVehicles, raw: html.slice(0, 500) };
      }

      // Fallback to marker-only parsing
      const mapState = extractStateFromHtml(html);
      if (mapState) {
        const vehicles = parseMapState(mapState);
        if (vehicles.length > 0) {
          console.log(`[SatisGPS] ✓ GET HTML markers got ${vehicles.length} vehicles`);
          return { ok: true, vehicles, raw: mapState };
        }
      }

      if (html.includes('__PAGESTATE_KEY')) {
        console.log('[SatisGPS] GET OK but no active vehicles in HTML (all offline?)');
        return { ok: true, vehicles: [] };
      }
    }

    // FALLBACK: POST with dynamic page state key detection
    const pageStateKey = await detectPageStateKey(cookie);
    const HEADERS = {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'accept': '*/*',
      'origin': 'https://satisgps.com',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'priority': 'u=1, i',
      ...BASE_HEADERS,
    };
    const body = buildRefreshBody(pageStateKey);

    // Second attempt: !!internalrefresh (our original method)
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: HEADERS,
      body,
    });

    // Session expired → redirect to login
    if (res.status === 302 || res.redirected) {
      if (retryOnExpiry) {
        console.log('[SatisGPS] Session expired, attempting re-login...');
        const newCookie = await relogin();
        if (newCookie) {
          // Update in-memory (caller should persist to env/DB)
          process.env.SATISGPS_COOKIE = newCookie;
          return pollSatisGPS(false); // retry once
        }
      }
      return {
        ok: false,
        vehicles: [],
        sessionExpired: true,
        error: 'Sesja Satis GPS wygasła. Zaktualizuj SATISGPS_COOKIE w Railway lub podaj SATISGPS_USER i SATISGPS_PASS do auto-relogowania.',
        statusCode: 302,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        vehicles: [],
        error: `HTTP ${res.status} from Satis GPS`,
        statusCode: res.status,
      };
    }

    const text = await res.text();

    // Try JSON parse directly
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Find JSON in response text (Satis sometimes wraps in other content)
      const patterns = [
        /(\{[\s\S]*?"controls"[\s\S]*?\})\s*$/,
        /(\{[\s\S]*?"Markers"[\s\S]*?\})/,
        /(\{[\s\S]*?"CurrentZoom"[\s\S]*?\})/,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m) {
          try { json = JSON.parse(m[1]); break; } catch {}
        }
      }
    }

    if (!json) {
      return {
        ok: false,
        vehicles: [],
        error: 'Nie można parsować odpowiedzi JSON z Satis GPS',
        raw: text.slice(0, 200),
      };
    }

    // Try full response parser first (table + markers + dashboard)
    const fullVehicles = parseFullResponse(json);
    if (fullVehicles.length > 0) {
      console.log(`[SatisGPS] ✓ POST full parse got ${fullVehicles.length} vehicles`);
      return { ok: true, vehicles: fullVehicles, raw: json };
    }

    const mapState = extractMapState(json);
    if (!mapState) {
      // Response OK but no map state — try other page state keys as fallback
      if (retryOnExpiry) {
        const fallbackKeys = ['S1','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12','S15','S20']
          .filter(k => k !== pageStateKey);
        for (const key of fallbackKeys) {
          const fb = buildRefreshBody(key);
          try {
            const r = await fetch(BASE_URL, { method: 'POST', headers: HEADERS, body: fb });
            if (!r.ok) continue;
            const t = await r.text();
            let j: any = null;
            try { j = JSON.parse(t); } catch {}
            if (j) {
              const s = extractMapState(j);
              if (s) {
                console.log(`[SatisGPS] ✓ Found map state with fallback key ${key}`);
                return { ok: true, vehicles: parseMapState(s), raw: j };
              }
            }
          } catch {}
        }
      }

      return {
        ok: false,
        vehicles: [],
        error: 'Map state not found in Satis GPS response. Spróbuj odświeżyć SATISGPS_COOKIE.',
        raw: typeof json === 'object' ? Object.keys(json) : json,
      };
    }

    const vehicles = parseMapState(mapState);
    return { ok: true, vehicles, raw: mapState };

  } catch (err: any) {
    return {
      ok: false,
      vehicles: [],
      error: `Błąd połączenia: ${err.message}`,
    };
  }
}
