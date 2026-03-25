import { NextRequest, NextResponse } from 'next/server';

// GET /api/here-discover?q=Circle+K+Rzgowska+Łódź&at=51.75,19.45
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const q = params.get('q') ?? '';
  const at = params.get('at') ?? '';

  if (q.length < 3) return NextResponse.json({ items: [] });

  const apiKey = process.env.HERE_API_KEY;
  const url =
    `https://discover.search.hereapi.com/v1/discover` +
    `?q=${encodeURIComponent(q)}` +
    `&apiKey=${apiKey}` +
    `&lang=pl` +
    `&in=countryCode:POL` +
    `&limit=10` +
    (at ? `&at=${encodeURIComponent(at)}` : '');

  try {
    const res = await fetch(url);
    const data = await res.json();
    const items = (data.items ?? []).map((item: Record<string, unknown>) => ({
      title: item.title ?? '',
      address: (item.address as Record<string, unknown>)?.label ?? '',
      lat: (item.position as Record<string, number>)?.lat ?? null,
      lng: (item.position as Record<string, number>)?.lng ?? null,
      category: ((item.categories as Record<string, unknown>[]))?.[0]?.name ?? '',
    }));
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
