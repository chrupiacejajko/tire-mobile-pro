import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/employee-gps?employee_id=X
 * Returns the latest GPS position for an employee.
 */
export async function GET(request: NextRequest) {
  const employeeId = request.nextUrl.searchParams.get('employee_id');
  if (!employeeId) return NextResponse.json({ error: 'employee_id required' }, { status: 400 });

  const supabase = getAdminClient();
  const { data } = await supabase
    .from('employee_locations')
    .select('lat, lng, speed, direction, status, timestamp')
    .eq('employee_id', employeeId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return NextResponse.json({ lat: null, lng: null });
  return NextResponse.json(data);
}
