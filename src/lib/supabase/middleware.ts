import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // In production, redirect unauthenticated users to login
  // In dev, allow access without auth for easier testing
  if (
    !user &&
    process.env.NODE_ENV === 'production' &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/register') &&
    !request.nextUrl.pathname.startsWith('/api/') &&
    !request.nextUrl.pathname.startsWith('/booking') &&
    request.nextUrl.pathname !== '/'
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Fetch role for authenticated users (needed for routing decisions)
  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    role = profile?.role ?? null;
  }

  const isWorker = role === 'worker';
  const isAdminOrDispatcher = role === 'admin' || role === 'dispatcher';
  const { pathname } = request.nextUrl;

  // Redirect authenticated users away from auth pages / root
  if (
    user &&
    (pathname.startsWith('/login') ||
      pathname.startsWith('/register') ||
      pathname === '/')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = isWorker ? '/worker' : '/dashboard';
    return NextResponse.redirect(url);
  }

  // Worker trying to access admin dashboard → redirect to /worker
  if (user && isWorker && pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = '/worker';
    return NextResponse.redirect(url);
  }

  // Admin/dispatcher trying to access /worker → redirect to /dashboard
  if (user && isAdminOrDispatcher && pathname.startsWith('/worker')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
