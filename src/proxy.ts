import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  // booking.routetire.pl → rewrite to /booking
  if (hostname.startsWith('booking.') && !pathname.startsWith('/booking') && !pathname.startsWith('/api')) {
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

  // Skip auth for public subdomains, API routes, and public pages
  if (
    hostname.startsWith('booking.') ||
    request.nextUrl.pathname.startsWith('/api/') ||
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/register') ||
    request.nextUrl.pathname.startsWith('/booking') ||
    request.nextUrl.pathname.startsWith('/mobile')
  ) {
    return NextResponse.next();
  }

  // Try Supabase auth if configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && supabaseUrl !== 'your-supabase-url') {
    try {
      const { updateSession } = await import('@/lib/supabase/middleware');
      return await updateSession(request);
    } catch {
      // If auth fails, allow access (dev mode fallback)
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
