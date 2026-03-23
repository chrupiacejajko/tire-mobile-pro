'use client';

import { useState, useEffect, useCallback } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MapPin, Clock, Route, Calendar, User, Navigation } from 'lucide-react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

interface LocationPoint {
  lat: number;
  lng: number;
  status: string;
  timestamp: string;
}

interface EmployeeOption {
  id: string;
  name: string;
  color: string;
}

export default function GpsHistoryPage() {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [points, setPoints] = useState<LocationPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.from('employees').select('id, user:profiles(full_name), region:regions(color)').eq('is_active', true)
      .then(({ data }) => {
        if (data) setEmployees(data.map((e: any) => ({
          id: e.id, name: e.user?.full_name || 'Nieznany', color: e.region?.color || '#3B82F6',
        })));
      });
  }, []);

  const fetchRoute = useCallback(async () => {
    if (!selectedEmployee || !selectedDate) return;
    setLoading(true);

    const startOfDay = `${selectedDate}T00:00:00`;
    const endOfDay = `${selectedDate}T23:59:59`;

    const { data } = await supabase
      .from('employee_locations')
      .select('lat, lng, status, timestamp')
      .eq('employee_id', selectedEmployee)
      .gte('timestamp', startOfDay)
      .lte('timestamp', endOfDay)
      .order('timestamp');

    setPoints((data || []) as LocationPoint[]);
    setLoading(false);
  }, [selectedEmployee, selectedDate]);

  useEffect(() => { fetchRoute(); }, [fetchRoute]);

  const routeCoords = points.map(p => [p.lat, p.lng] as [number, number]);
  const totalDistance = points.length > 1
    ? points.reduce((sum, p, i) => {
        if (i === 0) return 0;
        const prev = points[i - 1];
        const R = 6371;
        const dLat = (p.lat - prev.lat) * Math.PI / 180;
        const dLng = (p.lng - prev.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(prev.lat * Math.PI / 180) * Math.cos(p.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return sum + R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }, 0)
    : 0;

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const empColor = employees.find(e => e.id === selectedEmployee)?.color || '#3B82F6';

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Historia GPS"
        subtitle="Trasy przejechane przez pracowników"
        icon={<Route className="h-5 w-5" />}
      />
      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <Select value={selectedEmployee} onValueChange={v => setSelectedEmployee(v ?? '')}>
            <SelectTrigger className="w-56 h-9 rounded-xl">
              <User className="mr-2 h-4 w-4" /><SelectValue placeholder="Wybierz pracownika" />
            </SelectTrigger>
            <SelectContent>
              {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-44 h-9 rounded-xl" />
        </div>

        {/* Stats */}
        {points.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Card className="rounded-2xl border-gray-100 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Punkty GPS</p><p className="text-xl font-bold">{points.length}</p>
            </CardContent></Card>
            <Card className="rounded-2xl border-gray-100 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Dystans</p><p className="text-xl font-bold">{totalDistance.toFixed(1)} km</p>
            </CardContent></Card>
            <Card className="rounded-2xl border-gray-100 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Start</p><p className="text-xl font-bold">{firstPoint ? new Date(firstPoint.timestamp).toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' }) : '-'}</p>
            </CardContent></Card>
            <Card className="rounded-2xl border-gray-100 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Koniec</p><p className="text-xl font-bold">{lastPoint ? new Date(lastPoint.timestamp).toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' }) : '-'}</p>
            </CardContent></Card>
          </div>
        )}

        {/* Map */}
        <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden" style={{ height: '500px' }}>
          <CardContent className="p-0 h-full">
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            <MapContainer
              center={routeCoords.length > 0 ? routeCoords[Math.floor(routeCoords.length / 2)] : [52.0, 20.0]}
              zoom={routeCoords.length > 0 ? 12 : 6}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {routeCoords.length > 1 && (
                <Polyline positions={routeCoords} pathOptions={{ color: empColor, weight: 3, opacity: 0.8 }} />
              )}
              {firstPoint && (
                <CircleMarker center={[firstPoint.lat, firstPoint.lng]} radius={8}
                  pathOptions={{ color: '#10B981', fillColor: '#10B981', fillOpacity: 1 }}>
                  <Popup>Start: {new Date(firstPoint.timestamp).toLocaleTimeString('pl')}</Popup>
                </CircleMarker>
              )}
              {lastPoint && lastPoint !== firstPoint && (
                <CircleMarker center={[lastPoint.lat, lastPoint.lng]} radius={8}
                  pathOptions={{ color: '#EF4444', fillColor: '#EF4444', fillOpacity: 1 }}>
                  <Popup>Koniec: {new Date(lastPoint.timestamp).toLocaleTimeString('pl')}</Popup>
                </CircleMarker>
              )}
            </MapContainer>
          </CardContent>
        </Card>

        {!selectedEmployee && (
          <div className="text-center text-gray-400 py-8">
            <Navigation className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Wybierz pracownika i datę</p>
            <p className="text-xs mt-1">Zobaczysz trasę przejechaną w wybranym dniu</p>
          </div>
        )}
      </div>
    </div>
  );
}
