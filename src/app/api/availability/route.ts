import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/availability?date=2024-03-25&region=Warszawa&mode=slots|windows
 *
 * mode=slots   (default) — 30-minute slots 07:00-18:00
 * mode=windows — 3 time windows: 08:00-12:00 | 12:00-16:00 | 16:00-20:00
 */

const TIME_WINDOWS = [
  { id: 'morning',   label: 'Rano',       start: '08:00', end: '12:00', icon: '🌅' },
  { id: 'afternoon', label: 'Południe',   start: '12:00', end: '16:00', icon: '☀️'  },
  { id: 'evening',   label: 'Po południu', start: '16:00', end: '20:00', icon: '🌆' },
];

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const region = searchParams.get('region');
  const mode = searchParams.get('mode') || 'slots';

  if (!date) return NextResponse.json({ error: 'date parameter is required' }, { status: 400 });

  // Get orders for that date
  const { data: orders } = await supabase
    .from('orders')
    .select('scheduled_time_start, scheduled_time_end, time_window, employee_id')
    .eq('scheduled_date', date)
    .not('status', 'eq', 'cancelled');

  // Get employees
  let empQuery = supabase.from('employees').select('id, user:profiles(full_name), region:regions(name), working_hours').eq('is_active', true);
  if (region) {
    const { data: regionData } = await supabase.from('regions').select('id').eq('name', region).single();
    if (regionData) empQuery = empQuery.eq('region_id', regionData.id);
  }
  const { data: employees } = await empQuery;
  const totalEmployees = employees?.length || 0;

  // ── Window mode ───────────────────────────────────────────────────────
  if (mode === 'windows') {
    const windows = TIME_WINDOWS.map(win => {
      // Count employees busy during this entire window
      const busyEmployeeIds = new Set<string>();
      for (const o of (orders || [])) {
        // Order overlaps with this window
        const oStart = o.scheduled_time_start;
        const oEnd = o.scheduled_time_end;
        if (oStart < win.end && oEnd > win.start) {
          if (o.employee_id) busyEmployeeIds.add(o.employee_id);
        }
      }
      const available = totalEmployees - busyEmployeeIds.size;
      return {
        ...win,
        available: available > 0,
        employees_available: Math.max(0, available),
        slots_taken: busyEmployeeIds.size,
      };
    });
    return NextResponse.json({ date, mode: 'windows', windows, total_employees: totalEmployees });
  }

  // ── Slot mode (default) ───────────────────────────────────────────────
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
      slots.push({ time: timeStr, available: availableEmps.length > 0, employees_available: availableEmps.length });
    }
  }

  return NextResponse.json({
    date,
    mode: 'slots',
    region: region || 'all',
    total_employees: totalEmployees,
    slots: slots.filter(s => s.available),
    all_slots: slots,
  });
}
