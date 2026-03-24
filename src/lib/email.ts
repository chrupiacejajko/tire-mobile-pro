import { getAdminClient } from '@/lib/supabase/admin';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

interface OrderService {
  name: string;
  price: number;
  quantity: number;
}

interface OrderForEmail {
  id: string;
  status: string;
  scheduled_date: string | null;
  scheduled_time_start: string | null;
  time_window: string | null;
  services: OrderService[];
  total_price: number | null;
  address: string | null;
}

// ─── Email sender (pluggable) ────────────────────────────────────────────────

async function sendEmail(payload: EmailPayload): Promise<void> {
  console.log(`[EMAIL] To: ${payload.to} | Subject: ${payload.subject}`);

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'RouteTire <noreply@routetire.pl>',
          ...payload,
        }),
      });
    } catch (err) {
      console.error('[EMAIL] Resend send failed:', err);
    }
  }
}

// ─── Tracking link ───────────────────────────────────────────────────────────

function trackingUrl(orderId: string): string {
  const base = process.env.NEXT_PUBLIC_BOOKING_URL || 'https://booking.routetire.pl';
  return `${base}/tracking/${orderId}`;
}

// ─── Time window labels ─────────────────────────────────────────────────────

const WINDOW_LABELS: Record<string, string> = {
  morning: 'Rano (8:00-12:00)',
  afternoon: 'Po poludniu (12:00-16:00)',
  evening: 'Wieczorem (16:00-20:00)',
};

// ─── Email templates ─────────────────────────────────────────────────────────

function bookingConfirmationHtml(order: OrderForEmail): string {
  const idShort = order.id.slice(0, 8).toUpperCase();
  const servicesHtml = order.services
    .map(
      (s) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #f3f4f6">${s.name}${s.quantity > 1 ? ` x${s.quantity}` : ''}</td><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600">${s.price * s.quantity} zl</td></tr>`
    )
    .join('');

  const dateStr = order.scheduled_date || 'Do ustalenia';
  const timeStr = order.time_window
    ? WINDOW_LABELS[order.time_window] || order.time_window
    : order.scheduled_time_start || '';

  return `
<!DOCTYPE html>
<html lang="pl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
      <!-- Header -->
      <div style="background:#f97316;padding:24px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:22px">RouteTire</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:13px">Mobilna Wulkanizacja</p>
      </div>

      <div style="padding:24px">
        <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Potwierdzenie rezerwacji</h2>
        <p style="color:#6b7280;font-size:14px;margin:0 0 20px">Zlecenie <strong>#${idShort}</strong></p>

        <!-- Date -->
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px;margin-bottom:16px">
          <p style="margin:0;font-size:14px;color:#9a3412;font-weight:600">${dateStr}</p>
          ${timeStr ? `<p style="margin:4px 0 0;font-size:13px;color:#c2410c">${timeStr}</p>` : ''}
        </div>

        ${order.address ? `<p style="font-size:13px;color:#6b7280;margin:0 0 16px">Adres: <strong style="color:#374151">${order.address}</strong></p>` : ''}

        <!-- Services -->
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#374151">
          ${servicesHtml}
          ${order.total_price != null ? `<tr><td style="padding:10px 0;font-weight:700;font-size:14px">Lacznie</td><td style="padding:10px 0;text-align:right;font-weight:700;font-size:14px;color:#ea580c">${order.total_price} zl</td></tr>` : ''}
        </table>

        <!-- CTA -->
        <div style="text-align:center;margin:24px 0 8px">
          <a href="${trackingUrl(order.id)}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:12px 32px;border-radius:10px;font-weight:600;font-size:14px">
            Sledz zlecenie
          </a>
        </div>
        <p style="text-align:center;font-size:12px;color:#9ca3af;margin:0">
          Mozesz sledzic status zlecenia w czasie rzeczywistym.
        </p>
      </div>
    </div>

    <p style="text-align:center;font-size:11px;color:#9ca3af;margin:24px 0 0">
      RouteTire &middot; Mobilna Wulkanizacja
    </p>
  </div>
</body>
</html>`;
}

function statusUpdateHtml(order: OrderForEmail, statusLabel: string): string {
  const idShort = order.id.slice(0, 8).toUpperCase();

  return `
<!DOCTYPE html>
<html lang="pl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#f97316;padding:24px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:22px">RouteTire</h1>
      </div>

      <div style="padding:24px;text-align:center">
        <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Aktualizacja zlecenia</h2>
        <p style="color:#6b7280;font-size:14px;margin:0 0 20px">#${idShort}</p>

        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin-bottom:20px">
          <p style="margin:0;font-size:16px;font-weight:600;color:#166534">${statusLabel}</p>
        </div>

        <a href="${trackingUrl(order.id)}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:12px 32px;border-radius:10px;font-weight:600;font-size:14px">
          Sledz zlecenie
        </a>
      </div>
    </div>

    <p style="text-align:center;font-size:11px;color:#9ca3af;margin:24px 0 0">
      RouteTire &middot; Mobilna Wulkanizacja
    </p>
  </div>
</body>
</html>`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  new: 'Zlecenie przyjete',
  assigned: 'Technik przydzielony',
  in_transit: 'Technik w drodze',
  in_progress: 'Technik na miejscu',
  completed: 'Usluga zakonczona',
};

export async function sendBookingConfirmation(
  orderId: string,
  clientEmail: string,
  order: OrderForEmail
): Promise<void> {
  const idShort = orderId.slice(0, 8).toUpperCase();
  await sendEmail({
    to: clientEmail,
    subject: `Potwierdzenie rezerwacji #${idShort}`,
    html: bookingConfirmationHtml(order),
  });
}

export async function sendStatusUpdate(
  orderId: string,
  clientEmail: string,
  order: OrderForEmail,
  status: string
): Promise<void> {
  const idShort = orderId.slice(0, 8).toUpperCase();
  const label = STATUS_LABELS[status] || status;
  await sendEmail({
    to: clientEmail,
    subject: `Aktualizacja zlecenia #${idShort}`,
    html: statusUpdateHtml(order, label),
  });
}

/**
 * Look up the client email for an order and send the booking confirmation.
 * Safe to call even if the client has no email -- silently skips.
 */
export async function sendBookingConfirmationForOrder(
  orderId: string,
  clientId: string,
  order: OrderForEmail
): Promise<void> {
  try {
    const supabase = getAdminClient();
    const { data: client } = await supabase
      .from('clients')
      .select('email')
      .eq('id', clientId)
      .single();

    if (!client?.email) return;

    await sendBookingConfirmation(orderId, client.email, order);
  } catch (err) {
    console.error('[EMAIL] Failed to send booking confirmation:', err);
  }
}
