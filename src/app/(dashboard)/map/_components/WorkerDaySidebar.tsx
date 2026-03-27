'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Clock, MapPin, User, Phone, Briefcase,
  ChevronLeft, ChevronRight, Loader2, Calendar,
  Gauge, Compass, Activity, Navigation, ExternalLink,
  History, Route, AlertCircle, RefreshCw, Zap, Fuel,
  TrendingUp, Target, ArrowRight, ArrowLeft, Package,
  Unlink, Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/* ─── Types ─────────────────────────────────────────────────────────── */

interface SidebarOrder {
  id: string;
  status: string;
  priority: string;
  scheduled_date: string;
  scheduled_time_start: string | null;
  scheduled_time_end: string | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
  service_duration_minutes: number | null;
  min_arrival_time: string | null;
  max_arrival_time: string | null;
  time_window: string | null;
  services: { name: string; price: number }[];
  notes: string | null;
  total_price: number;
  client: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    city: string | null;
  } | null;
}

export interface VehicleData {
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
  fuel_liters: number | null;
  fuel_percent: number | null;
  odometer_km: number | null;
  voltage: number | null;
  engine_on: boolean | null;
  heading: number | null;
}

export interface EmployeeRoute {
  employee_id: string;
  employee_name: string;
  plate: string | null;
  color: string;
  current_position: { lat: number; lng: number; speed: number | null; direction: string | null; status: string | null; timestamp: string } | null;
  orders: { id: string; status: string; priority: string; time: string; lat: number | null; lng: number | null; client_name: string; client_address: string; services: any[] }[];
  total_orders: number;
  total_km: number;
  waypoints: { lat: number; lng: number }[];
}

export interface MapOrder {
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

interface WorkerDaySidebarProps {
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  highlightOrderId?: string | null;
  /** Currently hovered order (from map pin hover) */
  hoveredOrderId?: string | null;
  /** Callback when hovering over a calendar order block */
  onOrderHover?: (orderId: string | null) => void;
  onClose: () => void;
  onOrderClick?: (orderId: string) => void;
  /* Vehicle tab data (optional — shows tabs when provided) */
  vehicle?: VehicleData | null;
  route?: EmployeeRoute | null;
  onRefreshRoutes?: () => void;
  /* Order detail data (optional — shows order overlay when provided) */
  selectedOrder?: MapOrder | null;
  onOrderClose?: () => void;
  onOrderRefresh?: () => void;
  /** When true, render as a plain div that fills parent (no motion, no absolute positioning) */
  embedded?: boolean;
  /** Address prefill from map search — passed to inline order creation form */
  initialAddress?: string;
}

/* ─── Constants ──────────────────────────────────────────────────────── */

const HOUR_HEIGHT = 60; // px per hour
const START_HOUR = 6;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;

const STATUS_COLORS: Record<string, string> = {
  new: '#9CA3AF',
  assigned: '#F59E0B',
  in_progress: '#3B82F6',
  completed: '#10B981',
  cancelled: '#EF4444',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Nowe',
  assigned: 'Przypisane',
  in_progress: 'W trakcie',
  completed: 'Zakonczone',
  cancelled: 'Anulowane',
};

const VEHICLE_STATUS_COLORS: Record<string, string> = {
  driving: '#3B82F6', working: '#F59E0B', online: '#10B981', offline: '#6B7280',
};
const VEHICLE_STATUS_LABELS: Record<string, string> = {
  driving: 'Jedzie', working: 'Postoj', online: 'Online', offline: 'Offline',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#EF4444', high: '#F97316', normal: '#6B7280', low: '#9CA3AF',
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  new: '#9CA3AF', assigned: '#F59E0B', in_progress: '#3B82F6', completed: '#10B981', cancelled: '#EF4444',
};
const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'Nowe', assigned: 'Przypisane', in_progress: 'W trakcie', completed: 'Zakonczone', cancelled: 'Anulowane',
};

const TIME_WINDOW_LABELS: Record<string, string> = {
  morning: 'Rano (8-12)', afternoon: 'Poludnie (12-16)', evening: 'Wieczor (16-20)',
};

const DIRECTION_DEG: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

/* ─── Helpers ────────────────────────────────────────────────────────── */

function parseTimeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null;
  const tIdx = timeStr.indexOf('T');
  const timePart = tIdx >= 0 ? timeStr.slice(tIdx + 1) : timeStr;
  const parts = timePart.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function getOrderTimeRange(order: SidebarOrder): { startMin: number; endMin: number } | null {
  const startStr = order.planned_start_time ?? order.scheduled_time_start;
  const endStr = order.planned_end_time ?? order.scheduled_time_end;
  const startMin = parseTimeToMinutes(startStr);
  if (startMin === null) return null;
  let endMin = parseTimeToMinutes(endStr);
  if (endMin === null || endMin <= startMin) {
    const duration = order.service_duration_minutes ?? 60;
    endMin = startMin + duration;
  }
  return { startMin, endMin };
}

function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function localToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}
function isToday(dateStr: string): boolean {
  return dateStr === localToday();
}

function formatLastUpdate(ts: string | null): string {
  if (!ts) return 'brak danych';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (diff < 1) return 'przed chwila';
  if (diff === 1) return '1 min temu';
  if (diff < 60) return `${diff} min temu`;
  const h = Math.floor(diff / 60);
  return h === 1 ? '1 godz. temu' : `${h} godz. temu`;
}
function formatTimestamp(ts: string | null): string {
  if (!ts) return '\u2014';
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
      <svg viewBox="0 0 60 60" className="w-12 h-12">
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

/* ─── Vehicle detail content ─────────────────────────────────────────── */
function VehicleTabContent({ vehicle, route, onRefreshRoutes }: { vehicle: VehicleData; route: EmployeeRoute | null; onRefreshRoutes?: () => void }) {
  const color = VEHICLE_STATUS_COLORS[vehicle.status] || VEHICLE_STATUS_COLORS.offline;
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
    <div className="flex-1 overflow-y-auto">
      {/* Status bar */}
      <div className={cn('flex items-center justify-center gap-2 py-2 text-white font-semibold text-sm',
        vehicle.status === 'driving' ? 'bg-blue-500' : vehicle.status === 'working' ? 'bg-amber-500' : vehicle.status === 'online' ? 'bg-emerald-500' : 'bg-gray-400'
      )}>
        {vehicle.status === 'driving' && <span className="h-2 w-2 rounded-full bg-white animate-pulse" />}
        <span>{VEHICLE_STATUS_LABELS[vehicle.status]}{vehicle.status === 'driving' && vehicle.speed ? ` \u00b7 ${vehicle.speed} km/h` : ''}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Plate & model */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 tracking-widest">{vehicle.plate_number}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{vehicle.brand} {vehicle.model}{vehicle.year ? ` \u00b7 ${vehicle.year}` : ''}</p>
        </div>

        {/* Speedometer + Compass */}
        <div className="flex items-center gap-3">
          <div className="flex-1"><Speedometer speed={vehicle.speed} color={color} /></div>
          <div className="flex flex-col items-center gap-1.5">
            <CompassRose direction={vehicle.direction} />
            {vehicle.driving_time && (
              <div className="text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Czas jazdy</p>
                <p className="text-xs font-bold text-gray-800">{vehicle.driving_time}</p>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { icon: <Gauge className="h-3 w-3" />, label: 'Predkosc', value: vehicle.speed !== null ? `${vehicle.speed}` : '\u2014', unit: 'km/h' },
            { icon: <Activity className="h-3 w-3" />, label: 'RPM', value: vehicle.rpm !== null ? `${vehicle.rpm}` : '\u2014' },
            { icon: <Compass className="h-3 w-3" />, label: 'Kierunek', value: vehicle.direction ?? '\u2014' },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-lg p-2 text-center">
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                <span style={{ color }}>{s.icon}</span>
                <span className="text-[9px] font-medium uppercase tracking-wider text-gray-400">{s.label}</span>
              </div>
              <p className="text-sm font-bold text-gray-900">{s.value}</p>
              {s.unit && <p className="text-[9px] text-gray-400">{s.unit}</p>}
            </div>
          ))}
        </div>

        {/* Telemetry: fuel, odometer, voltage */}
        {(vehicle.fuel_percent != null || vehicle.odometer_km != null || vehicle.voltage != null) && (
          <div className="space-y-1.5">
            {vehicle.fuel_percent != null && (
              <div className="bg-gray-50 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1 text-gray-400">
                    <Fuel className="h-3 w-3" />
                    <span className="text-[10px] font-medium uppercase tracking-wider">Paliwo</span>
                  </div>
                  <span className="text-xs font-bold text-gray-900">
                    {vehicle.fuel_percent}%
                    {vehicle.fuel_liters != null && <span className="text-[10px] text-gray-400 ml-1">({vehicle.fuel_liters.toFixed(0)}L)</span>}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${vehicle.fuel_percent > 50 ? 'bg-emerald-500' : vehicle.fuel_percent > 25 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${vehicle.fuel_percent}%` }}
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {vehicle.odometer_km != null && (
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="flex items-center justify-center gap-0.5 mb-0.5">
                    <TrendingUp className="h-3 w-3 text-gray-400" />
                    <span className="text-[9px] font-medium uppercase tracking-wider text-gray-400">Przebieg</span>
                  </div>
                  <p className="text-xs font-bold text-gray-900">{vehicle.odometer_km.toLocaleString('pl')}</p>
                  <p className="text-[9px] text-gray-400">km</p>
                </div>
              )}
              {vehicle.voltage != null && (
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="flex items-center justify-center gap-0.5 mb-0.5">
                    <Zap className="h-3 w-3 text-gray-400" />
                    <span className="text-[9px] font-medium uppercase tracking-wider text-gray-400">Akumulator</span>
                  </div>
                  <p className="text-xs font-bold text-gray-900">{vehicle.voltage.toFixed(1)}</p>
                  <p className="text-[9px] text-gray-400">V</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Location */}
        {(vehicle.location_address || (vehicle.lat && vehicle.lng)) && (
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-1 text-gray-400 mb-1">
              <MapPin className="h-3 w-3" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Lokalizacja</span>
            </div>
            {vehicle.location_address && <p className="text-xs text-gray-700 font-medium">{vehicle.location_address}</p>}
            {vehicle.lat && vehicle.lng && (
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">{vehicle.lat.toFixed(5)}, {vehicle.lng.toFixed(5)}</p>
            )}
            <p className="text-[10px] text-gray-400 mt-0.5">{formatTimestamp(vehicle.last_update)}</p>
          </div>
        )}

        {/* Today's route */}
        {route && route.orders.length > 0 && (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowOrders(!showOrders)}
              className="w-full flex items-center justify-between p-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Route className="h-3.5 w-3.5" style={{ color: route.color }} />
                <span>{route.total_orders} zlecen \u00b7 {route.total_km} km</span>
              </div>
              <ChevronRight className={cn('h-3.5 w-3.5 text-gray-400 transition-transform', showOrders && 'rotate-90')} />
            </button>
            {showOrders && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {route.orders.map((o, i) => (
                  <div key={o.id} className="px-2.5 py-2 flex items-start gap-2">
                    <div className="flex-shrink-0 h-4.5 w-4.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white mt-0.5"
                      style={{ backgroundColor: o.status === 'completed' ? '#10B981' : o.status === 'in_progress' ? '#3B82F6' : route.color, width: 18, height: 18 }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-gray-800">{o.client_name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{o.client_address}</p>
                      <p className="text-[10px] text-gray-400">{o.time}</p>
                    </div>
                    {o.priority === 'urgent' && <AlertCircle className="h-3 w-3 text-red-400 flex-shrink-0 mt-0.5" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-1.5">
          {vehicle.lat && vehicle.lng && (
            <>
              <Button className="w-full rounded-lg text-xs h-8" style={{ backgroundColor: color }}
                onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${vehicle.lat},${vehicle.lng}`, '_blank')}>
                <Navigation className="h-3.5 w-3.5 mr-1.5" />Nawiguj
              </Button>
              <Button variant="outline" className="w-full rounded-lg text-xs h-8"
                onClick={() => window.open(`https://www.google.com/maps?q=&layer=c&cbll=${vehicle.lat},${vehicle.lng}`, '_blank')}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Street View
              </Button>
            </>
          )}
          <Button variant="outline" className="w-full rounded-lg text-xs h-8"
            onClick={() => window.open(`/gps-history?vehicle=${vehicle.id}`, '_blank')}>
            <History className="h-3.5 w-3.5 mr-1.5" />Historia trasy
          </Button>
          {route && route.orders.length > 0 && (
            <Button
              variant="outline"
              className="w-full rounded-lg text-xs h-8 text-blue-700 border-blue-200 hover:bg-blue-50"
              onClick={handleReoptimize}
              disabled={reoptimizing}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${reoptimizing ? 'animate-spin' : ''}`} />
              {reoptimizing ? 'Przeliczam...' : 'Przelicz trase'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Order detail content (inline in left sidebar) ──────────────────── */
function OrderDetailContent({ order, onBack, onRefresh }: { order: MapOrder; onBack: () => void; onRefresh: () => void }) {
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
      onBack();
    } catch { /* ignore */ }
    setAssigning(null);
  };

  const handleUnassign = async () => {
    if (!confirm('Czy na pewno chcesz odpiac pracownika od tego zlecenia?')) return;
    try {
      await fetch('/api/orders/unassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id }),
      });
      onRefresh();
      onBack();
    } catch { /* ignore */ }
  };

  const statusColor = order.priority === 'urgent' ? '#EF4444' : ORDER_STATUS_COLORS[order.status] || '#9CA3AF';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Back button header */}
      <div className="p-3 border-b border-gray-100 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-blue-600 font-medium hover:text-blue-700 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Powrot do kalendarza
        </button>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-center gap-2 py-2 text-white font-semibold text-sm"
        style={{ backgroundColor: statusColor }}>
        {order.priority === 'urgent' && <span className="h-2 w-2 rounded-full bg-white animate-pulse" />}
        <span>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
        {order.priority === 'urgent' && <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full">PILNE</span>}
        {order.priority === 'high' && <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full">Wysoki</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Client header */}
        <div>
          <h3 className="text-base font-bold text-gray-900">{order.client_name ?? 'Brak klienta'}</h3>
          {order.client_address && (
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <MapPin className="h-3 w-3 flex-shrink-0" />{order.client_address}{order.city ? `, ${order.city}` : ''}
            </p>
          )}
        </div>

        {/* Services */}
        {order.services?.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-1 text-gray-400 mb-1.5">
              <Briefcase className="h-3 w-3" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Uslugi</span>
            </div>
            <div className="space-y-1">
              {order.services.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700">{s.name}</span>
                  <span className="text-gray-500 font-mono text-[11px]">{s.price.toFixed(2)} zl</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 mt-1.5 pt-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">Razem</span>
              <span className="text-xs font-bold text-gray-900">{order.total_price.toFixed(2)} zl</span>
            </div>
          </div>
        )}

        {/* Time & Priority */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <div className="flex items-center justify-center gap-0.5 mb-0.5">
              <Clock className="h-3 w-3 text-gray-400" />
              <span className="text-[9px] font-medium uppercase tracking-wider text-gray-400">Okno czasowe</span>
            </div>
            <p className="text-xs font-bold text-gray-900">
              {order.time_window ? (TIME_WINDOW_LABELS[order.time_window] ?? order.time_window) : '\u2014'}
            </p>
            {order.scheduled_time_start && (
              <p className="text-[10px] text-gray-400 mt-0.5">{order.scheduled_time_start.slice(0, 5)}</p>
            )}
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <div className="flex items-center justify-center gap-0.5 mb-0.5">
              <Zap className="h-3 w-3 text-gray-400" />
              <span className="text-[9px] font-medium uppercase tracking-wider text-gray-400">Priorytet</span>
            </div>
            <p className="text-xs font-bold" style={{ color: PRIORITY_COLORS[order.priority] || '#6B7280' }}>
              {order.priority === 'urgent' ? 'Pilny' : order.priority === 'high' ? 'Wysoki' : order.priority === 'low' ? 'Niski' : 'Normalny'}
            </p>
          </div>
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-amber-600 mb-0.5">Notatki</p>
            <p className="text-xs text-amber-900">{order.notes}</p>
          </div>
        )}

        {/* Assignment */}
        <div className="border border-gray-100 rounded-lg p-3">
          <div className="flex items-center gap-1 text-gray-400 mb-1.5">
            <User className="h-3 w-3" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Przypisanie</span>
          </div>
          {order.employee_name ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                  {getInitials(order.employee_name)}
                </div>
                <span className="text-xs font-semibold text-gray-900">{order.employee_name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={handleUnassign} className="flex items-center gap-0.5 text-[10px] text-red-500 font-medium hover:underline" title="Odepnij pracownika">
                  <Unlink className="h-2.5 w-2.5" />
                </button>
                <button onClick={handleSuggest} className="text-[10px] text-blue-500 font-medium hover:underline">
                  Zmien
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs text-orange-500 font-medium mb-1.5">Nieprzypisane do pracownika</p>
              <button
                onClick={handleSuggest}
                disabled={loadingSuggest}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                {loadingSuggest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
                Sugeruj pracownika
              </button>
            </div>
          )}
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Sugestie przypisania</p>
            {suggestions.slice(0, 5).map((s: any) => (
              <div key={s.employee_id} className={`border rounded-lg p-2.5 flex items-center justify-between ${s.is_nearby ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-100'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-gray-900">{s.employee_name}</p>
                    {s.is_driving && <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded-full font-medium">W trasie</span>}
                    {s.is_nearby && <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1 py-0.5 rounded-full font-medium">Blisko!</span>}
                  </div>
                  {s.plate && <p className="text-[10px] text-gray-400 font-mono">{s.plate}</p>}
                  <div className="flex items-center gap-2 mt-0.5">
                    {s.gps_distance_km !== null && (
                      <span className="text-[10px] font-semibold text-blue-600">{s.gps_distance_km} km</span>
                    )}
                    <span className="text-[10px] text-gray-500">+{s.extra_km?.toFixed(1) ?? '?'} km trasy</span>
                    <span className="text-[10px] text-gray-500">{s.current_orders ?? 0} zlecen</span>
                  </div>
                </div>
                <button
                  onClick={() => handleAssign(s.employee_id)}
                  disabled={assigning === s.employee_id}
                  className="flex items-center gap-0.5 px-2 py-1 bg-blue-500 text-white rounded-lg text-[10px] font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {assigning === s.employee_id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ArrowRight className="h-2.5 w-2.5" />}
                  Przypisz
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-1.5">
          {order.client_phone && (
            <Button className="w-full rounded-lg text-xs h-8 bg-emerald-500 hover:bg-emerald-600"
              onClick={() => window.open(`tel:${order.client_phone}`, '_self')}>
              <Phone className="h-3.5 w-3.5 mr-1.5" />Zadzwon do klienta
            </Button>
          )}
          {order.lat && order.lng && (
            <Button variant="outline" className="w-full rounded-lg text-xs h-8"
              onClick={async () => {
                if (order.employee_id) {
                  try {
                    const res = await fetch(`/api/employee-gps?employee_id=${order.employee_id}`);
                    if (res.ok) {
                      const gps = await res.json();
                      if (gps.lat && gps.lng) {
                        window.open(`https://www.google.com/maps/dir/${gps.lat},${gps.lng}/${order.lat},${order.lng}`, '_blank');
                        return;
                      }
                    }
                  } catch { /* fallback */ }
                }
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}&travelmode=driving`, '_blank');
              }}>
              <Navigation className="h-3.5 w-3.5 mr-1.5" />Nawiguj do klienta
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

type LeftTab = 'calendar' | 'vehicle';

/* ─── Inline order creation form ─────────────────────────────────────── */
function InlineCreateOrder({
  employeeId,
  employeeName,
  date,
  time,
  initialAddress,
  onBack,
  onCreated,
}: {
  employeeId: string;
  employeeName: string;
  date: string;
  time: string;
  initialAddress?: string;
  onBack: () => void;
  onCreated: () => void;
}) {
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [address, setAddress] = useState(initialAddress ?? '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [services, setServices] = useState<{ id: string; name: string; price: number; duration: number }[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.from('services').select('id, name, base_price, duration_minutes').eq('is_active', true).order('name');
        if (data) setServices(data.map(s => ({ id: s.id, name: s.name, price: s.base_price ?? 0, duration: s.duration_minutes ?? 60 })));
      } catch {}
    };
    load();
  }, []);

  const totalPrice = services.filter(s => selectedServiceIds.includes(s.id)).reduce((sum, s) => sum + s.price, 0);
  const totalDuration = services.filter(s => selectedServiceIds.includes(s.id)).reduce((sum, s) => sum + s.duration, 0);

  const handleSubmit = async () => {
    if (!clientName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName,
          client_phone: clientPhone || null,
          address: address || null,
          scheduled_date: date,
          scheduled_time_start: time,
          employee_id: employeeId,
          notes: notes || null,
          service_ids: selectedServiceIds.length > 0 ? selectedServiceIds : undefined,
        }),
      });
      if (res.ok) {
        onCreated();
      }
    } catch {}
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-700 transition-colors mb-2">
          <ArrowLeft className="h-3.5 w-3.5" />Powrot do kalendarza
        </button>
        <h3 className="text-sm font-bold text-gray-900">Nowe zlecenie</h3>
        <p className="text-[11px] text-gray-400">{employeeName} · {date} · {time}</p>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Klient *</label>
          <Input placeholder="Imie i nazwisko" value={clientName} onChange={e => setClientName(e.target.value)} className="h-8 text-xs rounded-lg" />
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Telefon</label>
          <Input placeholder="+48 ..." value={clientPhone} onChange={e => setClientPhone(e.target.value)} className="h-8 text-xs rounded-lg" />
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Adres</label>
          <Input placeholder="ul. Przykladowa 1, Miasto" value={address} onChange={e => setAddress(e.target.value)} className="h-8 text-xs rounded-lg" />
        </div>

        {/* Services */}
        {services.length > 0 && (
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">Uslugi</label>
            <div className="space-y-1">
              {services.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedServiceIds(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                  className={cn(
                    'w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition-all flex items-center justify-between',
                    selectedServiceIds.includes(s.id) ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-100 bg-white hover:bg-gray-50 text-gray-600',
                  )}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-gray-400">{s.duration} min · {s.price} zl</span>
                </button>
              ))}
            </div>
            {selectedServiceIds.length > 0 && (
              <div className="flex items-center justify-between mt-1.5 px-1 text-xs">
                <span className="text-gray-500">{totalDuration} min</span>
                <span className="font-bold text-gray-900">{totalPrice.toFixed(0)} zl</span>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Notatki</label>
          <Input placeholder="Dodatkowe informacje..." value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-xs rounded-lg" />
        </div>
      </div>

      {/* Submit */}
      <div className="p-3 border-t border-gray-100 flex-shrink-0">
        <Button
          className="w-full rounded-lg text-xs h-9 bg-orange-500 hover:bg-orange-600"
          disabled={!clientName.trim() || submitting}
          onClick={handleSubmit}
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Calendar className="h-3.5 w-3.5 mr-1.5" />}
          Utworz zlecenie na {time}
        </Button>
      </div>
    </div>
  );
}

export function WorkerDaySidebar({
  employeeId,
  employeeName,
  date,
  highlightOrderId,
  hoveredOrderId,
  onOrderHover,
  onClose,
  onOrderClick,
  vehicle,
  route,
  onRefreshRoutes,
  selectedOrder,
  onOrderClose,
  onOrderRefresh,
  embedded,
  initialAddress,
}: WorkerDaySidebarProps) {
  const hasVehicle = !!vehicle;
  const [activeTab, setActiveTab] = useState<LeftTab>('calendar');
  const [orders, setOrders] = useState<SidebarOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(date);
  /* Inline order creation */
  const [createOrderTime, setCreateOrderTime] = useState<string | null>(null);

  // Fetch orders for the employee on the given date
  useEffect(() => {
    let cancelled = false;
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('orders')
          .select('*, client:clients(*)')
          .eq('employee_id', employeeId)
          .eq('scheduled_date', currentDate)
          .neq('status', 'cancelled')
          .order('scheduled_time_start');

        if (!cancelled && data) {
          setOrders(data as SidebarOrder[]);
        }
        if (error) {
          console.error('[WorkerDaySidebar] fetch error:', error);
        }
      } catch (err) {
        console.error('[WorkerDaySidebar] fetch error:', err);
      }
      if (!cancelled) setLoading(false);
    };

    fetchOrders();
    return () => { cancelled = true; };
  }, [employeeId, currentDate]);

  // Current time marker
  const [currentMinutes, setCurrentMinutes] = useState(getCurrentTimeMinutes());
  useEffect(() => {
    if (!isToday(currentDate)) return;
    const interval = setInterval(() => setCurrentMinutes(getCurrentTimeMinutes()), 60_000);
    return () => clearInterval(interval);
  }, [currentDate]);

  // Parse orders into positioned blocks
  const orderBlocks = useMemo(() => {
    return orders
      .map(order => {
        const range = getOrderTimeRange(order);
        if (!range) return null;
        const { startMin, endMin } = range;
        const visStart = Math.max(startMin, START_HOUR * 60);
        const visEnd = Math.min(endMin, END_HOUR * 60);
        if (visStart >= visEnd) return null;
        const top = ((visStart - START_HOUR * 60) / 60) * HOUR_HEIGHT;
        const height = Math.max(((visEnd - visStart) / 60) * HOUR_HEIGHT, 28);
        return { order, startMin, endMin, top, height };
      })
      .filter(Boolean) as {
        order: SidebarOrder;
        startMin: number;
        endMin: number;
        top: number;
        height: number;
      }[];
  }, [orders]);

  // Orders without time
  const untimed = useMemo(() => {
    return orders.filter(o => getOrderTimeRange(o) === null);
  }, [orders]);

  // Current time position
  const showCurrentTime = isToday(currentDate) &&
    currentMinutes >= START_HOUR * 60 &&
    currentMinutes <= END_HOUR * 60;
  const currentTimeTop = showCurrentTime
    ? ((currentMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT
    : 0;

  const navigateDate = (offset: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + offset);
    setCurrentDate(d.toISOString().split('T')[0]);
  };

  const formattedDate = useMemo(() => {
    const d = new Date(currentDate + 'T00:00:00');
    const dayNames = ['Niedziela', 'Poniedzialek', 'Wtorek', 'Sroda', 'Czwartek', 'Piatek', 'Sobota'];
    const monthNames = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paz', 'lis', 'gru'];
    return `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]}`;
  }, [currentDate]);

  const completedCount = orders.filter(o => o.status === 'completed').length;
  const totalCount = orders.length;

  // Show inline create order form?
  if (createOrderTime && employeeId !== '__order_only__') {
    const createContent = (
      <InlineCreateOrder
        employeeId={employeeId}
        employeeName={employeeName}
        date={currentDate}
        time={createOrderTime}
        initialAddress={initialAddress}
        onBack={() => setCreateOrderTime(null)}
        onCreated={() => {
          setCreateOrderTime(null);
          // Refresh orders
          const refetch = async () => {
            try {
              const supabase = createClient();
              const { data } = await supabase
                .from('orders')
                .select('id, status, priority, scheduled_date, scheduled_time_start, scheduled_time_end, planned_start_time, planned_end_time, service_duration_minutes, min_arrival_time, max_arrival_time, time_window, services, notes, total_price, client:clients(id, name, phone, address, city)')
                .eq('employee_id', employeeId)
                .eq('scheduled_date', currentDate)
                .order('scheduled_time_start');
              if (data) setOrders(data as any);
            } catch {}
          };
          refetch();
        }}
      />
    );
    if (embedded) {
      return <div className="flex flex-col h-full overflow-hidden bg-white relative">{createContent}</div>;
    }
    return (
      <motion.div initial={{ x: -340, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -340, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="absolute left-0 top-0 bottom-0 w-[320px] bg-white shadow-2xl z-40 flex flex-col overflow-hidden"
      >{createContent}</motion.div>
    );
  }

  // Show order detail overlay?
  const showOrderDetail = !!selectedOrder;

  if (showOrderDetail && selectedOrder && onOrderClose && onOrderRefresh) {
    const orderContent = (
      <OrderDetailContent
        order={selectedOrder}
        onBack={onOrderClose}
        onRefresh={onOrderRefresh}
      />
    );
    if (embedded) {
      return (
        <div className="flex flex-col h-full overflow-hidden bg-white relative">
          {orderContent}
        </div>
      );
    }
    return (
      <motion.div
        initial={{ x: -340, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -340, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="absolute left-0 top-0 bottom-0 w-[320px] bg-white shadow-2xl z-40 flex flex-col overflow-hidden"
      >
        {orderContent}
      </motion.div>
    );
  }

  const content = (
    <>
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex-shrink-0">
        {/* Back button (embedded mode) */}
        {embedded && (
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-700 transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Pojazdy
          </button>
        )}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
              {employeeName.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 leading-tight">{employeeName}</h3>
              <p className="text-[11px] text-gray-400">
                {activeTab === 'calendar' ? 'Kalendarz dnia' : 'Dane pojazdu'}
              </p>
            </div>
          </div>
          {!embedded && (
            <button
              onClick={onClose}
              className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Tabs (only shown when vehicle is available) */}
        {hasVehicle && (
          <div className="flex rounded-lg bg-gray-100 p-0.5 mb-3">
            <button
              onClick={() => setActiveTab('calendar')}
              className={cn(
                'flex-1 text-[11px] font-medium py-1.5 rounded-md transition-all flex items-center justify-center gap-1',
                activeTab === 'calendar' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
              )}
            >
              <Calendar className="h-3 w-3" />Kalendarz
            </button>
            <button
              onClick={() => setActiveTab('vehicle')}
              className={cn(
                'flex-1 text-[11px] font-medium py-1.5 rounded-md transition-all flex items-center justify-center gap-1',
                activeTab === 'vehicle' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
              )}
            >
              <Truck className="h-3 w-3" />Pojazd
            </button>
          </div>
        )}

        {/* Date navigation (only for calendar tab) */}
        {activeTab === 'calendar' && (
          <>
            <div className="flex items-center justify-between">
              <button
                onClick={() => navigateDate(-1)}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-center">
                <p className="text-xs font-semibold text-gray-700">{formattedDate}</p>
                {isToday(currentDate) && (
                  <span className="text-[10px] text-emerald-600 font-medium">Dzisiaj</span>
                )}
              </div>
              <button
                onClick={() => navigateDate(1)}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Summary */}
            {!loading && (
              <div className="flex items-center gap-3 mt-2.5 text-[11px] text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {totalCount} zlecen
                </span>
                {completedCount > 0 && (
                  <span className="text-emerald-600 font-medium">
                    {completedCount} ukonczonych
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Body: Calendar or Vehicle tab */}
      {activeTab === 'calendar' ? (
        /* Calendar body */
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="relative" style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT + 20 }}>
              {/* Clickable hour slots — click empty area to create order at that time */}
              {Array.from({ length: TOTAL_HOURS * 2 }, (_, i) => {
                const slotMinutes = START_HOUR * 60 + i * 30;
                const slotTop = (i * 30 / 60) * HOUR_HEIGHT;
                const slotHeight = HOUR_HEIGHT / 2;
                const slotTime = minutesToTimeStr(slotMinutes);
                // Check if any order overlaps this 30-min slot
                const isOccupied = orderBlocks.some(b => b.startMin < slotMinutes + 30 && b.endMin > slotMinutes);
                if (isOccupied) return null;
                return (
                  <button
                    key={`slot-${i}`}
                    className="absolute right-2 rounded-md transition-all group z-0 hover:bg-orange-50 hover:border hover:border-dashed hover:border-orange-300"
                    style={{ top: slotTop, height: slotHeight, left: 44 }}
                    onClick={() => setCreateOrderTime(slotTime)}
                    title={`Dodaj zlecenie na ${slotTime}`}
                  >
                    <span className="hidden group-hover:flex items-center justify-center h-full text-[10px] text-orange-500 font-medium gap-1">
                      + {slotTime}
                    </span>
                  </button>
                );
              })}

              {/* Hour grid lines */}
              {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
                const hour = START_HOUR + i;
                const top = i * HOUR_HEIGHT;
                return (
                  <div key={hour} className="absolute left-0 right-0 pointer-events-none" style={{ top }}>
                    <div className="flex items-start">
                      <span className="text-[10px] text-gray-300 font-mono w-10 text-right pr-2 -mt-1.5 select-none">
                        {hour.toString().padStart(2, '0')}:00
                      </span>
                      <div className="flex-1 border-t border-gray-100" />
                    </div>
                  </div>
                );
              })}

              {/* Half-hour dashed lines */}
              {Array.from({ length: TOTAL_HOURS }, (_, i) => {
                const top = i * HOUR_HEIGHT + HOUR_HEIGHT / 2;
                return (
                  <div key={`half-${i}`} className="absolute right-0 pointer-events-none" style={{ top, left: 42 }}>
                    <div className="border-t border-dashed border-gray-50 w-full" />
                  </div>
                );
              })}

              {/* Current time indicator */}
              {showCurrentTime && (
                <div
                  className="absolute left-0 right-0 z-20 pointer-events-none"
                  style={{ top: currentTimeTop }}
                >
                  <div className="flex items-center">
                    <div className="w-10 flex justify-end pr-1">
                      <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    </div>
                    <div className="flex-1 border-t-2 border-red-500" />
                  </div>
                </div>
              )}

              {/* Order blocks */}
              {orderBlocks.map(({ order, startMin, endMin, top, height }) => {
                const isHighlighted = highlightOrderId === order.id;
                const isHovered = hoveredOrderId === order.id;
                const isActive = isHighlighted || isHovered;
                const statusColor = STATUS_COLORS[order.status] || '#9CA3AF';
                const isCompleted = order.status === 'completed';
                const clientName = order.client?.name ?? 'Brak klienta';
                const clientAddress = order.client?.address ?? '';
                const serviceName = order.services?.length > 0
                  ? order.services.map(s => s.name).join(', ')
                  : '';

                return (
                  <button
                    key={order.id}
                    onClick={() => onOrderClick?.(order.id)}
                    onMouseEnter={() => onOrderHover?.(order.id)}
                    onMouseLeave={() => onOrderHover?.(null)}
                    className={cn(
                      'absolute right-2 rounded-lg border-l-[3px] text-left transition-all overflow-hidden',
                      isHighlighted
                        ? 'ring-2 ring-blue-500 ring-offset-1 shadow-md z-10'
                        : isHovered
                          ? 'ring-2 ring-orange-400 ring-offset-1 shadow-md z-10'
                          : 'shadow-sm hover:shadow-md hover:ring-1 hover:ring-orange-300',
                      isCompleted ? 'opacity-60' : '',
                    )}
                    style={{
                      top: top + 2,
                      height: Math.max(height - 4, 24),
                      left: 44,
                      borderLeftColor: isActive ? '#F97316' : statusColor,
                      backgroundColor: isHighlighted ? '#EFF6FF' : isHovered ? '#FFF7ED' : '#F9FAFB',
                    }}
                  >
                    <div className="px-2 py-1 h-full flex flex-col justify-center overflow-hidden">
                      <p className="text-[10px] text-gray-400 font-mono leading-tight">
                        {minutesToTimeStr(startMin)} - {minutesToTimeStr(endMin)}
                      </p>
                      <p className={cn(
                        'text-[11px] font-semibold leading-tight truncate',
                        isCompleted ? 'text-gray-400 line-through' : 'text-gray-800',
                      )}>
                        {clientName}
                      </p>
                      {height > 50 && clientAddress && (
                        <p className="text-[10px] text-gray-400 truncate leading-tight mt-0.5">
                          {clientAddress}
                        </p>
                      )}
                      {height > 70 && serviceName && (
                        <p className="text-[10px] text-gray-400 truncate leading-tight">
                          {serviceName}
                        </p>
                      )}
                      {height > 85 && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: statusColor + '20', color: statusColor }}
                          >
                            {STATUS_LABELS[order.status] ?? order.status}
                          </span>
                          {order.priority === 'urgent' && (
                            <span className="text-[9px] font-bold text-red-500">PILNE</span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Gap indicators */}
              {orderBlocks.length > 1 && orderBlocks.slice(0, -1).map((block, idx) => {
                const nextBlock = orderBlocks[idx + 1];
                const gapMinutes = nextBlock.startMin - block.endMin;
                if (gapMinutes < 5) return null;
                const gapTop = ((block.endMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                const gapHeight = (gapMinutes / 60) * HOUR_HEIGHT;
                if (gapHeight < 12) return null;
                return (
                  <div
                    key={`gap-${idx}`}
                    className="absolute right-2 flex items-center justify-center pointer-events-none"
                    style={{
                      top: gapTop + 2,
                      height: gapHeight - 4,
                      left: 44,
                    }}
                  >
                    <div className="border border-dashed border-gray-200 rounded-lg w-full h-full flex items-center justify-center">
                      <span className="text-[9px] text-gray-300 font-medium">
                        {gapMinutes} min przerwy
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Untimed orders */}
          {untimed.length > 0 && (
            <div className="p-3 border-t border-gray-100">
              <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-2">
                Bez ustalonej godziny
              </p>
              <div className="space-y-1.5">
                {untimed.map(order => {
                  const statusColor = STATUS_COLORS[order.status] || '#9CA3AF';
                  return (
                    <button
                      key={order.id}
                      onClick={() => onOrderClick?.(order.id)}
                      className={cn(
                        'w-full text-left p-2 rounded-lg border-l-[3px] bg-gray-50 hover:bg-gray-100 transition-colors',
                        highlightOrderId === order.id && 'ring-2 ring-blue-500 ring-offset-1',
                      )}
                      style={{ borderLeftColor: statusColor }}
                    >
                      <p className="text-[11px] font-semibold text-gray-800 truncate">
                        {order.client?.name ?? 'Brak klienta'}
                      </p>
                      {order.time_window && (
                        <p className="text-[10px] text-gray-400">
                          Okno: {order.time_window}
                        </p>
                      )}
                      {order.services?.length > 0 && (
                        <p className="text-[10px] text-gray-400 truncate">
                          {order.services.map(s => s.name).join(', ')}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add order button */}
          <div className="p-3 border-t border-gray-100 flex-shrink-0">
            <Button
              className="w-full rounded-lg text-xs h-8 bg-orange-500 hover:bg-orange-600"
              onClick={() => {
                setCreateOrderTime('09:00');
              }}
            >
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              Dodaj zlecenie
            </Button>
          </div>
        </div>
      ) : (
        /* Vehicle tab */
        hasVehicle && vehicle ? (
          <VehicleTabContent
            vehicle={vehicle}
            route={route ?? null}
            onRefreshRoutes={onRefreshRoutes}
          />
        ) : null
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-white relative">
        {content}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ x: -340, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -340, opacity: 0 }}
      transition={{ type: 'spring', damping: 26, stiffness: 280 }}
      className="absolute left-0 top-0 bottom-0 w-[320px] bg-white shadow-xl border-r border-gray-100 flex flex-col z-[999] overflow-hidden"
    >
      {content}
    </motion.div>
  );
}
