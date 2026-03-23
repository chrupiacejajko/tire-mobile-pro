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

import { extractMapState, parseMapState, SatisVehicle } from './converter';

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
 * Main polling function — fetches all vehicle positions from Satis GPS
 */
export async function pollSatisGPS(retryOnExpiry = true): Promise<PollResult> {
  const cookie = process.env.SATISGPS_COOKIE;

  if (!cookie) {
    return { ok: false, vehicles: [], error: 'SATISGPS_COOKIE env var not set. Skopiuj cookie z DevTools.' };
  }

  const body = buildRefreshBody('S2');

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'cookie': cookie,
        'accept': '*/*',
        'accept-language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
        'origin': 'https://satisgps.com',
        'referer': BASE_URL,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'priority': 'u=1, i',
      },
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

    const mapState = extractMapState(json);
    if (!mapState) {
      // Response OK but no map state — might be a different page state key
      // Try with S7
      if (retryOnExpiry) {
        const body7 = buildRefreshBody('S7');
        const res7 = await fetch(BASE_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'cookie': cookie,
            'accept': '*/*',
            'origin': 'https://satisgps.com',
            'referer': BASE_URL,
            'user-agent': 'Mozilla/5.0',
          },
          body: body7,
        });
        const text7 = await res7.text();
        let json7: any = null;
        try { json7 = JSON.parse(text7); } catch {}
        if (json7) {
          const state7 = extractMapState(json7);
          if (state7) {
            return { ok: true, vehicles: parseMapState(state7), raw: json7 };
          }
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
