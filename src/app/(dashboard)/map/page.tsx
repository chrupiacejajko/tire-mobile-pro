'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MapPin, Navigation, RefreshCw, X, Gauge, Compass,
  Clock, Truck, User, Search, ExternalLink, History,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

// Dynamic imports for Leaflet (SSR disabled)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });

// Leaflet CSS
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
  last_update: string | null;
  driver_name: string | null;
}

const statusColors: Record<string, string> = {
  driving: '#3B82F6',
  working: '#F59E0B',
  online: '#10B981',
  offline: '#6B7280',
};

const statusLabels: Record<string, string> = {
  driving: 'Jedzie',
  working: 'Postój',
  online: 'Online',
  offline: 'Offline',
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
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Inner map component that handles flyTo — must be rendered inside MapContainer
function MapController({ vehicle }: { vehicle: VehicleData | null }) {
  const mapRef = useRef<any>(null);

  // We use a div with a data attribute trick to get the map instance
  // via useMap hook which must be used inside MapContainer
  // Instead we'll attach the map ref via whenCreated on MapContainer
  // This component is a no-op; flyTo is handled via mapRef in parent
  return null;
}

// VehicleCard component for the sidebar
function VehicleCard({
  vehicle,
  selected,
  onClick,
}: {
  vehicle: VehicleData;
  selected: boolean;
  onClick: () => void;
}) {
  const color = statusColors[vehicle.status] || statusColors.offline;

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
        {/* Status dot */}
        <div className="mt-1 relative flex-shrink-0">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          {vehicle.status === 'driving' && (
            <div
              className="absolute inset-0 h-3 w-3 rounded-full animate-ping opacity-75"
              style={{ backgroundColor: color }}
            />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-gray-900 tracking-wide">
              {vehicle.plate_number}
            </span>
            {vehicle.status === 'driving' && vehicle.speed !== null ? (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full text-white flex-shrink-0"
                style={{ backgroundColor: color }}
              >
                {vehicle.speed} km/h
              </span>
            ) : vehicle.status !== 'offline' ? (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">
                Postój
              </span>
            ) : (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 flex-shrink-0">
                Offline
              </span>
            )}
          </div>
          {vehicle.driver_name && (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              <User className="h-3 w-3 inline mr-1" />
              {vehicle.driver_name}
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

// Right detail panel
function DetailPanel({
  vehicle,
  onClose,
}: {
  vehicle: VehicleData;
  onClose: () => void;
}) {
  const color = statusColors[vehicle.status] || statusColors.offline;
  const label = statusLabels[vehicle.status] || vehicle.status;

  const statusEmoji = vehicle.status === 'driving'
    ? '🟢'
    : vehicle.status === 'working'
    ? '🟡'
    : vehicle.status === 'online'
    ? '🟢'
    : '⚫';

  return (
    <motion.div
      initial={{ x: 360, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 360, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="w-[360px] flex-shrink-0 bg-white border-l border-gray-100 flex flex-col overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-gray-100">
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
          className="mt-1 h-8 w-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 p-5 space-y-5">
        {/* Driver */}
        {vehicle.driver_name && (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
              {getInitials(vehicle.driver_name)}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{vehicle.driver_name}</p>
              <p className="text-xs text-gray-400">Kierowca</p>
            </div>
          </div>
        )}

        {/* Status badge */}
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: color }}
        >
          <span>{statusEmoji}</span>
          <span>
            {label}
            {vehicle.status === 'driving' && vehicle.speed !== null
              ? ` ${vehicle.speed} km/h`
              : ''}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1">
              <Gauge className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wider">Prędkość</span>
            </div>
            <p className="text-lg font-bold text-gray-900">
              {vehicle.speed !== null ? `${vehicle.speed} km/h` : '—'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1">
              <Compass className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wider">Kierunek</span>
            </div>
            <p className="text-lg font-bold text-gray-900">
              {vehicle.direction ?? '—'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1">
              <Gauge className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wider">RPM</span>
            </div>
            <p className="text-lg font-bold text-gray-900">
              {vehicle.rpm !== null ? vehicle.rpm : '—'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wider">Czas jazdy</span>
            </div>
            <p className="text-lg font-bold text-gray-900">
              {vehicle.driving_time ?? '—'}
            </p>
          </div>
        </div>

        {/* Location */}
        {(vehicle.lat !== null && vehicle.lng !== null) && (
          <div className="bg-gray-50 rounded-xl p-3">
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
            onClick={() =>
              window.open(`/gps-history?vehicle=${vehicle.id}`, '_blank')
            }
          >
            <History className="h-4 w-4 mr-2" />
            Historia trasy
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// MapFlyTo: inner component that uses useMap
function MapFlyTo({
  vehicle,
  mapRef,
}: {
  vehicle: VehicleData | null;
  mapRef: React.MutableRefObject<any>;
}) {
  useEffect(() => {
    if (vehicle && vehicle.lat !== null && vehicle.lng !== null && mapRef.current) {
      mapRef.current.flyTo([vehicle.lat, vehicle.lng], 14, { animate: true, duration: 1 });
    }
  }, [vehicle, mapRef]);
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
        // Update selected vehicle data if it's currently selected
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
      setCountdown(prev => {
        if (prev <= 1) return 30;
        return prev - 1;
      });
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

  const handleSelectVehicle = (vehicle: VehicleData) => {
    setSelectedVehicle(prev => (prev?.id === vehicle.id ? null : vehicle));
  };

  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>
      <Topbar
        title="Flota GPS"
        subtitle={`${vehicles.length} pojazd${vehicles.length === 1 ? '' : vehicles.length < 5 ? 'y' : 'ów'}`}
        icon={<Truck className="h-5 w-5" />}
      />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
        {/* Left sidebar */}
        <div className="w-80 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
          {/* Sidebar header */}
          <div className="p-4 border-b border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                odświeży za{' '}
                <span className="font-semibold text-gray-600">{countdown}s</span>
              </span>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                Odśwież
              </button>
            </div>
            {/* Search */}
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
            ) : filteredVehicles.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Truck className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm">
                  {search ? 'Brak wyników' : 'Brak pojazdów'}
                </p>
              </div>
            ) : (
              filteredVehicles.map(vehicle => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  selected={selectedVehicle?.id === vehicle.id}
                  onClick={() => handleSelectVehicle(vehicle)}
                />
              ))
            )}
          </div>

          {/* Status legend */}
          <div className="p-4 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(statusColors).map(([status, color]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[11px] text-gray-500">{statusLabels[status]}</span>
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
                const color = statusColors[vehicle.status] || statusColors.offline;
                const isSelected = selectedVehicle?.id === vehicle.id;

                return (
                  <CircleMarker
                    key={vehicle.id}
                    center={[vehicle.lat!, vehicle.lng!]}
                    radius={isSelected ? 14 : 10}
                    pathOptions={{
                      color: isSelected ? '#1D4ED8' : color,
                      fillColor: color,
                      fillOpacity: 0.9,
                      weight: isSelected ? 3 : 2,
                    }}
                    eventHandlers={{
                      click: () => handleSelectVehicle(vehicle),
                    }}
                  >
                    <Popup>
                      <div className="text-sm min-w-[160px]">
                        <p className="font-bold text-base">{vehicle.plate_number}</p>
                        <p className="text-gray-500 text-xs">
                          {vehicle.brand} {vehicle.model}
                        </p>
                        {vehicle.driver_name && (
                          <p className="text-gray-600 text-xs mt-1">
                            <User className="h-3 w-3 inline mr-1" />
                            {vehicle.driver_name}
                          </p>
                        )}
                        <p className="text-xs mt-1" style={{ color }}>
                          {statusLabels[vehicle.status]}
                          {vehicle.speed !== null ? ` · ${vehicle.speed} km/h` : ''}
                        </p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
          </MapContainer>

          {/* Fly to selected vehicle — handled via mapRef */}
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

// FlyToEffect triggers flyTo on the map when vehicle selection changes
function FlyToEffect({
  lat,
  lng,
  mapRef,
  vehicleId,
}: {
  lat: number;
  lng: number;
  mapRef: React.MutableRefObject<any>;
  vehicleId: string;
}) {
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], 14, { animate: true, duration: 1 });
    }
  }, [vehicleId, lat, lng, mapRef]);

  return null;
}
