'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MapPin, Navigation, User, Clock, Filter, ExternalLink, Phone } from 'lucide-react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });

interface OrderPin {
  id: string;
  lat: number;
  lng: number;
  client_name: string;
  address: string;
  status: string;
  time: string;
  date: string;
}

interface EmployeePin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  region: string;
  regionColor: string;
}

const statusColors: Record<string, string> = {
  new: '#3B82F6',
  assigned: '#F59E0B',
  in_progress: '#8B5CF6',
  completed: '#10B981',
  cancelled: '#EF4444',
};

const empStatusColors: Record<string, string> = {
  online: '#9CA3AF',
  driving: '#3B82F6',
  working: '#10B981',
  offline: '#EF4444',
};

const empStatusLabels: Record<string, string> = {
  online: 'Dostępny',
  driving: 'W trasie',
  working: 'Na zleceniu',
  offline: 'Offline',
};

export default function MapPage() {
  const [orders, setOrders] = useState<OrderPin[]>([]);
  const [employees, setEmployees] = useState<EmployeePin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOrders, setShowOrders] = useState(true);
  const [showEmployees, setShowEmployees] = useState(true);
  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    // Fetch today's orders with coordinates
    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, lat, lng, address, status, scheduled_time_start, scheduled_date, client:clients(name)')
      .not('status', 'eq', 'cancelled')
      .not('lat', 'is', null);

    if (ordersData) {
      setOrders(ordersData.map((o: any) => ({
        id: o.id,
        lat: o.lat,
        lng: o.lng,
        client_name: o.client?.name || 'Nieznany',
        address: o.address,
        status: o.status,
        time: o.scheduled_time_start?.slice(0, 5) || '',
        date: o.scheduled_date,
      })));
    }

    // Fetch employee locations
    const { data: locData } = await supabase
      .from('employee_locations')
      .select('*, employee:employees(user:profiles(full_name), region:regions(name, color))')
      .order('timestamp', { ascending: false });

    if (locData) {
      const latest = new Map<string, any>();
      for (const loc of locData) {
        if (!latest.has(loc.employee_id)) latest.set(loc.employee_id, loc);
      }
      setEmployees([...latest.values()].map((l: any) => ({
        id: l.employee_id,
        name: l.employee?.user?.full_name || 'Nieznany',
        lat: l.lat,
        lng: l.lng,
        status: l.status,
        region: l.employee?.region?.name || '',
        regionColor: l.employee?.region?.color || '#3B82F6',
      })));
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openGoogleMaps = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Mapa"
        subtitle={`${orders.length} zleceń · ${employees.length} pracowników`}
        icon={<MapPin className="h-5 w-5" />}
      />
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6" style={{ height: 'calc(100vh - 140px)' }}>
          {/* Sidebar */}
          <div className="space-y-4 overflow-y-auto">
            {/* Filters */}
            <div className="flex gap-2">
              <Button
                variant={showOrders ? 'default' : 'outline'}
                size="sm"
                className="flex-1 rounded-xl text-xs h-8"
                onClick={() => setShowOrders(!showOrders)}
              >
                <MapPin className="h-3 w-3 mr-1" /> Zlecenia ({orders.length})
              </Button>
              <Button
                variant={showEmployees ? 'default' : 'outline'}
                size="sm"
                className="flex-1 rounded-xl text-xs h-8"
                onClick={() => setShowEmployees(!showEmployees)}
              >
                <User className="h-3 w-3 mr-1" /> Ekipa ({employees.length})
              </Button>
            </div>

            {/* Employees */}
            {showEmployees && (
              <Card className="rounded-2xl border-gray-100 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Pracownicy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {employees.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">Brak danych GPS</p>
                  ) : (
                    employees.map(emp => (
                      <div key={emp.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: empStatusColors[emp.status] || '#9CA3AF' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{emp.name}</p>
                          <p className="text-[11px] text-gray-400">{empStatusLabels[emp.status] || emp.status} · {emp.region}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openGoogleMaps(emp.lat, emp.lng)}>
                          <Navigation className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}

            {/* Orders */}
            {showOrders && (
              <Card className="rounded-2xl border-gray-100 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Zlecenia na mapie</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {orders.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">Brak zleceń z lokalizacją</p>
                  ) : (
                    orders.slice(0, 20).map(order => (
                      <div key={order.id} className="flex items-start gap-3 p-2 rounded-xl hover:bg-gray-50">
                        <div className="mt-1 h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: statusColors[order.status] }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{order.client_name}</p>
                          <p className="text-[11px] text-gray-400 truncate">{order.address}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-gray-500"><Clock className="h-3 w-3 inline mr-0.5" />{order.time}</span>
                            <span className="text-[11px] text-gray-500">{order.date}</span>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openGoogleMaps(order.lat, order.lng)}>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}

            {/* Legend */}
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Legenda</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries({ new: 'Nowe', assigned: 'Przydzielone', in_progress: 'W trakcie', completed: 'Ukończone' }).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColors[k] }} />
                      <span className="text-[11px] text-gray-500">{v}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Map */}
          <div className="lg:col-span-3">
            <Card className="h-full rounded-2xl border-gray-100 shadow-sm overflow-hidden">
              <CardContent className="p-0 h-full">
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <MapContainer
                  center={[52.0, 20.0]}
                  zoom={6}
                  style={{ height: '100%', width: '100%', minHeight: '500px' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  />
                  {/* Order pins */}
                  {showOrders && orders.map(order => (
                    <CircleMarker
                      key={order.id}
                      center={[order.lat, order.lng]}
                      radius={8}
                      pathOptions={{
                        color: statusColors[order.status] || '#3B82F6',
                        fillColor: statusColors[order.status] || '#3B82F6',
                        fillOpacity: 0.8,
                        weight: 2,
                      }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <p className="font-bold">{order.client_name}</p>
                          <p className="text-gray-500">{order.address}</p>
                          <p className="text-gray-500">{order.date} · {order.time}</p>
                          <button
                            className="mt-2 text-blue-600 text-xs font-medium"
                            onClick={() => openGoogleMaps(order.lat, order.lng)}
                          >
                            Nawiguj →
                          </button>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                  {/* Employee pins */}
                  {showEmployees && employees.map(emp => (
                    <CircleMarker
                      key={emp.id}
                      center={[emp.lat, emp.lng]}
                      radius={10}
                      pathOptions={{
                        color: emp.regionColor,
                        fillColor: empStatusColors[emp.status] || '#9CA3AF',
                        fillOpacity: 0.9,
                        weight: 3,
                      }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <p className="font-bold">{emp.name}</p>
                          <p className="text-gray-500">{empStatusLabels[emp.status]} · {emp.region}</p>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
