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

    console.log('[SatisGPS] Starting automatic polling every 30 seconds...');

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
          const speed = vehicle.speed; // keep null if unknown
          const status = speed !== null && speed > 5 ? 'driving'
                       : speed !== null && speed <= 5 ? 'parking'
                       : 'online'; // null speed = GPS fix but no speed data

          // Normalize plate: uppercase, strip spaces/dashes for matching
          const plateParts = [
            vehicle.plate,
            vehicle.plate.replace(/\s+/g, ''),
            vehicle.plate.toUpperCase(),
            vehicle.plate.toUpperCase().replace(/\s+/g, ''),
          ];

          let dbVehicle: { id: string } | null = null;
          for (const plate of [...new Set(plateParts)]) {
            const { data } = await supabase
              .from('vehicles')
              .select('id')
              .or(`plate_number.eq.${plate},satis_device_id.eq.${vehicle.satisId}`)
              .single();
            if (data) { dbVehicle = data; break; }
          }

          if (!dbVehicle) {
            console.warn(`[SatisGPS] Vehicle not found in DB: plate="${vehicle.plate}" satisId="${vehicle.satisId}"`);
            continue;
          }

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
            speed: vehicle.speed ?? null,
            direction: vehicle.direction ?? null,
            rpm: vehicle.rpm ?? null,
            driving_time: vehicle.drivingTime ?? null,
            location_address: vehicle.location ?? null,
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

    // Then every 30 seconds (matching Satis GPS refresh rate)
    setInterval(runPoll, 30_000);
  }
}
