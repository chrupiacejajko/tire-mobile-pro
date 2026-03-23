import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// GET /api/availability?date=2024-03-25&region=Warszawa
// Returns available time slots for a given date
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const region = searchParams.get('region');

  if (!date) {
    return NextResponse.json({ error: 'date parameter is required' }, { status: 400 });
  }

  // Get all orders for that date
  let query = supabase
    .from('orders')
    .select('scheduled_time_start, scheduled_time_end, employee_id')
    .eq('scheduled_date', date)
    .not('status', 'eq', 'cancelled');

  const { data: orders } = await query;

  // Get employees (optionally filtered by region)
  let empQuery = supabase
    .from('employees')
    .select('id, user:profiles(full_name), region:regions(name), working_hours')
    .eq('is_active', true);

  if (region) {
    const { data: regionData } = await supabase.from('regions').select('id').eq('name', region).single();
    if (regionData) empQuery = empQuery.eq('region_id', regionData.id);
  }

  const { data: employees } = await empQuery;

  // Generate available slots (7:00 - 18:00, 30-min slots)
  const slots: { time: string; available: boolean; employees_available: number }[] = [];
  for (let h = 7; h <= 17; h++) {
    for (const m of [0, 30]) {
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      const busyEmployees = (orders || []).filter(o => {
        const start = o.scheduled_time_start;
        const end = o.scheduled_time_end;
        return timeStr >= start && timeStr < end;
      }).map(o => o.employee_id);

      const availableEmps = (employees || []).filter(e => !busyEmployees.includes(e.id));

      slots.push({
        time: timeStr,
        available: availableEmps.length > 0,
        employees_available: availableEmps.length,
      });
    }
  }

  return NextResponse.json({
    date,
    region: region || 'all',
    total_employees: employees?.length || 0,
    slots: slots.filter(s => s.available),
    all_slots: slots,
  });
}
