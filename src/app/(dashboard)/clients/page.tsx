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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Plus, Search, Phone, Mail, MapPin, Car, Edit, Trash2, Users, Eye,
  X, ChevronRight, Clock, FileText, Upload, Ban, ShieldCheck, Hash,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { Client, Vehicle } from '@/lib/types';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

const emptyVehicle: Vehicle = { brand: '', model: '', year: new Date().getFullYear(), tire_size: '', plate_number: '' };

// ─── Rate limiter helpers ────────────────────────────────────────────────────
const RATE_LIMIT_KEY = 'client_views';
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 10;

function getViewTimestamps(): number[] {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function recordView(): void {
  const now = Date.now();
  const recent = getViewTimestamps().filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(recent));
}

function getViewsInWindow(): number {
  const now = Date.now();
  return getViewTimestamps().filter(t => now - t < RATE_LIMIT_WINDOW_MS).length;
}

function minutesUntilReset(): number {
  const now = Date.now();
  const timestamps = getViewTimestamps().filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length < RATE_LIMIT_MAX) return 0;
  const oldest = Math.min(...timestamps);
  return Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 60000);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ClientsPage() {
  const user = useAuth(s => s.user);
  const isDispatcher = user?.role === 'dispatcher';

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Rate limit state (for dispatcher)
  const [rateLimitBlocked, setRateLimitBlocked] = useState(false);
  const [rateLimitMinutes, setRateLimitMinutes] = useState(0);

  // Block/unblock state
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '', phone: '', email: '', address: '', city: '', notes: '', nip: '',
  });
  const [vehicles, setVehicles] = useState<Vehicle[]>([{ ...emptyVehicle }]);
  const [saving, setSaving] = useState(false);

  const supabase = createClient();

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setClients(data as Client[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const resetForm = () => {
    setForm({ name: '', phone: '', email: '', address: '', city: '', notes: '', nip: '' });
    setVehicles([{ ...emptyVehicle }]);
    setEditingClient(null);
  };

  const openEdit = (client: Client) => {
    setForm({
      name: client.name, phone: client.phone, email: client.email || '',
      address: client.address, city: client.city, notes: client.notes || '',
      nip: client.nip || '',
    });
    setVehicles(client.vehicles.length > 0 ? client.vehicles : [{ ...emptyVehicle }]);
    setEditingClient(client);
    setDialogOpen(true);
  };

  const handleSelectClient = (client: Client) => {
    if (isDispatcher) {
      const views = getViewsInWindow();
      if (views >= RATE_LIMIT_MAX) {
        setRateLimitBlocked(true);
        setRateLimitMinutes(minutesUntilReset());
        return;
      }
      recordView();
      setRateLimitBlocked(false);
    }
    setSelectedClient(client);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const cleanVehicles = vehicles.filter(v => v.brand || v.model || v.plate_number);

    // Geocode address
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(form.address + ', ' + form.city)}`);
      const geoData = await geoRes.json();
      if (geoData.lat && geoData.lng) { lat = geoData.lat; lng = geoData.lng; }
    } catch {}

    const payload = {
      ...form,
      email: form.email || null,
      notes: form.notes || null,
      nip: form.nip || null,
      vehicles: cleanVehicles,
      lat,
      lng,
    };

    if (editingClient) {
      await supabase.from('clients').update(payload).eq('id', editingClient.id);
    } else {
      await supabase.from('clients').insert(payload);
    }

    setSaving(false);
    setDialogOpen(false);
    resetForm();
    fetchClients();
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    await supabase.from('clients').delete().eq('id', id);
    setDeleting(null);
    fetchClients();
    if (selectedClient?.id === id) setSelectedClient(null);
  };

  const handleToggleBlock = async () => {
    if (!selectedClient) return;
    setBlocking(true);

    if (selectedClient.is_blocked) {
      // Unblock
      const { data } = await supabase
        .from('clients')
        .update({ is_blocked: false, block_reason: null })
        .eq('id', selectedClient.id)
        .select()
        .single();
      if (data) {
        const updated = data as Client;
        setSelectedClient(updated);
        setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
      }
    } else {
      // Block
      const { data } = await supabase
        .from('clients')
        .update({ is_blocked: true, block_reason: blockReason || null })
        .eq('id', selectedClient.id)
        .select()
        .single();
      if (data) {
        const updated = data as Client;
        setSelectedClient(updated);
        setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
      }
      setBlockDialogOpen(false);
      setBlockReason('');
    }

    setBlocking(false);
  };

  const filteredClients = clients.filter(c => {
    const name = c.name || 'Klient bez nazwy';
    const matchSearch = name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) || c.city.toLowerCase().includes(search.toLowerCase());
    const matchCity = cityFilter === 'all' || c.city === cityFilter;
    return matchSearch && matchCity;
  });

  const cities = [...new Set(clients.map(c => c.city))].sort();
  const totalVehicles = clients.reduce((sum, c) => sum + (c.vehicles?.length || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Klienci"
        subtitle="Zarządzaj bazą klientów"
        icon={<Users className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="h-9 rounded-xl text-sm gap-2" onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.csv';
              input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                const text = await file.text();
                const lines = text.split('\n').filter(l => l.trim());
                if (lines.length < 2) return;
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                const rows = lines.slice(1).map(line => {
                  const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                  const row: Record<string, string> = {};
                  headers.forEach((h, i) => { row[h] = values[i] || ''; });
                  return row;
                });
                const res = await fetch('/api/import?type=clients', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ rows }),
                });
                const data = await res.json();
                alert(`Zaimportowano ${data.imported} z ${data.total} klientów${data.errors?.length ? `\nBłędy: ${data.errors.join(', ')}` : ''}`);
                fetchClients();
              };
              input.click();
            }}>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button
              className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={() => { resetForm(); setDialogOpen(true); }}
            >
              <Plus className="h-4 w-4" /> Dodaj klienta
            </Button>
          </div>
        }
      />
      <div className="p-6 space-y-6">
        {/* Stats */}
        <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-4" variants={ANIM.container} initial="hidden" animate="show">
          {[
            { label: 'Wszyscy klienci', value: clients.length, color: 'from-blue-500 to-blue-600' },
            { label: 'Pojazdy w bazie', value: totalVehicles, color: 'from-emerald-500 to-emerald-600' },
            { label: 'Miasta', value: cities.length, color: 'from-violet-500 to-violet-600' },
            { label: 'Nowi (30 dni)', value: clients.filter(c => new Date(c.created_at) > new Date(Date.now() - 30*24*60*60*1000)).length, color: 'from-amber-500 to-amber-600' },
          ].map(s => (
            <motion.div key={s.label} variants={ANIM.item}
              className={`rounded-2xl bg-gradient-to-br ${s.color} p-4 text-white shadow-lg`}>
              <p className="text-sm text-white/80">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Rate limit warning */}
        {isDispatcher && rateLimitBlocked && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700 flex items-center gap-2"
          >
            <Clock className="h-4 w-4 shrink-0" />
            Osiągnięto limit wyświetleń klientów. Spróbuj ponownie za {rateLimitMinutes} minut.
          </motion.div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Szukaj klienta..." className="pl-9 h-9 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={cityFilter} onValueChange={v => setCityFilter(v ?? 'all')}>
            <SelectTrigger className="w-40 h-9 rounded-xl"><SelectValue placeholder="Miasto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie miasta</SelectItem>
              {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Client List */}
          <div className="lg:col-span-2">
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                  </div>
                ) : filteredClients.length === 0 ? (
                  <div className="text-center py-20 text-gray-400">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Brak klientów</p>
                    <p className="text-sm mt-1">Dodaj pierwszego klienta klikając przycisk powyżej</p>
                  </div>
                ) : (
                  <motion.div variants={ANIM.container} initial="hidden" animate="show">
                    {filteredClients.map(client => (
                      <motion.div
                        key={client.id}
                        variants={ANIM.item}
                        className={`flex items-center justify-between px-5 py-4 border-b last:border-0 cursor-pointer transition-colors ${
                          selectedClient?.id === client.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                        } ${client.is_blocked ? 'border-red-100 opacity-75' : 'border-gray-50'}`}
                        onClick={() => handleSelectClient(client)}
                        whileHover={{ x: 2 }}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold bg-gradient-to-br ${client.is_blocked ? 'from-red-400 to-red-600' : 'from-blue-500 to-blue-600'}`}>
                            {(client.name || 'K').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900 truncate">{client.name || 'Klient bez nazwy'}</p>
                              {client.is_blocked && (
                                <Badge className="text-[9px] bg-red-100 text-red-700 border-red-200 rounded-md px-1.5 py-0 font-bold tracking-wide">
                                  ZABLOKOWANY
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="flex items-center gap-1 text-xs text-gray-400"><Phone className="h-3 w-3" />{client.phone}</span>
                              <span className="flex items-center gap-1 text-xs text-gray-400"><MapPin className="h-3 w-3" />{client.city}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {client.vehicles?.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] rounded-lg">
                              <Car className="h-3 w-3 mr-1" />{client.vehicles.length}
                            </Badge>
                          )}
                          <ChevronRight className="h-4 w-4 text-gray-300" />
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Client Detail Panel */}
          <div>
            <AnimatePresence mode="wait">
              {selectedClient ? (
                <motion.div
                  key={selectedClient.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className={`rounded-2xl shadow-sm sticky top-6 ${selectedClient.is_blocked ? 'border-red-200' : 'border-gray-100'}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-bold">Profil klienta</CardTitle>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(selectedClient)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-500" onClick={() => handleDelete(selectedClient.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {/* Blocked banner */}
                      {selectedClient.is_blocked && (
                        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5">
                          <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
                            <Ban className="h-4 w-4" /> Konto zablokowane
                          </div>
                          {selectedClient.block_reason && (
                            <p className="text-xs text-red-500 mt-1">{selectedClient.block_reason}</p>
                          )}
                        </div>
                      )}

                      {/* Avatar + name */}
                      <div className="flex items-center gap-4">
                        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white text-lg font-bold bg-gradient-to-br ${selectedClient.is_blocked ? 'from-red-400 to-red-600' : 'from-blue-500 to-blue-600'}`}>
                          {(selectedClient.name || 'K').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-gray-900">{selectedClient.name || 'Klient bez nazwy'}</p>
                            {selectedClient.is_blocked && (
                              <Badge className="text-[9px] bg-red-100 text-red-700 border-red-200 rounded-md px-1.5 py-0 font-bold tracking-wide">
                                ZABLOKOWANY
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">Klient od {new Date(selectedClient.created_at).toLocaleDateString('pl')}</p>
                        </div>
                      </div>

                      {/* Contact */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2.5 text-sm">
                          <Phone className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-700">{selectedClient.phone}</span>
                        </div>
                        {selectedClient.email && (
                          <div className="flex items-center gap-2.5 text-sm">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-700">{selectedClient.email}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2.5 text-sm">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-700">{selectedClient.address}, {selectedClient.city}</span>
                        </div>
                        {selectedClient.nip && (
                          <div className="flex items-center gap-2.5 text-sm">
                            <Hash className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-700">NIP: {selectedClient.nip}</span>
                          </div>
                        )}
                      </div>

                      {/* Vehicles */}
                      {selectedClient.vehicles?.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Pojazdy</p>
                          <div className="space-y-2">
                            {selectedClient.vehicles.map((v: Vehicle, i: number) => (
                              <div key={i} className="rounded-xl bg-gray-50 p-3">
                                <p className="text-sm font-medium">{v.brand} {v.model} ({v.year})</p>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs text-gray-500">Opony: {v.tire_size}</span>
                                  <Badge variant="outline" className="text-[10px]">{v.plate_number}</Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {selectedClient.notes && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Notatki</p>
                          <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{selectedClient.notes}</p>
                        </div>
                      )}

                      {/* Block / Unblock toggle */}
                      <div className="border-t pt-4">
                        {selectedClient.is_blocked ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full rounded-xl text-xs h-9 border-green-200 text-green-700 hover:bg-green-50"
                            disabled={blocking}
                            onClick={handleToggleBlock}
                          >
                            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                            {blocking ? 'Odblokowanie...' : 'Odblokuj klienta'}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full rounded-xl text-xs h-9 border-red-200 text-red-700 hover:bg-red-50"
                            onClick={() => setBlockDialogOpen(true)}
                          >
                            <Ban className="h-3.5 w-3.5 mr-1.5" /> Zablokuj klienta
                          </Button>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 rounded-xl text-xs h-9">
                          <FileText className="h-3.5 w-3.5 mr-1" /> Historia zleceń
                        </Button>
                        <Button size="sm" className="flex-1 rounded-xl text-xs h-9 bg-blue-600 hover:bg-blue-700">
                          <Plus className="h-3.5 w-3.5 mr-1" /> Nowe zlecenie
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
                      <p className="text-sm font-medium">Wybierz klienta</p>
                      <p className="text-xs mt-1">Kliknij na klienta z listy aby zobaczyć szczegóły</p>
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
            <DialogTitle>{editingClient ? 'Edytuj klienta' : 'Nowy klient'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Imię i nazwisko / Firma</Label>
                <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Jan Kowalski" />
              </div>
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+48 500 100 200" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jan@example.com" />
            </div>
            <div className="space-y-2">
              <Label>NIP</Label>
              <Input value={form.nip} onChange={e => setForm({ ...form, nip: e.target.value })} placeholder="123-456-78-90" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Adres</Label>
                <Input required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="ul. Marszałkowska 15" />
              </div>
              <div className="space-y-2">
                <Label>Miasto</Label>
                <Input required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Warszawa" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notatki</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Dodatkowe informacje..." />
            </div>

            {/* Vehicles */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold flex items-center gap-2"><Car className="h-4 w-4" /> Pojazdy</h4>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs rounded-lg"
                  onClick={() => setVehicles([...vehicles, { ...emptyVehicle }])}>
                  <Plus className="h-3 w-3 mr-1" /> Dodaj pojazd
                </Button>
              </div>
              {vehicles.map((v, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 mb-2 items-end">
                  <Input placeholder="Marka" value={v.brand}
                    onChange={e => { const nv = [...vehicles]; nv[i] = { ...nv[i], brand: e.target.value }; setVehicles(nv); }} />
                  <Input placeholder="Model" value={v.model}
                    onChange={e => { const nv = [...vehicles]; nv[i] = { ...nv[i], model: e.target.value }; setVehicles(nv); }} />
                  <Input placeholder="Rok" type="number" value={v.year}
                    onChange={e => { const nv = [...vehicles]; nv[i] = { ...nv[i], year: Number(e.target.value) }; setVehicles(nv); }} />
                  <Input placeholder="Opony" value={v.tire_size}
                    onChange={e => { const nv = [...vehicles]; nv[i] = { ...nv[i], tire_size: e.target.value }; setVehicles(nv); }} />
                  <div className="flex gap-1">
                    <Input placeholder="Rejestracja" value={v.plate_number}
                      onChange={e => { const nv = [...vehicles]; nv[i] = { ...nv[i], plate_number: e.target.value }; setVehicles(nv); }} />
                    {vehicles.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-red-400"
                        onClick={() => setVehicles(vehicles.filter((_, j) => j !== i))}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => { setDialogOpen(false); resetForm(); }}>Anuluj</Button>
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                {saving ? 'Zapisywanie...' : editingClient ? 'Zapisz zmiany' : 'Dodaj klienta'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Block reason dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Zablokuj klienta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Czy na pewno chcesz zablokować klienta <strong>{selectedClient?.name || 'Klient bez nazwy'}</strong>?
            </p>
            <div className="space-y-2">
              <Label>Powód blokady (opcjonalnie)</Label>
              <Input
                value={blockReason}
                onChange={e => setBlockReason(e.target.value)}
                placeholder="np. Nieuregulowane należności"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setBlockDialogOpen(false); setBlockReason(''); }}>
                Anuluj
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={blocking}
                onClick={handleToggleBlock}
              >
                <Ban className="h-4 w-4 mr-1.5" />
                {blocking ? 'Blokowanie...' : 'Zablokuj'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
