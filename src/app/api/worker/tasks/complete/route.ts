/**
 * POST /api/worker/tasks/complete
 * Body: { order_id, notes?, photos?: string[] (base64 or URLs) }
 *
 * Marks order as completed, saves notes and optional photo URLs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const body = await request.json();
    const { order_id, notes, photos } = body;

    if (!order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 });

    // Update order status
    const updateData: Record<string, any> = {
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
    if (notes) updateData.notes = notes;

    const { error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', order_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Save photo URLs if provided
    if (photos?.length) {
      const photoRows = photos.map((url: string, i: number) => ({
        order_id,
        url,
        taken_at: new Date().toISOString(),
        sort_order: i,
      }));
      await supabase.from('order_photos').insert(photoRows);
    }

    return NextResponse.json({ success: true, order_id, completed_at: updateData.completed_at });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
