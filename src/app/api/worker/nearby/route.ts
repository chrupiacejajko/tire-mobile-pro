/**
 * GET /api/worker/nearby?lat=X&lng=Y&date=YYYY-MM-DD&radius=15
 *
 * Returns unassigned orders near the worker's current position.
 * Only includes orders with status 'new' and no employee assigned.
 * Results sorted by haversine distance ascending.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm } from '@/lib/geo';

interface NearbyOrder {
  id: string;
  client_name: string;
  address: string;
  distance_km: number;
  services: string[];
  time_window: string | null;
  priority: string;
  total_price: number;
}

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);

  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const radius = parseFloat(searchParams.get('radius') || '15');

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json(
      { error: 'lat and lng query parameters are required' },
      { status: 400 },
    );
  }

  try {
    // Fetch all unassigned new orders for the given date
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, priority, time_window, services, total_price, client:clients(name, address, city, lat, lng)')
      .eq('scheduled_date', date)
      .eq('status', 'new')
      .is('employee_id', null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Compute distance and filter by radius
    const nearby: NearbyOrder[] = (orders || [])
      .map((o) => {
        const c = (o as any).client;
        if (!c?.lat || !c?.lng) return null;

        const dist = haversineKm(lat, lng, c.lat, c.lng);
        if (dist > radius) return null;

        const serviceNames = ((o as any).services || []).map((s: any) =>
          typeof s === 'string' ? s : s?.name ?? '',
        );

        return {
          id: o.id,
          client_name: c.name ?? 'Klient',
          address: [c.address, c.city].filter(Boolean).join(', '),
          distance_km: Math.round(dist * 10) / 10,
          services: serviceNames,
          time_window: (o as any).time_window ?? null,
          priority: (o as any).priority ?? 'normal',
          total_price: (o as any).total_price ?? 0,
        };
      })
      .filter(Boolean) as NearbyOrder[];

    // Sort by distance ascending
    nearby.sort((a, b) => a.distance_km - b.distance_km);

    return NextResponse.json({ nearby });
  } catch (err) {
    console.error('[worker/nearby]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
