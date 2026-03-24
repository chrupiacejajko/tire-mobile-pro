/**
 * Shift summary API — daily RCP overview per employee
 *
 * GET /api/shifts/summary?date=YYYY-MM-DD
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { haversineKm } from '@/lib/geo';

interface GpsPoint {
  lat: number;
  lng: number;
  timestamp: string;
}

function computeTotalKm(points: GpsPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineKm(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }
  return total;
}

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 });
  }

  // Get all shifts for this date with employee names
  const { data: shifts, error: shiftsErr } = await supabase
    .from('shifts')
    .select('*, employees!inner(id, user_id, profiles:user_id(full_name))')
    .eq('date', date);

  if (shiftsErr) return NextResponse.json({ error: shiftsErr.message }, { status: 500 });
  if (!shifts || shifts.length === 0) {
    return NextResponse.json({ summary: [] });
  }

  const now = new Date();
  const summaries = await Promise.all(
    shifts.map(async (shift: any) => {
      const employeeId = shift.employee_id;
      const employeeName = shift.employees?.profiles?.full_name ?? 'Nieznany';

      // Calculate shift hours
      const clockIn = new Date(shift.clock_in);
      const clockOut = shift.clock_out ? new Date(shift.clock_out) : now;
      const shiftMs = clockOut.getTime() - clockIn.getTime();
      const breakMs = (shift.break_minutes || 0) * 60 * 1000;
      const shiftHours = Math.max(0, (shiftMs - breakMs) / (1000 * 60 * 60));

      // Get service hours from work_logs
      const { data: workLogs } = await supabase
        .from('work_logs')
        .select('duration_minutes')
        .eq('employee_id', employeeId)
        .gte('created_at', `${date}T00:00:00`)
        .lt('created_at', `${date}T23:59:59.999`);

      const serviceMinutes = (workLogs || []).reduce(
        (sum: number, wl: any) => sum + (wl.duration_minutes ?? 0),
        0,
      );
      const serviceHours = serviceMinutes / 60;

      // Get GPS data for travel hours
      const { data: gpsPoints } = await supabase
        .from('employee_locations')
        .select('lat, lng, timestamp')
        .eq('employee_id', employeeId)
        .gte('timestamp', `${date}T00:00:00`)
        .lt('timestamp', `${date}T23:59:59.999`)
        .order('timestamp', { ascending: true });

      const totalKm = computeTotalKm((gpsPoints as GpsPoint[]) || []);
      const travelHours = totalKm / 50; // 50 km/h average

      const idleHours = Math.max(0, shiftHours - serviceHours - travelHours);
      const utilizationPct = shiftHours > 0
        ? Math.round((serviceHours / shiftHours) * 100)
        : 0;

      return {
        employee_id: employeeId,
        employee_name: employeeName,
        shift_hours: Math.round(shiftHours * 100) / 100,
        service_hours: Math.round(serviceHours * 100) / 100,
        travel_hours: Math.round(travelHours * 100) / 100,
        idle_hours: Math.round(idleHours * 100) / 100,
        utilization_pct: utilizationPct,
        clock_in: shift.clock_in,
        clock_out: shift.clock_out,
        break_minutes: shift.break_minutes,
      };
    }),
  );

  return NextResponse.json({ summary: summaries });
}
