import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET /api/company-settings — return single (first) row
export async function GET() {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// PUT /api/company-settings — update fields
export async function PUT(request: NextRequest) {
  const supabase = getAdminClient();
  const body = await request.json();

  // Get the first row id
  const { data: existing, error: fetchError } = await supabase
    .from('company_settings')
    .select('id')
    .limit(1)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'No company settings found' }, { status: 404 });
  }

  const allowedFields = [
    'company_name', 'company_short', 'logo_url',
    'primary_color', 'secondary_color',
    'address', 'nip', 'phone', 'email', 'website',
  ];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  const { data, error } = await supabase
    .from('company_settings')
    .update(updates)
    .eq('id', existing.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
