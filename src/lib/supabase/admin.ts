import { createClient } from '@supabase/supabase-js';

// Lazy initialization - only creates client when called (not at module load time)
// This prevents build errors when env vars aren't available during SSG
export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
