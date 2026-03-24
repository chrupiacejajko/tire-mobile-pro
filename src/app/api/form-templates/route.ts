import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET /api/form-templates — list all active templates (or all if ?all=true)
// Also supports ?active=true for only active ones
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const showAll = searchParams.get('all') === 'true';
  const activeOnly = searchParams.get('active') === 'true';

  let query = supabase
    .from('form_templates')
    .select('*, fields:form_template_fields(*)')
    .order('name');

  if (activeOnly || !showAll) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Sort fields by sort_order within each template
  const templates = (data || []).map((t: any) => ({
    ...t,
    fields: (t.fields || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
  }));

  return NextResponse.json({ templates });
}

const VALID_TYPES = [
  'text', 'number', 'boolean', 'select', 'multiselect',
  'date', 'datetime', 'time', 'photo', 'signature', 'location',
];

// POST /api/form-templates — create a new template with fields
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { name, description, fields } = body;

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json({ error: 'fields must be a non-empty array' }, { status: 400 });
    }

    // Validate fields
    for (const field of fields) {
      if (!field.name && !field.label) {
        return NextResponse.json({ error: 'Each field must have a name (or label)' }, { status: 400 });
      }
      const ft = field.field_type || field.type;
      if (!ft || !VALID_TYPES.includes(ft)) {
        return NextResponse.json({ error: `Invalid field type: ${ft}` }, { status: 400 });
      }
      if (['select', 'multiselect'].includes(ft) && (!Array.isArray(field.options) || field.options.length === 0)) {
        return NextResponse.json({ error: `Field "${field.name || field.label}" (${ft}) must have options array` }, { status: 400 });
      }
    }

    // Insert template
    const { data: template, error: tplErr } = await supabase
      .from('form_templates')
      .insert({ name, description: description || null })
      .select()
      .single();

    if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 400 });

    // Insert fields
    const fieldRows = fields.map((f: any, i: number) => ({
      template_id: template.id,
      name: f.name || f.label,
      field_type: f.field_type || f.type,
      is_required: f.is_required ?? f.required ?? false,
      sort_order: f.sort_order ?? f.order ?? i,
      options: f.options || null,
      validation_regex: f.validation_regex || null,
      category: f.category || null,
    }));

    const { data: insertedFields, error: fieldsErr } = await supabase
      .from('form_template_fields')
      .insert(fieldRows)
      .select();

    if (fieldsErr) return NextResponse.json({ error: fieldsErr.message }, { status: 400 });

    return NextResponse.json({
      template: { ...template, fields: insertedFields },
    }, { status: 201 });
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

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase
        .from('form_templates')
        .update(updateData)
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // If fields provided, full replace: delete old and insert new
    if (fields !== undefined) {
      if (!Array.isArray(fields) || fields.length === 0) {
        return NextResponse.json({ error: 'fields must be a non-empty array' }, { status: 400 });
      }

      for (const field of fields) {
        const ft = field.field_type || field.type;
        if (!ft || !VALID_TYPES.includes(ft)) {
          return NextResponse.json({ error: `Invalid field type: ${ft}` }, { status: 400 });
        }
      }

      // Delete existing fields
      await supabase.from('form_template_fields').delete().eq('template_id', id);

      // Insert new fields
      const fieldRows = fields.map((f: any, i: number) => ({
        template_id: id,
        name: f.name || f.label,
        field_type: f.field_type || f.type,
        is_required: f.is_required ?? f.required ?? false,
        sort_order: f.sort_order ?? f.order ?? i,
        options: f.options || null,
        validation_regex: f.validation_regex || null,
        category: f.category || null,
      }));

      const { error: fieldsErr } = await supabase
        .from('form_template_fields')
        .insert(fieldRows);

      if (fieldsErr) return NextResponse.json({ error: fieldsErr.message }, { status: 400 });
    }

    // Fetch updated template with fields
    const { data: template, error: fetchErr } = await supabase
      .from('form_templates')
      .select('*, fields:form_template_fields(*)')
      .eq('id', id)
      .single();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 });

    return NextResponse.json({
      template: {
        ...template,
        fields: (template.fields || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/form-templates?id=X — soft delete (set is_active=false)
export async function DELETE(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabase
    .from('form_templates')
    .update({ is_active: false })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
