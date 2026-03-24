import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET /api/task-templates — list all templates
export async function GET() {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ templates: data });
}

// POST /api/task-templates — create a new template
// Body: { name, description, steps: [{ name, required, order }], enforce_order }
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { name, description, steps, enforce_order } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (steps && !Array.isArray(steps)) {
      return NextResponse.json({ error: 'steps must be an array' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('task_templates')
      .insert({
        name,
        description: description || null,
        steps: steps || [],
        enforce_order: enforce_order ?? false,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ template: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
