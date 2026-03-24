/**
 * GET /api/worker/me
 *
 * Returns full profile + live operational state for the authenticated worker.
 * shift_plan_status is computed dynamically from work_schedules (never stored).
 *
 * Auth: worker (own) or admin
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { checkAuth } from '@/lib/api/auth-guard';
import { getShiftPlanStatus } from '@/lib/worker/shift-helpers';

export async function GET(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'worker']);
  if (!auth.ok) return auth.response;

  if (!auth.employeeId) {
    return NextResponse.json({ error: 'No employee record for this account' }, { status: 404 });
  }

  const supabase = getAdminClient();
  const today = new Date().toISOString().split('T')[0];

  // Fetch employee data + profile
  const { data: employee } = await supabase
    .from('employees')
    .select(`
      id, first_name, last_name, phone_secondary, region_id, is_active,
      default_vehicle_id,
      user:profiles(full_name, email, phone, role, avatar_url),
      region:regions(name, color)
    `)
    .eq('id', auth.employeeId)
    .maybeSingle();

  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }

  // Operational state
  const { data: opState } = await supabase
    .from('employee_operational_state')
    .select('account_status, work_status, planner_status, last_gps_at, gps_lat, gps_lng, last_activity_at')
    .eq('employee_id', auth.employeeId)
    .maybeSingle();

  // Today's work schedule (for shift_plan_status computation)
  const { data: schedule } = await supabase
    .from('work_schedules')
    .select('start_time, end_time, vehicle_id, vehicle:vehicles(plate_number)')
    .eq('employee_id', auth.employeeId)
    .eq('date', today)
    .maybeSingle();

  // Today's clock-in/out from shifts table
  const { data: todayShift } = await supabase
    .from('shifts')
    .select('clock_in, clock_out, break_minutes')
    .eq('employee_id', auth.employeeId)
    .eq('date', today)
    .maybeSingle();

  // Vehicle assignment
  const { data: vehicleAssignment } = await supabase
    .from('vehicle_assignments')
    .select('vehicle:vehicles(plate_number, brand, model)')
    .eq('employee_id', auth.employeeId)
    .eq('is_active', true)
    .maybeSingle();

  const user = (employee as any).user;
  const region = (employee as any).region;

  return NextResponse.json({
    employee_id: employee.id,
    full_name: user?.full_name ?? [employee.first_name, employee.last_name].filter(Boolean).join(' ') ?? 'Pracownik',
    email: user?.email ?? null,
    phone: user?.phone ?? null,
    phone_secondary: employee.phone_secondary ?? null,
    avatar_url: user?.avatar_url ?? null,
    role: auth.role,
    region: region ? { name: region.name, color: region.color } : null,

    // Live state
    account_status: opState?.account_status ?? 'active',
    work_status: opState?.work_status ?? 'off_work',
    planner_status: opState?.planner_status ?? 'available',

    // Shift plan (computed dynamically — avoids drift)
    shift_today: schedule
      ? {
          scheduled: true,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          vehicle_plate: (schedule as any).vehicle?.plate_number ?? null,
        }
      : { scheduled: false, start_time: null, end_time: null, vehicle_plate: null },

    // Current clock-in session
    current_shift: todayShift
      ? {
          clock_in: todayShift.clock_in,
          clock_out: todayShift.clock_out,
          break_minutes: todayShift.break_minutes ?? 0,
          on_break: opState?.work_status === 'break',
        }
      : { clock_in: null, clock_out: null, break_minutes: 0, on_break: false },

    // Assigned vehicle
    vehicle: vehicleAssignment
      ? {
          plate_number: (vehicleAssignment as any).vehicle?.plate_number ?? null,
          brand: (vehicleAssignment as any).vehicle?.brand ?? null,
          model: (vehicleAssignment as any).vehicle?.model ?? null,
        }
      : null,

    // GPS
    last_gps_at: opState?.last_gps_at ?? null,
    last_activity_at: opState?.last_activity_at ?? null,
  });
}
