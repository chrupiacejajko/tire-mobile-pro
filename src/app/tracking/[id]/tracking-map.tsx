'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });

/* ─── FitBounds helper ──────────────────────────────────────────────── */
function FitBoundsHelper({ points }: { points: [number, number][] }) {
  const { useMap } = require('react-leaflet');
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (points.length >= 2 && !fitted.current) {
      const latLngs = points.map(([lat, lng]) => [lat, lng] as [number, number]);
      map.fitBounds(latLngs, { padding: [60, 60], maxZoom: 14 });
      fitted.current = true;
    }
  }, [map, points]);

  return null;
}

const FitBounds = dynamic(() => Promise.resolve(FitBoundsHelper), { ssr: false });

/* ─── Types ─────────────────────────────────────────────────────────── */
interface TrackingData {
  order: {
    id: string;
    status: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    scheduled_date: string | null;
    time_window: string | null;
  };
  driver: {
    name: string | null;
    lat: number | null;
    lng: number | null;
    vehicle: {
      brand: string;
      model: string;
      plate: string;
    } | null;
  } | null;
  eta_minutes: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Nowe',
  assigned: 'Przypisane',
  in_transit: 'W drodze',
  in_progress: 'Na miejscu',
  completed: 'Zakończone',
  cancelled: 'Anulowane',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-gray-100 text-gray-600',
  assigned: 'bg-amber-100 text-amber-700',
  in_transit: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};

interface TrackingMapProps {
  orderId: string;
  initialData: TrackingData | null;
}

export function TrackingMap({ orderId, initialData }: TrackingMapProps) {
  const [data, setData] = useState<TrackingData | null>(initialData);
  const [mapReady, setMapReady] = useState(false);

  // Poll for updates every 15 seconds
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tracking/${orderId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Silently fail - will retry on next interval
    }
  }, [orderId]);

  useEffect(() => {
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    setMapReady(true);
  }, []);

  if (!data) return null;

  const { order, driver, eta_minutes } = data;
  const driverPos = driver?.lat != null && driver?.lng != null
    ? [driver.lat, driver.lng] as [number, number]
    : null;
  const destPos = order.lat != null && order.lng != null
    ? [order.lat, order.lng] as [number, number]
    : null;

  const showMap = driverPos || destPos;
  const fitPoints: [number, number][] = [];
  if (driverPos) fitPoints.push(driverPos);
  if (destPos) fitPoints.push(destPos);

  // Default center: Poland
  const defaultCenter: [number, number] = destPos || driverPos || [51.9, 19.1];

  const firstName = driver?.name?.split(' ')[0] || 'Kierowca';

  return (
    <div className="flex flex-col h-screen relative">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="absolute top-0 left-0 right-0 z-[1000] bg-white/90 backdrop-blur-xl border-b border-gray-100/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <img
            src="/logo-full.png"
            alt="RouteTire"
            className="h-9 w-9 object-contain rounded-xl"
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-900 leading-tight">
              Route<span className="text-orange-500">Tire</span>
            </h1>
            <p className="text-[11px] text-gray-400 tracking-wide">
              Śledzenie zamówienia
            </p>
          </div>
          <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABELS[order.status] || order.status}
          </div>
        </div>
      </header>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      {showMap && mapReady ? (
        <div className="flex-1">
          <MapContainer
            center={defaultCenter}
            zoom={13}
            scrollWheelZoom={true}
            zoomControl={false}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />

            {fitPoints.length >= 2 && <FitBounds points={fitPoints} />}

            {/* Driver pulsing blue dot */}
            {driverPos && (
              <>
                <CircleMarker
                  center={driverPos}
                  radius={18}
                  pathOptions={{
                    color: 'transparent',
                    fillColor: '#3B82F6',
                    fillOpacity: 0.15,
                  }}
                />
                <CircleMarker
                  center={driverPos}
                  radius={10}
                  pathOptions={{
                    color: '#fff',
                    weight: 3,
                    fillColor: '#3B82F6',
                    fillOpacity: 1,
                  }}
                />
              </>
            )}

            {/* Destination orange marker */}
            {destPos && (
              <CircleMarker
                center={destPos}
                radius={10}
                pathOptions={{
                  color: '#fff',
                  weight: 3,
                  fillColor: '#F97316',
                  fillOpacity: 1,
                }}
              />
            )}

            {/* Route line between driver and destination */}
            {driverPos && destPos && (
              <Polyline
                positions={[driverPos, destPos]}
                pathOptions={{
                  color: '#3B82F6',
                  weight: 3,
                  opacity: 0.6,
                  dashArray: '8 12',
                }}
              />
            )}
          </MapContainer>
        </div>
      ) : (
        <div className="flex-1 bg-gray-50 flex items-center justify-center pt-16">
          <div className="text-center text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <p className="text-sm">Pozycja GPS niedostępna</p>
          </div>
        </div>
      )}

      {/* ── Bottom card overlay ─────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000]">
        <div className="bg-white rounded-t-3xl shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-5 pt-5 pb-8">
          {/* Handle bar */}
          <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-4" />

          {/* ETA */}
          {(order.status === 'in_transit' || order.status === 'assigned') && eta_minutes != null && (
            <div className="mb-4">
              <p className="text-2xl font-bold text-gray-900 text-center">
                Kierowca jest ~{eta_minutes} min od Ciebie
              </p>
            </div>
          )}

          {order.status === 'in_progress' && (
            <div className="mb-4">
              <p className="text-xl font-bold text-orange-600 text-center">
                Technik jest na miejscu
              </p>
            </div>
          )}

          {order.status === 'completed' && (
            <div className="mb-4">
              <p className="text-xl font-bold text-green-600 text-center">
                Usługa zakończona
              </p>
            </div>
          )}

          {/* Driver info row */}
          {driver && (
            <div className="flex items-center gap-3 mb-3">
              {/* Avatar */}
              <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{firstName}</p>
                {driver.vehicle && (
                  <p className="text-xs text-gray-500 truncate">
                    {driver.vehicle.brand} {driver.vehicle.model} &middot; {driver.vehicle.plate}
                  </p>
                )}
              </div>
              {/* Live indicator */}
              {driverPos && (order.status === 'in_transit' || order.status === 'in_progress') && (
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                  <span className="text-[11px] font-medium text-green-600">LIVE</span>
                </div>
              )}
            </div>
          )}

          {/* Address */}
          {order.address && (
            <div className="flex items-start gap-2.5 py-2 border-t border-gray-100">
              <svg className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm text-gray-600 leading-snug">{order.address}</p>
            </div>
          )}

          {/* Order ID */}
          <div className="mt-2 text-center">
            <p className="text-[11px] text-gray-300 font-mono">
              #{order.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
