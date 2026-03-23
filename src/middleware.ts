import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Redirect / to /dashboard
  if (request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Skip auth for API routes and public pages
  if (
    request.nextUrl.pathname.startsWith('/api/') ||
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/register') ||
    request.nextUrl.pathname.startsWith('/booking')
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
