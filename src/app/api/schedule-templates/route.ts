/**
 * Schedule Templates API (Szablony grafiku)
 *
 * GET  /api/schedule-templates  — list all active templates
 * POST /api/schedule-templates  — create template
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('schedule_templates')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: data });
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const { name, days_of_week, start_time, end_time } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('schedule_templates')
      .insert({
        name,
        days_of_week: days_of_week || [1, 2, 3, 4, 5],
        start_time: start_time || '08:00',
        end_time: end_time || '16:00',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template: data }, { status: 201 });
  } catch (err) {
    console.error('[schedule-templates POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
