import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// POST /api/upload?order_id=xxx - Upload photo to order
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('order_id');

    if (!orderId) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const ext = file.name.split('.').pop();
    const fileName = `orders/${orderId}/${Date.now()}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('lib')
      .upload(fileName, file, { contentType: file.type });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('lib').getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    // Append to order's photos array
    const { data: order } = await supabase.from('orders').select('photos').eq('id', orderId).single();
    const currentPhotos = order?.photos || [];

    await supabase.from('orders').update({
      photos: [...currentPhotos, publicUrl],
    }).eq('id', orderId);

    return NextResponse.json({ url: publicUrl, fileName });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
