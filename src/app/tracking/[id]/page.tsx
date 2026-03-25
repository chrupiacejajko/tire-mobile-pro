import { getAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { TrackingRefresher } from './tracking-refresher';
import { SelfCareActions } from './self-care-actions';
import { TrackingMap } from './tracking-map';

const STATUS_STEPS = [
  { key: 'new', label: 'Nowe' },
  { key: 'assigned', label: 'Przypisane' },
  { key: 'in_transit', label: 'W drodze' },
  { key: 'in_progress', label: 'W trakcie' },
  { key: 'completed', label: 'Zakończone' },
] as const;

type OrderStatus = (typeof STATUS_STEPS)[number]['key'] | 'cancelled';

function getStepIndex(status: string): number {
  const idx = STATUS_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

function getStatusMessage(
  status: string,
  employeeName: string | null,
  scheduledDate: string | null,
  timeWindow: string | null
): string {
  const windowLabels: Record<string, string> = {
    morning: 'rano (8:00-12:00)',
    afternoon: 'po południu (12:00-16:00)',
    evening: 'wieczorem (16:00-20:00)',
  };
  const tw = timeWindow ? windowLabels[timeWindow] || timeWindow : '';

  switch (status) {
    case 'new':
      return 'Zlecenie przyjęte. Wkrótce przydzielimy technika.';
    case 'assigned':
      return `Technik przydzielony. ${employeeName || 'Technik'} odwiedzi Cię ${scheduledDate || ''}${tw ? ` (${tw})` : ''}.`;
    case 'in_transit':
      return `${employeeName || 'Technik'} jest w drodze do Ciebie.`;
    case 'in_progress':
      return 'Technik jest na miejscu i wykonuje usługę.';
    case 'completed':
      return 'Usługa zakończona. Dziękujemy!';
    case 'cancelled':
      return 'Wizyta została anulowana.';
    default:
      return 'Status zlecenia nieznany.';
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('pl-PL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = getAdminClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      `
      id, status, priority, scheduled_date, scheduled_time_start, time_window,
      services, total_price, notes, address,
      client:clients(name, phone, address, city, lat, lng),
      employee:employees(id, user:profiles(full_name, phone))
    `
    )
    .eq('id', id)
    .single();

  if (error || !order) {
    notFound();
  }

  const status = (order.status as OrderStatus) || 'new';
  const currentStep = getStepIndex(status);
  const client = order.client as unknown as { name: string; phone: string; address: string; city: string; lat: number | null; lng: number | null } | null;
  const employee = order.employee as unknown as { id: string; user: { full_name: string; phone: string | null } | null } | null;
  const employeeName = employee?.user?.full_name || null;
  const employeePhone = employee?.user?.phone || null;
  const services = (order.services as { name: string; price: number; quantity: number }[]) || [];

  const timeWindowLabels: Record<string, string> = {
    morning: 'Rano (8:00-12:00)',
    afternoon: 'Po południu (12:00-16:00)',
    evening: 'Wieczorem (16:00-20:00)',
  };

  // ── For in_transit / in_progress: show the premium map view ──────────
  const showMapView = status === 'in_transit' || status === 'in_progress';

  if (showMapView) {
    // Fetch initial tracking data for SSR hydration
    let initialTrackingData = null;
    try {
      let driverLat: number | null = null;
      let driverLng: number | null = null;
      let driverSpeed: number | null = null;
      let vehicleInfo: { brand: string; model: string; plate: string } | null = null;

      if (employee?.id) {
        const { data: loc } = await supabase
          .from('employee_locations')
          .select('lat, lng, speed, timestamp')
          .eq('employee_id', employee.id)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (loc) {
          driverLat = loc.lat;
          driverLng = loc.lng;
          driverSpeed = loc.speed;
        }

        const { data: assignment } = await supabase
          .from('vehicle_assignments')
          .select('vehicle:vehicles(brand, model, plate_number)')
          .eq('employee_id', employee.id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (assignment) {
          const v = (assignment as any).vehicle;
          if (v) vehicleInfo = { brand: v.brand, model: v.model, plate: v.plate_number };
        }
      }

      let etaMinutes: number | null = null;
      const destLat = client?.lat ?? null;
      const destLng = client?.lng ?? null;
      if (driverLat != null && driverLng != null && destLat != null && destLng != null) {
        const R = 6371;
        const dLat = ((destLat - driverLat) * Math.PI) / 180;
        const dLng = ((destLng - driverLng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((driverLat * Math.PI) / 180) * Math.cos((destLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const avgSpeed = driverSpeed && driverSpeed > 5 ? driverSpeed : 40;
        etaMinutes = Math.max(1, Math.round((dist / avgSpeed) * 60));
      }

      initialTrackingData = {
        order: {
          id: order.id,
          status: order.status,
          address: order.address,
          lat: destLat,
          lng: destLng,
          scheduled_date: order.scheduled_date,
          time_window: order.time_window,
        },
        driver: employee
          ? {
              name: employeeName,
              lat: driverLat,
              lng: driverLng,
              vehicle: vehicleInfo,
            }
          : null,
        eta_minutes: etaMinutes,
      };
    } catch {
      // If tracking data fails, still show the map with whatever we have
    }

    return <TrackingMap orderId={order.id} initialData={initialTrackingData} />;
  }

  // ── For other statuses: show the card-based view ─────────────────────
  return (
    <div className="min-h-screen bg-white">
      <TrackingRefresher />

      {/* Header */}
      <header className="border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <img
            src="/logo-full.png"
            alt="RouteTire"
            className="h-10 w-10 object-contain rounded-xl"
          />
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">
              Route<span className="text-orange-500">Tire</span>
            </h1>
            <p className="text-xs text-gray-400">Mobilna Wulkanizacja</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Order number */}
        <div className="text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            Zlecenie
          </p>
          <p className="text-sm font-mono text-gray-500">
            #{order.id.slice(0, 8).toUpperCase()}
          </p>
        </div>

        {/* Cancelled badge */}
        {status === 'cancelled' ? (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-red-100 px-4 py-1.5 mb-3">
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-sm font-bold text-red-600 uppercase tracking-wider">Anulowane</span>
            </div>
            <p className="text-lg font-semibold text-red-800 leading-relaxed">
              {getStatusMessage(status, employeeName, null, null)}
            </p>
          </div>
        ) : (
          <>
            {/* Status stepper */}
            <div className="relative">
              <div className="flex items-center justify-between">
                {STATUS_STEPS.map((step, i) => {
                  const isActive = i <= currentStep;
                  const isCurrent = i === currentStep;
                  return (
                    <div key={step.key} className="flex flex-col items-center flex-1">
                      <div
                        className={`
                          w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                          transition-colors duration-300
                          ${isCurrent
                            ? 'bg-orange-500 text-white ring-4 ring-orange-100'
                            : isActive
                              ? 'bg-orange-500 text-white'
                              : 'bg-gray-100 text-gray-400'
                          }
                        `}
                      >
                        {isActive && i < currentStep ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </div>
                      <p
                        className={`text-[10px] mt-1.5 text-center leading-tight ${
                          isActive ? 'text-orange-600 font-semibold' : 'text-gray-400'
                        }`}
                      >
                        {step.label}
                      </p>
                    </div>
                  );
                })}
              </div>
              {/* Progress line */}
              <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-100 -z-10 mx-8">
                <div
                  className="h-full bg-orange-500 transition-all duration-500"
                  style={{
                    width: `${(currentStep / (STATUS_STEPS.length - 1)) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Big status message */}
            <div
              className={`
                rounded-2xl p-6 text-center
                ${status === 'completed'
                  ? 'bg-green-50 border border-green-100'
                  : 'bg-orange-50 border border-orange-100'
                }
              `}
            >
              <p
                className={`text-lg font-semibold leading-relaxed ${
                  status === 'completed' ? 'text-green-800' : 'text-gray-800'
                }`}
              >
                {getStatusMessage(status, employeeName, order.scheduled_date ? formatDate(order.scheduled_date) : null, order.time_window)}
              </p>
            </div>
          </>
        )}

        {/* Details cards */}
        <div className="space-y-3">
          {/* Date & time */}
          {order.scheduled_date && (
            <div className="rounded-xl border border-gray-100 p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4.5 h-4.5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Termin</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">
                    {formatDate(order.scheduled_date)}
                  </p>
                  {order.time_window && (
                    <p className="text-sm text-gray-500">
                      {timeWindowLabels[order.time_window] || order.time_window}
                    </p>
                  )}
                  {order.scheduled_time_start && !order.time_window && (
                    <p className="text-sm text-gray-500">
                      od {order.scheduled_time_start}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Technician */}
          {employeeName && (
            <div className="rounded-xl border border-gray-100 p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4.5 h-4.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Technik</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">
                    {employeeName}
                  </p>
                  {employeePhone && (
                    <a
                      href={`tel:${employeePhone}`}
                      className="text-sm text-orange-500 hover:text-orange-600 font-medium"
                    >
                      {employeePhone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Services */}
          {services.length > 0 && (
            <div className="rounded-xl border border-gray-100 p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4.5 h-4.5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Uslugi</p>
                  <div className="mt-1.5 space-y-1">
                    {services.map((svc, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">
                          {svc.name}
                          {svc.quantity > 1 && (
                            <span className="text-gray-400 ml-1">x{svc.quantity}</span>
                          )}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {svc.price * svc.quantity} zl
                        </span>
                      </div>
                    ))}
                  </div>
                  {order.total_price != null && (
                    <div className="border-t border-gray-100 mt-2 pt-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700">Łącznie</span>
                      <span className="text-sm font-bold text-orange-600">
                        {order.total_price} zl
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Address */}
          {order.address && (
            <div className="rounded-xl border border-gray-100 p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4.5 h-4.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Adres</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">
                    {order.address}
                  </p>
                  {client?.city && (
                    <p className="text-sm text-gray-500">{client.city}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Self-care actions (reschedule / cancel) */}
        {order.status !== 'completed' && order.status !== 'cancelled' && (
          <SelfCareActions orderId={order.id} orderStatus={order.status} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-8">
        <div className="max-w-lg mx-auto px-4 py-6 text-center">
          <p className="text-xs text-gray-400">
            RouteTire &middot; Mobilna Wulkanizacja
          </p>
        </div>
      </footer>
    </div>
  );
}
