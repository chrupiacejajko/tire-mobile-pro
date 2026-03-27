/**
 * POST /api/worker/tasks/{id}/start-driving
 * Body: { lat?: number, lng?: number }
 *
 * Transitions order from 'assigned' to 'in_transit'.
 * Calculates ETA via haversine and queues a tracking SMS after 5 minutes.
 *
 * Auth: worker JWT — verifies the order belongs to the calling worker.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth } from '@/lib/api/auth-guard';
import { formatTrackingMessage } from '@/lib/sms';

// ── Haversine distance (km) ────────────────────────────────────────────────

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;

  const auth = await checkAuth(request, ['admin', 'worker']);
  if (!auth.ok) return auth.response;

  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const workerLat: number | undefined = body.lat;
    const workerLng: number | undefined = body.lng;

    // Fetch order with client info
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, employee_id, lat, lng, client_id, clients(phone)')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Ownership check
    if (auth.role === 'worker' && order.employee_id !== auth.employeeId) {
      return NextResponse.json(
        { error: 'Forbidden', code: 'NOT_YOUR_ORDER' },
        { status: 403 },
      );
    }

    // Status check
    if (order.status !== 'assigned') {
      return NextResponse.json(
        {
          error: 'Cannot start driving — order is not in assigned status',
          code: 'INVALID_STATUS',
          current_status: order.status,
        },
        { status: 409 },
      );
    }

    // Calculate ETA
    let etaMinutes: number | null = null;
    if (
      workerLat != null &&
      workerLng != null &&
      order.lat != null &&
      order.lng != null
    ) {
      const distKm = haversineKm(workerLat, workerLng, order.lat, order.lng);
      const AVG_SPEED_KMH = 40;
      etaMinutes = Math.max(1, Math.round((distKm / AVG_SPEED_KMH) * 60));
    }

    const estimatedArrival = etaMinutes
      ? new Date(Date.now() + etaMinutes * 60 * 1000).toISOString()
      : null;

    // Update order status
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      status: 'in_transit',
      transit_started_at: now,
      actual_departure_time: now,
    };
    if (estimatedArrival) {
      updateData.estimated_arrival = estimatedArrival;
      // Recalculate planned_start_time based on departure + travel time
      updateData.planned_start_time = estimatedArrival;
    }

    const { error: updateErr } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Queue tracking SMS (fire-and-forget, best effort)
    const clientPhone =
      (order as Record<string, unknown>).clients &&
      ((order as Record<string, unknown>).clients as Record<string, unknown>)
        ?.phone;

    if (clientPhone && typeof clientPhone === 'string') {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000');

      const message = formatTrackingMessage(orderId, baseUrl);

      fetch(`${baseUrl}/api/sms/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: clientPhone,
          message,
          order_id: orderId,
          delay_minutes: 5,
        }),
      }).catch(() => {}); // fire-and-forget
    }

    return NextResponse.json({
      success: true,
      order_id: orderId,
      status: 'in_transit',
      eta_minutes: etaMinutes,
      estimated_arrival: estimatedArrival,
    });
  } catch (err: unknown) {
    console.error('[start-driving]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
