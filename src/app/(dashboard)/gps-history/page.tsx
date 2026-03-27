'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MapPin, Clock, Route, Calendar, User, Navigation, Download, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

// ── Fit bounds helper ─────────────────────────────────────────────────────────
function FitBoundsHelper({ coords }: { coords: [number, number][] }) {
  const { useMap } = require('react-leaflet');
  const map = useMap();
  useEffect(() => {
    if (coords.length >= 2) {
      const lats = coords.map(c => c[0]);
      const lngs = coords.map(c => c[1]);
      const bounds: [[number, number], [number, number]] = [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ];
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    } else if (coords.length === 1) {
      map.setView(coords[0], 14);
    }
  }, [coords, map]);
  return null;
}

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
  const [hasFetched, setHasFetched] = useState(false);
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
    setHasFetched(false);

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
    setHasFetched(true);
    setLoading(false);
  }, [selectedEmployee, selectedDate]);

  useEffect(() => { fetchRoute(); }, [fetchRoute]);

  const routeCoords = useMemo(() => points.map(p => [p.lat, p.lng] as [number, number]), [points]);

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

  // ── CSV export ──────────────────────────────────────────────────────────────
  const exportCsv = useCallback(() => {
    if (points.length === 0) return;
    const header = 'timestamp,lat,lng,speed_kmh\n';
    const rows = points.map((p, i) => {
      let speed = 0;
      if (i > 0) {
        const prev = points[i - 1];
        const R = 6371;
        const dLat = (p.lat - prev.lat) * Math.PI / 180;
        const dLng = (p.lng - prev.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(prev.lat * Math.PI / 180) * Math.cos(p.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const dt = (new Date(p.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 3600000;
        speed = dt > 0 ? dist / dt : 0;
      }
      return `${p.timestamp},${p.lat},${p.lng},${speed.toFixed(1)}`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const empName = employees.find(e => e.id === selectedEmployee)?.name || 'trasa';
    a.download = `gps_${empName.replace(/\s+/g, '_')}_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [points, selectedEmployee, selectedDate, employees]);

  // ── KML export ──────────────────────────────────────────────────────────────
  const exportKml = useCallback(() => {
    if (points.length === 0) return;
    const empName = employees.find(e => e.id === selectedEmployee)?.name || 'Trasa';
    const coordinates = points.map(p => `${p.lng},${p.lat},0`).join('\n            ');
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${empName} - ${selectedDate}</name>
    <Style id="route"><LineStyle><color>ff${empColor.slice(5,7)}${empColor.slice(3,5)}${empColor.slice(1,3)}</color><width>3</width></LineStyle></Style>
    <Placemark>
      <name>Trasa</name>
      <styleUrl>#route</styleUrl>
      <LineString>
        <coordinates>
            ${coordinates}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gps_${empName.replace(/\s+/g, '_')}_${selectedDate}.kml`;
    a.click();
    URL.revokeObjectURL(url);
  }, [points, selectedEmployee, selectedDate, employees, empColor]);

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Historia GPS"
        subtitle="Trasy przejechane przez pracowników"
        icon={<Route className="h-5 w-5" />}
      />
      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedEmployee} onValueChange={v => setSelectedEmployee(v ?? '')}>
            <SelectTrigger className="w-56 h-9 rounded-xl">
              <User className="mr-2 h-4 w-4" /><SelectValue placeholder="Wybierz pracownika" />
            </SelectTrigger>
            <SelectContent>
              {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-44 h-9 rounded-xl" />

          {points.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" className="rounded-xl h-9" onClick={exportCsv}>
                <Download className="h-4 w-4 mr-1.5" />CSV
              </Button>
              <Button variant="outline" size="sm" className="rounded-xl h-9" onClick={exportKml}>
                <Download className="h-4 w-4 mr-1.5" />KML
              </Button>
            </div>
          )}
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
        <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden relative" style={{ height: '500px' }}>
          <CardContent className="p-0 h-full">
            {loading && (
              <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="text-sm text-gray-500 font-medium">Ładowanie trasy...</span>
                </div>
              </div>
            )}
            <MapContainer
              center={[52.0, 20.0]}
              zoom={6}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; CARTO &copy; OSM'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              />
              {routeCoords.length > 0 && <FitBoundsHelper coords={routeCoords} />}
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

        {/* No data message */}
        {selectedEmployee && hasFetched && !loading && points.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Brak danych GPS dla wybranego dnia</p>
            <p className="text-xs mt-1">Pracownik nie miał zarejestrowanych punktów lokalizacji w dniu {selectedDate}</p>
          </div>
        )}

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
