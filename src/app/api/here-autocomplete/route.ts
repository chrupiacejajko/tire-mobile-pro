import { NextRequest, NextResponse } from 'next/server';

// GET /api/here-autocomplete?q=ul. Marszałkowska
export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  if (q.length < 3) return NextResponse.json({ items: [] });

  const apiKey = process.env.HERE_API_KEY;
  const url =
    `https://autocomplete.search.hereapi.com/v1/autocomplete` +
    `?q=${encodeURIComponent(q)}` +
    `&apiKey=${apiKey}` +
    `&lang=pl` +
    `&in=countryCode:POL` +
    `&limit=5` +
    `&resultTypes=houseNumber,street`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return NextResponse.json({ items: data.items ?? [] });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
