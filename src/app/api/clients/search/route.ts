import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET /api/clients/search?phone=123 or ?q=searchterm
// Search clients by phone (partial match) or name
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');
  const q = searchParams.get('q');

  if (!phone && !q) {
    return NextResponse.json({ clients: [] });
  }

  let query = supabase
    .from('clients')
    .select('id, name, phone, email, address, city, lat, lng')
    .limit(10);

  if (phone) {
    // Partial phone match using ilike
    query = query.ilike('phone', `%${phone}%`);
  } else if (q) {
    // Search by name or phone
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ clients: data ?? [] });
}
