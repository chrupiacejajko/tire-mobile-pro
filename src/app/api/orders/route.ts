import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendBookingConfirmationForOrder } from '@/lib/email';
import { fireNotification, buildNotificationContext } from '@/lib/notification-dispatcher';
import { autoAssignWorker } from '@/lib/auto-assign';
import { notifyWorker } from '@/lib/notifications';
import { pointInPolygon } from '@/lib/geo';
import { checkAuth } from '@/lib/api/auth-guard';

// GET /api/orders - List orders with optional filters
export async function GET(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;

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
      notes, priority, required_skills,
      scheduling_type, time_window_start, time_window_end,
      flexibility_minutes, source, auto_assign,
      vehicle_info,
    } = body;

    // ── Duplicate guard: same phone + date + services within 5 min ─────
    if (client_phone && scheduled_date) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('id, total_price, services, client:clients!inner(phone)')
        .eq('client.phone', client_phone)
        .eq('scheduled_date', scheduled_date)
        .gte('created_at', fiveMinAgo)
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentOrders && recentOrders.length > 0) {
        // Check if any recent order has the same set of services
        const incomingServiceKey = [...(service_ids || []), ...(vehicles || []).flatMap((v: any) => v.service_ids || [])].sort().join(',');
        const duplicate = recentOrders.find((o: any) => {
          const existingKey = (o.services || []).map((s: any) => s.service_id).sort().join(',');
          return existingKey === incomingServiceKey;
        });
        if (duplicate) {
          return NextResponse.json({
            success: true,
            order_id: duplicate.id,
            total_price: duplicate.total_price,
            message: 'Zlecenie już istnieje (duplikat).',
            duplicate: true,
          }, { status: 200 });
        }
      }
    }

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
        const hereKey = process.env.HERE_API_KEY || '8AMu0VNMjm8W2p8d8DdULqL5sYywQPbw3aARKJLRY80';
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

    // ── Resolve scheduling_type & priority overrides ─────────────────────
    const today = new Date().toISOString().split('T')[0];
    let finalSchedulingType = scheduling_type || (time_window ? 'time_window' : (scheduled_time ? 'fixed_time' : 'time_window'));
    let finalPriority = priority || 'normal';
    let finalDate = scheduled_date || today;
    let finalTimeWindowStart = time_window_start || null;
    let finalTimeWindowEnd = time_window_end || null;
    let finalFlexibility = flexibility_minutes || 0;
    const finalSource = source || 'dispatcher';

    if (finalSchedulingType === 'asap') {
      finalDate = today;
      finalPriority = 'urgent';
    }

    // ── Create order ────────────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase.from('orders').insert({
      client_id: clientId,
      status: 'new',
      priority: finalPriority,
      scheduled_date: finalDate,
      scheduled_time_start: startTime,
      scheduled_time_end: endTime,
      address: address || 'Do ustalenia',
      time_window: time_window || null,
      services: resolvedServices,
      total_price: totalPrice,
      notes: finalNotes,
      scheduling_type: finalSchedulingType,
      time_window_start: finalTimeWindowStart,
      time_window_end: finalTimeWindowEnd,
      flexibility_minutes: finalFlexibility,
      source: finalSource,
      auto_assigned: auto_assign || false,
      required_skills: required_skills && required_skills.length > 0 ? required_skills : null,
    }).select().single();

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 400 });

    // ── Auto-assign region based on geocoded location ─────────────────
    if (clientLat !== null && clientLng !== null && order?.id) {
      try {
        const { data: regionsData } = await supabase
          .from('regions')
          .select('id, polygon')
          .not('polygon', 'is', null);

        if (regionsData) {
          for (const region of regionsData) {
            const poly = region.polygon as [number, number][] | null;
            if (poly && poly.length >= 3 && pointInPolygon(clientLat, clientLng, poly)) {
              await supabase.from('orders').update({ region_id: region.id }).eq('id', order.id);
              break;
            }
          }
        }
      } catch { /* region assignment is best-effort */ }
    }

    // ── Auto-assign logic ──────────────────────────────────────────────
    const shouldAutoAssign =
      auto_assign === true ||
      finalSchedulingType === 'asap' ||
      finalPriority === 'urgent';

    let assignedEmployee: string | null = null;
    let assignedPlate: string | null = null;
    let estimatedTravelMinutes: number | null = null;
    let suggestions: any[] = [];

    if (clientLat && clientLng && order?.id) {
      try {
        suggestions = await autoAssignWorker({
          order_lat: clientLat,
          order_lng: clientLng,
          scheduled_date: finalDate,
          scheduling_type: finalSchedulingType as 'asap' | 'fixed_time' | 'time_window' | 'flexible',
          time_window_start: finalTimeWindowStart,
          time_window_end: finalTimeWindowEnd,
          scheduled_time: finalSchedulingType === 'fixed_time' ? scheduled_time : null,
          priority: finalPriority,
          service_duration_minutes: totalDuration,
          exclude_order_id: order.id,
          required_skills: required_skills || [],
        });

        if (shouldAutoAssign && suggestions.length > 0) {
          const best = suggestions[0];
          await supabase.from('orders').update({
            employee_id: best.employee_id,
            status: 'assigned',
            auto_assigned: true,
            estimated_travel_minutes: best.travel_minutes,
          }).eq('id', order.id);
          assignedEmployee = best.employee_name;
          assignedPlate = best.plate_number;
          estimatedTravelMinutes = best.travel_minutes;

          // Notify the assigned worker
          const serviceNames = resolvedServices.map(s => s.name).join(', ');
          const shortId = order.id.slice(0, 8).toUpperCase();
          notifyWorker({
            employee_id: best.employee_id,
            order_id: order.id,
            type: 'order_assigned',
            title: `Nowe zlecenie #${shortId}`,
            body: [
              `${client_name || 'Klient'}, ${address || 'adres do ustalenia'}`,
              serviceNames,
              `Termin: ${finalDate} ${time_window || startTime}`,
              `Szacowany dojazd: ~${best.travel_minutes} min`,
              client_phone ? `Telefon: ${client_phone}` : '',
            ].filter(Boolean).join('\n'),
          }).catch(() => {}); // fire-and-forget
        }
      } catch { /* auto-assign is best-effort */ }
    }

    // ── Send booking confirmation email (fire-and-forget) ─────────────
    sendBookingConfirmationForOrder(order.id, clientId, {
      id: order.id,
      status: assignedEmployee ? 'assigned' : order.status,
      scheduled_date: order.scheduled_date,
      scheduled_time_start: order.scheduled_time_start,
      time_window: order.time_window,
      services: resolvedServices,
      total_price: totalPrice,
      address: order.address,
    }).catch(() => {});

    // ── Fire configurable notification templates (fire-and-forget) ────
    buildNotificationContext(order.id).then(ctx => fireNotification('booking_created', ctx)).catch(() => {});

    return NextResponse.json({
      success: true,
      order_id: order.id,
      total_price: totalPrice,
      total_duration_minutes: totalDuration,
      assigned_employee: assignedEmployee,
      assigned_plate: assignedPlate,
      estimated_travel_minutes: estimatedTravelMinutes,
      auto_assigned: shouldAutoAssign && !!assignedEmployee,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      message: `Zlecenie utworzone na ${finalDate} (${time_window || startTime}). Kwota: ${totalPrice} zł.`,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/orders - Minimal admin update surface for P0 operational fields
export async function PUT(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;

  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const orderId = body.id || body.order_id;

    if (!orderId) {
      return NextResponse.json({ error: 'id/order_id is required' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (body.is_locked !== undefined) update.is_locked = !!body.is_locked;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No supported fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('orders')
      .update(update)
      .eq('id', orderId)
      .select('id, is_locked')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, order: data });
  } catch (err) {
    console.error('[orders PUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
