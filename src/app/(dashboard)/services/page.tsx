'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Wrench, Edit, Trash2, Clock, DollarSign, Tag } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Service } from '@/lib/types';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

const categories = [
  { value: 'wymiana', label: 'Wymiana opon', color: 'bg-blue-100 text-blue-700' },
  { value: 'serwis', label: 'Serwis', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'naprawa', label: 'Naprawa', color: 'bg-amber-100 text-amber-700' },
  { value: 'przechowywanie', label: 'Przechowywanie', color: 'bg-violet-100 text-violet-700' },
  { value: 'pakiet', label: 'Pakiet', color: 'bg-rose-100 text-rose-700' },
  { value: 'dojazd', label: 'Dojazd', color: 'bg-gray-100 text-gray-700' },
];

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [form, setForm] = useState({ name: '', description: '', duration_minutes: '60', price: '0', category: 'wymiana', is_active: true });
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const fetchServices = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('services').select('*').order('category, name');
    if (data) setServices(data as Service[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, duration_minutes: Number(form.duration_minutes), price: Number(form.price) };
    if (editingService) {
      await supabase.from('services').update(payload).eq('id', editingService.id);
    } else {
      await supabase.from('services').insert(payload);
    }
    setSaving(false);
    setDialogOpen(false);
    resetForm();
    fetchServices();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('services').delete().eq('id', id);
    fetchServices();
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await supabase.from('services').update({ is_active: !isActive }).eq('id', id);
    fetchServices();
  };

  const resetForm = () => {
    setForm({ name: '', description: '', duration_minutes: '60', price: '0', category: 'wymiana', is_active: true });
    setEditingService(null);
  };

  const openEdit = (s: Service) => {
    setForm({ name: s.name, description: s.description || '', duration_minutes: s.duration_minutes.toString(), price: Number(s.price).toString(), category: s.category, is_active: s.is_active });
    setEditingService(s);
    setDialogOpen(true);
  };

  const getCategoryStyle = (cat: string) => categories.find(c => c.value === cat) || categories[0];

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Katalog usług"
        subtitle={`${services.length} usług`}
        icon={<Wrench className="h-5 w-5" />}
        actions={
          <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Dodaj usługę
          </Button>
        }
      />
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
        ) : (
          <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" variants={ANIM.container} initial="hidden" animate="show">
            {services.map(service => {
              const catStyle = getCategoryStyle(service.category);
              return (
                <motion.div key={service.id} variants={ANIM.item} whileHover={{ y: -2 }}>
                  <Card className={`rounded-2xl border-gray-100 shadow-sm ${!service.is_active ? 'opacity-50' : ''}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">{service.name}</h3>
                          {service.description && <p className="text-xs text-gray-500 mt-0.5">{service.description}</p>}
                        </div>
                        <Badge className={`text-[10px] rounded-lg ${catStyle.color}`}>{catStyle.label}</Badge>
                      </div>
                      <div className="flex items-center gap-4 mb-3">
                        <span className="flex items-center gap-1 text-sm font-bold text-gray-900">
                          <DollarSign className="h-3.5 w-3.5 text-gray-400" />{Number(service.price)} zł
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3.5 w-3.5" />{service.duration_minutes} min
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t">
                        <div className="flex items-center gap-2">
                          <Switch checked={service.is_active} onCheckedChange={() => toggleActive(service.id, service.is_active)} />
                          <span className="text-xs text-gray-500">{service.is_active ? 'Aktywna' : 'Nieaktywna'}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEdit(service)}><Edit className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-red-500" onClick={() => handleDelete(service.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingService ? 'Edytuj usługę' : 'Nowa usługa'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2"><Label>Nazwa</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Opis</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Cena (zł)</Label><Input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>
              <div className="space-y-2"><Label>Czas (min)</Label><Input type="number" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Kategoria</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v ?? 'wymiana' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">{saving ? 'Zapisywanie...' : 'Zapisz'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
