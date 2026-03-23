import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET /api/orders - List orders with optional filters
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const date = searchParams.get('date');
  const client_id = searchParams.get('client_id');
  const limit = Number(searchParams.get('limit')) || 50;

  let query = supabase
    .from('orders')
    .select('*, client:clients(name, phone, address, city), employee:employees(user:profiles(full_name))')
    .order('scheduled_date', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (date) query = query.eq('scheduled_date', date);
  if (client_id) query = query.eq('client_id', client_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ orders: data });
}

// POST /api/orders - Create a new order (for Smifybot)
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { client_name, client_phone, address, city, scheduled_date, scheduled_time, service_names, notes } = body;

    // Find or create client
    let clientId: string;
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('phone', client_phone)
      .single();

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({
          name: client_name || 'Klient telefoniczny',
          phone: client_phone,
          address: address || 'Do ustalenia',
          city: city || 'Do ustalenia',
        })
        .select('id')
        .single();
      if (clientError) return NextResponse.json({ error: clientError.message }, { status: 400 });
      clientId = newClient.id;
    }

    // Find services by name
    const { data: allServices } = await supabase.from('services').select('*').eq('is_active', true);
    const matchedServices = (allServices || []).filter(s =>
      (service_names || []).some((name: string) => s.name.toLowerCase().includes(name.toLowerCase()))
    );

    const totalPrice = matchedServices.reduce((sum, s) => sum + Number(s.price), 0);
    const totalDuration = matchedServices.reduce((sum, s) => sum + s.duration_minutes, 0);

    const [h, m] = (scheduled_time || '08:00').split(':').map(Number);
    const endMinutes = h * 60 + m + (totalDuration || 60);
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

    const { data: order, error: orderError } = await supabase.from('orders').insert({
      client_id: clientId,
      status: 'new',
      priority: 'normal',
      scheduled_date: scheduled_date || new Date().toISOString().split('T')[0],
      scheduled_time_start: scheduled_time || '08:00',
      scheduled_time_end: endTime,
      address: address || 'Do ustalenia',
      services: matchedServices.map(s => ({ service_id: s.id, name: s.name, price: Number(s.price), quantity: 1 })),
      total_price: totalPrice,
      notes: notes || 'Rezerwacja przez Smifybot',
    }).select().single();

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 400 });

    return NextResponse.json({
      success: true,
      order_id: order.id,
      message: `Zlecenie utworzone na ${scheduled_date} o ${scheduled_time}. Łączna kwota: ${totalPrice} zł.`,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
