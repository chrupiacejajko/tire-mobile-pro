import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// POST /api/import?type=clients - Import CSV data
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'clients';
    const body = await request.json();
    const { rows } = body;

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'rows array is required' }, { status: 400 });
    }

    let imported = 0;
    let errors: string[] = [];

    if (type === 'clients') {
      for (const row of rows) {
        const { name, phone, email, address, city, notes } = row;
        if (!name || !phone || !address || !city) {
          errors.push(`Brak wymaganych pól dla: ${name || 'brak nazwy'}`);
          continue;
        }
        const { error } = await supabase.from('clients').insert({
          name, phone, email: email || null, address, city, notes: notes || null, vehicles: [],
        });
        if (error) errors.push(`${name}: ${error.message}`);
        else imported++;
      }
    } else if (type === 'orders') {
      for (const row of rows) {
        const { client_phone, date, time, service, address, notes } = row;
        if (!client_phone || !date) {
          errors.push(`Brak wymaganych pól`);
          continue;
        }

        // Find client by phone
        const { data: client } = await supabase.from('clients').select('id').eq('phone', client_phone).single();
        if (!client) {
          errors.push(`Nie znaleziono klienta: ${client_phone}`);
          continue;
        }

        const { error } = await supabase.from('orders').insert({
          client_id: client.id,
          status: 'new',
          priority: 'normal',
          scheduled_date: date,
          scheduled_time_start: time || '08:00',
          scheduled_time_end: '09:00',
          address: address || '',
          services: service ? [{ service_id: '', name: service, price: 0, quantity: 1 }] : [],
          total_price: 0,
          notes: notes || null,
        });
        if (error) errors.push(error.message);
        else imported++;
      }
    }

    return NextResponse.json({ imported, errors, total: rows.length });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
