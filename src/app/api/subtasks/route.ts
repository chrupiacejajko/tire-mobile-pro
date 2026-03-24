import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET /api/subtasks?order_id=X — returns subtasks for an order, sorted by step_order
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const order_id = searchParams.get('order_id');

  if (!order_id) {
    return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('order_subtasks')
    .select('*')
    .eq('order_id', order_id)
    .order('step_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ subtasks: data });
}

// POST /api/subtasks — add subtask to order
// Body: { order_id, step_name, step_order, is_required }
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { order_id, step_name, step_order, is_required } = body;

    if (!order_id || !step_name) {
      return NextResponse.json({ error: 'order_id and step_name are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('order_subtasks')
      .insert({
        order_id,
        step_name,
        step_order: step_order ?? 0,
        is_required: is_required ?? true,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ subtask: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/subtasks — mark subtask as completed
// Body: { id, is_completed, notes, completed_by }
export async function PUT(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { id, is_completed, notes, completed_by } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Fetch the subtask to get order_id and step_order
    const { data: subtask, error: fetchError } = await supabase
      .from('order_subtasks')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !subtask) {
      return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
    }

    // If marking as completed, check enforce_order on the template
    if (is_completed) {
      // Find the order and its services to check if enforce_order is set
      const { data: order } = await supabase
        .from('orders')
        .select('services')
        .eq('id', subtask.order_id)
        .single();

      if (order?.services && Array.isArray(order.services) && order.services.length > 0) {
        // Check if any linked service has a template with enforce_order
        const serviceIds = order.services.map((s: { service_id?: string }) => s.service_id).filter(Boolean);

        if (serviceIds.length > 0) {
          const { data: services } = await supabase
            .from('services')
            .select('task_template_id')
            .in('id', serviceIds)
            .not('task_template_id', 'is', null);

          if (services && services.length > 0) {
            const templateIds = services.map((s: { task_template_id: string }) => s.task_template_id);
            const { data: templates } = await supabase
              .from('task_templates')
              .select('enforce_order')
              .in('id', templateIds)
              .eq('enforce_order', true);

            if (templates && templates.length > 0) {
              // enforce_order is active — check all previous steps are completed
              const { data: previousSteps } = await supabase
                .from('order_subtasks')
                .select('id, step_order, is_completed')
                .eq('order_id', subtask.order_id)
                .lt('step_order', subtask.step_order)
                .eq('is_required', true)
                .eq('is_completed', false);

              if (previousSteps && previousSteps.length > 0) {
                return NextResponse.json(
                  { error: 'Nie można ukończyć tego kroku — wcześniejsze wymagane kroki nie zostały jeszcze zakończone.' },
                  { status: 422 }
                );
              }
            }
          }
        }
      }
    }

    // Update the subtask
    const updateData: Record<string, unknown> = {};
    if (is_completed !== undefined) {
      updateData.is_completed = is_completed;
      updateData.completed_at = is_completed ? new Date().toISOString() : null;
    }
    if (notes !== undefined) updateData.notes = notes;
    if (completed_by !== undefined) updateData.completed_by = completed_by;

    const { data, error } = await supabase
      .from('order_subtasks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ subtask: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
