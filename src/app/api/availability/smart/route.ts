/**
 * GET /api/availability/smart?date=...&lat=...&lng=...&duration=...
 *
 * Returns time windows enriched with geo-proximity hints:
 * - smart_pick: true if a worker already has a job close to this location
 * - proximity_km: nearest existing job in that window
 * - proximity_hint: human-readable string
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm } from '@/lib/geo';

const TIME_WINDOWS = [
  { id: 'morning',   label: 'Rano',        start: '08:00', end: '12:00', icon: 'sunrise' },
  { id: 'afternoon', label: 'Południe',    start: '12:00', end: '16:00', icon: 'sun'     },
  { id: 'evening',   label: 'Po południu', start: '16:00', end: '20:00', icon: 'sunset'  },
];

const SMART_RADIUS_KM = 15; // offer as "nearby" if existing job is within 15 km

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const latRaw = searchParams.get('lat');
  const lngRaw = searchParams.get('lng');

  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });

  const lat = latRaw ? parseFloat(latRaw) : null;
  const lng = lngRaw ? parseFloat(lngRaw) : null;
  const hasCoords = lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng);

  // Existing orders with their client coords
  const { data: orders } = await supabase
    .from('orders')
    .select('employee_id, scheduled_time_start, scheduled_time_end, client:clients(lat, lng)')
    .eq('scheduled_date', date)
    .not('status', 'eq', 'cancelled');

  // Active employees
  const { data: employees } = await supabase
    .from('employees')
    .select('id')
    .eq('is_active', true);

  const totalEmployees = employees?.length ?? 0;

  const windows = TIME_WINDOWS.map(win => {
    const busyEmployeeIds = new Set<string>();
    let minProximityKm = Infinity;
    let nearestEmployeeId: string | null = null;

    for (const o of (orders ?? [])) {
      const overlaps = o.scheduled_time_start < win.end && o.scheduled_time_end > win.start;
      if (!overlaps) continue;

      if (o.employee_id) {
        busyEmployeeIds.add(o.employee_id);

        if (hasCoords) {
          const c = (o as any).client;
          if (c?.lat && c?.lng) {
            const d = haversineKm(lat!, lng!, c.lat, c.lng);
            if (d < minProximityKm) {
              minProximityKm = d;
              nearestEmployeeId = o.employee_id;
            }
          }
        }
      }
    }

    const available = Math.max(0, totalEmployees - busyEmployeeIds.size);
    const smartPick = hasCoords && minProximityKm <= SMART_RADIUS_KM && available > 0;

    return {
      id: win.id,
      label: win.label,
      start: win.start,
      end: win.end,
      icon: win.icon,
      available: available > 0,
      employees_available: available,
      smart_pick: smartPick,
      proximity_km: smartPick ? Math.round(minProximityKm * 10) / 10 : null,
      proximity_hint: smartPick
        ? minProximityKm < 5
          ? 'Pracownik będzie bardzo blisko Ciebie'
          : `Pracownik będzie ~${Math.round(minProximityKm)} km od Ciebie`
        : null,
    };
  });

  return NextResponse.json({
    date,
    total_employees: totalEmployees,
    has_geo: hasCoords,
    windows,
  });
}
