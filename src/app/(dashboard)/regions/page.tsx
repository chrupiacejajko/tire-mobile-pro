'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, MapPin, Users, ClipboardList, Edit, Trash2, Map } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Region } from '@/lib/types';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } },
  item: { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } },
};

export default function RegionsPage() {
  const [regions, setRegions] = useState<(Region & { employee_count?: number; order_count?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [form, setForm] = useState({ name: '', description: '', color: '#3B82F6' });
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const fetchRegions = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('regions').select('*').order('name');
    if (data) {
      // Get counts per region
      const withCounts = await Promise.all(data.map(async (r) => {
        const [empRes, ordRes] = await Promise.all([
          supabase.from('employees').select('id', { count: 'exact', head: true }).eq('region_id', r.id),
          supabase.from('orders').select('id', { count: 'exact', head: true }).eq('region_id', r.id),
        ]);
        return { ...r, employee_count: empRes.count || 0, order_count: ordRes.count || 0 };
      }));
      setRegions(withCounts);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRegions(); }, [fetchRegions]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (editingRegion) {
      await supabase.from('regions').update(form).eq('id', editingRegion.id);
    } else {
      await supabase.from('regions').insert(form);
    }
    setSaving(false);
    setDialogOpen(false);
    setForm({ name: '', description: '', color: '#3B82F6' });
    setEditingRegion(null);
    fetchRegions();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('regions').delete().eq('id', id);
    fetchRegions();
  };

  const openEdit = (r: Region) => {
    setForm({ name: r.name, description: r.description || '', color: r.color });
    setEditingRegion(r);
    setDialogOpen(true);
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
                      </div>
                      <div className="flex gap-1">
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
    </div>
  );
}
