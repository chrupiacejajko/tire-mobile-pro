'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Truck, Fuel, Gauge, Navigation, MapPin, Clock, Zap,
  Battery, RefreshCw, Circle,
  Car, Power, Activity, TrendingUp, Eye, Route,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────
interface FleetVehicle {
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  vehicle_id: string | null;
  satis_device_id: string;
  in_database: boolean;
  driver_name: string | null;
  employee_id: string | null;
  lat: number;
  lng: number;
  location: string | null;
  heading: number | null;
  speed: number;
  rpm: number;
  engine_on: boolean;
  fuel_liters: number | null;
  fuel_percent: number | null;
  odometer_km: number | null;
  voltage: number | null;
  total_fuel_used: number | null;
  status: 'driving' | 'idle' | 'parked';
  last_update: string | null;
}

interface FleetSummary {
  total: number;
  driving: number;
  idle: number;
  parked: number;
  avg_fuel_percent: number;
}

interface FleetData {
  source: string;
  timestamp: string;
  summary: FleetSummary;
  vehicles: FleetVehicle[];
}

// ── Status config ──────────────────────────────────────────────────
const STATUS_CFG = {
  driving: { label: 'W trasie', color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: Route },
  idle:    { label: 'Na postoju', color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Power },
  parked:  { label: 'Zaparkowany', color: 'bg-gray-400', text: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', icon: Car },
} as const;

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } },
};

// ── Fuel gauge component ───────────────────────────────────────────
function FuelGauge({ percent }: { percent: number | null }) {
  if (percent == null) return <span className="text-xs text-gray-400">—</span>;
  const color = percent > 50 ? 'bg-emerald-500' : percent > 25 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-8 text-right">{percent}%</span>
    </div>
  );
}

// ── Time ago formatter ─────────────────────────────────────────────
function timeAgo(timestamp: string | null): string {
  if (!timestamp) return '—';
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 60_000) return 'teraz';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min temu`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h temu`;
  return `${Math.floor(diff / 86_400_000)}d temu`;
}

// ── Main page ──────────────────────────────────────────────────────
export default function FleetPage() {
  const [data, setData] = useState<FleetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FleetVehicle | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sseRef = useRef<EventSource | null>(null);

  const fetchFleet = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const res = await fetch('/api/fleet/live');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Fleet fetch error:', err);
    }
    setLoading(false);
  }, []);

  // SSE real-time stream
  useEffect(() => {
    if (!autoRefresh) {
      // Fallback: one-shot fetch when paused
      fetchFleet(true);
      return;
    }

    const sse = new EventSource('/api/fleet/stream');
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const vehicles: FleetVehicle[] = (payload.vehicles || []).map((v: any) => ({
          plate: v.plate,
          brand: v.brand,
          model: v.model,
          year: null,
          vehicle_id: v.vehicle_id,
          satis_device_id: '',
          in_database: !!v.vehicle_id,
          driver_name: v.driver_name,
          employee_id: null,
          lat: v.lat,
          lng: v.lng,
          location: v.location,
          heading: v.heading,
          speed: v.speed ?? 0,
          rpm: v.rpm ?? 0,
          engine_on: v.engine_on ?? false,
          fuel_liters: v.fuel_liters,
          fuel_percent: v.fuel_percent,
          odometer_km: v.odometer_km,
          voltage: v.voltage,
          total_fuel_used: v.total_fuel_used ?? null,
          status: v.status,
          last_update: v.last_update,
        }));

        const statusOrder = { driving: 0, idle: 1, parked: 2 };
        vehicles.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));

        const summary: FleetSummary = {
          total: vehicles.length,
          driving: vehicles.filter(f => f.status === 'driving').length,
          idle: vehicles.filter(f => f.status === 'idle').length,
          parked: vehicles.filter(f => f.status === 'parked').length,
          avg_fuel_percent: Math.round(
            vehicles.filter(f => f.fuel_percent != null).reduce((s, f) => s + (f.fuel_percent || 0), 0) /
            Math.max(vehicles.filter(f => f.fuel_percent != null).length, 1)
          ),
        };

        setData({ source: 'sse', timestamp: payload.timestamp, summary, vehicles });
        setLoading(false);
      } catch {}
    };

    sse.onerror = () => console.warn('[Fleet SSE] reconnecting...');

    return () => {
      sse.close();
      sseRef.current = null;
    };
  }, [autoRefresh, fetchFleet]);

  const summary = data?.summary;
  const vehicles = data?.vehicles || [];

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Flota GPS"
        subtitle="Pozycje i telemetria w czasie rzeczywistym"
        icon={<Truck className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={`h-8 rounded-xl text-xs gap-1.5 ${autoRefresh ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : ''}`}
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <Activity className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-pulse' : ''}`} />
              {autoRefresh ? 'Live' : 'Pauza'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl text-xs gap-1.5"
              onClick={() => fetchFleet(true)}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Odśwież
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {/* ── Summary KPI Cards ──────────────────────────── */}
        {summary && (
          <motion.div variants={ANIM.container} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <motion.div variants={ANIM.item}>
              <Card className="rounded-2xl border-0 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-blue-100">Flota</p>
                      <p className="text-3xl font-black">{summary.total}</p>
                      <p className="text-xs text-blue-200">pojazdów</p>
                    </div>
                    <Truck className="h-10 w-10 text-blue-200/50" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={ANIM.item}>
              <Card className="rounded-2xl border-0 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-emerald-100">W trasie</p>
                      <p className="text-3xl font-black">{summary.driving}</p>
                      <p className="text-xs text-emerald-200">jedzie teraz</p>
                    </div>
                    <Route className="h-10 w-10 text-emerald-200/50" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={ANIM.item}>
              <Card className="rounded-2xl border-0 bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-amber-100">Postój</p>
                      <p className="text-3xl font-black">{summary.idle}</p>
                      <p className="text-xs text-amber-200">silnik włączony</p>
                    </div>
                    <Power className="h-10 w-10 text-amber-200/50" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={ANIM.item}>
              <Card className="rounded-2xl border-0 bg-gradient-to-br from-gray-500 to-gray-600 text-white shadow-lg shadow-gray-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-200">Zaparkowane</p>
                      <p className="text-3xl font-black">{summary.parked}</p>
                      <p className="text-xs text-gray-300">silnik wyłączony</p>
                    </div>
                    <Car className="h-10 w-10 text-gray-300/50" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={ANIM.item}>
              <Card className="rounded-2xl border-0 bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-lg shadow-violet-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-violet-100">Śr. paliwo</p>
                      <p className="text-3xl font-black">{summary.avg_fuel_percent}%</p>
                      <p className="text-xs text-violet-200">średni poziom</p>
                    </div>
                    <Fuel className="h-10 w-10 text-violet-200/50" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}

        {/* ── Loading ────────────────────────────────────── */}
        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-3">
              <div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
              <p className="text-sm text-gray-500">Łączenie z Satis GPS API...</p>
            </div>
          </div>
        )}

        {/* ── Vehicle Cards Grid ─────────────────────────── */}
        {vehicles.length > 0 && (
          <motion.div variants={ANIM.container} initial="hidden" animate="show" className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {vehicles.map(v => {
              const cfg = STATUS_CFG[v.status];
              const StatusIcon = cfg.icon;
              const isSelected = selected?.plate === v.plate;

              return (
                <motion.div key={v.plate} variants={ANIM.item}>
                  <Card
                    className={`rounded-2xl cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
                      isSelected ? 'ring-2 ring-orange-500 shadow-lg' : 'border-gray-100'
                    }`}
                    onClick={() => setSelected(isSelected ? null : v)}
                  >
                    <CardContent className="p-4 space-y-3">
                      {/* Header: plate + status */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={`h-9 w-9 rounded-xl ${cfg.bg} ${cfg.border} border flex items-center justify-center`}>
                            <StatusIcon className={`h-4 w-4 ${cfg.text}`} />
                          </div>
                          <div>
                            <p className="text-sm font-black tracking-wide text-gray-900">{v.plate}</p>
                            <p className="text-[11px] text-gray-400">
                              {v.brand} {v.model} {v.year ? `'${String(v.year).slice(2)}` : ''}
                            </p>
                          </div>
                        </div>
                        <Badge className={`${cfg.color} text-white text-[10px] px-2 py-0.5 rounded-lg border-0`}>
                          {cfg.label}
                        </Badge>
                      </div>

                      {/* Driver */}
                      {v.driver_name && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Circle className="h-2 w-2 fill-blue-400 text-blue-400" />
                          <span>{v.driver_name}</span>
                        </div>
                      )}

                      {/* Location */}
                      <div className="flex items-start gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-600 line-clamp-1">{v.location || `${v.lat.toFixed(4)}, ${v.lng.toFixed(4)}`}</p>
                      </div>

                      {/* Telemetry grid */}
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <div className="text-center p-1.5 bg-gray-50 rounded-xl">
                          <Gauge className="h-3.5 w-3.5 mx-auto text-gray-400 mb-0.5" />
                          <p className="text-sm font-bold text-gray-900">{v.speed}</p>
                          <p className="text-[9px] text-gray-400">km/h</p>
                        </div>
                        <div className="text-center p-1.5 bg-gray-50 rounded-xl">
                          <Activity className="h-3.5 w-3.5 mx-auto text-gray-400 mb-0.5" />
                          <p className="text-sm font-bold text-gray-900">{v.rpm}</p>
                          <p className="text-[9px] text-gray-400">RPM</p>
                        </div>
                        <div className="text-center p-1.5 bg-gray-50 rounded-xl">
                          <Battery className="h-3.5 w-3.5 mx-auto text-gray-400 mb-0.5" />
                          <p className="text-sm font-bold text-gray-900">{v.voltage ? v.voltage.toFixed(1) : '—'}</p>
                          <p className="text-[9px] text-gray-400">V</p>
                        </div>
                      </div>

                      {/* Fuel bar */}
                      <div className="flex items-center gap-2">
                        <Fuel className="h-3.5 w-3.5 text-gray-400" />
                        <FuelGauge percent={v.fuel_percent} />
                        {v.fuel_liters != null && (
                          <span className="text-[10px] text-gray-400 ml-auto">{v.fuel_liters.toFixed(0)}L</span>
                        )}
                      </div>

                      {/* Footer: odometer + timestamp */}
                      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                          <TrendingUp className="h-3 w-3" />
                          {v.odometer_km ? `${(v.odometer_km).toLocaleString('pl')} km` : '—'}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                          <Clock className="h-3 w-3" />
                          {timeAgo(v.last_update)}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-2 border-t border-gray-100 space-y-2">
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex items-center gap-1.5 text-gray-500">
                                  <Zap className="h-3 w-3" />
                                  Silnik: <strong className={v.engine_on ? 'text-emerald-600' : 'text-gray-400'}>{v.engine_on ? 'ON' : 'OFF'}</strong>
                                </div>
                                <div className="flex items-center gap-1.5 text-gray-500">
                                  <Navigation className="h-3 w-3" />
                                  Kierunek: <strong>{v.heading != null ? `${v.heading}°` : '—'}</strong>
                                </div>
                                {v.total_fuel_used != null && (
                                  <div className="flex items-center gap-1.5 text-gray-500 col-span-2">
                                    <Fuel className="h-3 w-3" />
                                    Spalono łącznie: <strong>{v.total_fuel_used.toFixed(0)}L</strong>
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 h-7 text-[10px] rounded-lg"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(`https://www.google.com/maps?q=${v.lat},${v.lng}`, '_blank');
                                  }}
                                >
                                  <Eye className="h-3 w-3 mr-1" /> Google Maps
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 h-7 text-[10px] rounded-lg"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(`/gps-history?plate=${v.plate}`, '_self');
                                  }}
                                >
                                  <Route className="h-3 w-3 mr-1" /> Historia GPS
                                </Button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* ── Last update footer ─────────────────────────── */}
        {data && (
          <div className="text-center text-[11px] text-gray-400 pt-2">
            Źródło: Satis GPS REST API · Ostatnia aktualizacja: {new Date(data.timestamp).toLocaleTimeString('pl')}
            {autoRefresh && <span className="ml-2">· Auto-odświeżanie co 60s</span>}
          </div>
        )}
      </div>
    </div>
  );
}
