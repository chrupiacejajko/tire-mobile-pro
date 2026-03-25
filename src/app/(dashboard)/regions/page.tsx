'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, MapPin, Users, ClipboardList, Edit, Trash2, Map, Pencil, X, Save, Eraser, Shield, ChevronUp, ChevronDown } from 'lucide-react';
import dynamic from 'next/dynamic';
import type { Region } from '@/lib/types';

import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Polygon = dynamic(() => import('react-leaflet').then(m => m.Polygon), { ssr: false });
const LeafletTooltip = dynamic(() => import('react-leaflet').then(m => m.Tooltip), { ssr: false });

/* -- Map click handler component -- */
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  const { useMapEvents } = require('react-leaflet');
  useMapEvents({
    click(e: { latlng: { lat: number; lng: number } }) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } },
  item: { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } },
};

type RegionWithCounts = Region & { employee_count?: number; order_count?: number };

/* -- HERE autocomplete suggestion -- */
interface HereSuggestion {
  id: string;
  title: string;
  address?: { label?: string };
}

export default function RegionsPage() {
  const [regions, setRegions] = useState<RegionWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [form, setForm] = useState({ name: '', description: '', color: '#3B82F6', main_address: '' });
  const [saving, setSaving] = useState(false);

  // Address autocomplete
  const [addressSuggestions, setAddressSuggestions] = useState<HereSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [geocodedLat, setGeocodedLat] = useState<number | null>(null);
  const [geocodedLng, setGeocodedLng] = useState<number | null>(null);
  const addressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Polygon editor state
  const [drawingRegion, setDrawingRegion] = useState<RegionWithCounts | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [savingPolygon, setSavingPolygon] = useState(false);
  const [drawingMode, setDrawingMode] = useState<'boundary' | 'free_zone'>('boundary');

  const fetchRegions = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/regions');
    const data = await res.json();
    if (Array.isArray(data)) setRegions(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRegions(); }, [fetchRegions]);

  // Address autocomplete handler
  const handleAddressChange = (value: string) => {
    setForm(f => ({ ...f, main_address: value }));
    if (addressTimeoutRef.current) clearTimeout(addressTimeoutRef.current);
    if (value.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    addressTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/here-autocomplete?q=${encodeURIComponent(value)}`);
        const data = await res.json();
        setAddressSuggestions(data.items || []);
        setShowSuggestions(true);
      } catch {
        setAddressSuggestions([]);
      }
    }, 300);
  };

  const selectSuggestion = async (suggestion: HereSuggestion) => {
    setForm(f => ({ ...f, main_address: suggestion.title }));
    setShowSuggestions(false);
    setAddressSuggestions([]);
    // Geocode via lookup
    try {
      const res = await fetch(`/api/here-lookup?id=${encodeURIComponent(suggestion.id)}`);
      const data = await res.json();
      if (data.lat && data.lng) {
        setGeocodedLat(data.lat);
        setGeocodedLng(data.lng);
      }
    } catch {
      // ignore
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: form.name,
      description: form.description,
      color: form.color,
      main_address: form.main_address || null,
      main_lat: geocodedLat,
      main_lng: geocodedLng,
    };

    if (editingRegion) {
      await fetch('/api/regions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingRegion.id, ...payload }) });
    } else {
      await fetch('/api/regions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    setSaving(false);
    setDialogOpen(false);
    setForm({ name: '', description: '', color: '#3B82F6', main_address: '' });
    setGeocodedLat(null);
    setGeocodedLng(null);
    setEditingRegion(null);
    fetchRegions();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/regions?id=${id}`, { method: 'DELETE' });
    fetchRegions();
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const sorted = [...regions].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;

    const current = sorted[index];
    const adjacent = sorted[swapIndex];
    const currentOrder = current.display_order ?? index;
    const adjacentOrder = adjacent.display_order ?? swapIndex;

    // Optimistic update
    setRegions(prev => {
      const updated = [...prev];
      const ci = updated.findIndex(r => r.id === current.id);
      const ai = updated.findIndex(r => r.id === adjacent.id);
      if (ci >= 0) updated[ci] = { ...updated[ci], display_order: adjacentOrder };
      if (ai >= 0) updated[ai] = { ...updated[ai], display_order: currentOrder };
      return updated;
    });

    await fetch('/api/regions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reorder: [
          { id: current.id, display_order: adjacentOrder },
          { id: adjacent.id, display_order: currentOrder },
        ],
      }),
    });
  };

  const openEdit = (r: Region) => {
    setForm({ name: r.name, description: r.description || '', color: r.color, main_address: r.main_address || '' });
    setGeocodedLat(r.main_lat ?? null);
    setGeocodedLng(r.main_lng ?? null);
    setEditingRegion(r);
    setDialogOpen(true);
  };

  const openDrawPolygon = (region: RegionWithCounts, mode: 'boundary' | 'free_zone') => {
    setDrawingRegion(region);
    setDrawingMode(mode);
    if (mode === 'boundary') {
      setDrawingPoints(region.polygon || []);
    } else {
      setDrawingPoints(region.free_zone_polygon || []);
    }
  };

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setDrawingPoints(prev => [...prev, [lat, lng]]);
  }, []);

  const clearPolygon = () => {
    setDrawingPoints([]);
  };

  const savePolygon = async () => {
    if (!drawingRegion) return;
    setSavingPolygon(true);
    const fieldName = drawingMode === 'boundary' ? 'polygon' : 'free_zone_polygon';
    await fetch('/api/regions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: drawingRegion.id,
        [fieldName]: drawingPoints.length >= 3 ? drawingPoints : null,
      }),
    });
    setSavingPolygon(false);
    setDrawingRegion(null);
    setDrawingPoints([]);
    fetchRegions();
  };

  const closePolygonEditor = () => {
    setDrawingRegion(null);
    setDrawingPoints([]);
  };

  const undoLastPoint = () => {
    setDrawingPoints(prev => prev.slice(0, -1));
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Regiony"
        subtitle="Zarządzaj obszarami działania"
        icon={<Map className="h-5 w-5" />}
        actions={
          <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={() => { setForm({ name: '', description: '', color: '#3B82F6', main_address: '' }); setGeocodedLat(null); setGeocodedLng(null); setEditingRegion(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Dodaj region
          </Button>
        }
      />
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : regions.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Map className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Brak regionów</p>
            <p className="text-sm mt-1">Dodaj pierwszy region</p>
          </div>
        ) : (
          <motion.div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" variants={ANIM.container} initial="hidden" animate="show">
            {[...regions].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).map((region, idx, sorted) => (
              <motion.div key={region.id} variants={ANIM.item} whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }}>
                <Card className="overflow-hidden rounded-2xl border-gray-100 shadow-sm cursor-pointer">
                  <div className="h-2" style={{ backgroundColor: region.color }} />
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-1">
                        <div className="flex flex-col -mt-1">
                          {idx > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReorder(idx, 'up'); }}
                              className="text-gray-400 hover:text-gray-600 transition-colors p-0.5"
                              title="Przesuń w górę"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                          )}
                          {idx < sorted.length - 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReorder(idx, 'down'); }}
                              className="text-gray-400 hover:text-gray-600 transition-colors p-0.5"
                              title="Przesuń w dół"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold flex items-center gap-2">
                            <MapPin className="h-5 w-5" style={{ color: region.color }} />
                            {region.name}
                          </h3>
                        {region.description && <p className="text-sm text-gray-500 mt-1">{region.description}</p>}
                        {region.main_address && (
                          <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {region.main_address}
                          </p>
                        )}
                        {region.polygon && region.polygon.length >= 3 && (
                          <p className="text-xs text-green-600 mt-1">{region.polygon.length} punktów granicy</p>
                        )}
                        {region.free_zone_polygon && region.free_zone_polygon.length >= 3 && (
                          <p className="text-xs text-emerald-500 mt-0.5">{region.free_zone_polygon.length} punktów strefy bezpłatnej</p>
                        )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openDrawPolygon(region, 'boundary')} title="Rysuj granice">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-emerald-600" onClick={() => openDrawPolygon(region, 'free_zone')} title="Rysuj strefę bezpłatną">
                          <Shield className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(region)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-500" onClick={() => handleDelete(region.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div className="text-center">
                        <Users className="h-4 w-4 mx-auto text-gray-400" />
                        <p className="mt-1 text-lg font-bold">{region.employee_count}</p>
                        <p className="text-xs text-gray-500">Pracownicy</p>
                      </div>
                      <div className="text-center">
                        <ClipboardList className="h-4 w-4 mx-auto text-gray-400" />
                        <p className="mt-1 text-lg font-bold">{region.order_count}</p>
                        <p className="text-xs text-gray-500">Zlecenia</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* -- Create/Edit Dialog -- */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) { setEditingRegion(null); setShowSuggestions(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingRegion ? 'Edytuj region' : 'Nowy region'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2"><Label>Nazwa</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="np. Poznań" /></div>
            <div className="space-y-2"><Label>Opis</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Opis regionu..." /></div>

            {/* Main address with HERE autocomplete */}
            <div className="space-y-2 relative">
              <Label>Główny adres</Label>
              <Input
                value={form.main_address}
                onChange={e => handleAddressChange(e.target.value)}
                onFocus={() => { if (addressSuggestions.length > 0) setShowSuggestions(true); }}
                onBlur={() => { setTimeout(() => setShowSuggestions(false), 200); }}
                placeholder="np. ul. Marszałkowska 1, Warszawa"
              />
              {showSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute z-50 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {addressSuggestions.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-b-0"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => selectSuggestion(s)}
                    >
                      {s.title}
                      {s.address?.label && <span className="text-xs text-gray-400 block">{s.address.label}</span>}
                    </button>
                  ))}
                </div>
              )}
              {geocodedLat && geocodedLng && (
                <p className="text-[10px] text-gray-400">Współrzędne: {geocodedLat.toFixed(5)}, {geocodedLng.toFixed(5)}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Kolor</Label>
              <div className="flex items-center gap-3">
                <Input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="h-10 w-16 p-1" />
                <Input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="flex-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                {saving ? 'Zapisywanie...' : editingRegion ? 'Zapisz' : 'Dodaj region'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Polygon Editor Overlay -- */}
      <AnimatePresence>
        {drawingRegion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-gray-900/80 flex flex-col"
          >
            {/* Toolbar */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 rounded-full" style={{ backgroundColor: drawingMode === 'free_zone' ? '#10b981' : drawingRegion.color }} />
                <h2 className="text-lg font-bold text-gray-900">
                  {drawingMode === 'free_zone' ? 'Rysuj strefę bezpłatną' : 'Rysuj granice'}: {drawingRegion.name}
                </h2>
                <span className="text-sm text-gray-500 ml-2">({drawingPoints.length} punktów)</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={undoLastPoint} disabled={drawingPoints.length === 0}>
                  Cofnij punkt
                </Button>
                <Button variant="outline" size="sm" onClick={clearPolygon} className="text-red-500 hover:text-red-600">
                  <Eraser className="h-4 w-4 mr-1" /> Wyczyść
                </Button>
                <Button size="sm" onClick={savePolygon} disabled={savingPolygon} className="bg-green-600 hover:bg-green-700">
                  <Save className="h-4 w-4 mr-1" /> {savingPolygon ? 'Zapisywanie...' : 'Zapisz'}
                </Button>
                <Button variant="ghost" size="icon" onClick={closePolygonEditor} className="h-9 w-9">
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <p className="bg-blue-50 text-blue-700 text-sm px-6 py-2 text-center">
              {drawingMode === 'free_zone'
                ? 'Kliknij na mapę, aby dodać punkty strefy bezpłatnej. Minimum 3 punkty.'
                : 'Kliknij na mapę, aby dodać punkty granicy regionu. Minimum 3 punkty.'
              }
            </p>

            {/* Map */}
            <div className="flex-1">
              <MapContainer
                center={
                  drawingPoints.length > 0
                    ? [drawingPoints[0][0], drawingPoints[0][1]]
                    : [52.0, 19.5]
                }
                zoom={drawingPoints.length > 0 ? 10 : 6}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />

                <MapClickHandler onMapClick={handleMapClick} />

                {/* Other regions' polygons (semi-transparent) */}
                {regions
                  .filter(r => r.id !== drawingRegion.id && r.polygon && r.polygon.length >= 3)
                  .map(r => (
                    <Polygon
                      key={r.id}
                      positions={r.polygon!.map(p => [p[0], p[1]] as [number, number])}
                      pathOptions={{
                        color: r.color,
                        fillColor: r.color,
                        fillOpacity: 0.1,
                        weight: 2,
                        opacity: 0.4,
                        dashArray: '4, 4',
                      }}
                    >
                      <LeafletTooltip>{r.name}</LeafletTooltip>
                    </Polygon>
                  ))}

                {/* Current region's main boundary (when editing free zone, show the existing boundary) */}
                {drawingMode === 'free_zone' && drawingRegion.polygon && drawingRegion.polygon.length >= 3 && (
                  <Polygon
                    positions={drawingRegion.polygon.map(p => [p[0], p[1]] as [number, number])}
                    pathOptions={{
                      color: drawingRegion.color,
                      fillColor: drawingRegion.color,
                      fillOpacity: 0.15,
                      weight: 3,
                    }}
                  >
                    <LeafletTooltip>Granica: {drawingRegion.name}</LeafletTooltip>
                  </Polygon>
                )}

                {/* Current region's free zone (when editing boundary, show the existing free zone) */}
                {drawingMode === 'boundary' && drawingRegion.free_zone_polygon && drawingRegion.free_zone_polygon.length >= 3 && (
                  <Polygon
                    positions={drawingRegion.free_zone_polygon.map(p => [p[0], p[1]] as [number, number])}
                    pathOptions={{
                      color: '#10b981',
                      fillColor: '#10b981',
                      fillOpacity: 0.15,
                      weight: 2,
                      dashArray: '8, 4',
                    }}
                  >
                    <LeafletTooltip>Strefa bezpłatna: {drawingRegion.name}</LeafletTooltip>
                  </Polygon>
                )}

                {/* Current polygon being drawn */}
                {drawingPoints.length >= 3 && (
                  <Polygon
                    positions={drawingPoints.map(p => [p[0], p[1]] as [number, number])}
                    pathOptions={drawingMode === 'free_zone' ? {
                      color: '#10b981',
                      fillColor: '#10b981',
                      fillOpacity: 0.25,
                      weight: 3,
                      dashArray: '8, 4',
                    } : {
                      color: drawingRegion.color,
                      fillColor: drawingRegion.color,
                      fillOpacity: 0.25,
                      weight: 3,
                    }}
                  />
                )}

                {/* Individual points as small markers */}
                {drawingPoints.map((p, i) => {
                  const CircleMarker = require('react-leaflet').CircleMarker;
                  return (
                    <CircleMarker
                      key={i}
                      center={[p[0], p[1]] as [number, number]}
                      radius={5}
                      pathOptions={{
                        color: 'white',
                        fillColor: drawingMode === 'free_zone' ? '#10b981' : drawingRegion.color,
                        fillOpacity: 1,
                        weight: 2,
                      }}
                    />
                  );
                })}
              </MapContainer>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
