'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  Plus, Search, Phone, MapPin, Car, Edit, UserCog, Users, Mail,
  Clock, DollarSign, Wrench,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Region } from '@/lib/types';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

interface EmployeeRow {
  id: string;
  user_id: string;
  region_id: string | null;
  skills: string[];
  hourly_rate: number;
  vehicle_info: string | null;
  is_active: boolean;
  working_hours: Record<string, { start: string; end: string } | null>;
  created_at: string;
  user?: { full_name: string; email: string; phone: string | null };
  region?: { name: string; color: string } | null;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', region_id: '',
    skills: '', hourly_rate: '40', vehicle_info: '',
  });

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [empRes, regRes] = await Promise.all([
      supabase.from('employees').select('*, user:profiles(full_name, email, phone), region:regions(name, color)').order('created_at', { ascending: false }),
      supabase.from('regions').select('*').order('name'),
    ]);
    if (empRes.data) setEmployees(empRes.data as EmployeeRow[]);
    if (regRes.data) setRegions(regRes.data as Region[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // Create auth user first
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      // Fallback: just show error
      console.error('Failed to create employee');
    }

    setSaving(false);
    setDialogOpen(false);
    setForm({ full_name: '', email: '', phone: '', region_id: '', skills: '', hourly_rate: '40', vehicle_info: '' });
    fetchData();
  };

  const filtered = employees.filter(e =>
    e.user?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.region?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = employees.filter(e => e.is_active).length;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Pracownicy"
        subtitle="Zarządzaj zespołem"
        icon={<UserCog className="h-5 w-5" />}
        actions={
          <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Dodaj pracownika
          </Button>
        }
      />
      <div className="p-6 space-y-6">
        {/* Stats */}
        <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-4" variants={ANIM.container} initial="hidden" animate="show">
          {[
            { label: 'Wszyscy', value: employees.length, color: 'from-blue-500 to-blue-600' },
            { label: 'Aktywni', value: activeCount, color: 'from-emerald-500 to-emerald-600' },
            { label: 'Regiony', value: regions.length, color: 'from-violet-500 to-violet-600' },
            { label: 'Śr. stawka/h', value: employees.length > 0 ? Math.round(employees.reduce((s, e) => s + Number(e.hourly_rate), 0) / employees.length) + ' zł' : '0 zł', color: 'from-amber-500 to-amber-600' },
          ].map(s => (
            <motion.div key={s.label} variants={ANIM.item} className={`rounded-2xl bg-gradient-to-br ${s.color} p-4 text-white shadow-lg`}>
              <p className="text-sm text-white/80">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Tabs */}
        <Tabs defaultValue="list">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="list" className="gap-2"><Users className="h-4 w-4" /> Lista pracowników</TabsTrigger>
              <TabsTrigger value="schedule" className="gap-2"><Clock className="h-4 w-4" /> Grafik pracy</TabsTrigger>
            </TabsList>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Szukaj pracownika..." className="pl-9 h-9 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <TabsContent value="list" className="mt-4">
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-20 text-gray-400">
                    <UserCog className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Brak pracowników</p>
                    <p className="text-sm mt-1">Dodaj pierwszego pracownika</p>
                  </div>
                ) : (
                  <motion.div variants={ANIM.container} initial="hidden" animate="show">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_120px_120px_100px_80px_60px] gap-4 px-5 py-3 border-b bg-gray-50/50 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      <span>Pracownik</span><span>Region</span><span>Pojazd</span><span>Stawka/h</span><span>Status</span><span></span>
                    </div>
                    {filtered.map(emp => (
                      <motion.div
                        key={emp.id}
                        variants={ANIM.item}
                        className="grid grid-cols-[1fr_120px_120px_100px_80px_60px] gap-4 items-center px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white text-xs font-bold">
                            {emp.user?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{emp.user?.full_name}</p>
                            <p className="text-xs text-gray-400 truncate">{emp.user?.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {emp.region && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: emp.region.color }} />}
                          <span className="text-sm text-gray-600">{emp.region?.name || '-'}</span>
                        </div>
                        <span className="text-sm text-gray-600 truncate">{emp.vehicle_info || '-'}</span>
                        <span className="text-sm font-medium">{Number(emp.hourly_rate)} zł</span>
                        <Badge variant={emp.is_active ? 'default' : 'secondary'} className="text-[10px] rounded-lg">
                          {emp.is_active ? 'Aktywny' : 'Nieaktywny'}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule" className="mt-4">
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardContent className="p-6 text-center text-gray-400">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Grafik pracy</p>
                <p className="text-sm mt-1">Harmonogram pracowników na ten tydzień (wkrótce)</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Employee Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nowy pracownik</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Imię i nazwisko</Label><Input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Telefon</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Region</Label>
                <Select value={form.region_id} onValueChange={v => setForm({ ...form, region_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Wybierz region" /></SelectTrigger>
                  <SelectContent>
                    {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Stawka/h (zł)</Label><Input type="number" value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Pojazd</Label><Input value={form.vehicle_info} onChange={e => setForm({ ...form, vehicle_info: e.target.value })} placeholder="VW Transporter 2021" /></div>
            <div className="space-y-2"><Label>Umiejętności (oddzielone przecinkami)</Label><Input value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })} placeholder="wymiana opon, wyważanie, naprawa" /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                {saving ? 'Tworzenie...' : 'Dodaj pracownika'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
