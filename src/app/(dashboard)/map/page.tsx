'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MapPin, Navigation, RefreshCw, X, Gauge, Compass,
  Clock, Truck, User, Search, ExternalLink, History,
  Zap, Activity,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

// Dynamic imports for Leaflet (SSR disabled)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });

import 'leaflet/dist/leaflet.css';

interface VehicleData {
  id: string;
  plate_number: string;
  brand: string;
  model: string;
  year: number | null;
  satis_device_id: string | null;
  lat: number | null;
  lng: number | null;
  status: 'driving' | 'working' | 'online' | 'offline';
  speed: number | null;
  direction: string | null;
  rpm: number | null;
  driving_time: string | null;
  location_address: string | null;
  last_update: string | null;
  driver_name: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  driving: '#3B82F6',
  working: '#F59E0B',
  online: '#10B981',
  offline: '#6B7280',
};

const STATUS_LABELS: Record<string, string> = {
  driving: 'Jedzie',
  working: 'Postój',
  online: 'Online',
  offline: 'Offline',
};

const STATUS_BG: Record<string, string> = {
  driving: 'bg-blue-500',
  working: 'bg-amber-500',
  online: 'bg-emerald-500',
  offline: 'bg-gray-400',
};

// Direction to degrees for compass needle
const DIRECTION_DEG: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

function formatLastUpdate(timestamp: string | null): string {
  if (!timestamp) return 'brak danych';
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'przed chwilą';
  if (diffMin === 1) return '1 min temu';
  if (diffMin < 60) return `${diffMin} min temu`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH === 1) return '1 godz. temu';
  if (diffH < 24) return `${diffH} godz. temu`;
  return then.toLocaleDateString('pl-PL');
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return 'brak';
  return new Date(timestamp).toLocaleString('pl-PL', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

// SVG Speedometer gauge
function Speedometer({ speed, maxSpeed = 160, color }: { speed: number | null; maxSpeed?: number; color: string }) {
  const val = Math.min(speed ?? 0, maxSpeed);
  const pct = val / maxSpeed;
  // Arc from -225deg to 45deg (270 degree sweep)
  const r = 52;
  const cx = 60;
  const cy = 65;
  const startAngle = -225;
  const endAngle = 45;
  const sweep = endAngle - startAngle; // 270 degrees
  const angle = startAngle + sweep * pct;

  function polarToXY(angleDeg: number, radius: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function describeArc(startDeg: number, endDeg: number, radius: number) {
    const s = polarToXY(startDeg, radius);
    const e = polarToXY(endDeg, radius);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  }

  const needleEnd = polarToXY(angle, 38);
  const needleBase1 = polarToXY(angle + 90, 5);
  const needleBase2 = polarToXY(angle - 90, 5);

  return (
    <svg viewBox="0 0 120 90" className="w-full">
      {/* Background arc */}
      <path
        d={describeArc(startAngle, endAngle, r)}
        fill="none"
        stroke="#E5E7EB"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* Value arc */}
      {val > 0 && (
        <path
          d={describeArc(startAngle, angle, r)}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
        />
      )}
      {/* Tick marks */}
      {[0, 40, 80, 120, 160].map((tick) => {
        const tickPct = tick / maxSpeed;
        const tickAngle = startAngle + sweep * tickPct;
        const outer = polarToXY(tickAngle, r + 6);
        const inner = polarToXY(tickAngle, r - 2);
        return (
          <line
            key={tick}
            x1={outer.x} y1={outer.y}
            x2={inner.x} y2={inner.y}
            stroke="#9CA3AF"
            strokeWidth="1.5"
          />
        );
      })}
      {/* Needle */}
      <polygon
        points={`${needleEnd.x},${needleEnd.y} ${needleBase1.x},${needleBase1.y} ${cx},${cy} ${needleBase2.x},${needleBase2.y}`}
        fill={color}
        opacity="0.9"
      />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r="5" fill={color} />
      <circle cx={cx} cy={cy} r="2.5" fill="white" />
      {/* Speed text */}
      <text x={cx} y={cy + 20} textAnchor="middle" fontSize="18" fontWeight="bold" fill="#111827">
        {speed ?? 0}
      </text>
      <text x={cx} y={cy + 30} textAnchor="middle" fontSize="7" fill="#6B7280">
        km/h
      </text>
    </svg>
  );
}

// Compass rose
function CompassRose({ direction }: { direction: string | null }) {
  const deg = direction ? (DIRECTION_DEG[direction] ?? 0) : 0;
  return (
    <div className="relative flex items-center justify-center">
      <svg viewBox="0 0 60 60" className="w-14 h-14">
        <circle cx="30" cy="30" r="28" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="1.5" />
        {/* Cardinal directions */}
        <text x="30" y="8" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#374151">N</text>
        <text x="53" y="32" textAnchor="middle" fontSize="7" fill="#9CA3AF">E</text>
        <text x="30" y="56" textAnchor="middle" fontSize="7" fill="#9CA3AF">S</text>
        <text x="7" y="32" textAnchor="middle" fontSize="7" fill="#9CA3AF">W</text>
        {/* Needle */}
        <g transform={`rotate(${deg}, 30, 30)`}>
          <polygon points="30,8 33,30 30,34 27,30" fill="#EF4444" />
          <polygon points="30,52 33,30 30,34 27,30" fill="#9CA3AF" />
        </g>
        <circle cx="30" cy="30" r="3" fill="#374151" />
      </svg>
      {direction && (
        <span className="absolute bottom-0 text-[10px] font-bold text-gray-600 leading-none pb-0.5">
          {direction}
        </span>
      )}
    </div>
  );
}

// Vehicle card in sidebar
function VehicleCard({
  vehicle, selected, onClick,
}: {
  vehicle: VehicleData; selected: boolean; onClick: () => void;
}) {
  const color = STATUS_COLORS[vehicle.status] || STATUS_COLORS.offline;
  const isOnline = vehicle.status !== 'offline';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-xl border transition-all duration-150',
        selected
          ? 'border-blue-400 bg-blue-50 shadow-sm'
          : 'border-gray-100 bg-white hover:bg-gray-50 hover:border-gray-200'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 relative flex-shrink-0">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          {vehicle.status === 'driving' && (
            <div
              className="absolute inset-0 h-3 w-3 rounded-full animate-ping opacity-60"
              style={{ backgroundColor: color }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-gray-900 tracking-wide">
              {vehicle.plate_number}
            </span>
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: isOnline ? color + '20' : '#F3F4F6',
                color: isOnline ? color : '#9CA3AF',
              }}
            >
              {vehicle.status === 'driving' && vehicle.speed !== null
                ? `${vehicle.speed} km/h`
                : STATUS_LABELS[vehicle.status]}
            </span>
          </div>
          {vehicle.driver_name && (
            <p className="text-xs text-gray-500 truncate mt-0.5 flex items-center gap-1">
              <User className="h-3 w-3 flex-shrink-0" />
              {vehicle.driver_name}
            </p>
          )}
          {vehicle.location_address && vehicle.status !== 'offline' && (
            <p className="text-[11px] text-gray-400 truncate mt-0.5 flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
              {vehicle.location_address}
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">
            {formatLastUpdate(vehicle.last_update)}
          </p>
        </div>
      </div>
    </button>
  );
}

// Right panel — Satis GPS-style detail view
function DetailPanel({ vehicle, onClose }: { vehicle: VehicleData; onClose: () => void }) {
  const color = STATUS_COLORS[vehicle.status] || STATUS_COLORS.offline;
  const isMoving = vehicle.status === 'driving';

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: 'spring', damping: 26, stiffness: 280 }}
      className="w-[380px] flex-shrink-0 bg-white border-l border-gray-100 flex flex-col overflow-y-auto"
    >
      {/* Header */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-widest">
              {vehicle.plate_number}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {vehicle.brand} {vehicle.model}
              {vehicle.year ? ` · ${vehicle.year}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Driver */}
        {vehicle.driver_name && (
          <div className="flex items-center gap-2.5 mt-4">
            <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
              {getInitials(vehicle.driver_name)}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">{vehicle.driver_name}</p>
              <p className="text-xs text-gray-400">Kierowca</p>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div
        className={cn(
          'flex items-center justify-center gap-2 py-3 text-white font-semibold text-sm',
          STATUS_BG[vehicle.status]
        )}
      >
        {isMoving && (
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
        )}
        <span>
          {STATUS_LABELS[vehicle.status]}
          {isMoving && vehicle.speed !== null ? ` · ${vehicle.speed} km/h` : ''}
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* Speedometer + Compass row */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Speedometer speed={vehicle.speed} color={color} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <CompassRose direction={vehicle.direction} />
            {vehicle.driving_time && (
              <div className="text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Czas jazdy</p>
                <p className="text-sm font-bold text-gray-800">{vehicle.driving_time}</p>
              </div>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2.5">
          <StatBox
            icon={<Gauge className="h-3.5 w-3.5" />}
            label="Prędkość"
            value={vehicle.speed !== null ? `${vehicle.speed}` : '—'}
            unit="km/h"
            color={color}
          />
          <StatBox
            icon={<Activity className="h-3.5 w-3.5" />}
            label="RPM"
            value={vehicle.rpm !== null ? `${vehicle.rpm}` : '—'}
            color={color}
          />
          <StatBox
            icon={<Compass className="h-3.5 w-3.5" />}
            label="Kierunek"
            value={vehicle.direction ?? '—'}
            color={color}
          />
        </div>

        {/* Location address */}
        {vehicle.location_address && (
          <div className="bg-gray-50 rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1.5">
              <MapPin className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wider">Lokalizacja</span>
            </div>
            <p className="text-sm text-gray-700 font-medium leading-tight">
              {vehicle.location_address}
            </p>
            {vehicle.lat !== null && vehicle.lng !== null && (
              <p className="text-[11px] text-gray-400 font-mono mt-1">
                {vehicle.lat.toFixed(5)}, {vehicle.lng.toFixed(5)}
              </p>
            )}
            <p className="text-[11px] text-gray-400 mt-1">
              {formatTimestamp(vehicle.last_update)}
            </p>
          </div>
        )}

        {/* Coords only if no address */}
        {!vehicle.location_address && vehicle.lat !== null && vehicle.lng !== null && (
          <div className="bg-gray-50 rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1.5">
              <MapPin className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wider">Lokalizacja</span>
            </div>
            <p className="text-xs text-gray-600 font-mono">
              {vehicle.lat.toFixed(5)}, {vehicle.lng.toFixed(5)}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {formatTimestamp(vehicle.last_update)}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          {vehicle.lat !== null && vehicle.lng !== null && (
            <>
              <Button
                className="w-full rounded-xl"
                style={{ backgroundColor: color, borderColor: color }}
                onClick={() =>
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${vehicle.lat},${vehicle.lng}`,
                    '_blank'
                  )
                }
              >
                <Navigation className="h-4 w-4 mr-2" />
                Nawiguj
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={() =>
                  window.open(
                    `https://www.google.com/maps?q=&layer=c&cbll=${vehicle.lat},${vehicle.lng}`,
                    '_blank'
                  )
                }
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Widok Street View
              </Button>
            </>
          )}
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => window.open(`/gps-history?vehicle=${vehicle.id}`, '_blank')}
          >
            <History className="h-4 w-4 mr-2" />
            Historia trasy
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function StatBox({
  icon, label, value, unit, color,
}: {
  icon: React.ReactNode; label: string; value: string; unit?: string; color: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-2.5 text-center">
      <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</span>
      </div>
      <p className="text-base font-bold text-gray-900 leading-tight">{value}</p>
      {unit && <p className="text-[10px] text-gray-400">{unit}</p>}
    </div>
  );
}

// FlyToEffect triggers flyTo on the map when vehicle selection changes
function FlyToEffect({
  lat, lng, mapRef, vehicleId,
}: {
  lat: number; lng: number; mapRef: React.MutableRefObject<any>; vehicleId: string;
}) {
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], 14, { animate: true, duration: 1 });
    }
  }, [vehicleId, lat, lng, mapRef]);
  return null;
}

export default function MapPage() {
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleData | null>(null);
  const [countdown, setCountdown] = useState(30);
  const mapRef = useRef<any>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch('/api/vehicles/locations');
      if (res.ok) {
        const data: VehicleData[] = await res.json();
        setVehicles(data);
        setSelectedVehicle(prev => {
          if (!prev) return null;
          return data.find(v => v.id === prev.id) ?? null;
        });
      }
    } catch (err) {
      console.error('[MapPage] Failed to fetch vehicles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const resetCountdown = useCallback(() => {
    setCountdown(30);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
  }, []);

  useEffect(() => {
    fetchVehicles();
    resetCountdown();
    const interval = setInterval(() => {
      fetchVehicles();
      resetCountdown();
    }, 30_000);
    return () => {
      clearInterval(interval);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [fetchVehicles, resetCountdown]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await fetchVehicles();
    resetCountdown();
  }, [fetchVehicles, resetCountdown]);

  const filteredVehicles = vehicles.filter(v => {
    const q = search.toLowerCase();
    return (
      v.plate_number.toLowerCase().includes(q) ||
      (v.driver_name?.toLowerCase().includes(q) ?? false)
    );
  });

  // Sort: driving first, then working, then online, then offline
  const sortedVehicles = [...filteredVehicles].sort((a, b) => {
    const order = { driving: 0, working: 1, online: 2, offline: 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  const handleSelectVehicle = (vehicle: VehicleData) => {
    setSelectedVehicle(prev => (prev?.id === vehicle.id ? null : vehicle));
  };

  const drivingCount = vehicles.filter(v => v.status === 'driving').length;
  const onlineCount = vehicles.filter(v => v.status !== 'offline').length;

  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>
      <Topbar
        title="Flota GPS"
        subtitle={`${vehicles.length} pojazdów · ${onlineCount} online`}
        icon={<Truck className="h-5 w-5" />}
      />

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
        {/* Left sidebar */}
        <div className="w-80 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">
                  odświeży za <span className="font-semibold text-gray-600">{countdown}s</span>
                </span>
                {drivingCount > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                    {drivingCount} w trasie
                  </span>
                )}
              </div>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                Odśwież
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Szukaj po tablicy lub kierowcy..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs rounded-xl bg-gray-50 border-gray-200"
              />
            </div>
          </div>

          {/* Vehicle list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading && vehicles.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center text-gray-400">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm">Ładowanie...</p>
                </div>
              </div>
            ) : sortedVehicles.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Truck className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm">{search ? 'Brak wyników' : 'Brak pojazdów'}</p>
              </div>
            ) : (
              sortedVehicles.map(vehicle => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  selected={selectedVehicle?.id === vehicle.id}
                  onClick={() => handleSelectVehicle(vehicle)}
                />
              ))
            )}
          </div>

          {/* Legend */}
          <div className="p-4 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STATUS_COLORS).map(([status, color]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[11px] text-gray-500">{STATUS_LABELS[status]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative overflow-hidden">
          <MapContainer
            center={[52.0, 19.5]}
            zoom={6}
            style={{ height: '100%', width: '100%' }}
            ref={mapRef}
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />

            {vehicles
              .filter(v => v.lat !== null && v.lng !== null)
              .map(vehicle => {
                const color = STATUS_COLORS[vehicle.status] || STATUS_COLORS.offline;
                const isSelected = selectedVehicle?.id === vehicle.id;

                return (
                  <CircleMarker
                    key={vehicle.id}
                    center={[vehicle.lat!, vehicle.lng!]}
                    radius={isSelected ? 16 : 11}
                    pathOptions={{
                      color: isSelected ? '#1D4ED8' : 'white',
                      fillColor: color,
                      fillOpacity: vehicle.status === 'offline' ? 0.5 : 0.9,
                      weight: isSelected ? 3 : 2,
                    }}
                    eventHandlers={{ click: () => handleSelectVehicle(vehicle) }}
                  >
                    <Popup>
                      <div className="text-sm min-w-[180px]">
                        <p className="font-bold text-base">{vehicle.plate_number}</p>
                        <p className="text-gray-500 text-xs">{vehicle.brand} {vehicle.model}</p>
                        {vehicle.driver_name && (
                          <p className="text-gray-600 text-xs mt-1 flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {vehicle.driver_name}
                          </p>
                        )}
                        <p className="text-xs mt-1 font-semibold" style={{ color }}>
                          {STATUS_LABELS[vehicle.status]}
                          {vehicle.speed !== null ? ` · ${vehicle.speed} km/h` : ''}
                        </p>
                        {vehicle.location_address && (
                          <p className="text-[11px] text-gray-400 mt-1">{vehicle.location_address}</p>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
          </MapContainer>

          {selectedVehicle && selectedVehicle.lat !== null && selectedVehicle.lng !== null && (
            <FlyToEffect
              lat={selectedVehicle.lat}
              lng={selectedVehicle.lng}
              mapRef={mapRef}
              vehicleId={selectedVehicle.id}
            />
          )}
        </div>

        {/* Right detail panel */}
        <AnimatePresence>
          {selectedVehicle && (
            <DetailPanel
              vehicle={selectedVehicle}
              onClose={() => setSelectedVehicle(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
