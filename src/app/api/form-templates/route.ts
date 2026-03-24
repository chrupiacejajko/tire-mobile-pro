import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET /api/form-templates — list all active templates (or all if ?all=true)
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const showAll = searchParams.get('all') === 'true';

  let query = supabase
    .from('form_templates')
    .select('*')
    .order('name');

  if (!showAll) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ templates: data });
}

// POST /api/form-templates — create a new template
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { name, description, fields } = body;

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json({ error: 'fields must be a non-empty array' }, { status: 400 });
    }

    // Validate field structure
    const validTypes = ['text', 'number', 'boolean', 'select', 'multiselect', 'photo', 'date', 'signature'];
    for (const field of fields) {
      if (!field.id || !field.type || !field.label) {
        return NextResponse.json({ error: 'Each field must have id, type, and label' }, { status: 400 });
      }
      if (!validTypes.includes(field.type)) {
        return NextResponse.json({ error: `Invalid field type: ${field.type}` }, { status: 400 });
      }
      if (['select', 'multiselect'].includes(field.type) && (!Array.isArray(field.options) || field.options.length === 0)) {
        return NextResponse.json({ error: `Field "${field.label}" (${field.type}) must have options array` }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from('form_templates')
      .insert({ name, description: description || null, fields })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ template: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/form-templates — update a template
export async function PUT(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { id, name, description, fields, is_active } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (fields !== undefined) {
      if (!Array.isArray(fields) || fields.length === 0) {
        return NextResponse.json({ error: 'fields must be a non-empty array' }, { status: 400 });
      }
      const validTypes = ['text', 'number', 'boolean', 'select', 'multiselect', 'photo', 'date', 'signature'];
      for (const field of fields) {
        if (!field.id || !field.type || !field.label) {
          return NextResponse.json({ error: 'Each field must have id, type, and label' }, { status: 400 });
        }
        if (!validTypes.includes(field.type)) {
          return NextResponse.json({ error: `Invalid field type: ${field.type}` }, { status: 400 });
        }
        if (['select', 'multiselect'].includes(field.type) && (!Array.isArray(field.options) || field.options.length === 0)) {
          return NextResponse.json({ error: `Field "${field.label}" (${field.type}) must have options array` }, { status: 400 });
        }
      }
      updateData.fields = fields;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('form_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ template: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
