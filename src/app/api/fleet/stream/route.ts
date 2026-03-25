import { NextRequest } from 'next/server';
import { pollSatisGPS } from '@/lib/satisgps/poller';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/fleet/stream
 *
 * Server-Sent Events (SSE) endpoint for real-time fleet tracking.
 * Polls Satis GPS API every 5 seconds and pushes updates to the browser.
 *
 * The browser receives a stream of JSON events:
 *   data: { "vehicles": [...], "timestamp": "..." }
 *
 * Connection stays open until the client disconnects.
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  // Pre-load vehicle info + driver assignments (refreshed every 5 min)
  let vehicleCache: Map<string, any> = new Map();
  let driverCache: Map<string, string | null> = new Map();
  let cacheAge = 0;

  async function refreshCaches() {
    const supabase = getAdminClient();
    const [vRes, aRes] = await Promise.all([
      supabase.from('vehicles').select('id, plate_number, brand, model, year, satis_device_id').eq('is_active', true),
      supabase.from('vehicle_assignments').select('vehicle_id, employee:employees(user:profiles(full_name))').eq('is_active', true),
    ]);
    vehicleCache = new Map((vRes.data || []).map(v => [v.plate_number, v]));
    driverCache = new Map((aRes.data || []).map((a: any) => [a.vehicle_id, a.employee?.user?.full_name ?? null]));
    cacheAge = Date.now();
  }

  const stream = new ReadableStream({
    async start(controller) {
      let running = true;

      // Listen for client disconnect
      request.signal.addEventListener('abort', () => {
        running = false;
      });

      // Initial cache load
      await refreshCaches();

      // Send initial comment to establish connection
      controller.enqueue(encoder.encode(': connected\n\n'));

      while (running) {
        try {
          // Refresh DB caches every 5 minutes
          if (Date.now() - cacheAge > 5 * 60_000) {
            await refreshCaches();
          }

          // Poll Satis GPS API
          const result = await pollSatisGPS();

          if (result.ok) {
            const vehicles = result.vehicles.map(v => {
              const dbVehicle = vehicleCache.get(v.plate);
              const driverName = dbVehicle ? driverCache.get(dbVehicle.id) : null;
              const speed = v.speed ?? 0;
              const engineOn = v.ignitionOn ?? false;

              return {
                plate: v.plate,
                brand: dbVehicle?.brand || null,
                model: dbVehicle?.model || null,
                vehicle_id: dbVehicle?.id || null,
                driver_name: driverName || null,
                lat: v.lat,
                lng: v.lng,
                location: v.location,
                heading: v.direction ? parseInt(v.direction, 10) || null : null,
                speed,
                rpm: v.rpm ?? 0,
                engine_on: engineOn,
                fuel_liters: v.fuel,
                fuel_percent: v.fuelPercent,
                odometer_km: v.odometer,
                voltage: v.voltage,
                status: engineOn ? (speed > 5 ? 'driving' : 'idle') : 'parked',
                last_update: v.timestamp,
              };
            });

            const payload = JSON.stringify({
              vehicles,
              timestamp: new Date().toISOString(),
              count: vehicles.length,
            });

            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }
        } catch (err) {
          // Don't crash on individual poll errors — just skip
          console.error('[SSE] Poll error:', err);
        }

        // Wait 5 seconds before next poll
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 5_000);
          request.signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
