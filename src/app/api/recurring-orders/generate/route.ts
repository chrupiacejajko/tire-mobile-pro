/**
 * POST /api/recurring-orders/generate
 *
 * Generates concrete orders from active recurring_orders whose next_date <= target date.
 * Can be called manually or via a cron job.
 *
 * Body: { date?: string }  — defaults to today
 *
 * For each matching recurring order:
 *   1. Creates a new order (same pattern as POST /api/orders)
 *   2. Updates last_generated and computes next_date based on frequency
 *   3. Skips Sundays when computing next_date
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

/** Advance a date by the given frequency rule, skipping Sundays. */
function computeNextDate(
  currentDate: Date,
  frequency: string,
  preferredDay: number | null,
): Date {
  let next: Date;

  switch (frequency) {
    case 'weekly': {
      next = new Date(currentDate);
      next.setDate(next.getDate() + 7);
      // If there's a preferred day, find the next occurrence
      if (preferredDay !== null && preferredDay >= 0 && preferredDay <= 6) {
        const diff = (preferredDay - next.getDay() + 7) % 7;
        if (diff !== 0) next.setDate(next.getDate() + diff);
      }
      break;
    }
    case 'biweekly': {
      next = new Date(currentDate);
      next.setDate(next.getDate() + 14);
      if (preferredDay !== null && preferredDay >= 0 && preferredDay <= 6) {
        const diff = (preferredDay - next.getDay() + 7) % 7;
        if (diff !== 0) next.setDate(next.getDate() + diff);
      }
      break;
    }
    case 'monthly': {
      next = new Date(currentDate);
      next.setMonth(next.getMonth() + 1);
      break;
    }
    case 'quarterly': {
      next = new Date(currentDate);
      next.setMonth(next.getMonth() + 3);
      break;
    }
    default: {
      next = new Date(currentDate);
      next.setDate(next.getDate() + 7);
    }
  }

  // Skip Sundays — move to Monday
  if (next.getDay() === 0) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json().catch(() => ({}));
    const targetDate = (body as any)?.date || new Date().toISOString().split('T')[0];

    // Fetch active recurring orders whose next_date is due
    const { data: recurringOrders, error: fetchError } = await supabase
      .from('recurring_orders')
      .select('*, client:clients(name, phone, address, city)')
      .eq('is_active', true)
      .lte('next_date', targetDate);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!recurringOrders || recurringOrders.length === 0) {
      return NextResponse.json({ generated: 0, orders: [] });
    }

    // Fetch all active services for resolving service_ids
    const { data: allServices } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true);

    const generatedOrders: { id: string; client_name: string; date: string }[] = [];

    for (const rec of recurringOrders) {
      const client = (rec as any).client;
      if (!client) continue;

      // Resolve services from service_ids
      const serviceIds: string[] = rec.service_ids || [];
      const resolvedServices = (allServices || [])
        .filter((s) => serviceIds.includes(s.id))
        .map((s) => ({
          service_id: s.id,
          name: s.name,
          price: Number(s.price),
          quantity: 1,
        }));

      const totalPrice = resolvedServices.reduce((sum, s) => sum + s.price * s.quantity, 0);
      const totalDuration = resolvedServices.reduce((sum, s) => {
        const svc = (allServices || []).find((a) => a.id === s.service_id);
        return sum + (svc?.duration_minutes || 60) * s.quantity;
      }, 0) || 60;

      // Derive start time from preferred time window
      const WINDOW_START: Record<string, string> = {
        morning: '08:00',
        afternoon: '12:00',
        evening: '16:00',
      };
      const startTime = rec.preferred_time_window
        ? WINDOW_START[rec.preferred_time_window] || '08:00'
        : '08:00';
      const [h, m] = startTime.split(':').map(Number);
      const endMinutes = h * 60 + m + totalDuration;
      const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

      // Create the order
      const scheduledDate = rec.next_date || targetDate;
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          client_id: rec.client_id,
          status: 'new',
          priority: 'normal',
          scheduled_date: scheduledDate,
          scheduled_time_start: startTime,
          scheduled_time_end: endTime,
          address: rec.address || client.address || 'Do ustalenia',
          time_window: rec.preferred_time_window || null,
          services: resolvedServices,
          total_price: totalPrice,
          notes: rec.notes || 'Zlecenie cykliczne',
          employee_id: rec.preferred_employee_id || null,
        })
        .select('id')
        .single();

      if (orderError) {
        console.error('[recurring-orders/generate] Order creation failed:', orderError);
        continue;
      }

      // Update last_generated and compute next_date
      const currentNextDate = new Date(rec.next_date || targetDate);
      const newNextDate = computeNextDate(
        currentNextDate,
        rec.frequency,
        rec.preferred_day ?? null,
      );

      await supabase
        .from('recurring_orders')
        .update({
          last_generated: targetDate,
          next_date: formatDate(newNextDate),
        })
        .eq('id', rec.id);

      generatedOrders.push({
        id: order.id,
        client_name: client.name ?? 'Klient',
        date: scheduledDate,
      });
    }

    return NextResponse.json({
      generated: generatedOrders.length,
      orders: generatedOrders,
    });
  } catch (err) {
    console.error('[recurring-orders/generate]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
