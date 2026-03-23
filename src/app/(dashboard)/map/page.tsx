'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MapPin, Navigation, RefreshCw, X, Gauge, Compass,
  Clock, Truck, User, Search, ExternalLink, History,
  Activity, Route, ChevronRight, AlertCircle,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });

import 'leaflet/dist/leaflet.css';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface VehicleData {
  id: string;
  plate_number: string;
  brand: string;
  model: string;
  year: number | null;
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

interface RouteOrder {
  id: string;
  status: string;
  priority: string;
  time: string;
  lat: number | null;
  lng: number | null;
  client_name: string;
  client_address: string;
  services: any[];
}

interface EmployeeRoute {
  employee_id: string;
  employee_name: string;
  plate: string | null;
  color: string;
  current_position: { lat: number; lng: number; speed: number | null; direction: string | null; status: string | null; timestamp: string } | null;
  orders: RouteOrder[];
  total_orders: number;
  total_km: number;
  waypoints: { lat: number; lng: number }[];
}

/* ─── Constants ──────────────────────────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  driving: '#3B82F6', working: '#F59E0B', online: '#10B981', offline: '#6B7280',
};
const STATUS_LABELS: Record<string, string> = {
  driving: 'Jedzie', working: 'Postój', online: 'Online', offline: 'Offline',
};
const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#EF4444', high: '#F97316', normal: '#6B7280', low: '#9CA3AF',
};
const DIRECTION_DEG: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

/* ─── Helpers ────────────────────────────────────────────────────────── */
function formatLastUpdate(ts: string | null): string {
  if (!ts) return 'brak danych';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (diff < 1) return 'przed chwilą';
  if (diff === 1) return '1 min temu';
  if (diff < 60) return `${diff} min temu`;
  const h = Math.floor(diff / 60);
  return h === 1 ? '1 godz. temu' : `${h} godz. temu`;
}
function formatTimestamp(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

/* ─── Speedometer SVG ────────────────────────────────────────────────── */
function Speedometer({ speed, color }: { speed: number | null; color: string }) {
  const MAX = 160;
  const val = Math.min(speed ?? 0, MAX);
  const pct = val / MAX;
  const cx = 60, cy = 65, r = 52;
  const startAngle = -225, sweep = 270;
  const angle = startAngle + sweep * pct;

  function polar(deg: number, radius: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }
  function arc(s: number, e: number, radius: number) {
    const sp = polar(s, radius), ep = polar(e, radius);
    return `M ${sp.x} ${sp.y} A ${radius} ${radius} 0 ${e - s > 180 ? 1 : 0} 1 ${ep.x} ${ep.y}`;
  }
  const needle = polar(angle, 38);
  const nb1 = polar(angle + 90, 5), nb2 = polar(angle - 90, 5);

  return (
    <svg viewBox="0 0 120 90" className="w-full">
      <path d={arc(startAngle, startAngle + sweep, r)} fill="none" stroke="#E5E7EB" strokeWidth="8" strokeLinecap="round" />
      {val > 0 && <path d={arc(startAngle, angle, r)} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />}
      {[0, 40, 80, 120, 160].map(t => {
        const a = startAngle + sweep * (t / MAX);
        const o = polar(a, r + 6), i = polar(a, r - 2);
        return <line key={t} x1={o.x} y1={o.y} x2={i.x} y2={i.y} stroke="#9CA3AF" strokeWidth="1.5" />;
      })}
      <polygon points={`${needle.x},${needle.y} ${nb1.x},${nb1.y} ${cx},${cy} ${nb2.x},${nb2.y}`} fill={color} opacity="0.9" />
      <circle cx={cx} cy={cy} r="5" fill={color} />
      <circle cx={cx} cy={cy} r="2.5" fill="white" />
      <text x={cx} y={cy + 20} textAnchor="middle" fontSize="18" fontWeight="bold" fill="#111827">{speed ?? 0}</text>
      <text x={cx} y={cy + 30} textAnchor="middle" fontSize="7" fill="#6B7280">km/h</text>
    </svg>
  );
}

/* ─── Compass ────────────────────────────────────────────────────────── */
function CompassRose({ direction }: { direction: string | null }) {
  const deg = direction ? (DIRECTION_DEG[direction] ?? 0) : 0;
  return (
    <div className="relative flex items-center justify-center">
      <svg viewBox="0 0 60 60" className="w-14 h-14">
        <circle cx="30" cy="30" r="28" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="1.5" />
        <text x="30" y="8" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#374151">N</text>
        <text x="53" y="32" textAnchor="middle" fontSize="7" fill="#9CA3AF">E</text>
        <text x="30" y="56" textAnchor="middle" fontSize="7" fill="#9CA3AF">S</text>
        <text x="7" y="32" textAnchor="middle" fontSize="7" fill="#9CA3AF">W</text>
        <g transform={`rotate(${deg}, 30, 30)`}>
          <polygon points="30,8 33,30 30,34 27,30" fill="#EF4444" />
          <polygon points="30,52 33,30 30,34 27,30" fill="#9CA3AF" />
        </g>
        <circle cx="30" cy="30" r="3" fill="#374151" />
      </svg>
      {direction && <span className="absolute bottom-0 text-[10px] font-bold text-gray-600 pb-0.5">{direction}</span>}
    </div>
  );
}

/* ─── Sidebar tabs ───────────────────────────────────────────────────── */
type SidebarTab = 'vehicles' | 'routes';

/* ─── Vehicle card ───────────────────────────────────────────────────── */
function VehicleCard({ vehicle, selected, onClick }: { vehicle: VehicleData; selected: boolean; onClick: () => void }) {
  const color = STATUS_COLORS[vehicle.status] || STATUS_COLORS.offline;
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-xl border transition-all duration-150',
        selected ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-gray-100 bg-white hover:bg-gray-50',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 relative flex-shrink-0">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          {vehicle.status === 'driving' && (
            <div className="absolute inset-0 h-3 w-3 rounded-full animate-ping opacity-60" style={{ backgroundColor: color }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-gray-900 tracking-wide">{vehicle.plate_number}</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color + '20', color: vehicle.status !== 'offline' ? color : '#9CA3AF' }}>
              {vehicle.status === 'driving' && vehicle.speed !== null ? `${vehicle.speed} km/h` : STATUS_LABELS[vehicle.status]}
            </span>
          </div>
          {vehicle.driver_name && (
            <p className="text-xs text-gray-500 truncate mt-0.5 flex items-center gap-1">
              <User className="h-3 w-3 flex-shrink-0" />{vehicle.driver_name}
            </p>
          )}
          {vehicle.location_address && vehicle.status !== 'offline' && (
            <p className="text-[11px] text-gray-400 truncate mt-0.5 flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5 flex-shrink-0" />{vehicle.location_address}
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">{formatLastUpdate(vehicle.last_update)}</p>
        </div>
      </div>
    </button>
  );
}

/* ─── Route card (employee route in sidebar) ─────────────────────────── */
function RouteCard({ route, selected, onClick }: { route: EmployeeRoute; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-xl border transition-all',
        selected ? 'border-opacity-100 shadow-sm' : 'border-gray-100 bg-white hover:bg-gray-50',
      )}
      style={selected ? { borderColor: route.color, backgroundColor: route.color + '10' } : {}}
    >
      <div className="flex items-start gap-2.5">
        <div className="h-3 w-3 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: route.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900">{route.employee_name}</span>
            <span className="text-[11px] text-gray-400">{route.total_km} km</span>
          </div>
          {route.plate && <p className="text-xs text-gray-400 font-mono">{route.plate}</p>}
          <p className="text-xs text-gray-500 mt-0.5">
            {route.total_orders} zleceń dzisiaj
          </p>
          {route.orders.slice(0, 2).map((o, i) => (
            <p key={i} className="text-[11px] text-gray-400 truncate mt-0.5">
              {o.time} · {o.client_name}
              {o.priority === 'urgent' && <span className="ml-1 text-red-400">●</span>}
            </p>
          ))}
        </div>
      </div>
    </button>
  );
}

/* ─── Detail panel ───────────────────────────────────────────────────── */
function VehicleDetailPanel({ vehicle, route, onClose }: { vehicle: VehicleData; route: EmployeeRoute | null; onClose: () => void }) {
  const color = STATUS_COLORS[vehicle.status] || STATUS_COLORS.offline;
  const [showOrders, setShowOrders] = useState(false);

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 380, opacity: 0 }}
      transition={{ type: 'spring', damping: 26, stiffness: 280 }}
      className="w-[380px] flex-shrink-0 bg-white border-l border-gray-100 flex flex-col overflow-y-auto"
    >
      {/* Header */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-widest">{vehicle.plate_number}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{vehicle.brand} {vehicle.model}{vehicle.year ? ` · ${vehicle.year}` : ''}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
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
      <div className={cn('flex items-center justify-center gap-2 py-2.5 text-white font-semibold text-sm',
        vehicle.status === 'driving' ? 'bg-blue-500' : vehicle.status === 'working' ? 'bg-amber-500' : vehicle.status === 'online' ? 'bg-emerald-500' : 'bg-gray-400'
      )}>
        {vehicle.status === 'driving' && <span className="h-2 w-2 rounded-full bg-white animate-pulse" />}
        <span>{STATUS_LABELS[vehicle.status]}{vehicle.status === 'driving' && vehicle.speed ? ` · ${vehicle.speed} km/h` : ''}</span>
      </div>

      <div className="p-5 space-y-5">
        {/* Speedometer + Compass */}
        <div className="flex items-center gap-4">
          <div className="flex-1"><Speedometer speed={vehicle.speed} color={color} /></div>
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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <Gauge className="h-3.5 w-3.5" />, label: 'Prędkość', value: vehicle.speed !== null ? `${vehicle.speed}` : '—', unit: 'km/h' },
            { icon: <Activity className="h-3.5 w-3.5" />, label: 'RPM', value: vehicle.rpm !== null ? `${vehicle.rpm}` : '—' },
            { icon: <Compass className="h-3.5 w-3.5" />, label: 'Kierunek', value: vehicle.direction ?? '—' },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-xl p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <span style={{ color }}>{s.icon}</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{s.label}</span>
              </div>
              <p className="text-base font-bold text-gray-900">{s.value}</p>
              {s.unit && <p className="text-[10px] text-gray-400">{s.unit}</p>}
            </div>
          ))}
        </div>

        {/* Location */}
        {(vehicle.location_address || (vehicle.lat && vehicle.lng)) && (
          <div className="bg-gray-50 rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1.5">
              <MapPin className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wider">Lokalizacja</span>
            </div>
            {vehicle.location_address && <p className="text-sm text-gray-700 font-medium">{vehicle.location_address}</p>}
            {vehicle.lat && vehicle.lng && (
              <p className="text-[11px] text-gray-400 font-mono mt-0.5">{vehicle.lat.toFixed(5)}, {vehicle.lng.toFixed(5)}</p>
            )}
            <p className="text-[11px] text-gray-400 mt-1">{formatTimestamp(vehicle.last_update)}</p>
          </div>
        )}

        {/* Today's route (from dispatcher/routes) */}
        {route && route.orders.length > 0 && (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowOrders(!showOrders)}
              className="w-full flex items-center justify-between p-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4" style={{ color: route.color }} />
                <span>{route.total_orders} zleceń dzisiaj · {route.total_km} km</span>
              </div>
              <ChevronRight className={cn('h-4 w-4 text-gray-400 transition-transform', showOrders && 'rotate-90')} />
            </button>
            {showOrders && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {route.orders.map((o, i) => (
                  <div key={o.id} className="px-3 py-2.5 flex items-start gap-2.5">
                    <div className="flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
                      style={{ backgroundColor: o.status === 'completed' ? '#10B981' : o.status === 'in_progress' ? '#3B82F6' : route.color }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800">{o.client_name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{o.client_address}</p>
                      <p className="text-[11px] text-gray-400">{o.time}</p>
                    </div>
                    {o.priority === 'urgent' && <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {vehicle.lat && vehicle.lng && (
            <>
              <Button className="w-full rounded-xl" style={{ backgroundColor: color }}
                onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${vehicle.lat},${vehicle.lng}`, '_blank')}>
                <Navigation className="h-4 w-4 mr-2" />Nawiguj
              </Button>
              <Button variant="outline" className="w-full rounded-xl"
                onClick={() => window.open(`https://www.google.com/maps?q=&layer=c&cbll=${vehicle.lat},${vehicle.lng}`, '_blank')}>
                <ExternalLink className="h-4 w-4 mr-2" />Street View
              </Button>
            </>
          )}
          <Button variant="outline" className="w-full rounded-xl"
            onClick={() => window.open(`/gps-history?vehicle=${vehicle.id}`, '_blank')}>
            <History className="h-4 w-4 mr-2" />Historia trasy
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── FlyToEffect ────────────────────────────────────────────────────── */
function FlyToEffect({ lat, lng, mapRef, key: _key }: { lat: number; lng: number; mapRef: React.MutableRefObject<any>; key: string }) {
  useEffect(() => {
    if (mapRef.current) mapRef.current.flyTo([lat, lng], 14, { animate: true, duration: 1 });
  }, [_key, lat, lng, mapRef]);
  return null;
}

/* ─── Main page ──────────────────────────────────────────────────────── */
export default function MapPage() {
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [routes, setRoutes] = useState<EmployeeRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleData | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<EmployeeRoute | null>(null);
  const [tab, setTab] = useState<SidebarTab>('vehicles');
  const [showRoutes, setShowRoutes] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const mapRef = useRef<any>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const fetchAll = useCallback(async () => {
    try {
      const [vRes, rRes] = await Promise.all([
        fetch('/api/vehicles/locations'),
        fetch(`/api/dispatcher/routes?date=${today}`),
      ]);
      if (vRes.ok) {
        const data = await vRes.json();
        setVehicles(data);
        setSelectedVehicle(prev => prev ? data.find((v: VehicleData) => v.id === prev.id) ?? null : null);
      }
      if (rRes.ok) {
        const data = await rRes.json();
        setRoutes(data.routes ?? []);
      }
    } catch (err) {
      console.error('[MapPage]', err);
    } finally {
      setLoading(false);
    }
  }, [today]);

  const resetCountdown = useCallback(() => {
    setCountdown(30);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => setCountdown(p => p <= 1 ? 30 : p - 1), 1000);
  }, []);

  useEffect(() => {
    fetchAll(); resetCountdown();
    const iv = setInterval(() => { fetchAll(); resetCountdown(); }, 30_000);
    return () => { clearInterval(iv); if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [fetchAll, resetCountdown]);

  const handleRefresh = useCallback(async () => { setLoading(true); await fetchAll(); resetCountdown(); }, [fetchAll, resetCountdown]);

  const filteredVehicles = [...vehicles]
    .filter(v => {
      const q = search.toLowerCase();
      return v.plate_number.toLowerCase().includes(q) || (v.driver_name?.toLowerCase().includes(q) ?? false);
    })
    .sort((a, b) => {
      const o: Record<string, number> = { driving: 0, working: 1, online: 2, offline: 3 };
      return (o[a.status] ?? 4) - (o[b.status] ?? 4);
    });

  const filteredRoutes = routes.filter(r => {
    const q = search.toLowerCase();
    return r.employee_name.toLowerCase().includes(q) || (r.plate?.toLowerCase().includes(q) ?? false);
  });

  const handleSelectVehicle = (v: VehicleData) => {
    setSelectedVehicle(prev => prev?.id === v.id ? null : v);
    // Find matching route for this vehicle's driver
    const matchRoute = routes.find(r => r.plate === v.plate_number || r.employee_name === v.driver_name);
    setSelectedRoute(matchRoute ?? null);
  };

  const handleSelectRoute = (r: EmployeeRoute) => {
    setSelectedRoute(prev => prev?.employee_id === r.employee_id ? null : r);
    setSelectedVehicle(null);
    // Fly to first waypoint
    if (r.waypoints.length > 0 && mapRef.current) {
      mapRef.current.flyTo([r.waypoints[0].lat, r.waypoints[0].lng], 12, { animate: true, duration: 1 });
    }
  };

  const drivingCount = vehicles.filter(v => v.status === 'driving').length;
  const onlineCount = vehicles.filter(v => v.status !== 'offline').length;
  const totalOrdersToday = routes.reduce((s, r) => s + r.total_orders, 0);

  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>
      <Topbar title="Mapa dyspozytora" subtitle={`${onlineCount} online · ${drivingCount} w trasie · ${totalOrdersToday} zleceń dziś`} icon={<Truck className="h-5 w-5" />} />

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
        {/* ── Sidebar ── */}
        <div className="w-80 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">odświeży za <span className="font-semibold text-gray-600">{countdown}s</span></span>
                {drivingCount > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />{drivingCount} w trasie
                  </span>
                )}
              </div>
              <button onClick={handleRefresh} disabled={loading} className="flex items-center gap-1 text-xs text-blue-600 font-medium disabled:opacity-50">
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />Odśwież
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input placeholder="Szukaj..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs rounded-xl bg-gray-50 border-gray-200" />
            </div>
            {/* Tabs */}
            <div className="flex rounded-xl bg-gray-100 p-0.5">
              <button onClick={() => setTab('vehicles')} className={cn('flex-1 text-xs font-medium py-1.5 rounded-lg transition-all', tab === 'vehicles' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500')}>
                <Truck className="h-3.5 w-3.5 inline mr-1" />Pojazdy
              </button>
              <button onClick={() => setTab('routes')} className={cn('flex-1 text-xs font-medium py-1.5 rounded-lg transition-all', tab === 'routes' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500')}>
                <Route className="h-3.5 w-3.5 inline mr-1" />Trasy
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading && vehicles.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto" />
              </div>
            ) : tab === 'vehicles' ? (
              filteredVehicles.length === 0 ? (
                <div className="text-center py-12 text-gray-400"><Truck className="h-6 w-6 mx-auto mb-2" /><p className="text-sm">Brak pojazdów</p></div>
              ) : filteredVehicles.map(v => (
                <VehicleCard key={v.id} vehicle={v} selected={selectedVehicle?.id === v.id} onClick={() => handleSelectVehicle(v)} />
              ))
            ) : (
              filteredRoutes.length === 0 ? (
                <div className="text-center py-12 text-gray-400"><Route className="h-6 w-6 mx-auto mb-2" /><p className="text-sm">Brak tras na dziś</p></div>
              ) : filteredRoutes.map(r => (
                <RouteCard key={r.employee_id} route={r} selected={selectedRoute?.employee_id === r.employee_id} onClick={() => handleSelectRoute(r)} />
              ))
            )}
          </div>

          {/* Legend */}
          <div className="p-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Legenda</span>
              <button onClick={() => setShowRoutes(!showRoutes)} className="text-[11px] text-blue-500 font-medium">
                {showRoutes ? 'Ukryj trasy' : 'Pokaż trasy'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(STATUS_COLORS).map(([s, c]) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                  <span className="text-[11px] text-gray-500">{STATUS_LABELS[s]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Map ── */}
        <div className="flex-1 relative overflow-hidden">
          <MapContainer center={[52.0, 19.5]} zoom={6} style={{ height: '100%', width: '100%' }} ref={mapRef}>
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />

            {/* Route polylines */}
            {showRoutes && routes.map(route => (
              route.waypoints.length >= 2 && (
                <Polyline
                  key={route.employee_id}
                  positions={route.waypoints.map(w => [w.lat, w.lng] as [number, number])}
                  pathOptions={{
                    color: route.color,
                    weight: selectedRoute?.employee_id === route.employee_id ? 5 : 3,
                    opacity: selectedRoute?.employee_id === route.employee_id ? 0.9 : 0.5,
                    dashArray: '8, 6',
                  }}
                />
              )
            ))}

            {/* Order markers on routes */}
            {showRoutes && routes.map(route =>
              route.orders
                .filter(o => o.lat && o.lng)
                .map((o, i) => (
                  <CircleMarker
                    key={o.id}
                    center={[o.lat!, o.lng!]}
                    radius={6}
                    pathOptions={{
                      color: 'white',
                      fillColor: o.status === 'completed' ? '#10B981' : o.priority === 'urgent' ? '#EF4444' : route.color,
                      fillOpacity: 0.9,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div className="text-sm min-w-[160px]">
                        <p className="font-bold text-xs text-gray-400">{route.employee_name}</p>
                        <p className="font-bold">{i + 1}. {o.client_name}</p>
                        <p className="text-xs text-gray-500">{o.client_address}</p>
                        <p className="text-xs text-gray-400">{o.time}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))
            )}

            {/* Vehicle GPS markers */}
            {vehicles.filter(v => v.lat && v.lng).map(vehicle => {
              const color = STATUS_COLORS[vehicle.status] || STATUS_COLORS.offline;
              const isSelected = selectedVehicle?.id === vehicle.id;
              return (
                <CircleMarker
                  key={vehicle.id}
                  center={[vehicle.lat!, vehicle.lng!]}
                  radius={isSelected ? 16 : 12}
                  pathOptions={{ color: isSelected ? '#1D4ED8' : 'white', fillColor: color, fillOpacity: vehicle.status === 'offline' ? 0.5 : 1, weight: isSelected ? 3 : 2.5 }}
                  eventHandlers={{ click: () => handleSelectVehicle(vehicle) }}
                >
                  <Popup>
                    <div className="text-sm min-w-[180px]">
                      <p className="font-bold text-base">{vehicle.plate_number}</p>
                      <p className="text-gray-500 text-xs">{vehicle.brand} {vehicle.model}</p>
                      {vehicle.driver_name && <p className="text-xs mt-1 flex items-center gap-1"><User className="h-3 w-3" />{vehicle.driver_name}</p>}
                      <p className="text-xs mt-1 font-semibold" style={{ color }}>
                        {STATUS_LABELS[vehicle.status]}{vehicle.speed ? ` · ${vehicle.speed} km/h` : ''}
                      </p>
                      {vehicle.location_address && <p className="text-[11px] text-gray-400 mt-1">{vehicle.location_address}</p>}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>

          {selectedVehicle?.lat && selectedVehicle?.lng && (
            <FlyToEffect lat={selectedVehicle.lat} lng={selectedVehicle.lng} mapRef={mapRef} key={selectedVehicle.id} />
          )}
        </div>

        {/* ── Detail panel ── */}
        <AnimatePresence>
          {selectedVehicle && (
            <VehicleDetailPanel
              vehicle={selectedVehicle}
              route={selectedRoute}
              onClose={() => { setSelectedVehicle(null); setSelectedRoute(null); }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
