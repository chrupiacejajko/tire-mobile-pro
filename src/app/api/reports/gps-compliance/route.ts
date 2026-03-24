/**
 * GET /api/reports/gps-compliance?from=YYYY-MM-DD&to=YYYY-MM-DD&employee_id=X
 *
 * Verifies whether a worker was physically at the client's address
 * when an order was marked as completed or in_progress.
 *
 * For each qualifying order:
 *  1. Get client lat/lng
 *  2. Find closest GPS record from employee_locations within +-30 min of scheduled_time_start on scheduled_date
 *  3. Calculate haversine distance
 *  4. Classify: confirmed (<500m), nearby (<2km), suspicious (2-10km), no_match (>10km or no GPS)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm } from '@/lib/geo';

type ComplianceStatus = 'confirmed' | 'nearby' | 'suspicious' | 'no_match';

function classify(distanceKm: number | null): ComplianceStatus {
  if (distanceKm === null) return 'no_match';
  if (distanceKm <= 0.5) return 'confirmed';
  if (distanceKm <= 2) return 'nearby';
  if (distanceKm <= 10) return 'suspicious';
  return 'no_match';
}

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);

  // Date range defaults to last 7 days
  const now = new Date();
  const defaultTo = now.toISOString().split('T')[0];
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const from = searchParams.get('from') || defaultFrom;
  const to = searchParams.get('to') || defaultTo;
  const employeeFilter = searchParams.get('employee_id');

  try {
    // Fetch completed/in_progress orders in date range
    let ordersQuery = supabase
      .from('orders')
      .select(`
        id, status, scheduled_date, scheduled_time_start, address, employee_id,
        client:clients(name, lat, lng, address)
      `)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)
      .in('status', ['completed', 'in_progress']);

    if (employeeFilter) {
      ordersQuery = ordersQuery.eq('employee_id', employeeFilter);
    }

    const { data: orders, error: ordersError } = await ordersQuery;
    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    // Get employee names
    const employeeIds = [...new Set((orders || []).map(o => o.employee_id).filter(Boolean))];
    const { data: employees } = await supabase
      .from('employees')
      .select('id, user:profiles(full_name)')
      .in('id', employeeIds.length ? employeeIds : ['__none__']);

    const empNameMap = new Map<string, string>();
    for (const emp of employees || []) {
      empNameMap.set(emp.id, (emp.user as any)?.full_name ?? 'Pracownik');
    }

    // Get vehicle plates for employees
    const { data: assignments } = await supabase
      .from('vehicle_assignments')
      .select('employee_id, vehicle:vehicles(plate_number)')
      .eq('is_active', true);

    const empToPlate = new Map<string, string>();
    for (const a of assignments || []) {
      if (a.employee_id) empToPlate.set(a.employee_id, (a.vehicle as any)?.plate_number ?? '');
    }

    // For each order, find closest GPS record
    const results: Array<{
      order_id: string;
      client_name: string;
      address: string;
      scheduled_date: string;
      scheduled_time: string;
      employee_name: string;
      plate_number: string;
      status: ComplianceStatus;
      gps_distance_meters: number | null;
      gps_timestamp: string | null;
      client_lat: number | null;
      client_lng: number | null;
      gps_lat: number | null;
      gps_lng: number | null;
    }> = [];

    for (const order of orders || []) {
      const client = order.client as any;
      const clientLat = client?.lat;
      const clientLng = client?.lng;
      const empId = order.employee_id;

      if (!empId) continue;

      const scheduledDate = order.scheduled_date;
      const scheduledTime = order.scheduled_time_start || '08:00';

      // Build timestamp range: scheduled_time +-30 min on the scheduled_date
      const [h, m] = scheduledTime.split(':').map(Number);
      const scheduledMinutes = h * 60 + m;
      const windowStartMin = Math.max(0, scheduledMinutes - 30);
      const windowEndMin = scheduledMinutes + 30;

      const wsH = Math.floor(windowStartMin / 60);
      const wsM = windowStartMin % 60;
      const weH = Math.floor(windowEndMin / 60);
      const weM = windowEndMin % 60;

      const windowStart = `${scheduledDate}T${String(wsH).padStart(2, '0')}:${String(wsM).padStart(2, '0')}:00`;
      const windowEnd = `${scheduledDate}T${String(weH).padStart(2, '0')}:${String(weM).padStart(2, '0')}:00`;

      // Query GPS records for this employee in the time window
      const { data: gpsRecords } = await supabase
        .from('employee_locations')
        .select('lat, lng, timestamp')
        .eq('employee_id', empId)
        .gte('timestamp', windowStart)
        .lte('timestamp', windowEnd)
        .order('timestamp', { ascending: true });

      let closestDist: number | null = null;
      let closestRecord: { lat: number; lng: number; timestamp: string } | null = null;

      if (clientLat && clientLng && gpsRecords && gpsRecords.length > 0) {
        for (const gps of gpsRecords) {
          if (!gps.lat || !gps.lng) continue;
          const dist = haversineKm(clientLat, clientLng, gps.lat, gps.lng);
          if (closestDist === null || dist < closestDist) {
            closestDist = dist;
            closestRecord = { lat: gps.lat, lng: gps.lng, timestamp: gps.timestamp };
          }
        }
      }

      const complianceStatus = classify(closestDist);
      const distMeters = closestDist !== null ? Math.round(closestDist * 1000) : null;

      results.push({
        order_id: order.id,
        client_name: client?.name ?? 'Klient',
        address: order.address || client?.address || '',
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        employee_name: empNameMap.get(empId) ?? 'Pracownik',
        plate_number: empToPlate.get(empId) ?? '',
        status: complianceStatus,
        gps_distance_meters: distMeters,
        gps_timestamp: closestRecord?.timestamp ?? null,
        client_lat: clientLat ?? null,
        client_lng: clientLng ?? null,
        gps_lat: closestRecord?.lat ?? null,
        gps_lng: closestRecord?.lng ?? null,
      });
    }

    // Summary
    const total = results.length;
    const confirmed = results.filter(r => r.status === 'confirmed').length;
    const nearby = results.filter(r => r.status === 'nearby').length;
    const suspicious = results.filter(r => r.status === 'suspicious').length;
    const no_match = results.filter(r => r.status === 'no_match').length;
    const compliance_pct = total > 0 ? Math.round(((confirmed + nearby) / total) * 100) : 0;

    return NextResponse.json({
      from,
      to,
      results,
      summary: { total, confirmed, nearby, suspicious, no_match, compliance_pct },
    });
  } catch (err) {
    console.error('[reports/gps-compliance]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
