/**
 * Resolves the employees.id for the currently authenticated user.
 *
 * JWT sub → profiles.id → employees.user_id → employees.id
 *
 * Returns null if the user has no associated employee record
 * (e.g. admin-only accounts without a field worker profile).
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function resolveEmployeeId(req: NextRequest): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getAdminClient();
  const { data } = await admin
    .from('employees')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  return data?.id ?? null;
}

/**
 * Asserts that the given employee_id (e.g. from a URL param or request body)
 * belongs to the currently authenticated user.
 *
 * Admins bypass the check (they can act on any employee).
 *
 * Returns { ok: true } or { ok: false, status: 403 }.
 */
export async function assertEmployeeOwnership(
  userId: string,
  role: string,
  targetEmployeeId: string
): Promise<{ ok: boolean; ownEmployeeId?: string }> {
  if (role === 'admin') return { ok: true };

  const admin = getAdminClient();
  const { data } = await admin
    .from('employees')
    .select('id')
    .eq('user_id', userId)
    .eq('id', targetEmployeeId)
    .eq('is_active', true)
    .maybeSingle();

  return { ok: !!data, ownEmployeeId: data?.id };
}
