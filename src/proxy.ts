import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPublicApiPath, isWebhookBypassPath, isWorkerApiPath } from '@/lib/api/access-policy';
import {
  getWorkerAccessTokenFromRequest,
  verifyWorkerAccessToken,
} from '@/lib/security/worker-token';

// ── Webhook / integration paths that bypass JWT (signature-based auth instead) ──
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/booking',
  '/tracking',   // intentionally public (client order tracking)
  '/invite',     // invite activation — public by design, token-gated server-side
];

type SessionContext = {
  response: NextResponse;
  userId: string | null;
  role: string | null;
};

async function getSessionContext(request: NextRequest): Promise<SessionContext> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { response, userId: null, role: null };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  return { response, userId: user.id, role: profile?.role ?? null };
}

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  // booking.routetire.pl → rewrite to /booking
  if (
    hostname.startsWith('booking.') &&
    !pathname.startsWith('/booking') &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/tracking')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/booking';
    return NextResponse.rewrite(url);
  }

  // Redirect / to /dashboard
  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // /mobile → permanent redirect to /worker (legacy path)
  if (pathname === '/mobile' || pathname.startsWith('/mobile/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/mobile/, '/worker') || '/worker';
    return NextResponse.redirect(url, { status: 301 });
  }

  // Booking subdomain — skip all auth
  if (hostname.startsWith('booking.')) {
    return NextResponse.next();
  }

  // Webhook allowlist — no JWT, handled by withWebhookSecret in route handlers
  if (isWebhookBypassPath(pathname)) {
    return NextResponse.next();
  }

  // Public pages — no session needed
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Static assets — skip auth
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    if (isPublicApiPath(pathname, request.method)) {
      return NextResponse.next();
    }

    if (isWorkerApiPath(pathname)) {
      const workerToken = getWorkerAccessTokenFromRequest(request);
      if (workerToken) {
        const payload = await verifyWorkerAccessToken(workerToken);
        if (payload) return NextResponse.next();
      }

      try {
        const session = await getSessionContext(request);
        if (session.userId && session.role && ['admin', 'dispatcher', 'worker'].includes(session.role)) {
          return session.response;
        }
      } catch {
        // fall through to 401
      }

      return NextResponse.json(
        { error: 'Unauthorized', code: 'WORKER_AUTH_REQUIRED' },
        { status: 401 },
      );
    }

    try {
      const session = await getSessionContext(request);
      if (!session.userId) {
        return NextResponse.json(
          { error: 'Unauthorized', code: 'NO_SESSION' },
          { status: 401 },
        );
      }

      if (!session.role || !['admin', 'dispatcher'].includes(session.role)) {
        return NextResponse.json(
          { error: 'Forbidden', code: 'INSUFFICIENT_ROLE', required: ['admin', 'dispatcher'], got: session.role },
          { status: 403 },
        );
      }

      return session.response;
    } catch {
      return NextResponse.json(
        { error: 'Internal server error', code: 'API_PROXY_AUTH_FAILED' },
        { status: 500 },
      );
    }
  }

  // /worker/* — requires authenticated session (role check done client-side + per API call)
  // /dashboard/* — requires authenticated session
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && supabaseUrl !== 'your-supabase-url') {
    try {
      const { updateSession } = await import('@/lib/supabase/middleware');
      return await updateSession(request);
    } catch {
      // Auth failure → redirect to login
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
