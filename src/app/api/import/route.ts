import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// Simple CSV parser — handles quoted fields, newlines in quotes, etc.
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length < 2) return [];

  const splitRow = (line: string): string[] => {
    const result: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if ((ch === ',' || ch === ';') && !quoted) {
        result.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    result.push(field.trim());
    return result;
  };

  const headers = splitRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] || '';
    });
    rows.push(row);
  }

  return rows;
}

// POST /api/import — Import CSV data (multipart/form-data)
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  try {
    const formData = await request.formData();
    const type = (formData.get('type') as string) || 'clients';
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Plik CSV jest wymagany' }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Plik CSV jest pusty lub ma nieprawidłowy format' }, { status: 400 });
    }

    let imported = 0;
    const errors: string[] = [];

    if (type === 'clients') {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = row.name || row.nazwa;
        const phone = row.phone || row.telefon;
        const email = row.email || '';
        const address = row.address || row.adres || '';
        const city = row.city || row.miasto || '';
        const lat = row.lat ? parseFloat(row.lat) : null;
        const lng = row.lng ? parseFloat(row.lng) : null;

        if (!name || !phone) {
          errors.push(`Wiersz ${i + 2}: Brak nazwy lub telefonu`);
          continue;
        }

        // Upsert by phone number
        const { data: existing } = await supabase
          .from('clients')
          .select('id')
          .eq('phone', phone)
          .single();

        if (existing) {
          const updateData: Record<string, any> = { name };
          if (email) updateData.email = email;
          if (address) updateData.address = address;
          if (city) updateData.city = city;
          if (lat !== null) updateData.lat = lat;
          if (lng !== null) updateData.lng = lng;
          const { error } = await supabase.from('clients').update(updateData).eq('id', existing.id);
          if (error) errors.push(`Wiersz ${i + 2} (${name}): ${error.message}`);
          else imported++;
        } else {
          const { error } = await supabase.from('clients').insert({
            name,
            phone,
            email: email || null,
            address,
            city,
            lat: lat,
            lng: lng,
            vehicles: [],
          });
          if (error) errors.push(`Wiersz ${i + 2} (${name}): ${error.message}`);
          else imported++;
        }
      }
    } else if (type === 'employees') {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const fullName = row.full_name || row.imie_nazwisko || row.name || '';
        const email = row.email || '';
        const phone = row.phone || row.telefon || '';
        const role = row.role || row.rola || 'worker';

        if (!fullName || !email) {
          errors.push(`Wiersz ${i + 2}: Brak imienia/nazwiska lub e-maila`);
          continue;
        }

        // Create profile
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .insert({
            email,
            full_name: fullName,
            phone: phone || null,
            role: role === 'admin' ? 'admin' : role === 'dispatcher' ? 'dispatcher' : 'worker',
          })
          .select('id')
          .single();

        if (profileErr) {
          errors.push(`Wiersz ${i + 2} (${fullName}): ${profileErr.message}`);
          continue;
        }

        // Create employee record
        const { error: empErr } = await supabase.from('employees').insert({
          user_id: profile.id,
          skills: [],
          hourly_rate: 0,
          is_active: true,
          working_hours: {
            monday: { start: '08:00', end: '16:00' },
            tuesday: { start: '08:00', end: '16:00' },
            wednesday: { start: '08:00', end: '16:00' },
            thursday: { start: '08:00', end: '16:00' },
            friday: { start: '08:00', end: '16:00' },
            saturday: null,
            sunday: null,
          },
        });

        if (empErr) {
          errors.push(`Wiersz ${i + 2} (${fullName}): ${empErr.message}`);
        } else {
          imported++;
        }
      }
    } else if (type === 'orders') {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const address = row.address || row.adres || '';
        const city = row.city || row.miasto || '';
        const scheduledDate = row.scheduled_date || row.data || '';
        const scheduledTimeStart = row.scheduled_time_start || row.godzina || '08:00';
        const clientName = row.client_name || row.klient || '';
        const clientPhone = row.client_phone || row.telefon_klienta || '';
        const clientEmail = row.client_email || row.email_klienta || '';
        const serviceNames = (row.service_names || row.uslugi || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        const priority = row.priority || row.priorytet || 'normal';
        const notes = row.notes || row.notatki || '';

        if (!address || !scheduledDate) {
          errors.push(`Wiersz ${i + 2}: Brak adresu lub daty`);
          continue;
        }

        // Look up or create client
        let clientId: string | null = null;
        if (clientPhone) {
          const { data: existingClient } = await supabase
            .from('clients')
            .select('id')
            .eq('phone', clientPhone)
            .single();

          if (existingClient) {
            clientId = existingClient.id;
          } else if (clientName) {
            const { data: newClient } = await supabase
              .from('clients')
              .insert({
                name: clientName,
                phone: clientPhone,
                email: clientEmail || null,
                address: `${address}${city ? ', ' + city : ''}`,
                city: city,
                vehicles: [],
              })
              .select('id')
              .single();
            clientId = newClient?.id || null;
          }
        }

        if (!clientId) {
          errors.push(`Wiersz ${i + 2}: Nie można zidentyfikować klienta (brak telefonu lub nazwy)`);
          continue;
        }

        // Look up services
        const orderServices: { service_id: string; name: string; price: number; quantity: number }[] = [];
        let totalPrice = 0;
        for (const sName of serviceNames) {
          const { data: svc } = await supabase
            .from('services')
            .select('id, name, price')
            .ilike('name', sName)
            .single();
          if (svc) {
            orderServices.push({ service_id: svc.id, name: svc.name, price: Number(svc.price), quantity: 1 });
            totalPrice += Number(svc.price);
          } else {
            orderServices.push({ service_id: '', name: sName, price: 0, quantity: 1 });
          }
        }

        // Map priority
        const priorityMap: Record<string, string> = {
          niski: 'low', low: 'low',
          normalny: 'normal', normal: 'normal',
          wysoki: 'high', high: 'high',
          pilny: 'urgent', urgent: 'urgent',
        };
        const mappedPriority = priorityMap[priority.toLowerCase()] || 'normal';

        const { error } = await supabase.from('orders').insert({
          client_id: clientId,
          status: 'new',
          priority: mappedPriority,
          scheduled_date: scheduledDate,
          scheduled_time_start: scheduledTimeStart,
          scheduled_time_end: '09:00',
          address: `${address}${city ? ', ' + city : ''}`,
          services: orderServices,
          total_price: totalPrice,
          notes: notes || null,
        });

        if (error) errors.push(`Wiersz ${i + 2}: ${error.message}`);
        else imported++;
      }
    } else {
      return NextResponse.json({ error: `Nieznany typ importu: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ imported, errors, total: rows.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Błąd wewnętrzny' }, { status: 500 });
  }
}
