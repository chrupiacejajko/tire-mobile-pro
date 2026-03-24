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
  Plus, Phone, Briefcase, Target, Zap, ArrowRight, Package, CheckCircle2, Loader2, ChevronDown,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });
const LeafletCircle = dynamic(() => import('react-leaflet').then(m => m.Circle), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const LeafletPolygon = dynamic(() => import('react-leaflet').then(m => m.Polygon), { ssr: false });
const LeafletTooltip = dynamic(() => import('react-leaflet').then(m => m.Tooltip), { ssr: false });

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

interface MapOrder {
  id: string;
  status: string;
  priority: string;
  scheduled_date: string;
  scheduled_time_start: string | null;
  time_window: string | null;
  services: { name: string; price: number }[];
  employee_id: string | null;
  employee_name: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  total_price: number;
  notes: string | null;
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

const ORDER_STATUS_COLORS: Record<string, string> = {
  new: '#9CA3AF',
  assigned: '#F59E0B',
  in_progress: '#3B82F6',
  completed: '#10B981',
  cancelled: '#EF4444',
};
const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'Nowe', assigned: 'Przypisane', in_progress: 'W trakcie', completed: 'Zakończone', cancelled: 'Anulowane',
};
const TIME_WINDOW_LABELS: Record<string, string> = {
  morning: '🌅 Rano (8-12)', afternoon: '☀️ Południe (12-16)', evening: '🌇 Wieczór (16-20)',
};

const HERE_API_KEY = process.env.NEXT_PUBLIC_HERE_API_KEY || '8AMu0VNMjm8W2p8d8DdULqL5sYywQPbw3aARKJLRY80';

/* ─── Address search types ──────────────────────────────────────────── */
interface HereSuggestion {
  id: string;
  title: string;
  address?: { label?: string };
}
interface AddressPin {
  lat: number;
  lng: number;
  label: string;
}
interface NearbyWorker {
  employee_id: string;
  employee_name: string;
  plate: string | null;
  status: string;
  lat: number;
  lng: number;
  distance_km: number;
  travel_minutes: number;
  orders_today: number;
}

interface MapRegion {
  id: string;
  name: string;
  color: string;
  polygon: [number, number][] | null;
}

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
type SidebarTab = 'vehicles' | 'routes' | 'orders';

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

/* ─── Order card (sidebar) ───────────────────────────────────────────── */
function OrderCard({ order, selected, onClick }: { order: MapOrder; selected: boolean; onClick: () => void }) {
  const color = order.priority === 'urgent' ? '#EF4444' : ORDER_STATUS_COLORS[order.status] || '#9CA3AF';
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-xl border transition-all duration-150',
        selected ? 'border-orange-400 bg-orange-50 shadow-sm' : 'border-gray-100 bg-white hover:bg-gray-50',
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 relative flex-shrink-0">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          {order.priority === 'urgent' && (
            <div className="absolute inset-0 h-3 w-3 rounded-full animate-ping opacity-60" style={{ backgroundColor: '#EF4444' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-gray-900">{order.client_name ?? 'Brak klienta'}</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color + '20', color }}>
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>
          {order.client_address && (
            <p className="text-[11px] text-gray-400 truncate mt-0.5 flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5 flex-shrink-0" />{order.client_address}{order.city ? `, ${order.city}` : ''}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            {order.time_window && (
              <span className="text-[11px] text-gray-500">{TIME_WINDOW_LABELS[order.time_window] ?? order.time_window}</span>
            )}
            {order.scheduled_time_start && (
              <span className="text-[11px] text-gray-400">{order.scheduled_time_start.slice(0, 5)}</span>
            )}
          </div>
          {order.services?.length > 0 && (
            <p className="text-[11px] text-gray-400 truncate mt-0.5">
              {order.services.map(s => s.name).join(', ')}
            </p>
          )}
          {order.employee_name ? (
            <p className="text-[11px] text-blue-500 mt-0.5 flex items-center gap-1">
              <User className="h-2.5 w-2.5" />{order.employee_name}
            </p>
          ) : (
            <p className="text-[11px] text-orange-500 font-medium mt-0.5">⚠ Nieprzypisane</p>
          )}
        </div>
      </div>
    </button>
  );
}

/* ─── Vehicle Detail panel ───────────────────────────────────────────── */
function VehicleDetailPanel({ vehicle, route, onClose, onRefreshRoutes }: { vehicle: VehicleData; route: EmployeeRoute | null; onClose: () => void; onRefreshRoutes?: () => void }) {
  const color = STATUS_COLORS[vehicle.status] || STATUS_COLORS.offline;
  const [showOrders, setShowOrders] = useState(false);
  const [reoptimizing, setReoptimizing] = useState(false);

  const handleReoptimize = async () => {
    if (!route?.employee_id) return;
    setReoptimizing(true);
    try {
      const res = await fetch('/api/planner/reoptimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: route.employee_id }),
      });
      if (res.ok && onRefreshRoutes) onRefreshRoutes();
    } finally {
      setReoptimizing(false);
    }
  };

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
          {route && route.orders.length > 0 && (
            <Button
              variant="outline"
              className="w-full rounded-xl text-blue-700 border-blue-200 hover:bg-blue-50"
              onClick={handleReoptimize}
              disabled={reoptimizing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${reoptimizing ? 'animate-spin' : ''}`} />
              {reoptimizing ? 'Przeliczam...' : 'Przelicz trase'}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Order Detail panel ─────────────────────────────────────────────── */
function OrderDetailPanel({ order, onClose, onRefresh }: { order: MapOrder; onClose: () => void; onRefresh: () => void }) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  const handleSuggest = async () => {
    setLoadingSuggest(true);
    try {
      const res = await fetch('/api/planner/suggest-insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch { /* ignore */ }
    setLoadingSuggest(false);
  };

  const handleAssign = async (employeeId: string) => {
    setAssigning(employeeId);
    try {
      await fetch('/api/planner/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id, employee_id: employeeId }),
      });
      onRefresh();
      onClose();
    } catch { /* ignore */ }
    setAssigning(null);
  };

  const statusColor = order.priority === 'urgent' ? '#EF4444' : ORDER_STATUS_COLORS[order.status] || '#9CA3AF';

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
            <h2 className="text-lg font-bold text-gray-900">{order.client_name ?? 'Brak klienta'}</h2>
            {order.client_address && (
              <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />{order.client_address}{order.city ? `, ${order.city}` : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-center gap-3 py-2.5 text-white font-semibold text-sm"
        style={{ backgroundColor: statusColor }}>
        {order.priority === 'urgent' && <span className="h-2 w-2 rounded-full bg-white animate-pulse" />}
        <span>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
        {order.priority === 'urgent' && <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">PILNE</span>}
        {order.priority === 'high' && <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">Wysoki</span>}
      </div>

      <div className="p-5 space-y-5">
        {/* Services */}
        {order.services?.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 text-gray-400 mb-2">
              <Briefcase className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wider">Usługi</span>
            </div>
            <div className="space-y-1.5">
              {order.services.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{s.name}</span>
                  <span className="text-gray-500 font-mono text-xs">{s.price.toFixed(2)} zł</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 mt-2 pt-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Razem</span>
              <span className="text-sm font-bold text-gray-900">{order.total_price.toFixed(2)} zł</span>
            </div>
          </div>
        )}

        {/* Time & Priority */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Okno czasowe</span>
            </div>
            <p className="text-sm font-bold text-gray-900">
              {order.time_window ? (TIME_WINDOW_LABELS[order.time_window] ?? order.time_window) : '—'}
            </p>
            {order.scheduled_time_start && (
              <p className="text-xs text-gray-400 mt-0.5">{order.scheduled_time_start.slice(0, 5)}</p>
            )}
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Zap className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Priorytet</span>
            </div>
            <p className="text-sm font-bold" style={{ color: PRIORITY_COLORS[order.priority] || '#6B7280' }}>
              {order.priority === 'urgent' ? 'Pilny' : order.priority === 'high' ? 'Wysoki' : order.priority === 'low' ? 'Niski' : 'Normalny'}
            </p>
          </div>
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-amber-600 mb-1">Notatki</p>
            <p className="text-sm text-amber-900">{order.notes}</p>
          </div>
        )}

        {/* Assignment */}
        <div className="border border-gray-100 rounded-xl p-3.5">
          <div className="flex items-center gap-1.5 text-gray-400 mb-2">
            <User className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wider">Przypisanie</span>
          </div>
          {order.employee_name ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                  {getInitials(order.employee_name)}
                </div>
                <span className="text-sm font-semibold text-gray-900">{order.employee_name}</span>
              </div>
              <button onClick={handleSuggest} className="text-xs text-blue-500 font-medium hover:underline">
                Zmień
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-orange-500 font-medium mb-2">⚠ Nieprzypisane do pracownika</p>
              <button
                onClick={handleSuggest}
                disabled={loadingSuggest}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                {loadingSuggest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                Sugeruj pracownika
              </button>
            </div>
          )}
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Sugestie przypisania</p>
            {suggestions.slice(0, 5).map((s: any) => (
              <div key={s.employee_id} className={`border rounded-xl p-3 flex items-center justify-between ${s.is_nearby ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-100'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{s.employee_name}</p>
                    {s.is_driving && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">W trasie</span>}
                    {s.is_nearby && <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">Blisko!</span>}
                  </div>
                  {s.plate && <p className="text-xs text-gray-400 font-mono">{s.plate}</p>}
                  <div className="flex items-center gap-3 mt-0.5">
                    {s.gps_distance_km !== null && (
                      <span className="text-[11px] font-semibold text-blue-600">📍 {s.gps_distance_km} km</span>
                    )}
                    <span className="text-[11px] text-gray-500">+{s.extra_km?.toFixed(1) ?? '?'} km trasy</span>
                    <span className="text-[11px] text-gray-500">{s.current_orders ?? 0} zleceń</span>
                  </div>
                </div>
                <button
                  onClick={() => handleAssign(s.employee_id)}
                  disabled={assigning === s.employee_id}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {assigning === s.employee_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                  Przypisz
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {order.client_phone && (
            <Button className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600"
              onClick={() => window.open(`tel:${order.client_phone}`, '_self')}>
              <Phone className="h-4 w-4 mr-2" />Zadzwoń do klienta
            </Button>
          )}
          {order.lat && order.lng && (
            <Button variant="outline" className="w-full rounded-xl"
              onClick={async () => {
                if (order.employee_id) {
                  try {
                    // Fetch latest GPS position for the assigned employee
                    const res = await fetch(`/api/employee-gps?employee_id=${order.employee_id}`);
                    if (res.ok) {
                      const gps = await res.json();
                      if (gps.lat && gps.lng) {
                        window.open(`https://www.google.com/maps/dir/${gps.lat},${gps.lng}/${order.lat},${order.lng}`, '_blank');
                        return;
                      }
                    }
                  } catch { /* fallback: open client location only */ }
                }
                // No employee or GPS unavailable — open client location
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}&travelmode=driving`, '_blank');
              }}>
              <Navigation className="h-4 w-4 mr-2" />Nawiguj do klienta
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Quick Add Order panel ──────────────────────────────────────────── */
function QuickAddOrderPanel({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [priority, setPriority] = useState<string>('urgent');
  const [timeWindow, setTimeWindow] = useState<string>('morning');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [services, setServices] = useState<{ id: string; name: string; price: number }[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [showServices, setShowServices] = useState(false);

  useEffect(() => {
    const loadServices = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.from('services').select('id, name, base_price').eq('is_active', true).order('name');
        if (data) setServices(data.map(s => ({ id: s.id, name: s.name, price: s.base_price ?? 0 })));
      } catch { /* ignore */ }
    };
    loadServices();
  }, []);

  const toggleService = (id: string) => {
    setSelectedServiceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSubmit = async () => {
    if (!clientName.trim()) return;
    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName,
          client_phone: clientPhone || null,
          address: address || null,
          city: city || null,
          priority,
          time_window: timeWindow,
          scheduled_date: today,
          notes: notes || null,
          service_ids: selectedServiceIds.length > 0 ? selectedServiceIds : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const orderId = data.id ?? data.order?.id;
        if (orderId) {
          setCreatedOrderId(orderId);
          // Auto-suggest
          setLoadingSuggest(true);
          try {
            const sRes = await fetch('/api/planner/suggest-insert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ order_id: orderId }),
            });
            const sData = await sRes.json();
            setSuggestions(sData.suggestions ?? []);
          } catch { /* ignore */ }
          setLoadingSuggest(false);
        } else {
          onRefresh();
          onClose();
        }
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  const handleAssign = async (employeeId: string) => {
    if (!createdOrderId) return;
    setAssigning(employeeId);
    try {
      await fetch('/api/planner/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: createdOrderId, employee_id: employeeId }),
      });
      onRefresh();
      onClose();
    } catch { /* ignore */ }
    setAssigning(null);
  };

  const priorityOptions = [
    { value: 'low', label: 'Niski', color: '#9CA3AF' },
    { value: 'normal', label: 'Normalny', color: '#6B7280' },
    { value: 'high', label: 'Wysoki', color: '#F97316' },
    { value: 'urgent', label: 'Pilny', color: '#EF4444' },
  ];

  const timeWindowOptions = [
    { value: 'morning', label: '🌅 Rano', sub: '8-12' },
    { value: 'afternoon', label: '☀️ Południe', sub: '12-16' },
    { value: 'evening', label: '🌇 Wieczór', sub: '16-20' },
  ];

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
            <h2 className="text-lg font-bold text-gray-900">Nowe zlecenie</h2>
            <p className="text-sm text-gray-500 mt-0.5">Szybkie dodawanie z mapy</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {!createdOrderId ? (
          <>
            {/* Client name */}
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Klient</label>
              <Input placeholder="Imię i nazwisko" value={clientName} onChange={e => setClientName(e.target.value)}
                className="h-9 text-sm rounded-xl" />
            </div>

            {/* Phone */}
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Telefon</label>
              <Input placeholder="+48 ..." value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                className="h-9 text-sm rounded-xl" />
            </div>

            {/* Address */}
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Adres</label>
              <Input placeholder="ul. Przykładowa 1" value={address} onChange={e => setAddress(e.target.value)}
                className="h-9 text-sm rounded-xl" />
            </div>

            {/* City */}
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Miasto</label>
              <Input placeholder="Warszawa" value={city} onChange={e => setCity(e.target.value)}
                className="h-9 text-sm rounded-xl" />
            </div>

            {/* Services multi-select */}
            {services.length > 0 && (
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Usługi</label>
                <button
                  onClick={() => setShowServices(!showServices)}
                  className="w-full flex items-center justify-between h-9 px-3 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <span className={selectedServiceIds.length === 0 ? 'text-gray-400' : ''}>
                    {selectedServiceIds.length === 0 ? 'Wybierz usługi...' : `${selectedServiceIds.length} wybranych`}
                  </span>
                  <ChevronDown className={cn('h-3.5 w-3.5 text-gray-400 transition-transform', showServices && 'rotate-180')} />
                </button>
                {showServices && (
                  <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                    {services.map(s => (
                      <button
                        key={s.id}
                        onClick={() => toggleService(s.id)}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 transition-colors',
                          selectedServiceIds.includes(s.id) ? 'bg-orange-50' : '',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'h-4 w-4 rounded border flex items-center justify-center',
                            selectedServiceIds.includes(s.id) ? 'bg-orange-500 border-orange-500' : 'border-gray-300',
                          )}>
                            {selectedServiceIds.includes(s.id) && <CheckCircle2 className="h-3 w-3 text-white" />}
                          </div>
                          <span className="text-gray-700">{s.name}</span>
                        </div>
                        <span className="text-xs text-gray-400 font-mono">{s.price.toFixed(0)} zł</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Priority */}
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">Priorytet</label>
              <div className="grid grid-cols-4 gap-1.5">
                {priorityOptions.map(p => (
                  <button key={p.value} onClick={() => setPriority(p.value)}
                    className={cn(
                      'py-1.5 px-2 rounded-lg text-xs font-medium transition-all border',
                      priority === p.value ? 'border-opacity-100 shadow-sm' : 'border-gray-100 text-gray-500 hover:bg-gray-50',
                    )}
                    style={priority === p.value ? { borderColor: p.color, backgroundColor: p.color + '15', color: p.color } : {}}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time window */}
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">Okno czasowe</label>
              <div className="grid grid-cols-3 gap-1.5">
                {timeWindowOptions.map(tw => (
                  <button key={tw.value} onClick={() => setTimeWindow(tw.value)}
                    className={cn(
                      'py-2 px-2 rounded-lg text-xs font-medium transition-all border text-center',
                      timeWindow === tw.value
                        ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm'
                        : 'border-gray-100 text-gray-500 hover:bg-gray-50',
                    )}
                  >
                    <span className="block">{tw.label}</span>
                    <span className="block text-[10px] mt-0.5 opacity-70">{tw.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Notatki</label>
              <textarea
                placeholder="Dodatkowe informacje..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full h-20 px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
              />
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={submitting || !clientName.trim()}
              className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white h-10"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {submitting ? 'Tworzenie...' : 'Utwórz zlecenie'}
            </Button>
          </>
        ) : (
          /* After creation — show suggestions */
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
              <p className="text-sm font-semibold text-emerald-800">Zlecenie utworzone!</p>
              <p className="text-xs text-emerald-600 mt-0.5">Wybierz pracownika do przypisania</p>
            </div>

            {loadingSuggest ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                <span className="ml-2 text-sm text-gray-500">Szukam najlepszego pracownika...</span>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Sugestie przypisania</p>
                {suggestions.slice(0, 3).map((s: any) => (
                  <div key={s.employee_id} className="border border-gray-100 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{s.employee_name}</p>
                      {s.plate && <p className="text-xs text-gray-400 font-mono">{s.plate}</p>}
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-gray-500">+{s.extra_km?.toFixed(1) ?? '?'} km</span>
                        <span className="text-[11px] text-gray-500">{s.current_orders ?? 0} zleceń</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAssign(s.employee_id)}
                      disabled={assigning === s.employee_id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                    >
                      {assigning === s.employee_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                      Przypisz
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-400">Brak sugestii — przypisz ręcznie w panelu zleceń</p>
              </div>
            )}

            <Button variant="outline" className="w-full rounded-xl" onClick={() => { onRefresh(); onClose(); }}>
              Zamknij
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Haversine distance (km) ────────────────────────────────────────── */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ─── Nearby workers panel ──────────────────────────────────────────── */
function NearbyWorkersPanel({
  pin, workers, radiusKm, onRadiusChange, onClose,
}: {
  pin: AddressPin;
  workers: NearbyWorker[];
  radiusKm: number;
  onRadiusChange: (km: number) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 380, opacity: 0 }}
      transition={{ type: 'spring', damping: 26, stiffness: 280 }}
      className="w-[380px] flex-shrink-0 bg-white border-l border-gray-100 flex flex-col overflow-y-auto"
    >
      {/* Header */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900">Pracownicy w pobliżu</h2>
            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1 truncate">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />{pin.label}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-colors flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Radius slider */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Promień wyszukiwania</span>
          <span className="text-sm font-bold text-gray-700">{radiusKm} km</span>
        </div>
        <input
          type="range"
          min={5}
          max={50}
          step={5}
          value={radiusKm}
          onChange={e => onRadiusChange(Number(e.target.value))}
          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
          <span>5 km</span><span>50 km</span>
        </div>
      </div>

      {/* Workers list */}
      <div className="flex-1 overflow-y-auto p-5 space-y-2">
        {workers.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <User className="h-6 w-6 mx-auto mb-2" />
            <p className="text-sm">Brak pracowników w promieniu {radiusKm} km</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-2">
              {workers.length} pracownik{workers.length === 1 ? '' : workers.length < 5 ? 'ów' : 'ów'} w zasięgu
            </p>
            {workers.map(w => {
              const statusColor = STATUS_COLORS[w.status] || STATUS_COLORS.offline;
              return (
                <div key={w.employee_id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
                        <span className="text-sm font-bold text-gray-900">{w.employee_name}</span>
                      </div>
                      {w.plate && <p className="text-xs text-gray-400 font-mono mt-0.5 ml-[18px]">{w.plate}</p>}
                      <div className="flex items-center gap-3 mt-1 ml-[18px]">
                        <span className="text-[11px] font-semibold text-blue-600">{w.distance_km.toFixed(1)} km</span>
                        <span className="text-[11px] text-gray-500">~{Math.round(w.travel_minutes)} min</span>
                        <span className="text-[11px] text-gray-500">{w.orders_today} zleceń</span>
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: statusColor + '20', color: statusColor }}>
                          {STATUS_LABELS[w.status] ?? w.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 ml-[18px]">
                    <a
                      href={`/dispatch?address=${encodeURIComponent(pin.label)}&lat=${pin.lat}&lng=${pin.lng}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors"
                    >
                      <Plus className="h-3 w-3" />Utwórz zlecenie
                    </a>
                  </div>
                </div>
              );
            })}
          </>
        )}
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
  const [allOrders, setAllOrders] = useState<MapOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleData | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<EmployeeRoute | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<MapOrder | null>(null);
  const [tab, setTab] = useState<SidebarTab>('vehicles');
  const [showRouteLines, setShowRouteLines] = useState(true);
  const [showOrders, setShowOrders] = useState(true);
  const [showRegions, setShowRegions] = useState(false);
  const [mapRegions, setMapRegions] = useState<MapRegion[]>([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [orderFilter, setOrderFilter] = useState<string>('all');
  const [countdown, setCountdown] = useState(30);
  /* Address search state */
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<HereSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressPin, setAddressPin] = useState<AddressPin | null>(null);
  const [nearbyWorkers, setNearbyWorkers] = useState<NearbyWorker[]>([]);
  const [searchRadiusKm, setSearchRadiusKm] = useState(15);
  const [addressSearching, setAddressSearching] = useState(false);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<any>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const fetchAll = useCallback(async () => {
    try {
      const [vRes, rRes, oRes, regRes] = await Promise.all([
        fetch('/api/vehicles/locations'),
        fetch(`/api/dispatcher/routes?date=${today}`),
        fetch(`/api/dispatcher/orders?date=${today}`),
        fetch('/api/regions'),
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
      if (oRes.ok) {
        const data = await oRes.json();
        setAllOrders(data.orders ?? []);
      }
      if (regRes.ok) {
        const data = await regRes.json();
        if (Array.isArray(data)) {
          setMapRegions(data.filter((r: MapRegion) => r.polygon && r.polygon.length >= 3));
        }
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

  /* ── Address autocomplete (HERE) ── */
  const fetchAddressSuggestions = useCallback(async (q: string) => {
    if (q.length < 3) { setAddressSuggestions([]); setShowAddressSuggestions(false); return; }
    try {
      const res = await fetch(
        `https://autocomplete.search.hereapi.com/v1/autocomplete?q=${encodeURIComponent(q)}&apiKey=${HERE_API_KEY}&in=countryCode:POL&limit=5`
      );
      if (res.ok) {
        const data = await res.json();
        setAddressSuggestions((data.items ?? []) as HereSuggestion[]);
        setShowAddressSuggestions(true);
      }
    } catch { /* ignore */ }
  }, []);

  const handleAddressInputChange = useCallback((value: string) => {
    setAddressQuery(value);
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    addressDebounceRef.current = setTimeout(() => fetchAddressSuggestions(value), 500);
  }, [fetchAddressSuggestions]);

  const geocodeAddress = useCallback(async (query: string) => {
    setAddressSearching(true);
    setShowAddressSuggestions(false);
    try {
      const res = await fetch(
        `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(query)}&apiKey=${HERE_API_KEY}`
      );
      if (res.ok) {
        const data = await res.json();
        const item = data.items?.[0];
        if (item?.position) {
          const pin: AddressPin = { lat: item.position.lat, lng: item.position.lng, label: item.address?.label ?? query };
          setAddressPin(pin);
          setAddressQuery(pin.label);
          // Fly to location
          if (mapRef.current) mapRef.current.flyTo([pin.lat, pin.lng], 12, { animate: true, duration: 1 });
        }
      }
    } catch { /* ignore */ }
    setAddressSearching(false);
  }, []);

  const handleAddressSuggestionClick = useCallback((suggestion: HereSuggestion) => {
    const label = suggestion.address?.label ?? suggestion.title;
    setAddressQuery(label);
    geocodeAddress(label);
  }, [geocodeAddress]);

  const handleAddressKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
      setShowAddressSuggestions(false);
      geocodeAddress(addressQuery);
    }
  }, [addressQuery, geocodeAddress]);

  const clearAddressSearch = useCallback(() => {
    setAddressQuery('');
    setAddressPin(null);
    setNearbyWorkers([]);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  }, []);

  /* ── Compute nearby workers when pin or radius or data changes ── */
  useEffect(() => {
    if (!addressPin) { setNearbyWorkers([]); return; }
    const workers: NearbyWorker[] = [];
    for (const route of routes) {
      const pos = route.current_position;
      if (!pos) continue;
      const dist = haversineKm(addressPin.lat, addressPin.lng, pos.lat, pos.lng);
      if (dist <= searchRadiusKm) {
        // Estimate travel time: haversine * 1.4 road factor / 50 km/h * 60 min
        const travelMin = (dist * 1.4) / 50 * 60;
        workers.push({
          employee_id: route.employee_id,
          employee_name: route.employee_name,
          plate: route.plate,
          status: pos.status ?? 'offline',
          lat: pos.lat,
          lng: pos.lng,
          distance_km: dist,
          travel_minutes: travelMin,
          orders_today: route.total_orders,
        });
      }
    }
    // Also check vehicles that may not have routes
    for (const v of vehicles) {
      if (!v.lat || !v.lng) continue;
      // Skip if already added from routes
      if (workers.some(w => w.plate === v.plate_number)) continue;
      const dist = haversineKm(addressPin.lat, addressPin.lng, v.lat, v.lng);
      if (dist <= searchRadiusKm) {
        const travelMin = (dist * 1.4) / 50 * 60;
        const matchRoute = routes.find(r => r.plate === v.plate_number || r.employee_name === v.driver_name);
        workers.push({
          employee_id: matchRoute?.employee_id ?? v.id,
          employee_name: v.driver_name ?? v.plate_number,
          plate: v.plate_number,
          status: v.status,
          lat: v.lat,
          lng: v.lng,
          distance_km: dist,
          travel_minutes: travelMin,
          orders_today: matchRoute?.total_orders ?? 0,
        });
      }
    }
    workers.sort((a, b) => a.distance_km - b.distance_km);
    setNearbyWorkers(workers);
  }, [addressPin, searchRadiusKm, routes, vehicles]);

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

  const filteredOrders = allOrders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = (o.client_name?.toLowerCase().includes(q) ?? false) ||
      (o.client_address?.toLowerCase().includes(q) ?? false) ||
      (o.employee_name?.toLowerCase().includes(q) ?? false) ||
      (o.city?.toLowerCase().includes(q) ?? false);
    const matchFilter = orderFilter === 'all' || o.status === orderFilter;
    return matchSearch && matchFilter;
  });

  const handleSelectVehicle = (v: VehicleData) => {
    setSelectedVehicle(prev => prev?.id === v.id ? null : v);
    setSelectedOrder(null);
    // Find matching route for this vehicle's driver
    const matchRoute = routes.find(r => r.plate === v.plate_number || r.employee_name === v.driver_name);
    setSelectedRoute(matchRoute ?? null);
  };

  const handleSelectRoute = (r: EmployeeRoute) => {
    setSelectedRoute(prev => prev?.employee_id === r.employee_id ? null : r);
    setSelectedVehicle(null);
    setSelectedOrder(null);
    // Fly to first waypoint
    if (r.waypoints.length > 0 && mapRef.current) {
      mapRef.current.flyTo([r.waypoints[0].lat, r.waypoints[0].lng], 12, { animate: true, duration: 1 });
    }
  };

  const handleSelectOrder = (o: MapOrder) => {
    setSelectedOrder(prev => prev?.id === o.id ? null : o);
    setSelectedVehicle(null);
    setSelectedRoute(null);
    // Fly to order location
    if (o.lat && o.lng && mapRef.current) {
      mapRef.current.flyTo([o.lat, o.lng], 14, { animate: true, duration: 1 });
    }
  };

  const drivingCount = vehicles.filter(v => v.status === 'driving').length;
  const onlineCount = vehicles.filter(v => v.status !== 'offline').length;
  const totalOrdersToday = routes.reduce((s, r) => s + r.total_orders, 0);
  const unassignedCount = allOrders.filter(o => !o.employee_id && o.status === 'new').length;

  const orderCountAll = allOrders.length;
  const orderCountNew = allOrders.filter(o => o.status === 'new').length;
  const orderCountAssigned = allOrders.filter(o => o.status === 'assigned').length;
  const orderCountInProgress = allOrders.filter(o => o.status === 'in_progress').length;

  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>
      <Topbar
        title="Mapa dyspozytora"
        subtitle={`${onlineCount} online · ${drivingCount} w trasie · ${totalOrdersToday} zleceń · ${unassignedCount > 0 ? `⚠ ${unassignedCount} nieprzypisanych` : '✓ wszystkie przypisane'}`}
        icon={<Truck className="h-5 w-5" />}
      />

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
              <button onClick={() => setTab('orders')} className={cn('flex-1 text-xs font-medium py-1.5 rounded-lg transition-all', tab === 'orders' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500')}>
                <Package className="h-3.5 w-3.5 inline mr-1" />Zlecenia
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
            ) : tab === 'routes' ? (
              filteredRoutes.length === 0 ? (
                <div className="text-center py-12 text-gray-400"><Route className="h-6 w-6 mx-auto mb-2" /><p className="text-sm">Brak tras na dziś</p></div>
              ) : filteredRoutes.map(r => (
                <RouteCard key={r.employee_id} route={r} selected={selectedRoute?.employee_id === r.employee_id} onClick={() => handleSelectRoute(r)} />
              ))
            ) : (
              /* Orders tab */
              <>
                {/* Order count badges */}
                <div className="flex flex-wrap items-center gap-1 pb-2">
                  {[
                    { key: 'all', label: 'Wszystkie', count: orderCountAll },
                    { key: 'new', label: 'Nowe', count: orderCountNew },
                    { key: 'assigned', label: 'Przypisane', count: orderCountAssigned },
                    { key: 'in_progress', label: 'W trakcie', count: orderCountInProgress },
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setOrderFilter(f.key)}
                      className={cn(
                        'text-[11px] font-medium px-2 py-1 rounded-lg transition-all',
                        orderFilter === f.key ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100',
                      )}
                    >
                      {f.label} ({f.count})
                    </button>
                  ))}
                </div>
                {filteredOrders.length === 0 ? (
                  <div className="text-center py-12 text-gray-400"><Package className="h-6 w-6 mx-auto mb-2" /><p className="text-sm">Brak zleceń</p></div>
                ) : filteredOrders.map(o => (
                  <OrderCard key={o.id} order={o} selected={selectedOrder?.id === o.id} onClick={() => handleSelectOrder(o)} />
                ))}
              </>
            )}
          </div>

          {/* Legend */}
          <div className="p-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Legenda</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowOrders(!showOrders)} className="text-[11px] text-orange-500 font-medium">
                  {showOrders ? 'Ukryj zlecenia' : 'Pokaż zlecenia'}
                </button>
                <button onClick={() => setShowRouteLines(!showRouteLines)} className="text-[11px] text-blue-500 font-medium">
                  {showRouteLines ? 'Ukryj trasy' : 'Pokaż trasy'}
                </button>
                <button onClick={() => setShowRegions(!showRegions)} className="text-[11px] text-purple-500 font-medium">
                  {showRegions ? 'Ukryj regiony' : 'Pokaż regiony'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(STATUS_COLORS).map(([s, c]) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                  <span className="text-[11px] text-gray-500">{STATUS_LABELS[s]}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-2 pt-2 border-t border-gray-50">
              {Object.entries(ORDER_STATUS_COLORS).filter(([s]) => s !== 'cancelled').map(([s, c]) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c, border: s === 'new' ? '1px dashed #9CA3AF' : undefined }} />
                  <span className="text-[11px] text-gray-500">{ORDER_STATUS_LABELS[s]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Map ── */}
        <div className="flex-1 relative overflow-hidden">
          {/* Address search bar overlay */}
          <div className="absolute top-4 left-4 right-4 z-[1000] flex justify-center pointer-events-none">
            <div className="relative w-full max-w-md pointer-events-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Wpisz adres klienta..."
                  value={addressQuery}
                  onChange={e => handleAddressInputChange(e.target.value)}
                  onKeyDown={handleAddressKeyDown}
                  onFocus={() => { if (addressSuggestions.length > 0) setShowAddressSuggestions(true); }}
                  className="w-full h-10 pl-10 pr-10 rounded-xl border border-gray-200 bg-white shadow-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
                />
                {addressSearching && <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500 animate-spin" />}
                {(addressQuery || addressPin) && (
                  <button onClick={clearAddressSearch} className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {/* Autocomplete dropdown */}
              {showAddressSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {addressSuggestions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => handleAddressSuggestionClick(s)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 transition-colors flex items-center gap-2 border-b border-gray-50 last:border-b-0"
                    >
                      <MapPin className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                      <span className="truncate">{s.address?.label ?? s.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <MapContainer center={[52.0, 19.5]} zoom={6} style={{ height: '100%', width: '100%' }} ref={mapRef}>
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />

            {/* Region polygons */}
            {showRegions && mapRegions.map(region => (
              <LeafletPolygon
                key={`region-${region.id}`}
                positions={region.polygon!.map(p => [p[0], p[1]] as [number, number])}
                pathOptions={{
                  color: region.color,
                  fillColor: region.color,
                  fillOpacity: 0.12,
                  weight: 2,
                  opacity: 0.7,
                }}
              >
                <LeafletTooltip sticky>{region.name}</LeafletTooltip>
              </LeafletPolygon>
            ))}

            {/* Route polylines */}
            {showRouteLines && routes.map(route => (
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
            {showRouteLines && routes.map(route =>
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

            {/* All order pins */}
            {showOrders && allOrders
              .filter(o => o.lat && o.lng && o.status !== 'completed' && o.status !== 'cancelled')
              .map(order => {
                const isUrgent = order.priority === 'urgent';
                const isSelected = selectedOrder?.id === order.id;
                const color = isUrgent ? '#EF4444' : ORDER_STATUS_COLORS[order.status] || '#9CA3AF';
                return (
                  <CircleMarker
                    key={`order-${order.id}`}
                    center={[order.lat!, order.lng!]}
                    radius={isSelected ? 10 : isUrgent ? 8 : 7}
                    pathOptions={{
                      color: isSelected ? '#1D4ED8' : 'white',
                      fillColor: color,
                      fillOpacity: 0.85,
                      weight: isSelected ? 3 : 2,
                      dashArray: order.status === 'new' ? '4, 3' : undefined,
                    }}
                    eventHandlers={{ click: () => { setSelectedOrder(order); setSelectedVehicle(null); } }}
                  >
                    <Popup>
                      <div className="text-sm min-w-[180px]">
                        <p className="font-bold">{order.client_name ?? 'Brak klienta'}</p>
                        <p className="text-xs text-gray-500">{order.client_address}</p>
                        {order.services?.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">{order.services.map(s => s.name).join(', ')}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: color + '20', color }}>
                            {ORDER_STATUS_LABELS[order.status]}
                          </span>
                          {order.employee_name && <span className="text-xs text-blue-500">{order.employee_name}</span>}
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

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
            {/* Address search pin + radius */}
            {addressPin && (
              <>
                <LeafletCircle
                  center={[addressPin.lat, addressPin.lng]}
                  radius={searchRadiusKm * 1000}
                  pathOptions={{ color: '#F97316', fillColor: '#F97316', fillOpacity: 0.08, weight: 2, dashArray: '6, 4' }}
                />
                <CircleMarker
                  center={[addressPin.lat, addressPin.lng]}
                  radius={10}
                  pathOptions={{ color: '#DC2626', fillColor: '#EF4444', fillOpacity: 1, weight: 3 }}
                >
                  <Popup>
                    <div className="text-sm min-w-[180px]">
                      <p className="font-bold text-red-600">Szukany adres</p>
                      <p className="text-xs text-gray-600 mt-0.5">{addressPin.label}</p>
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5">{addressPin.lat.toFixed(5)}, {addressPin.lng.toFixed(5)}</p>
                    </div>
                  </Popup>
                </CircleMarker>
                {/* Highlight nearby workers with pulse */}
                {nearbyWorkers.map(w => (
                  <CircleMarker
                    key={`nearby-${w.employee_id}`}
                    center={[w.lat, w.lng]}
                    radius={16}
                    pathOptions={{ color: '#F97316', fillColor: '#F97316', fillOpacity: 0.2, weight: 2 }}
                  />
                ))}
              </>
            )}
          </MapContainer>

          {selectedVehicle?.lat && selectedVehicle?.lng && (
            <FlyToEffect lat={selectedVehicle.lat} lng={selectedVehicle.lng} mapRef={mapRef} key={selectedVehicle.id} />
          )}

          {/* Quick Add FAB */}
          <button
            onClick={() => { setShowQuickAdd(true); setSelectedVehicle(null); setSelectedOrder(null); }}
            className="absolute bottom-6 right-6 z-[1000] h-14 w-14 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>

        {/* ── Detail panels ── */}
        <AnimatePresence>
          {selectedVehicle && (
            <VehicleDetailPanel
              vehicle={selectedVehicle}
              route={selectedRoute}
              onClose={() => { setSelectedVehicle(null); setSelectedRoute(null); }}
              onRefreshRoutes={fetchAll}
            />
          )}
          {selectedOrder && !selectedVehicle && (
            <OrderDetailPanel
              order={selectedOrder}
              onClose={() => setSelectedOrder(null)}
              onRefresh={() => { fetchAll(); resetCountdown(); }}
            />
          )}
          {showQuickAdd && !selectedVehicle && !selectedOrder && !addressPin && (
            <QuickAddOrderPanel
              onClose={() => setShowQuickAdd(false)}
              onRefresh={() => { fetchAll(); resetCountdown(); }}
            />
          )}
          {addressPin && !selectedVehicle && !selectedOrder && (
            <NearbyWorkersPanel
              pin={addressPin}
              workers={nearbyWorkers}
              radiusKm={searchRadiusKm}
              onRadiusChange={setSearchRadiusKm}
              onClose={clearAddressSearch}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
