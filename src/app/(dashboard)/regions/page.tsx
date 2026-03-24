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
import { Plus, MapPin, Users, ClipboardList, Edit, Trash2, Map, Pencil, X, Save, Eraser } from 'lucide-react';
import dynamic from 'next/dynamic';
import type { Region } from '@/lib/types';

import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Polygon = dynamic(() => import('react-leaflet').then(m => m.Polygon), { ssr: false });
const LeafletTooltip = dynamic(() => import('react-leaflet').then(m => m.Tooltip), { ssr: false });

/* ─── Map click handler component ──────────────────────────────────── */
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

export default function RegionsPage() {
  const [regions, setRegions] = useState<RegionWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [form, setForm] = useState({ name: '', description: '', color: '#3B82F6' });
  const [saving, setSaving] = useState(false);

  // Polygon editor state
  const [drawingRegion, setDrawingRegion] = useState<RegionWithCounts | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [savingPolygon, setSavingPolygon] = useState(false);

  const fetchRegions = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/regions');
    const data = await res.json();
    if (Array.isArray(data)) setRegions(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRegions(); }, [fetchRegions]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (editingRegion) {
      await fetch('/api/regions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingRegion.id, ...form }) });
    } else {
      await fetch('/api/regions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    }
    setSaving(false);
    setDialogOpen(false);
    setForm({ name: '', description: '', color: '#3B82F6' });
    setEditingRegion(null);
    fetchRegions();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/regions?id=${id}`, { method: 'DELETE' });
    fetchRegions();
  };

  const openEdit = (r: Region) => {
    setForm({ name: r.name, description: r.description || '', color: r.color });
    setEditingRegion(r);
    setDialogOpen(true);
  };

  const openDrawPolygon = (region: RegionWithCounts) => {
    setDrawingRegion(region);
    setDrawingPoints(region.polygon || []);
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
    await fetch('/api/regions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: drawingRegion.id,
        polygon: drawingPoints.length >= 3 ? drawingPoints : null,
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
            onClick={() => { setForm({ name: '', description: '', color: '#3B82F6' }); setEditingRegion(null); setDialogOpen(true); }}>
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
            {regions.map(region => (
              <motion.div key={region.id} variants={ANIM.item} whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }}>
                <Card className="overflow-hidden rounded-2xl border-gray-100 shadow-sm cursor-pointer">
                  <div className="h-2" style={{ backgroundColor: region.color }} />
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          <MapPin className="h-5 w-5" style={{ color: region.color }} />
                          {region.name}
                        </h3>
                        {region.description && <p className="text-sm text-gray-500 mt-1">{region.description}</p>}
                        {region.polygon && region.polygon.length >= 3 && (
                          <p className="text-xs text-green-600 mt-1">{region.polygon.length} punktów granicy</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openDrawPolygon(region)} title="Rysuj granice">
                          <Pencil className="h-4 w-4" />
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

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) setEditingRegion(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingRegion ? 'Edytuj region' : 'Nowy region'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2"><Label>Nazwa</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="np. Poznań" /></div>
            <div className="space-y-2"><Label>Opis</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Opis regionu..." /></div>
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

      {/* ── Polygon Editor Overlay ── */}
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
                <div className="h-4 w-4 rounded-full" style={{ backgroundColor: drawingRegion.color }} />
                <h2 className="text-lg font-bold text-gray-900">Rysuj granice: {drawingRegion.name}</h2>
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
              Kliknij na mapę, aby dodać punkty granicy regionu. Minimum 3 punkty.
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

                {/* Current polygon being drawn */}
                {drawingPoints.length >= 3 && (
                  <Polygon
                    positions={drawingPoints.map(p => [p[0], p[1]] as [number, number])}
                    pathOptions={{
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
                        fillColor: drawingRegion.color,
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
