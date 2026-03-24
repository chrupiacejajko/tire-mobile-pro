import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendBookingConfirmationForOrder } from '@/lib/email';

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

// POST /api/orders - Create a new order (booking portal + Smifybot)
// Body:
//   client_name, client_phone (required)
//   address, city
//   scheduled_date, scheduled_time, time_window (morning|afternoon|evening)
//   service_ids?: string[]           — preferred: exact IDs
//   service_names?: string[]         — fallback: name-based match
//   vehicles?: { label: string, service_ids: string[] }[]  — multi-vehicle
//   notes?: string
//   priority?: 'normal'|'urgent'|'high'|'low'
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const {
      client_name, client_phone, client_email, address, city,
      scheduled_date, scheduled_time, time_window,
      service_ids, service_names, vehicles,
      notes, priority,
    } = body;

    // ── Find or create client ───────────────────────────────────────────
    let clientId: string;
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('phone', client_phone)
      .single();

    // Geocode address → lat/lng (fire in background, don't block order creation)
    let clientLat: number | null = null;
    let clientLng: number | null = null;
    if (address) {
      try {
        const hereKey = process.env.HERE_API_KEY;
        if (hereKey) {
          const geoQuery = [address, city, 'Polska'].filter(Boolean).join(', ');
          const geoRes = await fetch(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(geoQuery)}&apiKey=${hereKey}`);
          const geoData = await geoRes.json();
          const pos = geoData.items?.[0]?.position;
          if (pos) { clientLat = pos.lat; clientLng = pos.lng; }
        }
      } catch { /* geocoding is best-effort */ }
    }

    if (existingClient) {
      clientId = existingClient.id;
      // Update name/address/email/coords if changed
      await supabase.from('clients').update({
        name: client_name,
        address: address || undefined,
        city: city || undefined,
        ...(client_email ? { email: client_email } : {}),
        ...(clientLat !== null ? { lat: clientLat, lng: clientLng } : {}),
      }).eq('id', clientId);
    } else {
      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({
          name: client_name || 'Klient online',
          phone: client_phone,
          email: client_email || null,
          address: address || 'Do ustalenia',
          city: city || 'Do ustalenia',
          lat: clientLat,
          lng: clientLng,
          vehicles: [],
        })
        .select('id')
        .single();
      if (clientError) return NextResponse.json({ error: clientError.message }, { status: 400 });
      clientId = newClient.id;
    }

    // ── Resolve services ────────────────────────────────────────────────
    const { data: allServices } = await supabase.from('services').select('*').eq('is_active', true);

    // Build a flat list of service IDs (with repetitions for multi-vehicle)
    let flatServiceIds: string[] = [];

    if (vehicles && Array.isArray(vehicles) && vehicles.length > 0) {
      // Multi-vehicle booking — flatten all serviceIds
      flatServiceIds = (vehicles as { label: string; service_ids: string[] }[]).flatMap(v => v.service_ids || []);
    } else if (service_ids && Array.isArray(service_ids) && service_ids.length > 0) {
      flatServiceIds = service_ids;
    } else if (service_names && Array.isArray(service_names) && service_names.length > 0) {
      const matched = (allServices || []).filter(s =>
        (service_names as string[]).some(n => s.name.toLowerCase().includes(n.toLowerCase()))
      );
      flatServiceIds = matched.map(s => s.id);
    }

    // Count quantities per service
    const qtyMap = new Map<string, number>();
    for (const id of flatServiceIds) qtyMap.set(id, (qtyMap.get(id) || 0) + 1);

    const resolvedServices = (allServices || [])
      .filter(s => qtyMap.has(s.id))
      .map(s => ({
        service_id: s.id,
        name: s.name,
        price: Number(s.price),
        quantity: qtyMap.get(s.id)!,
      }));

    const totalPrice = resolvedServices.reduce((sum, s) => sum + s.price * s.quantity, 0);
    const totalDuration = resolvedServices.reduce((sum, s) => {
      const svc = (allServices || []).find(a => a.id === s.service_id);
      return sum + (svc?.duration_minutes || 60) * s.quantity;
    }, 0) || 60;

    // ── Derive scheduled_time from time_window if needed ────────────────
    const WINDOW_START: Record<string, string> = {
      morning: '08:00', afternoon: '12:00', evening: '16:00',
    };
    const startTime = scheduled_time || (time_window ? WINDOW_START[time_window] : '08:00') || '08:00';
    const [h, m] = startTime.split(':').map(Number);
    const endMinutes = h * 60 + m + totalDuration;
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

    // ── Build notes ─────────────────────────────────────────────────────
    let finalNotes = notes || '';
    if (vehicles && vehicles.length > 1) {
      const vehicleNotes = (vehicles as { label: string; service_ids: string[] }[])
        .map((v, i) => {
          const svcNames = (v.service_ids || [])
            .map(id => (allServices || []).find(s => s.id === id)?.name || id)
            .join(', ');
          return `${v.label || `Pojazd ${i + 1}`}: ${svcNames}`;
        })
        .join('\n');
      finalNotes = [vehicleNotes, finalNotes].filter(Boolean).join('\n---\n');
    }
    if (!finalNotes) finalNotes = 'Rezerwacja online';

    // ── Create order ────────────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase.from('orders').insert({
      client_id: clientId,
      status: 'new',
      priority: priority || 'normal',
      scheduled_date: scheduled_date || new Date().toISOString().split('T')[0],
      scheduled_time_start: startTime,
      scheduled_time_end: endTime,
      address: address || 'Do ustalenia',
      time_window: time_window || null,
      services: resolvedServices,
      total_price: totalPrice,
      notes: finalNotes,
    }).select().single();

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 400 });

    // ── Send booking confirmation email (fire-and-forget) ─────────────
    sendBookingConfirmationForOrder(order.id, clientId, {
      id: order.id,
      status: order.status,
      scheduled_date: order.scheduled_date,
      scheduled_time_start: order.scheduled_time_start,
      time_window: order.time_window,
      services: resolvedServices,
      total_price: totalPrice,
      address: order.address,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      order_id: order.id,
      total_price: totalPrice,
      total_duration_minutes: totalDuration,
      message: `Zlecenie utworzone na ${scheduled_date} (${time_window || startTime}). Kwota: ${totalPrice} zł.`,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
