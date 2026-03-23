/**
 * Next.js Instrumentation — runs once when the server starts
 * Sets up background Satis GPS polling every 60 seconds
 *
 * Railway runs this as a persistent Node.js process (not serverless),
 * so setInterval works reliably 24/7.
 */

export async function register() {
  // Only run in Node.js runtime (not Edge), only on server start
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const hasCookie = !!process.env.SATISGPS_COOKIE;
    const hasUrl = !!process.env.SATISGPS_URL;

    if (!hasCookie || !hasUrl) {
      console.log('[SatisGPS] Polling disabled — set SATISGPS_COOKIE and SATISGPS_URL env vars');
      return;
    }

    console.log('[SatisGPS] Starting automatic polling every 60 seconds...');

    // Small delay on startup to let the app fully initialize
    await new Promise((resolve) => setTimeout(resolve, 10_000));

    const runPoll = async () => {
      try {
        const { pollSatisGPS } = await import('./lib/satisgps/poller');
        const { getAdminClient } = await import('./lib/supabase/admin');

        const result = await pollSatisGPS();

        if (!result.ok) {
          console.warn(`[SatisGPS] Poll failed: ${result.error}`);
          if (result.sessionExpired) {
            console.warn('[SatisGPS] Session expired! Update SATISGPS_COOKIE in Railway env vars.');
          }
          return;
        }

        const supabase = getAdminClient();
        let stored = 0;

        for (const vehicle of result.vehicles) {
          const speed = vehicle.speed ?? 0;
          const status = speed > 5 ? 'driving' : speed === 0 ? 'working' : 'online';

          const { data: dbVehicle } = await supabase
            .from('vehicles')
            .select('id')
            .or(`plate_number.eq.${vehicle.plate},satis_device_id.eq.${vehicle.satisId}`)
            .single();

          if (!dbVehicle) continue;

          const { data: assignment } = await supabase
            .from('vehicle_assignments')
            .select('employee_id')
            .eq('vehicle_id', dbVehicle.id)
            .eq('is_active', true)
            .single();

          const { error } = await supabase.from('employee_locations').insert({
            employee_id: assignment?.employee_id ?? null,
            vehicle_id: dbVehicle.id,
            lat: vehicle.lat,
            lng: vehicle.lng,
            status,
            speed: vehicle.speed ?? 0,
            direction: vehicle.direction ?? null,
            rpm: vehicle.rpm ?? null,
            driving_time: vehicle.drivingTime ?? null,
            timestamp: new Date().toISOString(),
          });

          if (!error) stored++;
        }

        console.log(`[SatisGPS] ✓ ${result.vehicles.length} vehicles polled, ${stored} locations stored`);
      } catch (err) {
        console.error('[SatisGPS] Poll error:', err);
      }
    };

    // First poll immediately
    runPoll();

    // Then every 60 seconds
    setInterval(runPoll, 60_000);
  }
}
