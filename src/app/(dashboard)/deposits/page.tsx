'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Package, Plus, Search, X, ChevronDown, Car, MapPin,
  Phone, User, Calendar, CheckCircle2, AlertTriangle,
  Wrench, Archive, Edit3, Trash2, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface Client { id: string; name: string; phone: string; address?: string; city?: string; }

interface TireDeposit {
  id: string;
  client_id: string;
  client: Client;
  vehicle_info: string | null;
  license_plate: string | null;
  tire_brand: string | null;
  tire_size: string | null;
  tire_type: string;
  quantity: number;
  condition: string;
  storage_location: string | null;
  season: string | null;
  received_date: string;
  expected_pickup: string | null;
  picked_up_date: string | null;
  status: 'stored' | 'picked_up' | 'disposed';
  notes: string | null;
  storage_price: number | null;
  created_at: string;
}

/* ─── Constants ──────────────────────────────────────────────────────── */
const TIRE_TYPES = ['letnie', 'zimowe', 'całoroczne'];
const CONDITIONS = ['dobre', 'do_wymiany', 'uszkodzone'];
const CONDITION_LABELS: Record<string, string> = { dobre: 'Dobre', do_wymiany: 'Do wymiany', uszkodzone: 'Uszkodzone' };
const CONDITION_COLORS: Record<string, string> = { dobre: 'bg-emerald-100 text-emerald-700', do_wymiany: 'bg-amber-100 text-amber-700', uszkodzone: 'bg-red-100 text-red-700' };
const TYPE_COLORS: Record<string, string> = { letnie: 'bg-orange-100 text-orange-700', zimowe: 'bg-blue-100 text-blue-700', całoroczne: 'bg-purple-100 text-purple-700' };
const TYPE_ICONS: Record<string, string> = { letnie: '☀️', zimowe: '❄️', całoroczne: '🔄' };

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(expected: string | null): boolean {
  if (!expected) return false;
  return new Date(expected) < new Date();
}

/* ─── Deposit card ───────────────────────────────────────────────────── */
function DepositCard({ deposit, onEdit, onPickup, onDelete }: {
  deposit: TireDeposit;
  onEdit: (d: TireDeposit) => void;
  onPickup: (d: TireDeposit) => void;
  onDelete: (id: string) => void;
}) {
  const overdue = deposit.status === 'stored' && isOverdue(deposit.expected_pickup);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className={cn(
        'bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition-shadow',
        overdue ? 'border-amber-200' : 'border-gray-100',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-lg flex-shrink-0">
            {TYPE_ICONS[deposit.tire_type] || '🔧'}
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">
              {deposit.tire_brand ?? '—'} {deposit.tire_size ?? ''}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {deposit.quantity} szt. · {deposit.vehicle_info ?? deposit.license_plate ?? 'Brak danych pojazdu'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', TYPE_COLORS[deposit.tire_type])}>
            {TYPE_ICONS[deposit.tire_type]} {deposit.tire_type}
          </span>
          {deposit.status === 'stored' && (
            <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', CONDITION_COLORS[deposit.condition])}>
              {CONDITION_LABELS[deposit.condition]}
            </span>
          )}
        </div>
      </div>

      {/* Client */}
      <div className="flex items-center gap-2 mb-3 p-2.5 bg-gray-50 rounded-xl">
        <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{deposit.client.name || 'Klient bez nazwy'}</p>
          <p className="text-xs text-gray-400">{deposit.client.phone}</p>
        </div>
        {overdue && (
          <div className="ml-auto flex items-center gap-1 text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold">Termin minął</span>
          </div>
        )}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
        <div>
          <p className="text-gray-400 mb-0.5">Przyjęto</p>
          <p className="font-medium text-gray-700">{formatDate(deposit.received_date)}</p>
        </div>
        <div>
          <p className="text-gray-400 mb-0.5">Planowany odbiór</p>
          <p className={cn('font-medium', overdue ? 'text-amber-600' : 'text-gray-700')}>
            {formatDate(deposit.expected_pickup)}
          </p>
        </div>
        {deposit.storage_location && (
          <div>
            <p className="text-gray-400 mb-0.5">Lokalizacja</p>
            <p className="font-medium text-gray-700 flex items-center gap-1">
              <MapPin className="h-3 w-3" />{deposit.storage_location}
            </p>
          </div>
        )}
        {deposit.season && (
          <div>
            <p className="text-gray-400 mb-0.5">Sezon</p>
            <p className="font-medium text-gray-700">{deposit.season}</p>
          </div>
        )}
        {deposit.storage_price && (
          <div>
            <p className="text-gray-400 mb-0.5">Cena/sezon</p>
            <p className="font-semibold text-gray-900">{deposit.storage_price} PLN</p>
          </div>
        )}
      </div>

      {deposit.notes && (
        <p className="text-xs text-gray-400 italic mb-3 border-l-2 border-gray-200 pl-2">{deposit.notes}</p>
      )}

      {/* Actions */}
      {deposit.status === 'stored' ? (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 rounded-xl text-xs" onClick={() => onPickup(deposit)}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Wydaj opony
          </Button>
          <Button size="sm" variant="outline" className="rounded-xl px-3" onClick={() => onEdit(deposit)}>
            <Edit3 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="rounded-xl px-3 text-red-500 hover:text-red-600 hover:border-red-200" onClick={() => onDelete(deposit.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full',
            deposit.status === 'picked_up' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
            {deposit.status === 'picked_up' ? `✓ Wydano ${formatDate(deposit.picked_up_date)}` : 'Zutylizowano'}
          </span>
          <Button size="sm" variant="ghost" className="text-xs text-gray-400 h-7 px-2" onClick={() => onDelete(deposit.id)}>
            <Trash2 className="h-3 w-3 mr-1" />Usuń
          </Button>
        </div>
      )}
    </motion.div>
  );
}

/* ─── Deposit form ───────────────────────────────────────────────────── */
function DepositForm({ initial, clients, onSave, onClose }: {
  initial?: Partial<TireDeposit>;
  clients: Client[];
  onSave: (data: any) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    client_id: initial?.client_id ?? '',
    vehicle_info: initial?.vehicle_info ?? '',
    license_plate: initial?.license_plate ?? '',
    tire_brand: initial?.tire_brand ?? '',
    tire_size: initial?.tire_size ?? '',
    tire_type: initial?.tire_type ?? 'zimowe',
    quantity: initial?.quantity ?? 4,
    condition: initial?.condition ?? 'dobre',
    storage_location: initial?.storage_location ?? '',
    season: initial?.season ?? '',
    received_date: initial?.received_date ?? new Date().toISOString().split('T')[0],
    expected_pickup: initial?.expected_pickup ?? '',
    notes: initial?.notes ?? '',
    storage_price: initial?.storage_price ?? '',
  });
  const [clientSearch, setClientSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.phone.includes(clientSearch)
  ).slice(0, 8);

  const selectedClient = clients.find(c => c.id === form.client_id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      ...form,
      quantity: Number(form.quantity),
      storage_price: form.storage_price ? Number(form.storage_price) : null,
      expected_pickup: form.expected_pickup || null,
      storage_location: form.storage_location || null,
      season: form.season || null,
      notes: form.notes || null,
      vehicle_info: form.vehicle_info || null,
      license_plate: form.license_plate || null,
    });
    setSaving(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {initial?.id ? 'Edytuj depozyt' : 'Nowy depozyt opon'}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">Zarejestruj opony na przechowanie</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Client */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Klient *</label>
            {selectedClient ? (
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl border border-blue-200">
                <User className="h-4 w-4 text-blue-500" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{selectedClient.name}</p>
                  <p className="text-xs text-gray-400">{selectedClient.phone}</p>
                </div>
                <button type="button" onClick={() => set('client_id', '')} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Szukaj klienta..."
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  className="pl-9 rounded-xl"
                />
                {clientSearch && filteredClients.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border border-gray-100 rounded-xl mt-1 shadow-lg overflow-hidden">
                    {filteredClients.map(c => (
                      <button key={c.id} type="button"
                        onClick={() => { set('client_id', c.id); setClientSearch(''); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                        <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Vehicle */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Tablica rej.</label>
              <Input placeholder="WE12345" value={form.license_plate} onChange={e => set('license_plate', e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Pojazd</label>
              <Input placeholder="BMW X5 2020" value={form.vehicle_info} onChange={e => set('vehicle_info', e.target.value)} className="rounded-xl" />
            </div>
          </div>

          {/* Tire details */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Opony</label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {TIRE_TYPES.map(t => (
                <button key={t} type="button"
                  onClick={() => set('tire_type', t)}
                  className={cn('py-2 rounded-xl text-xs font-semibold border-2 transition-all',
                    form.tire_type === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500 hover:border-gray-200')}>
                  {TYPE_ICONS[t]} {t}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Marka" value={form.tire_brand} onChange={e => set('tire_brand', e.target.value)} className="rounded-xl" />
              <Input placeholder="225/45 R17" value={form.tire_size} onChange={e => set('tire_size', e.target.value)} className="rounded-xl" />
              <Input type="number" placeholder="4 szt." min={1} max={8} value={form.quantity}
                onChange={e => set('quantity', e.target.value)} className="rounded-xl" />
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Stan opon</label>
            <div className="flex gap-2">
              {CONDITIONS.map(c => (
                <button key={c} type="button"
                  onClick={() => set('condition', c)}
                  className={cn('flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-all',
                    form.condition === c
                      ? c === 'dobre' ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : c === 'do_wymiany' ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-100 text-gray-500 hover:border-gray-200')}>
                  {CONDITION_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {/* Storage & dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Lokalizacja</label>
              <Input placeholder="Regał A3, pół. 2" value={form.storage_location} onChange={e => set('storage_location', e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Sezon</label>
              <Input placeholder="2025/2026 zima" value={form.season} onChange={e => set('season', e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Data przyjęcia</label>
              <Input type="date" value={form.received_date} onChange={e => set('received_date', e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Planowany odbiór</label>
              <Input type="date" value={form.expected_pickup} onChange={e => set('expected_pickup', e.target.value)} className="rounded-xl" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Cena przechowania (PLN/sezon)</label>
            <Input type="number" placeholder="200" value={form.storage_price} onChange={e => set('storage_price', e.target.value)} className="rounded-xl" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Notatki</label>
            <textarea placeholder="Uwagi, uwagi..." value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Anuluj</Button>
            <Button type="submit" className="flex-1 rounded-xl" disabled={!form.client_id || saving}>
              {saving ? 'Zapisywanie...' : initial?.id ? 'Zapisz zmiany' : 'Dodaj depozyt'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */
export default function DepositsPage() {
  const [deposits, setDeposits] = useState<TireDeposit[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [counts, setCounts] = useState({ stored: 0, picked_up: 0, disposed: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'stored' | 'picked_up' | 'disposed'>('stored');
  const [showForm, setShowForm] = useState(false);
  const [editDeposit, setEditDeposit] = useState<TireDeposit | null>(null);

  const fetchDeposits = useCallback(async () => {
    const res = await fetch(`/api/deposits?status=${statusFilter}${search ? `&search=${encodeURIComponent(search)}` : ''}`);
    if (res.ok) {
      const data = await res.json();
      setDeposits(data.deposits ?? []);
      setCounts(data.counts ?? { stored: 0, picked_up: 0, disposed: 0 });
    }
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => { fetchDeposits(); }, [fetchDeposits]);

  useEffect(() => {
    fetch('/api/clients?limit=500').then(r => r.json()).then(d => setClients(d.clients ?? []));
  }, []);

  const handleSave = async (data: any) => {
    if (editDeposit) {
      await fetch(`/api/deposits/${editDeposit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    } else {
      await fetch('/api/deposits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    }
    setShowForm(false);
    setEditDeposit(null);
    fetchDeposits();
  };

  const handlePickup = async (deposit: TireDeposit) => {
    if (!confirm(`Wydać opony klientowi ${deposit.client.name || 'Klient bez nazwy'}?`)) return;
    await fetch(`/api/deposits/${deposit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'picked_up', picked_up_date: new Date().toISOString().split('T')[0] }),
    });
    fetchDeposits();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Usunąć ten depozyt?')) return;
    await fetch(`/api/deposits/${id}`, { method: 'DELETE' });
    fetchDeposits();
  };

  const overdueCount = deposits.filter(d => d.status === 'stored' && isOverdue(d.expected_pickup)).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Topbar
        title="Depozyty opon"
        subtitle={`${counts.stored} przechowywanych · ${counts.picked_up} wydanych`}
        icon={<Package className="h-5 w-5" />}
      />

      <div className="p-6 max-w-7xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Przechowywane', value: counts.stored, color: 'blue', icon: Package },
            { label: 'Zaległe odbiory', value: overdueCount, color: 'amber', icon: AlertTriangle },
            { label: 'Wydane (łącznie)', value: counts.picked_up, color: 'emerald', icon: CheckCircle2 },
            { label: 'Utylizowane', value: counts.disposed, color: 'gray', icon: Archive },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{s.label}</span>
                <s.icon className={`h-4 w-4 text-${s.color}-500`} />
              </div>
              <p className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Szukaj po kliencie, tablicy, marce..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 rounded-xl bg-white"
            />
          </div>

          {/* Status filter */}
          <div className="flex rounded-xl bg-white border border-gray-100 p-0.5">
            {(['stored', 'picked_up', 'disposed'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  statusFilter === s ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {s === 'stored' ? `Przechowywane (${counts.stored})` : s === 'picked_up' ? `Wydane (${counts.picked_up})` : `Utylizowane (${counts.disposed})`}
              </button>
            ))}
          </div>

          <Button className="rounded-xl gap-2 flex-shrink-0" onClick={() => { setEditDeposit(null); setShowForm(true); }}>
            <Plus className="h-4 w-4" />Nowy depozyt
          </Button>
        </div>

        {/* Overdue alert */}
        {overdueCount > 0 && statusFilter === 'stored' && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-700">
              <span className="font-semibold">{overdueCount} depozyt{overdueCount > 1 ? 'ów' : ''}</span> przekroczyło planowany termin odbioru.
            </p>
          </div>
        )}

        {/* Deposits grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
                <div className="h-4 bg-gray-100 rounded mb-3 w-3/4" />
                <div className="h-3 bg-gray-100 rounded mb-2 w-1/2" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : deposits.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Brak depozytów</p>
            <p className="text-sm mt-1">
              {search ? 'Zmień kryteria wyszukiwania' : 'Dodaj pierwszy depozyt opon klikając przycisk powyżej'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {deposits.map(d => (
                <DepositCard
                  key={d.id}
                  deposit={d}
                  onEdit={dep => { setEditDeposit(dep); setShowForm(true); }}
                  onPickup={handlePickup}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <DepositForm
            initial={editDeposit ?? undefined}
            clients={clients}
            onSave={handleSave}
            onClose={() => { setShowForm(false); setEditDeposit(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
