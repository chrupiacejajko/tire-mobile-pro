/**
 * Satis GPS Web Scraper
 *
 * Satis GPS uses ASP.NET WebForms with custom AJAX.
 * This module logs into maps.satisgps.com and fetches vehicle positions.
 *
 * Flow:
 * 1. GET /Login → get ASP.NET viewstate tokens
 * 2. POST /Login with credentials → receive session cookie
 * 3. GET /Map (or equivalent) → get initial map state with vehicle positions
 * 4. Parse JSON response → extract XOffset/YOffset → convert to lat/lng
 */

export interface SatisCredentials {
  username: string;
  password: string;
  baseUrl?: string;
}

export interface SatisSessionState {
  cookies: string;
  viewState: string;
  viewStateGenerator: string;
  eventValidation: string;
  lastSync: Date | null;
  isLoggedIn: boolean;
}

const DEFAULT_BASE_URL = 'https://maps.satisgps.com';

/**
 * Extract ASP.NET hidden field value from HTML
 */
function extractHiddenField(html: string, fieldName: string): string {
  const match = html.match(
    new RegExp(`<input[^>]+name="${fieldName}"[^>]+value="([^"]*)"`, 'i')
  ) ?? html.match(
    new RegExp(`<input[^>]+value="([^"]*)"[^>]+name="${fieldName}"`, 'i')
  );
  return match?.[1] ?? '';
}

/**
 * Extract cookies from Set-Cookie headers
 */
function parseCookies(headers: Headers, existingCookies = ''): string {
  const setCookie = headers.get('set-cookie') ?? '';
  if (!setCookie) return existingCookies;

  // Merge cookies (simple approach)
  const newCookies = setCookie
    .split(',')
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');

  if (!existingCookies) return newCookies;

  // Update existing cookies with new values
  const existingMap = new Map(
    existingCookies.split('; ').map((c) => {
      const [k, ...v] = c.split('=');
      return [k.trim(), v.join('=')];
    })
  );
  newCookies.split('; ').forEach((c) => {
    const [k, ...v] = c.split('=');
    existingMap.set(k.trim(), v.join('='));
  });

  return [...existingMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * Step 1: GET login page → extract ASP.NET tokens
 */
export async function getLoginPage(baseUrl = DEFAULT_BASE_URL): Promise<{
  html: string;
  cookies: string;
  viewState: string;
  viewStateGenerator: string;
  eventValidation: string;
}> {
  const res = await fetch(`${baseUrl}/Login.aspx`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });

  const html = await res.text();
  const cookies = parseCookies(res.headers);

  return {
    html,
    cookies,
    viewState: extractHiddenField(html, '__VIEWSTATE'),
    viewStateGenerator: extractHiddenField(html, '__VIEWSTATEGENERATOR'),
    eventValidation: extractHiddenField(html, '__EVENTVALIDATION'),
  };
}

/**
 * Step 2: POST login form → receive authenticated session
 */
export async function login(
  credentials: SatisCredentials,
  loginPageData: Awaited<ReturnType<typeof getLoginPage>>
): Promise<SatisSessionState> {
  const baseUrl = credentials.baseUrl ?? DEFAULT_BASE_URL;

  const body = new URLSearchParams({
    __VIEWSTATE: loginPageData.viewState,
    __VIEWSTATEGENERATOR: loginPageData.viewStateGenerator,
    __EVENTVALIDATION: loginPageData.eventValidation,
    // Common ASP.NET login control field names (adjust if needed)
    ctl00$cphMain$txtLogin: credentials.username,
    ctl00$cphMain$txtPassword: credentials.password,
    ctl00$cphMain$btnLogin: 'Zaloguj',
  });

  const res = await fetch(`${baseUrl}/Login.aspx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      Cookie: loginPageData.cookies,
      Referer: `${baseUrl}/Login.aspx`,
    },
    body: body.toString(),
    redirect: 'manual', // don't auto-follow — we need to capture the redirect + new cookies
  });

  const cookies = parseCookies(res.headers, loginPageData.cookies);
  const isLoggedIn = res.status === 302 || cookies.includes('ASP.NET_SessionId');

  // Follow redirect to get map page viewstate
  let mapHtml = '';
  let mapViewState = '';
  if (res.status === 302) {
    const location = res.headers.get('location') ?? '/Default.aspx';
    const mapRes = await fetch(`${baseUrl}${location.startsWith('http') ? '' : ''}${location}`, {
      headers: {
        Cookie: cookies,
        'User-Agent': 'Mozilla/5.0',
      },
    });
    mapHtml = await mapRes.text();
    mapViewState = extractHiddenField(mapHtml, '__VIEWSTATE');
  }

  return {
    cookies,
    viewState: mapViewState || loginPageData.viewState,
    viewStateGenerator: loginPageData.viewStateGenerator,
    eventValidation: extractHiddenField(mapHtml, '__EVENTVALIDATION') || loginPageData.eventValidation,
    lastSync: null,
    isLoggedIn,
  };
}

/**
 * Step 3: Fetch vehicle positions from the map panel
 *
 * Satis GPS sends vehicle data as JSON in ASP.NET ScriptManager callbacks.
 * The exact endpoint/postback parameters need to be determined by inspecting
 * your browser's network tab while using the Satis panel.
 */
export async function fetchVehiclePositions(
  session: SatisSessionState,
  baseUrl = DEFAULT_BASE_URL
): Promise<{ controls: any[] } | null> {
  // This is the __doPostBack or ScriptManager async postback
  // The exact target/argument needs to be reverse-engineered from the network tab
  const body = new URLSearchParams({
    __VIEWSTATE: session.viewState,
    __VIEWSTATEGENERATOR: session.viewStateGenerator,
    __EVENTVALIDATION: session.eventValidation,
    __EVENTTARGET: 'ctl00$cphMain$asMap$mapTracking',
    __EVENTARGUMENT: '{"e":"refresh"}',
    __ASYNCPOST: 'true',
  });

  const res = await fetch(`${baseUrl}/Default.aspx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      'X-Requested-With': 'XMLHttpRequest',
      'X-MicrosoftAjax': 'Delta=true',
      Cookie: session.cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Referer: `${baseUrl}/Default.aspx`,
    },
    body: body.toString(),
  });

  if (!res.ok) return null;

  const text = await res.text();

  // ASP.NET ScriptManager response starts with pipe-delimited sections
  // Try to find and parse JSON in the response
  try {
    // Look for JSON object in response
    const jsonMatch = text.match(/\{[\s\S]*"controls"[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Try parsing directly
    if (text.trim().startsWith('{')) {
      return JSON.parse(text);
    }
  } catch {
    // Not JSON, try ASP.NET UpdatePanel format
  }

  return null;
}

/**
 * Push a captured JSON blob directly (from browser network tab paste)
 * This is the manual integration path
 */
export function parseDirectCapture(json: any): { controls: any[] } {
  if (json?.controls) return json;
  return { controls: [json] };
}
