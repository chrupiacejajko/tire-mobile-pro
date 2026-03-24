import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth } from '@/lib/api/auth-guard';

/**
 * GET /api/dispatcher/orders?date=2026-03-24
 *
 * Returns ALL orders for a given date (including unassigned ones)
 * as lightweight map pins.
 *
 * Used by dispatcher map to render order markers.
 */

interface MapOrder {
  id: string;
  status: string;
  priority: string;
  scheduled_date: string;
  scheduled_time_start: string | null;
  time_window: string | null;
  services: { name: string; price: number }[];
  employee_id: string | null;
  employee_name: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  total_price: number;
  notes: string | null;
}

export async function GET(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const { data: rawOrders } = await supabase
    .from('orders')
    .select(`
      id, status, priority, scheduled_date, scheduled_time_start, time_window,
      services, notes, employee_id, address, total_price,
      client:clients(name, phone, lat, lng, address, city),
      employee:employees(user:profiles(full_name))
    `)
    .eq('scheduled_date', date)
    .order('scheduled_time_start', { ascending: true, nullsFirst: false });

  const orders: MapOrder[] = (rawOrders || []).map((o: any) => ({
    id: o.id,
    status: o.status,
    priority: o.priority,
    scheduled_date: o.scheduled_date,
    scheduled_time_start: o.scheduled_time_start ?? null,
    time_window: o.time_window ?? null,
    services: o.services ?? [],
    employee_id: o.employee_id ?? null,
    employee_name: o.employee?.user?.full_name ?? null,
    client_name: o.client?.name ?? null,
    client_phone: o.client?.phone ?? null,
    client_address: o.client?.address ?? null,
    city: o.client?.city ?? null,
    lat: o.client?.lat ?? null,
    lng: o.client?.lng ?? null,
    total_price: o.total_price ?? 0,
    notes: o.notes ?? null,
  }));

  return NextResponse.json({ orders, date });
}
