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
import {
  Plus, Package, Edit, Trash2, Search, AlertTriangle,
  ArrowUp, ArrowDown, DollarSign, Layers, BarChart3,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { InventoryItem } from '@/lib/types';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

const categories = [
  { value: 'material', label: 'Materiał', color: 'bg-blue-100 text-blue-700' },
  { value: 'narzędzie', label: 'Narzędzie', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'opona', label: 'Opona', color: 'bg-amber-100 text-amber-700' },
  { value: 'część', label: 'Część', color: 'bg-violet-100 text-violet-700' },
  { value: 'inne', label: 'Inne', color: 'bg-gray-100 text-gray-700' },
];

const units = [
  { value: 'szt', label: 'szt' },
  { value: 'komplet', label: 'komplet' },
  { value: 'kg', label: 'kg' },
  { value: 'l', label: 'l' },
];

export default function WarehousePage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({
    name: '', sku: '', category: 'material', quantity: '0', min_quantity: '0',
    unit: 'szt', price: '0', location: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('inventory_items').select('*').order('name');
    if (data) setItems(data as InventoryItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      quantity: Number(form.quantity),
      min_quantity: Number(form.min_quantity),
      price: Number(form.price),
      location: form.location || null,
      notes: form.notes || null,
    };
    if (editingItem) {
      await supabase.from('inventory_items').update(payload).eq('id', editingItem.id);
    } else {
      await supabase.from('inventory_items').insert(payload);
    }
    setSaving(false);
    setDialogOpen(false);
    resetForm();
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('inventory_items').delete().eq('id', id);
    fetchItems();
  };

  const adjustQuantity = async (id: string, delta: number) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const newQty = Math.max(0, item.quantity + delta);
    await supabase.from('inventory_items').update({ quantity: newQty }).eq('id', id);
    fetchItems();
  };

  const resetForm = () => {
    setForm({ name: '', sku: '', category: 'material', quantity: '0', min_quantity: '0', unit: 'szt', price: '0', location: '', notes: '' });
    setEditingItem(null);
  };

  const openEdit = (item: InventoryItem) => {
    setForm({
      name: item.name, sku: item.sku, category: item.category,
      quantity: item.quantity.toString(), min_quantity: item.min_quantity.toString(),
      unit: item.unit, price: Number(item.price).toString(),
      location: item.location || '', notes: item.notes || '',
    });
    setEditingItem(item);
    setDialogOpen(true);
  };

  const getCategoryStyle = (cat: string) => categories.find(c => c.value === cat) || categories[4];

  const filteredItems = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.sku.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === 'all' || i.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const lowStockCount = items.filter(i => i.quantity <= i.min_quantity).length;
  const uniqueCategories = [...new Set(items.map(i => i.category))].length;
  const totalValue = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Magazyn"
        subtitle={`${items.length} pozycji`}
        icon={<Package className="h-5 w-5" />}
        actions={
          <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Dodaj pozycję
          </Button>
        }
      />
      <div className="p-6 space-y-6">
        {/* Stats */}
        <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-4" variants={ANIM.container} initial="hidden" animate="show">
          {[
            { label: 'Wszystkie pozycje', value: items.length, color: 'from-blue-500 to-blue-600' },
            { label: 'Niski stan', value: lowStockCount, color: 'from-red-500 to-red-600' },
            { label: 'Kategorie', value: uniqueCategories, color: 'from-violet-500 to-violet-600' },
            { label: 'Wartość magazynu', value: `${totalValue.toFixed(0)} zł`, color: 'from-emerald-500 to-emerald-600' },
          ].map(s => (
            <motion.div key={s.label} variants={ANIM.item}
              className={`rounded-2xl bg-gradient-to-br ${s.color} p-4 text-white shadow-lg`}>
              <p className="text-sm text-white/80">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Szukaj po nazwie lub SKU..." className="pl-9 h-9 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v ?? 'all')}>
            <SelectTrigger className="w-44 h-9 rounded-xl"><SelectValue placeholder="Kategoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie kategorie</SelectItem>
              {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Brak pozycji</p>
            <p className="text-sm mt-1">Dodaj pierwszą pozycję klikając przycisk powyżej</p>
          </div>
        ) : (
          <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" variants={ANIM.container} initial="hidden" animate="show">
            {filteredItems.map(item => {
              const catStyle = getCategoryStyle(item.category);
              const isLowStock = item.quantity <= item.min_quantity;
              return (
                <motion.div key={item.id} variants={ANIM.item} whileHover={{ y: -2 }}>
                  <Card className={`rounded-2xl border-gray-100 shadow-sm ${isLowStock ? 'ring-2 ring-red-200' : ''}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-gray-900 truncate">{item.name}</h3>
                          <p className="text-xs text-gray-400 mt-0.5">SKU: {item.sku}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isLowStock && (
                            <Badge className="text-[10px] rounded-lg bg-red-100 text-red-700">
                              <AlertTriangle className="h-3 w-3 mr-0.5" /> Niski stan
                            </Badge>
                          )}
                          <Badge className={`text-[10px] rounded-lg ${catStyle.color}`}>{catStyle.label}</Badge>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-gray-900">{item.quantity}</span>
                          <span className="text-xs text-gray-400">/ {item.min_quantity} min</span>
                          <span className="text-xs text-gray-500">{item.unit}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mb-3">
                        <span className="flex items-center gap-1 text-sm font-bold text-gray-900">
                          <DollarSign className="h-3.5 w-3.5 text-gray-400" />{Number(item.price)} zł
                        </span>
                        {item.location && (
                          <span className="text-xs text-gray-500">📍 {item.location}</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t">
                        <div className="flex gap-1">
                          <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" onClick={() => adjustQuantity(item.id, -1)}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" onClick={() => adjustQuantity(item.id, 1)}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEdit(item)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-red-500" onClick={() => handleDelete(item.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingItem ? 'Edytuj pozycję' : 'Nowa pozycja'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nazwa</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Opona letnia 205/55R16" /></div>
              <div className="space-y-2"><Label>SKU</Label><Input required value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="OPN-205-55R16" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Kategoria</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v ?? 'material' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Ilość</Label><Input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
              <div className="space-y-2"><Label>Min. ilość</Label><Input type="number" value={form.min_quantity} onChange={e => setForm({ ...form, min_quantity: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Jednostka</Label>
                <Select value={form.unit} onValueChange={v => setForm({ ...form, unit: v ?? 'szt' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{units.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Cena (zł)</Label><Input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>
              <div className="space-y-2"><Label>Lokalizacja</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Regał A3" /></div>
            </div>
            <div className="space-y-2"><Label>Notatki</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Dodatkowe informacje..." /></div>
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
