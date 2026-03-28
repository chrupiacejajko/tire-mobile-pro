import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { verifyHmacSha256HexSignature } from '@/lib/security/webhook-auth';

/**
 * POST /api/satisgps/webhook
 *
 * Receives vehicle position data pushed by SatisGPS webhook.
 * Accepts any JSON format — we normalize to our employee_locations table.
 *
 * Expected formats (will auto-detect):
 *
 * A) Array of vehicles:
 *    [{ "plate": "PY4836H", "lat": 52.37, "lng": 17.0, "speed": 45, ... }, ...]
 *
 * B) Single vehicle:
 *    { "plate": "PY4836H", "lat": 52.37, "lng": 17.0, "speed": 45, ... }
 *
 * C) Wrapped:
 *    { "vehicles": [...], "timestamp": "..." }
 *    { "data": [...] }
 *
 * Common field names we look for (case-insensitive):
 *   lat/latitude, lng/lon/longitude, speed/velocity,
 *   plate/plate_number/registration, direction/heading/course,
 *   rpm, timestamp/time/date, address/location
 */

interface NormalizedPosition {
  plate: string;
  lat: number;
  lng: number;
  speed: number | null;
  direction: string | null;
  rpm: number | null;
  location_address: string | null;
  timestamp: string;
}

function extractField(obj: any, ...keys: string[]): any {
  for (const key of keys) {
    const lower = key.toLowerCase();
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === lower && obj[k] != null) return obj[k];
    }
  }
  return null;
}

function degToDirection(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function normalizeVehicle(raw: any): NormalizedPosition | null {
  const plate = extractField(raw, 'plate', 'plate_number', 'registration', 'plateNumber', 'vehiclePlate', 'name');
  const lat = parseFloat(extractField(raw, 'lat', 'latitude', 'Lat', 'Latitude'));
  const lng = parseFloat(extractField(raw, 'lng', 'lon', 'longitude', 'Lng', 'Lon', 'Longitude'));

  if (!plate || isNaN(lat) || isNaN(lng)) return null;

  const speed = parseFloat(extractField(raw, 'speed', 'velocity', 'Speed', 'Velocity'));
  const rawDir = extractField(raw, 'direction', 'heading', 'course', 'Direction', 'Heading', 'Course');
  let direction: string | null = null;
  if (typeof rawDir === 'string' && rawDir.length <= 3) {
    direction = rawDir;
  } else if (typeof rawDir === 'number') {
    direction = degToDirection(rawDir);
  }

  const rpm = parseFloat(extractField(raw, 'rpm', 'RPM', 'engineRpm'));
  const address = extractField(raw, 'address', 'location', 'location_address', 'Address', 'Location');
  const ts = extractField(raw, 'timestamp', 'time', 'date', 'Timestamp', 'Time', 'DateTime', 'gpsTime');

  return {
    plate: String(plate).toUpperCase().replace(/\s/g, ''),
    lat,
    lng,
    speed: isNaN(speed) ? null : Math.round(speed),
    direction,
    rpm: isNaN(rpm) ? null : Math.round(rpm),
    location_address: address ? String(address) : null,
    timestamp: ts ? new Date(ts).toISOString() : new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.SATISGPS_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error('[satisgps/webhook] SATISGPS_WEBHOOK_SECRET env var not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  const providedSignature =
    request.headers.get('x-satisgps-signature') ??
    request.headers.get('x-webhook-signature');

  const validSignature = await verifyHmacSha256HexSignature(
    rawBody,
    providedSignature,
    expectedSecret,
  );

  if (!validSignature) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'INVALID_SATISGPS_SIGNATURE' },
      { status: 403 },
    );
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Extract array of vehicles from various formats
  let rawVehicles: any[];
  if (Array.isArray(body)) {
    rawVehicles = body;
  } else if (Array.isArray(body?.vehicles)) {
    rawVehicles = body.vehicles;
  } else if (Array.isArray(body?.data)) {
    rawVehicles = body.data;
  } else if (body?.plate || body?.lat || body?.plate_number) {
    rawVehicles = [body];
  } else {
    // Try to find any array in the body
    const firstArray = Object.values(body).find(v => Array.isArray(v)) as any[] | undefined;
    rawVehicles = firstArray ?? [body];
  }

  const normalized = rawVehicles.map(normalizeVehicle).filter(Boolean) as NormalizedPosition[];

  if (normalized.length === 0) {
    return NextResponse.json({ error: 'No valid vehicle positions found', received_keys: Object.keys(body) }, { status: 422 });
  }

  // Map plates to vehicle_id and employee_id
  const supabase = getAdminClient();
  const plates = normalized.map(v => v.plate);

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, plate_number')
    .in('plate_number', plates);

  const { data: assignments } = await supabase
    .from('vehicle_assignments')
    .select('vehicle_id, employee_id')
    .eq('is_active', true);

  const plateToVehicle = new Map((vehicles ?? []).map(v => [v.plate_number.toUpperCase().replace(/\s/g, ''), v.id]));
  const vehicleToEmployee = new Map((assignments ?? []).map(a => [a.vehicle_id, a.employee_id]));

  // Determine status from speed
  function getStatus(speed: number | null): string {
    if (speed === null) return 'online';
    if (speed > 3) return 'driving';
    return 'online';
  }

  // Insert into employee_locations
  const rows = normalized.map(v => {
    const vehicleId = plateToVehicle.get(v.plate);
    const employeeId = vehicleId ? vehicleToEmployee.get(vehicleId) : null;
    return {
      employee_id: employeeId,
      vehicle_id: vehicleId ?? null,
      lat: v.lat,
      lng: v.lng,
      speed: v.speed,
      direction: v.direction,
      rpm: v.rpm,
      status: getStatus(v.speed),
      location_address: v.location_address,
      timestamp: v.timestamp,
    };
  }).filter(r => r.employee_id); // Only insert if we can map to an employee

  let inserted = 0;
  if (rows.length > 0) {
    const { error } = await supabase.from('employee_locations').insert(rows);
    if (!error) inserted = rows.length;
    else console.error('[SatisGPS Webhook] Insert error:', error.message);
  }

  console.log(`[SatisGPS Webhook] Received ${normalized.length} vehicles, inserted ${inserted} positions`);

  return NextResponse.json({
    ok: true,
    received: normalized.length,
    inserted,
    unmatched: normalized.length - inserted,
    plates: normalized.map(v => v.plate),
  });
}
