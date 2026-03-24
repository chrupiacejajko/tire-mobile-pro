import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET /api/closure-codes?category=completed — list active codes, optionally filtered by category
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  let query = supabase
    .from('closure_codes')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ closure_codes: data });
}

// POST /api/closure-codes — create a new closure code
// Body: { code, label, category }
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { code, label, category } = body;

    if (!code || !label || !category) {
      return NextResponse.json({ error: 'code, label, and category are required' }, { status: 400 });
    }

    const validCategories = ['completed', 'not_completed', 'cancelled'];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${validCategories.join(', ')}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('closure_codes')
      .insert({ code, label, category })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ closure_code: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
