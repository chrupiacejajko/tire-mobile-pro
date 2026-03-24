import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/form-templates/linked-services?service_ids=xxx&service_ids=yyy
 * Returns unique template_ids linked to the given service IDs.
 */
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const serviceIds = searchParams.getAll('service_ids');

  if (serviceIds.length === 0) {
    return NextResponse.json({ template_ids: [] });
  }

  const { data, error } = await supabase
    .from('services')
    .select('form_template_id')
    .in('id', serviceIds)
    .not('form_template_id', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const templateIds = [...new Set((data || []).map(s => s.form_template_id).filter(Boolean))];
  return NextResponse.json({ template_ids: templateIds });
}
