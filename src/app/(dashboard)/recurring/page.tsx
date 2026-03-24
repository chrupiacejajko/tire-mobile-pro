'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Repeat, Edit, Trash2, Play, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface ClientInfo {
  name: string;
  phone: string;
  address: string | null;
  city: string | null;
}

interface RecurringOrder {
  id: string;
  client_id: string;
  client: ClientInfo;
  service_ids: string[];
  frequency: string;
  preferred_day: number | null;
  preferred_time_window: string | null;
  preferred_employee_id: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  is_active: boolean;
  next_date: string | null;
  last_generated: string | null;
  created_at: string;
}

interface ServiceItem {
  id: string;
  name: string;
  price: number;
}

interface ClientSearch {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  city: string | null;
}

/* ─── Constants ──────────────────────────────────────────────────────── */
const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Co tydzień',
  biweekly: 'Co 2 tygodnie',
  monthly: 'Co miesiąc',
  quarterly: 'Co kwartał',
};

const DAY_LABELS: Record<number, string> = {
  0: 'Niedziela',
  1: 'Poniedziałek',
  2: 'Wtorek',
  3: 'Środa',
  4: 'Czwartek',
  5: 'Piątek',
  6: 'Sobota',
};

const TIME_WINDOW_LABELS: Record<string, string> = {
  morning: 'Rano (8-12)',
  afternoon: 'Południe (12-16)',
  evening: 'Wieczór (16-20)',
};

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function RecurringOrdersPage() {
  const [items, setItems] = useState<RecurringOrder[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    client_id: '',
    client_search: '',
    service_ids: [] as string[],
    frequency: 'weekly',
    preferred_day: 1,
    preferred_time_window: 'morning',
    address: '',
    city: '',
    notes: '',
    next_date: '',
  });

  // Client search
  const [clientResults, setClientResults] = useState<ClientSearch[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientSearch | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recurring-orders');
      const data = await res.json();
      setItems(data.recurring_orders || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch('/api/services');
      const data = await res.json();
      setServices(data.services || data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchItems();
    fetchServices();
  }, [fetchItems, fetchServices]);

  const searchClients = useCallback(async (q: string) => {
    if (q.length < 2) { setClientResults([]); return; }
    try {
      const res = await fetch(`/api/clients/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setClientResults(data.clients || data || []);
      setShowClientDropdown(true);
    } catch { /* ignore */ }
  }, []);

  const resetForm = () => {
    setForm({
      client_id: '', client_search: '', service_ids: [],
      frequency: 'weekly', preferred_day: 1, preferred_time_window: 'morning',
      address: '', city: '', notes: '', next_date: '',
    });
    setSelectedClient(null);
    setClientResults([]);
    setShowClientDropdown(false);
  };

  const openCreate = () => {
    resetForm();
    setEditingItem(null);
    setDialogOpen(true);
  };

  const openEdit = (item: RecurringOrder) => {
    setEditingItem(item);
    setSelectedClient({ id: item.client_id, name: item.client?.name || '', phone: item.client?.phone || '', address: item.address, city: item.city });
    setForm({
      client_id: item.client_id,
      client_search: item.client?.name || '',
      service_ids: item.service_ids || [],
      frequency: item.frequency,
      preferred_day: item.preferred_day ?? 1,
      preferred_time_window: item.preferred_time_window || 'morning',
      address: item.address || '',
      city: item.city || '',
      notes: item.notes || '',
      next_date: item.next_date || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      client_id: form.client_id,
      service_ids: form.service_ids,
      frequency: form.frequency,
      preferred_day: form.preferred_day,
      preferred_time_window: form.preferred_time_window,
      address: form.address || undefined,
      city: form.city || undefined,
      notes: form.notes || undefined,
      next_date: form.next_date || undefined,
    };

    if (editingItem) {
      await fetch('/api/recurring-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingItem.id, ...payload }),
      });
    } else {
      await fetch('/api/recurring-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    setSaving(false);
    setDialogOpen(false);
    resetForm();
    setEditingItem(null);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    await fetch('/api/recurring-orders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchItems();
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateResult(null);
    try {
      const res = await fetch('/api/recurring-orders/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days_ahead: 7 }),
      });
      const data = await res.json();
      setGenerateResult(`Wygenerowano ${data.generated || 0} zleceń`);
      fetchItems();
    } catch {
      setGenerateResult('Błąd generowania');
    }
    setGenerating(false);
    setTimeout(() => setGenerateResult(null), 5000);
  };

  const toggleService = (sid: string) => {
    setForm(prev => ({
      ...prev,
      service_ids: prev.service_ids.includes(sid)
        ? prev.service_ids.filter(s => s !== sid)
        : [...prev.service_ids, sid],
    }));
  };

  const getServiceNames = (ids: string[]) =>
    ids.map(id => services.find(s => s.id === id)?.name || '?').join(', ');

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Zlecenia cykliczne"
        subtitle="Automatyczne generowanie zleceń"
        icon={<Repeat className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-9 rounded-xl text-sm gap-2"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Generuj zlecenia
            </Button>
            <Button
              className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" /> Dodaj cykliczne zlecenie
            </Button>
          </div>
        }
      />

      <div className="p-6">
        {generateResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 rounded-xl bg-green-50 text-green-700 text-sm font-medium border border-green-200"
          >
            {generateResult}
          </motion.div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Repeat className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Brak zleceń cyklicznych</p>
            <p className="text-sm mt-1">Dodaj pierwszy szablon</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="pb-3 pl-4">Klient</th>
                  <th className="pb-3">Adres</th>
                  <th className="pb-3">Usługi</th>
                  <th className="pb-3">Cykl</th>
                  <th className="pb-3">Dzień</th>
                  <th className="pb-3">Okno czasowe</th>
                  <th className="pb-3">Następna data</th>
                  <th className="pb-3">Aktywny</th>
                  <th className="pb-3 pr-4">Akcje</th>
                </tr>
              </thead>
              <motion.tbody variants={ANIM.container} initial="hidden" animate="show">
                {items.map(item => (
                  <motion.tr
                    key={item.id}
                    variants={ANIM.item}
                    className="border-b border-gray-100 hover:bg-gray-50/80 transition-colors"
                  >
                    <td className="py-3 pl-4">
                      <div>
                        <p className="font-medium text-gray-900">{item.client?.name || '—'}</p>
                        <p className="text-xs text-gray-400">{item.client?.phone || ''}</p>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className="text-gray-600">{item.address || item.client?.address || '—'}</span>
                    </td>
                    <td className="py-3">
                      <span className="text-gray-600 text-xs">{getServiceNames(item.service_ids || []) || '—'}</span>
                    </td>
                    <td className="py-3">
                      <Badge variant="outline" className="text-xs">
                        {FREQUENCY_LABELS[item.frequency] || item.frequency}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <span className="text-gray-600">
                        {item.frequency === 'monthly'
                          ? (item.preferred_day !== null ? `${item.preferred_day}. dnia miesiąca` : '—')
                          : (item.preferred_day !== null ? DAY_LABELS[item.preferred_day] : '—')}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="text-gray-600">{item.preferred_time_window ? TIME_WINDOW_LABELS[item.preferred_time_window] : '—'}</span>
                    </td>
                    <td className="py-3">
                      <span className="text-gray-600 text-xs font-mono">
                        {item.next_date || '—'}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={cn('inline-block h-2.5 w-2.5 rounded-full', item.is_active ? 'bg-green-500' : 'bg-gray-300')} />
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(item)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-500" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) { setEditingItem(null); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edytuj zlecenie cykliczne' : 'Nowe zlecenie cykliczne'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            {/* Client search */}
            <div className="space-y-2">
              <Label>Klient</Label>
              <div className="relative">
                <Input
                  value={form.client_search}
                  onChange={e => {
                    setForm(prev => ({ ...prev, client_search: e.target.value }));
                    searchClients(e.target.value);
                  }}
                  placeholder="Szukaj klienta..."
                  onFocus={() => { if (clientResults.length > 0) setShowClientDropdown(true); }}
                />
                {showClientDropdown && clientResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                    {clientResults.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                        onClick={() => {
                          setSelectedClient(c);
                          setForm(prev => ({
                            ...prev,
                            client_id: c.id,
                            client_search: c.name,
                            address: prev.address || c.address || '',
                            city: prev.city || c.city || '',
                          }));
                          setShowClientDropdown(false);
                        }}
                      >
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedClient && (
                <p className="text-xs text-green-600">Wybrany: {selectedClient.name} ({selectedClient.phone})</p>
              )}
            </div>

            {/* Address */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Adres</Label>
                <Input value={form.address} onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))} placeholder="ul. Przykładowa 1" />
              </div>
              <div className="space-y-2">
                <Label>Miasto</Label>
                <Input value={form.city} onChange={e => setForm(prev => ({ ...prev, city: e.target.value }))} placeholder="Warszawa" />
              </div>
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label>Cykl</Label>
              <select
                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={form.frequency}
                onChange={e => setForm(prev => ({ ...prev, frequency: e.target.value }))}
              >
                <option value="weekly">Co tydzień</option>
                <option value="biweekly">Co 2 tygodnie</option>
                <option value="monthly">Co miesiąc</option>
                <option value="quarterly">Co kwartał</option>
              </select>
            </div>

            {/* Day */}
            <div className="space-y-2">
              <Label>{form.frequency === 'monthly' || form.frequency === 'quarterly' ? 'Dzień miesiąca' : 'Dzień tygodnia'}</Label>
              {form.frequency === 'monthly' || form.frequency === 'quarterly' ? (
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={form.preferred_day}
                  onChange={e => setForm(prev => ({ ...prev, preferred_day: Number(e.target.value) }))}
                />
              ) : (
                <select
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={form.preferred_day}
                  onChange={e => setForm(prev => ({ ...prev, preferred_day: Number(e.target.value) }))}
                >
                  {[1, 2, 3, 4, 5, 6, 0].map(d => (
                    <option key={d} value={d}>{DAY_LABELS[d]}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Time window */}
            <div className="space-y-2">
              <Label>Okno czasowe</Label>
              <select
                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={form.preferred_time_window}
                onChange={e => setForm(prev => ({ ...prev, preferred_time_window: e.target.value }))}
              >
                <option value="morning">Rano (8-12)</option>
                <option value="afternoon">Południe (12-16)</option>
                <option value="evening">Wieczór (16-20)</option>
              </select>
            </div>

            {/* Next date */}
            <div className="space-y-2">
              <Label>Następna data generowania</Label>
              <Input
                type="date"
                value={form.next_date}
                onChange={e => setForm(prev => ({ ...prev, next_date: e.target.value }))}
              />
            </div>

            {/* Services */}
            <div className="space-y-2">
              <Label>Usługi</Label>
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-1">
                {services.length === 0 ? (
                  <p className="text-xs text-gray-400 p-2">Brak usług</p>
                ) : (
                  services.map(s => (
                    <label key={s.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.service_ids.includes(s.id)}
                        onChange={() => toggleService(s.id)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">{s.name}</span>
                      <span className="text-xs text-gray-400 ml-auto">{s.price} zł</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notatki</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Dodatkowe informacje..."
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving || !form.client_id} className="bg-blue-600 hover:bg-blue-700">
                {saving ? 'Zapisywanie...' : editingItem ? 'Zapisz' : 'Dodaj'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
