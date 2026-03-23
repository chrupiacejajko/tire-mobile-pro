import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * GET  /api/deposits?client_id=&status=stored&search=
 * POST /api/deposits  — create new deposit
 */

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const status = searchParams.get('status') || 'stored';
  const search = searchParams.get('search') || '';
  const all = searchParams.get('all') === '1';

  let query = supabase
    .from('tire_deposits')
    .select(`
      *,
      client:clients(id, name, phone, address, city)
    `)
    .order('created_at', { ascending: false });

  if (!all) query = query.eq('status', status);
  if (clientId) query = query.eq('client_id', clientId);
  if (search) {
    query = query.or(`vehicle_info.ilike.%${search}%,license_plate.ilike.%${search}%,tire_brand.ilike.%${search}%,tire_size.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Count by status
  const { data: counts } = await supabase
    .from('tire_deposits')
    .select('status')
    .then(r => r);

  const statusCounts = { stored: 0, picked_up: 0, disposed: 0 };
  for (const d of (counts || [])) {
    if (d.status in statusCounts) statusCounts[d.status as keyof typeof statusCounts]++;
  }

  return NextResponse.json({ deposits: data, counts: statusCounts });
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const {
      client_id, order_id, vehicle_info, license_plate,
      tire_brand, tire_size, tire_type, quantity, condition,
      storage_location, season, received_date, expected_pickup,
      notes, storage_price,
    } = body;

    if (!client_id) return NextResponse.json({ error: 'client_id is required' }, { status: 400 });

    const { data, error } = await supabase
      .from('tire_deposits')
      .insert({
        client_id,
        order_id: order_id || null,
        vehicle_info: vehicle_info || null,
        license_plate: license_plate || null,
        tire_brand: tire_brand || null,
        tire_size: tire_size || null,
        tire_type: tire_type || 'letnie',
        quantity: quantity || 4,
        condition: condition || 'dobre',
        storage_location: storage_location || null,
        season: season || null,
        received_date: received_date || new Date().toISOString().split('T')[0],
        expected_pickup: expected_pickup || null,
        notes: notes || null,
        storage_price: storage_price || null,
        status: 'stored',
      })
      .select('*, client:clients(name, phone)')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ deposit: data });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
