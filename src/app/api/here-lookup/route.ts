import { NextRequest, NextResponse } from 'next/server';

// GET /api/here-lookup?id=here:af:streetsection:XXX
export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const apiKey = process.env.HERE_API_KEY;
  const url = `https://lookup.search.hereapi.com/v1/lookup?id=${encodeURIComponent(id)}&apiKey=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const addr = data.address ?? {};
    return NextResponse.json({
      lat: data.position?.lat ?? null,
      lng: data.position?.lng ?? null,
      street: [addr.street, addr.houseNumber].filter(Boolean).join(' '),
      city: addr.city ?? '',
      postalCode: addr.postalCode ?? '',
    });
  } catch {
    return NextResponse.json({ lat: null, lng: null, street: '', city: '' });
  }
}
