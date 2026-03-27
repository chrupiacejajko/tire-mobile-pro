'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  X, Clock, MapPin, User, Loader2, Briefcase,
  ArrowRight, Calendar, Route,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { haversineKm, etaMinutes } from '@/lib/geo';

/* ─── Constants ──────────────────────────────────────────────────────── */
const SEARCH_RADIUS_KM = 50;

/* ─── Types ──────────────────────────────────────────────────────────── */
interface ServiceOption {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  category: string;
}

interface ScheduledStop {
  order_id: string;
  sequence: number;
  client_name: string;
  address: string;
  lat: number;
  lng: number;
  arrival_time: string;
  service_start: string;
  departure_time: string;
  departure_minutes: number;
  service_duration_minutes: number;
  travel_minutes: number;
}

interface PlannerRoute {
  employee_id: string;
  employee_name: string;
  plate: string | null;
  schedule: ScheduledStop[];
  total_orders: number;
  total_km: number;
  current_position: { lat: number; lng: number } | null;
  start_time: string;
}

interface AvailableSlot {
  employee_id: string;
  employee_name: string;
  plate: string | null;
  insert_after_index: number; // -1 = before first stop, N = after stop N
  slot_start_time: string; // HH:MM when the new order would start
  travel_to_minutes: number; // travel time from previous stop to new address
  travel_from_minutes: number; // travel time from new address to next stop
  extra_travel_minutes: number; // total extra travel added
  total_orders: number;
  distance_from_prev_km: number;
  prev_stop_name: string;
  next_stop_name: string | null;
}

interface AddressPin {
  lat: number;
  lng: number;
  label: string;
}

interface GpsPosition {
  lat: number;
  lng: number;
}

interface OrderInsertSidebarProps {
  pin: AddressPin;
  date: string; // YYYY-MM-DD
  /** Real-time GPS positions keyed by employee_id — used instead of planner positions */
  livePositions?: Map<string, GpsPosition>;
  onClose: () => void;
  onSelectSlot: (slot: {
    employee_id: string;
    employee_name: string;
    planned_start_time: string;
    service_id: string;
    service_name: string;
    service_duration: number;
    pin: AddressPin;
  }) => void;
  /** Set of employee_ids with available slots, used by parent to filter map pins */
  onAvailableWorkersChange?: (workerIds: Set<string>) => void;
  /** When true, renders without outer positioned wrapper (for embedding in a parent sidebar) */
  embedded?: boolean;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const WORK_DAY_END_MINUTES = 24 * 60; // 24:00 — business runs 24/7

/* ─── Component ──────────────────────────────────────────────────────── */
export function OrderInsertSidebar({
  pin,
  date: initialDate,
  livePositions,
  onClose,
  onSelectSlot,
  onAvailableWorkersChange,
  embedded = false,
}: OrderInsertSidebarProps) {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [timeMode, setTimeMode] = useState<'now' | 'custom'>('now');
  const [customTime, setCustomTime] = useState('09:00');

  // Load services on mount
  useEffect(() => {
    const loadServices = async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data } = await supabase
          .from('services')
          .select('id, name, duration_minutes, price, category')
          .eq('is_active', true)
          .order('category, name');
        if (data) setServices(data as ServiceOption[]);
      } catch {
        setError('Nie udalo sie zaladowac uslug');
      }
      setLoadingServices(false);
    };
    loadServices();
  }, []);

  const selectedService = useMemo(
    () => services.find(s => s.id === selectedServiceId) ?? null,
    [services, selectedServiceId],
  );

  // Find available slots when service is selected
  useEffect(() => {
    if (!selectedServiceId || !selectedService) {
      setSlots([]);
      onAvailableWorkersChange?.(new Set());
      return;
    }

    const findSlots = async () => {
      setLoadingSlots(true);
      setError('');
      try {
        // Fetch planner routes and work schedules in parallel
        const [plannerRes, schedulesRes] = await Promise.all([
          fetch(`/api/planner?date=${selectedDate}`),
          (async () => {
            const { createClient } = await import('@/lib/supabase/client');
            const supabase = createClient();
            const { data } = await supabase
              .from('work_schedules')
              .select('employee_id, start_at, duration_minutes, end_at')
              .lte('start_at', `${selectedDate}T23:59:59`)
              .gte('end_at', `${selectedDate}T00:00:00`);
            return data ?? [];
          })(),
        ]);

        if (!plannerRes.ok) throw new Error('Blad planner API');
        const plannerData = await plannerRes.json();
        const routes: PlannerRoute[] = plannerData.routes ?? [];
        const schedules = schedulesRes as { employee_id: string; start_at: string; end_at: string; duration_minutes: number }[];
        const serviceDuration = selectedService.duration_minutes;
        const foundSlots: AvailableSlot[] = [];

        // Build a map of employee shifts for this date
        const shiftMap = new Map<string, { startMin: number; endMin: number }>();
        const _now = new Date();
        const realNowMinutes = _now.getHours() * 60 + _now.getMinutes();
        // If custom time is set, use that as the "now" reference
        const nowMinutes = timeMode === 'custom' ? parseTimeToMinutes(customTime) : realNowMinutes;
        const _tn = new Date();
        const isSearchingToday = selectedDate === `${_tn.getFullYear()}-${String(_tn.getMonth()+1).padStart(2,'0')}-${String(_tn.getDate()).padStart(2,'0')}`;

        for (const ws of schedules) {
          const shiftStart = new Date(ws.start_at);
          const shiftEnd = new Date(ws.end_at);
          // Get local hours/minutes for start and end
          // If shift started before today, treat it as starting at 00:00
          const [sy, sm, sd] = selectedDate.split('-').map(Number);
          const dayStartLocal = new Date(sy, sm - 1, sd, 0, 0, 0);
          const dayEndLocal = new Date(sy, sm - 1, sd, 23, 59, 59);

          const effectiveStart = shiftStart < dayStartLocal ? dayStartLocal : shiftStart;
          const effectiveEnd = shiftEnd > dayEndLocal ? dayEndLocal : shiftEnd;

          const startMin = effectiveStart.getHours() * 60 + effectiveStart.getMinutes();
          const endMin = effectiveEnd.getHours() * 60 + effectiveEnd.getMinutes();
          // If shift covers midnight and ends tomorrow, endMin = 24*60
          const finalEndMin = shiftEnd > dayEndLocal ? 24 * 60 : endMin;

          const existing = shiftMap.get(ws.employee_id);
          if (!existing || startMin < existing.startMin) {
            shiftMap.set(ws.employee_id, { startMin, endMin: finalEndMin });
          }
        }

        for (const route of routes) {
          const schedule = route.schedule ?? [];

          // Determine earliest available time for this worker
          const shift = shiftMap.get(route.employee_id);
          let earliestMinutes: number;
          let latestMinutes: number;

          if (shift) {
            // Worker has a shift — they're available from shift start
            // In 'now' mode: earliest = max(shift start, current time)
            // In 'custom' mode: earliest = max(shift start, custom time) — we search from the requested time
            const searchFrom = (isSearchingToday || timeMode === 'custom') ? Math.max(shift.startMin, nowMinutes) : shift.startMin;
            earliestMinutes = searchFrom;
            latestMinutes = shift.endMin;
          } else {
            // No shift = worker is NOT available, skip
            continue;
          }

          // If worker's shift already ended or search time is past shift end, skip
          if (earliestMinutes >= latestMinutes) continue;

          // Prefer real-time GPS position over planner position
          const gps = livePositions?.get(route.employee_id);
          const startLat = gps?.lat ?? route.current_position?.lat;
          const startLng = gps?.lng ?? route.current_position?.lng;
          if (startLat == null || startLng == null) continue;

          // Check if worker's GPS position is within search radius
          const workerDistKm = haversineKm(startLat, startLng, pin.lat, pin.lng);
          if (workerDistKm > SEARCH_RADIUS_KM) continue;

          if (schedule.length === 0) {
            // Empty schedule - worker is free from earliest available
            const travelMin = etaMinutes(workerDistKm);
            const startTime = earliestMinutes + travelMin;
            if (startTime + serviceDuration > latestMinutes) continue;

            foundSlots.push({
              employee_id: route.employee_id,
              employee_name: route.employee_name,
              plate: route.plate,
              insert_after_index: -1,
              slot_start_time: minutesToTime(startTime),
              travel_to_minutes: travelMin,
              travel_from_minutes: 0,
              extra_travel_minutes: travelMin,
              total_orders: route.total_orders,
              distance_from_prev_km: Math.round(workerDistKm * 10) / 10,
              prev_stop_name: 'Start',
              next_stop_name: null,
            });
            continue;
          }

          // Try inserting BEFORE the first stop
          {
            const firstStop = schedule[0];
            const distToNew = haversineKm(startLat, startLng, pin.lat, pin.lng);
            const travelToNew = etaMinutes(distToNew);
            const distFromNew = haversineKm(pin.lat, pin.lng, firstStop.lat, firstStop.lng);
            const travelFromNew = etaMinutes(distFromNew);
            const originalTravel = firstStop.travel_minutes;
            const extraTravel = travelToNew + travelFromNew - originalTravel;

            const newStartMinutes = earliestMinutes + travelToNew;
            const newEndMinutes = newStartMinutes + serviceDuration + travelFromNew;
            const firstStopStartMinutes = parseTimeToMinutes(firstStop.service_start || firstStop.arrival_time);

            // New order must finish + travel to first stop BEFORE first stop starts
            if (newEndMinutes <= firstStopStartMinutes) {
              foundSlots.push({
                employee_id: route.employee_id,
                employee_name: route.employee_name,
                plate: route.plate,
                insert_after_index: -1,
                slot_start_time: minutesToTime(newStartMinutes),
                travel_to_minutes: travelToNew,
                travel_from_minutes: travelFromNew,
                extra_travel_minutes: Math.max(0, extraTravel),
                total_orders: route.total_orders,
                distance_from_prev_km: Math.round(distToNew * 10) / 10,
                prev_stop_name: 'Start',
                next_stop_name: firstStop.client_name,
              });
            }
          }

          // Try inserting BETWEEN consecutive stops
          for (let i = 0; i < schedule.length - 1; i++) {
            const prevStop = schedule[i];
            const nextStop = schedule[i + 1];

            // Distance from previous stop to new address
            const distToNew = haversineKm(prevStop.lat, prevStop.lng, pin.lat, pin.lng);
            const travelToNew = etaMinutes(distToNew);
            const distFromNew = haversineKm(pin.lat, pin.lng, nextStop.lat, nextStop.lng);
            const travelFromNew = etaMinutes(distFromNew);
            const originalTravel = nextStop.travel_minutes;
            const extraTravel = travelToNew + travelFromNew - originalTravel;

            // Absolute times: prev stop finishes, next stop must start
            const prevDeparture = prevStop.departure_minutes;
            const nextStopStart = parseTimeToMinutes(nextStop.service_start || nextStop.arrival_time);

            // Check: travel from prev → new address + service + travel to next ≤ gap
            const newStartMinutes = prevDeparture + travelToNew;
            const newEndMinutes = newStartMinutes + serviceDuration + travelFromNew;
            if (newEndMinutes <= nextStopStart) {

              foundSlots.push({
                employee_id: route.employee_id,
                employee_name: route.employee_name,
                plate: route.plate,
                insert_after_index: i,
                slot_start_time: minutesToTime(newStartMinutes),
                travel_to_minutes: travelToNew,
                travel_from_minutes: travelFromNew,
                extra_travel_minutes: Math.max(0, extraTravel),
                total_orders: route.total_orders,
                distance_from_prev_km: Math.round(distToNew * 10) / 10,
                prev_stop_name: prevStop.client_name,
                next_stop_name: nextStop.client_name,
              });
            }
          }

          // Try APPENDING after the last stop
          {
            const lastStop = schedule[schedule.length - 1];
            const distToNew = haversineKm(lastStop.lat, lastStop.lng, pin.lat, pin.lng);
            const travelToNew = etaMinutes(distToNew);
            const newStartMinutes = lastStop.departure_minutes + travelToNew;

            if (newStartMinutes + serviceDuration <= latestMinutes) {
              foundSlots.push({
                employee_id: route.employee_id,
                employee_name: route.employee_name,
                plate: route.plate,
                insert_after_index: schedule.length - 1,
                slot_start_time: minutesToTime(newStartMinutes),
                travel_to_minutes: travelToNew,
                travel_from_minutes: 0,
                extra_travel_minutes: travelToNew,
                total_orders: route.total_orders,
                distance_from_prev_km: Math.round(distToNew * 10) / 10,
                prev_stop_name: lastStop.client_name,
                next_stop_name: null,
              });
            }
          }
        }

        // Filter out past slots if searching for today
        const _n = new Date();
        const todayStr = `${_n.getFullYear()}-${String(_n.getMonth()+1).padStart(2,'0')}-${String(_n.getDate()).padStart(2,'0')}`;
        if (selectedDate === todayStr) {
          const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
          // Remove slots that would start in the past (with 15min grace)
          const filtered = foundSlots.filter(s => parseTimeToMinutes(s.slot_start_time) >= nowMin - 15);
          foundSlots.length = 0;
          foundSlots.push(...filtered);
        }

        // Sort: earliest time first, then by least extra travel
        foundSlots.sort((a, b) => {
          const timeA = parseTimeToMinutes(a.slot_start_time);
          const timeB = parseTimeToMinutes(b.slot_start_time);
          if (timeA !== timeB) return timeA - timeB;
          return a.extra_travel_minutes - b.extra_travel_minutes;
        });

        // Deduplicate: keep only the best slot per worker
        const bestPerWorker = new Map<string, AvailableSlot>();
        for (const slot of foundSlots) {
          if (!bestPerWorker.has(slot.employee_id)) {
            bestPerWorker.set(slot.employee_id, slot);
          }
        }
        const deduped = Array.from(bestPerWorker.values());

        // Re-sort deduped: soonest start, then least extra travel
        deduped.sort((a, b) => {
          const timeA = parseTimeToMinutes(a.slot_start_time);
          const timeB = parseTimeToMinutes(b.slot_start_time);
          if (timeA !== timeB) return timeA - timeB;
          return a.extra_travel_minutes - b.extra_travel_minutes;
        });

        setSlots(deduped);

        // Notify parent of which workers have slots
        const workerIds = new Set(deduped.map(s => s.employee_id));
        onAvailableWorkersChange?.(workerIds);
      } catch (e) {
        console.error('[OrderInsertSidebar] findSlots error:', e);
        setError('Blad podczas szukania wolnych terminow');
      }
      setLoadingSlots(false);
    };

    findSlots();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServiceId, selectedService, selectedDate, pin.lat, pin.lng, timeMode, customTime]);

  const handleSelectSlot = (slot: AvailableSlot) => {
    if (!selectedService) return;
    onSelectSlot({
      employee_id: slot.employee_id,
      employee_name: slot.employee_name,
      planned_start_time: slot.slot_start_time,
      service_id: selectedService.id,
      service_name: selectedService.name,
      service_duration: selectedService.duration_minutes,
      pin,
    });
  };

  const innerContent = (
    <>
      {/* Date/time controls */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 font-medium"
          />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTimeMode('now')}
              className={cn(
                'text-[11px] px-2 py-0.5 rounded font-medium transition-colors',
                timeMode === 'now'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              )}
            >
              Teraz
            </button>
            <button
              onClick={() => setTimeMode('custom')}
              className={cn(
                'text-[11px] px-2 py-0.5 rounded font-medium transition-colors',
                timeMode === 'custom'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              )}
            >
              Na godz.
            </button>
            {timeMode === 'custom' && (
              <input
                type="time"
                value={customTime}
                onChange={e => setCustomTime(e.target.value)}
                className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 font-medium w-[70px]"
              />
            )}
          </div>
          <span className="text-[11px] text-gray-400">Promien {SEARCH_RADIUS_KM} km</span>
        </div>
      </div>

      {/* Service selector */}
      <div className="px-4 py-3 border-b border-gray-100">
        <label className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">
          Rodzaj uslugi
        </label>
        {loadingServices ? (
          <div className="flex items-center gap-2 py-2 text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Ladowanie uslug...</span>
          </div>
        ) : (
          <select
            value={selectedServiceId}
            onChange={e => setSelectedServiceId(e.target.value)}
            className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239CA3AF' d='M3 4.5L6 7.5L9 4.5'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center',
            }}
          >
            <option value="">Wybierz usluge...</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.duration_minutes} min)
              </option>
            ))}
          </select>
        )}
        {selectedService && (
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {selectedService.duration_minutes} min
            </span>
            <span className="flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              {selectedService.price?.toFixed(0) ?? '?'} zl
            </span>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!selectedServiceId ? (
          <div className="text-center py-12 px-4">
            <Briefcase className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Wybierz usluge, aby wyszukac dostepne terminy</p>
          </div>
        ) : loadingSlots ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            <p className="text-sm text-gray-500">Szukam wolnych terminow...</p>
            <p className="text-xs text-gray-400">Analizuje harmonogramy pracownikow</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 px-4">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : slots.length === 0 ? (
          <div className="text-center py-12 px-4">
            <User className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-medium">Brak wolnych terminow</p>
            <p className="text-xs text-gray-400 mt-1">
              Zaden pracownik nie ma wolnego okna w promieniu {SEARCH_RADIUS_KM} km
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 px-1">
              {slots.length} dostepn{slots.length === 1 ? 'y' : slots.length < 5 ? 'e' : 'ych'} termin{slots.length === 1 ? '' : slots.length < 5 ? 'y' : 'ow'}
            </p>
            {slots.map((slot, i) => (
              <div
                key={`${slot.employee_id}-${slot.insert_after_index}`}
                className={cn(
                  'border rounded-xl p-3 transition-all hover:shadow-sm cursor-pointer group',
                  i === 0
                    ? 'border-orange-200 bg-orange-50/50 hover:border-orange-300'
                    : 'border-gray-100 bg-white hover:bg-gray-50 hover:border-gray-200',
                )}
                onClick={() => handleSelectSlot(slot)}
              >
                {/* Worker info */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {slot.employee_name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 leading-tight">{slot.employee_name}</p>
                      {slot.plate && <p className="text-[10px] text-gray-400 font-mono">{slot.plate}</p>}
                    </div>
                  </div>
                  {i === 0 && (
                    <Badge className="bg-orange-100 text-orange-700 border-0 text-[10px] px-1.5">
                      Najlepszy
                    </Badge>
                  )}
                </div>

                {/* Slot details */}
                <div className="space-y-1.5 ml-9">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3 text-orange-500" />
                    <span className="text-sm font-bold text-orange-600">{slot.slot_start_time}</span>
                    <span className="text-[11px] text-gray-400">
                      ({selectedService?.duration_minutes} min)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    <Route className="h-3 w-3 flex-shrink-0" />
                    <span>
                      {slot.prev_stop_name}
                      <ArrowRight className="h-2.5 w-2.5 inline mx-0.5 text-gray-400" />
                      <span className="font-medium text-orange-600">nowe</span>
                      {slot.next_stop_name && (
                        <>
                          <ArrowRight className="h-2.5 w-2.5 inline mx-0.5 text-gray-400" />
                          {slot.next_stop_name}
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-blue-600 font-semibold">
                      {slot.distance_from_prev_km} km
                    </span>
                    <span className="text-gray-500">
                      ~{slot.travel_to_minutes} min dojazdu
                    </span>
                    {slot.extra_travel_minutes > 0 && (
                      <span className="text-amber-600">
                        +{slot.extra_travel_minutes} min trasy
                      </span>
                    )}
                    <span className="text-gray-400">
                      {slot.total_orders} zlecen
                    </span>
                  </div>
                </div>

                {/* Action button */}
                <div className="mt-2.5 ml-9">
                  <Button
                    size="sm"
                    className="h-7 text-xs rounded-lg bg-orange-500 hover:bg-orange-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectSlot(slot);
                    }}
                  >
                    <ArrowRight className="h-3 w-3 mr-1" />
                    Dodaj zlecenie
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {slots.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
          <p className="text-[10px] text-gray-400 text-center">
            Kliknij pracownika, aby utworzyc zlecenie z wypelnionym terminem
          </p>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="flex flex-col flex-1 overflow-hidden">{innerContent}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: 'spring', damping: 26, stiffness: 280 }}
      className="absolute top-4 right-4 bottom-4 w-[340px] z-[1000] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
    >
      {/* Header (standalone mode only) */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-orange-500" />
              Znajdz termin
            </h2>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 flex-shrink-0 text-red-500" />
              {pin.label}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {innerContent}
    </motion.div>
  );
}
