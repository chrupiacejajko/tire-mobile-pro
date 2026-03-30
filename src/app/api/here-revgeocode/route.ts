import { NextRequest, NextResponse } from 'next/server';

// GET /api/here-revgeocode?at=51.75,19.45
export async function GET(request: NextRequest) {
  const at = new URL(request.url).searchParams.get('at') ?? '';
  if (!at) return NextResponse.json({ items: [] });

  const apiKey = process.env.HERE_API_KEY;
  const url =
    `https://revgeocode.search.hereapi.com/v1/revgeocode` +
    `?at=${encodeURIComponent(at)}` +
    `&apiKey=${apiKey}` +
    `&lang=pl`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return NextResponse.json({ items: data.items ?? [] });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
