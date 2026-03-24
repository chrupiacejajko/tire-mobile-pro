import { NextResponse, type NextRequest } from 'next/server';

// ── Webhook / integration paths that bypass JWT (signature-based auth instead) ──
const WEBHOOK_ALLOWLIST = [
  '/api/satisgps/',
  '/api/integrations/',
];

// ── Fully public paths — no session needed ──
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/booking',
  '/tracking',   // intentionally public (client order tracking)
  '/invite',     // invite activation — public by design, token-gated server-side
];

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
  if (WEBHOOK_ALLOWLIST.some(p => pathname.startsWith(p))) {
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

  // All API routes — JWT validation happens inside route handlers via checkAuth()
  // Proxy only refreshes the session cookie here (no role check at this layer)
  if (pathname.startsWith('/api/')) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl && supabaseUrl !== 'your-supabase-url') {
      try {
        const { updateSession } = await import('@/lib/supabase/middleware');
        return await updateSession(request);
      } catch {
        return NextResponse.next();
      }
    }
    return NextResponse.next();
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
