'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus, Search, Phone, Mail, MapPin, Edit, Trash2, Eye,
  ChevronRight, Handshake, Building2, DollarSign,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Subcontractor } from '@/lib/types';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

export default function SubcontractorsPage() {
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subcontractor | null>(null);
  const [selectedSub, setSelectedSub] = useState<Subcontractor | null>(null);
  const [form, setForm] = useState({
    name: '', company: '', phone: '', email: '', nip: '',
    address: '', city: '', specializations: '', hourly_rate: '0', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const fetchSubcontractors = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('subcontractors').select('*').order('name');
    if (data) setSubcontractors(data as Subcontractor[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSubcontractors(); }, [fetchSubcontractors]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const specs = form.specializations.split(',').map(s => s.trim()).filter(Boolean);
    const payload = {
      name: form.name,
      company: form.company || null,
      phone: form.phone,
      email: form.email || null,
      nip: form.nip || null,
      address: form.address || null,
      city: form.city || null,
      specializations: specs,
      hourly_rate: Number(form.hourly_rate),
      notes: form.notes || null,
    };
    if (editingSub) {
      await supabase.from('subcontractors').update(payload).eq('id', editingSub.id);
    } else {
      await supabase.from('subcontractors').insert({ ...payload, is_active: true });
    }
    setSaving(false);
    setDialogOpen(false);
    resetForm();
    fetchSubcontractors();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('subcontractors').delete().eq('id', id);
    fetchSubcontractors();
    if (selectedSub?.id === id) setSelectedSub(null);
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await supabase.from('subcontractors').update({ is_active: !isActive }).eq('id', id);
    fetchSubcontractors();
  };

  const resetForm = () => {
    setForm({ name: '', company: '', phone: '', email: '', nip: '', address: '', city: '', specializations: '', hourly_rate: '0', notes: '' });
    setEditingSub(null);
  };

  const openEdit = (sub: Subcontractor) => {
    setForm({
      name: sub.name, company: sub.company || '', phone: sub.phone,
      email: sub.email || '', nip: sub.nip || '', address: sub.address || '',
      city: sub.city || '', specializations: (sub.specializations || []).join(', '),
      hourly_rate: Number(sub.hourly_rate).toString(), notes: sub.notes || '',
    });
    setEditingSub(sub);
    setDialogOpen(true);
  };

  const filteredSubs = subcontractors.filter(s => {
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) ||
      (s.company || '').toLowerCase().includes(q) ||
      (s.city || '').toLowerCase().includes(q) ||
      s.phone.includes(q);
  });

  const activeSubs = subcontractors.filter(s => s.is_active).length;
  const cities = [...new Set(subcontractors.map(s => s.city).filter(Boolean))].length;
  const avgRate = subcontractors.length > 0
    ? (subcontractors.reduce((sum, s) => sum + Number(s.hourly_rate), 0) / subcontractors.length).toFixed(0)
    : '0';

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Podwykonawcy"
        subtitle="Zarządzaj podwykonawcami"
        icon={<Handshake className="h-5 w-5" />}
        actions={
          <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Dodaj podwykonawcę
          </Button>
        }
      />
      <div className="p-6 space-y-6">
        {/* Stats */}
        <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-4" variants={ANIM.container} initial="hidden" animate="show">
          {[
            { label: 'Wszyscy', value: subcontractors.length, color: 'from-blue-500 to-blue-600' },
            { label: 'Aktywni', value: activeSubs, color: 'from-emerald-500 to-emerald-600' },
            { label: 'Miasta', value: cities, color: 'from-violet-500 to-violet-600' },
            { label: 'Śr. stawka/h', value: `${avgRate} zł`, color: 'from-amber-500 to-amber-600' },
          ].map(s => (
            <motion.div key={s.label} variants={ANIM.item}
              className={`rounded-2xl bg-gradient-to-br ${s.color} p-4 text-white shadow-lg`}>
              <p className="text-sm text-white/80">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Szukaj podwykonawcy..." className="pl-9 h-9 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* List */}
          <div className="lg:col-span-2">
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                  </div>
                ) : filteredSubs.length === 0 ? (
                  <div className="text-center py-20 text-gray-400">
                    <Handshake className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Brak podwykonawców</p>
                    <p className="text-sm mt-1">Dodaj pierwszego podwykonawcę klikając przycisk powyżej</p>
                  </div>
                ) : (
                  <motion.div variants={ANIM.container} initial="hidden" animate="show">
                    {filteredSubs.map(sub => (
                      <motion.div
                        key={sub.id}
                        variants={ANIM.item}
                        className={`flex items-center justify-between px-5 py-4 border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${selectedSub?.id === sub.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        onClick={() => setSelectedSub(sub)}
                        whileHover={{ x: 2 }}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white text-sm font-bold">
                            {sub.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900 truncate">{sub.name}</p>
                              <Badge className={`text-[10px] rounded-lg ${sub.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                {sub.is_active ? 'Aktywny' : 'Nieaktywny'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              {sub.company && <span className="flex items-center gap-1 text-xs text-gray-400"><Building2 className="h-3 w-3" />{sub.company}</span>}
                              <span className="flex items-center gap-1 text-xs text-gray-400"><Phone className="h-3 w-3" />{sub.phone}</span>
                              {sub.city && <span className="flex items-center gap-1 text-xs text-gray-400"><MapPin className="h-3 w-3" />{sub.city}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-700">{Number(sub.hourly_rate)} zł/h</span>
                          <ChevronRight className="h-4 w-4 text-gray-300" />
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detail Panel */}
          <div>
            <AnimatePresence mode="wait">
              {selectedSub ? (
                <motion.div
                  key={selectedSub.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="rounded-2xl border-gray-100 shadow-sm sticky top-6">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-bold">Profil podwykonawcy</CardTitle>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(selectedSub)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-500" onClick={() => handleDelete(selectedSub.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {/* Avatar + name */}
                      <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white text-lg font-bold">
                          {selectedSub.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{selectedSub.name}</p>
                          {selectedSub.company && <p className="text-xs text-gray-500">{selectedSub.company}</p>}
                          <Badge className={`text-[10px] rounded-lg mt-1 ${selectedSub.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {selectedSub.is_active ? 'Aktywny' : 'Nieaktywny'}
                          </Badge>
                        </div>
                      </div>

                      {/* Contact */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2.5 text-sm">
                          <Phone className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-700">{selectedSub.phone}</span>
                        </div>
                        {selectedSub.email && (
                          <div className="flex items-center gap-2.5 text-sm">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-700">{selectedSub.email}</span>
                          </div>
                        )}
                        {(selectedSub.address || selectedSub.city) && (
                          <div className="flex items-center gap-2.5 text-sm">
                            <MapPin className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-700">{[selectedSub.address, selectedSub.city].filter(Boolean).join(', ')}</span>
                          </div>
                        )}
                        {selectedSub.nip && (
                          <div className="flex items-center gap-2.5 text-sm">
                            <Building2 className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-700">NIP: {selectedSub.nip}</span>
                          </div>
                        )}
                      </div>

                      {/* Rate */}
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Stawka</p>
                        <div className="flex items-center gap-2 rounded-xl bg-gray-50 p-3">
                          <DollarSign className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-bold text-gray-900">{Number(selectedSub.hourly_rate)} zł / godzina</span>
                        </div>
                      </div>

                      {/* Specializations */}
                      {selectedSub.specializations?.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Specjalizacje</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedSub.specializations.map((spec, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px] rounded-lg">{spec}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {selectedSub.notes && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Notatki</p>
                          <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{selectedSub.notes}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline" size="sm"
                          className="flex-1 rounded-xl text-xs h-9"
                          onClick={() => toggleActive(selectedSub.id, selectedSub.is_active)}
                        >
                          {selectedSub.is_active ? 'Dezaktywuj' : 'Aktywuj'}
                        </Button>
                        <Button size="sm" className="flex-1 rounded-xl text-xs h-9 bg-blue-600 hover:bg-blue-700">
                          <Plus className="h-3.5 w-3.5 mr-1" /> Przypisz zlecenie
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card className="rounded-2xl border-gray-100 shadow-sm">
                    <CardContent className="py-16 text-center text-gray-400">
                      <Eye className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">Wybierz podwykonawcę</p>
                      <p className="text-xs mt-1">Kliknij na podwykonawcę z listy aby zobaczyć szczegóły</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSub ? 'Edytuj podwykonawcę' : 'Nowy podwykonawca'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Imię i nazwisko</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Jan Kowalski" /></div>
              <div className="space-y-2"><Label>Firma</Label><Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Firma Sp. z o.o." /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Telefon</Label><Input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+48 500 100 200" /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jan@example.com" /></div>
            </div>
            <div className="space-y-2"><Label>NIP</Label><Input value={form.nip} onChange={e => setForm({ ...form, nip: e.target.value })} placeholder="1234567890" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Adres</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="ul. Marszałkowska 15" /></div>
              <div className="space-y-2"><Label>Miasto</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Warszawa" /></div>
            </div>
            <div className="space-y-2"><Label>Specjalizacje (oddzielone przecinkami)</Label><Input value={form.specializations} onChange={e => setForm({ ...form, specializations: e.target.value })} placeholder="wymiana opon, wyważanie, serwis klimatyzacji" /></div>
            <div className="space-y-2"><Label>Stawka godzinowa (zł)</Label><Input type="number" step="0.01" value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} /></div>
            <div className="space-y-2"><Label>Notatki</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Dodatkowe informacje..." /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => { setDialogOpen(false); resetForm(); }}>Anuluj</Button>
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                {saving ? 'Zapisywanie...' : editingSub ? 'Zapisz zmiany' : 'Dodaj podwykonawcę'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
