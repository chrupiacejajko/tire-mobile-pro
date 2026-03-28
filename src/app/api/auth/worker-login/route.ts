import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  createWorkerAccessToken,
  setWorkerAccessTokenCookie,
} from '@/lib/security/worker-token';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawLogin = body.email || body.login;
    const password = body.password;
    const email = typeof rawLogin === 'string' && rawLogin.includes('@')
      ? rawLogin
      : `${rawLogin}@routetire.pl`;

    if (!rawLogin || !password) {
      return NextResponse.json(
        { error: 'email/login and password are required' },
        { status: 400 },
      );
    }

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return NextResponse.json(
        { error: 'Invalid login credentials', code: 'INVALID_CREDENTIALS' },
        { status: 401 },
      );
    }

    const admin = getAdminClient();
    const [{ data: profile }, { data: employee }] = await Promise.all([
      admin.from('profiles').select('role').eq('id', data.user.id).maybeSingle(),
      admin
        .from('employees')
        .select('id, is_active')
        .eq('user_id', data.user.id)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    if (profile?.role !== 'worker' || !employee?.id) {
      return NextResponse.json(
        { error: 'Worker account not found', code: 'WORKER_NOT_FOUND' },
        { status: 403 },
      );
    }

    const token = await createWorkerAccessToken({
      userId: data.user.id,
      employeeId: employee.id,
    });

    const response = NextResponse.json({
      ok: true,
      employee_id: employee.id,
      redirect: '/worker',
    });
    setWorkerAccessTokenCookie(response, token);
    return response;
  } catch (err) {
    console.error('[auth/worker-login]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
