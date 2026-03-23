import { NextRequest, NextResponse } from 'next/server';

// GET /api/geocode?address=ul. Marszałkowska 15, Warszawa
// Uses free Nominatim (OpenStreetMap) geocoding
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'address parameter is required' }, { status: 400 });
  }

  try {
    const encoded = encodeURIComponent(address + ', Poland');
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=pl`,
      {
        headers: {
          'User-Agent': 'RouteTire/1.0',
        },
      }
    );

    const data = await res.json();

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Address not found', lat: null, lng: null });
    }

    return NextResponse.json({
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      display_name: data[0].display_name,
      quality: data[0].importance > 0.5 ? 'high' : data[0].importance > 0.3 ? 'medium' : 'low',
    });
  } catch (err) {
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500 });
  }
}
