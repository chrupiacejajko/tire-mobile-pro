import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  order: number;
  options?: string[];
  min?: number;
  max?: number;
}

// GET /api/form-submissions?order_id=X — get all submissions for an order
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('order_id');

  if (!orderId) return NextResponse.json({ error: 'order_id is required' }, { status: 400 });

  const { data, error } = await supabase
    .from('form_submissions')
    .select('*, template:form_templates(name, fields)')
    .eq('order_id', orderId)
    .order('submitted_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ submissions: data });
}

// POST /api/form-submissions — submit a filled form
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { order_id, template_id, employee_id, data: formData } = body;

    if (!order_id) return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    if (!template_id) return NextResponse.json({ error: 'template_id is required' }, { status: 400 });
    if (!formData || typeof formData !== 'object') {
      return NextResponse.json({ error: 'data must be an object' }, { status: 400 });
    }

    // Fetch the template to validate against
    const { data: template, error: tplErr } = await supabase
      .from('form_templates')
      .select('fields')
      .eq('id', template_id)
      .single();

    if (tplErr || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const fields = template.fields as FormField[];
    const errors: string[] = [];

    for (const field of fields) {
      const value = formData[field.id];

      // Check required
      if (field.required) {
        if (value === undefined || value === null || value === '') {
          errors.push(`Pole "${field.label}" jest wymagane`);
          continue;
        }
      }

      // Skip validation if value not provided and not required
      if (value === undefined || value === null || value === '') continue;

      // Type-specific validation
      switch (field.type) {
        case 'number': {
          const num = Number(value);
          if (isNaN(num)) {
            errors.push(`Pole "${field.label}" musi być liczbą`);
          } else {
            if (field.min !== undefined && num < field.min) {
              errors.push(`Pole "${field.label}" nie może być mniejsze niż ${field.min}`);
            }
            if (field.max !== undefined && num > field.max) {
              errors.push(`Pole "${field.label}" nie może być większe niż ${field.max}`);
            }
          }
          break;
        }
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`Pole "${field.label}" musi być wartością tak/nie`);
          }
          break;
        case 'select':
          if (field.options && !field.options.includes(value)) {
            errors.push(`Pole "${field.label}": nieprawidłowa opcja "${value}"`);
          }
          break;
        case 'multiselect':
          if (!Array.isArray(value)) {
            errors.push(`Pole "${field.label}" musi być tablicą`);
          } else if (field.options) {
            for (const v of value) {
              if (!field.options.includes(v)) {
                errors.push(`Pole "${field.label}": nieprawidłowa opcja "${v}"`);
              }
            }
          }
          break;
        case 'date':
          if (typeof value === 'string' && isNaN(Date.parse(value))) {
            errors.push(`Pole "${field.label}" musi być prawidłową datą`);
          }
          break;
        // text, photo, signature — any string is valid
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: 'Błędy walidacji', details: errors }, { status: 400 });
    }

    const { data: submission, error: insertErr } = await supabase
      .from('form_submissions')
      .insert({
        order_id,
        template_id,
        employee_id: employee_id || null,
        data: formData,
      })
      .select()
      .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    return NextResponse.json({ submission }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
