'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Plus, Package, Warehouse as WarehouseIcon, Wrench, Layers,
  ArrowRightLeft, ChevronDown, ChevronRight, MapPin, User,
  ArrowDownToLine, ArrowUpFromLine, History, Pencil, Search,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type {
  Warehouse, Equipment, EquipmentType, EquipmentStatus,
  MaterialType, MaterialStock, MaterialMovement,
} from '@/lib/types';

const STATUS_MAP: Record<EquipmentStatus, { label: string; color: string }> = {
  available: { label: 'Dostepny', color: 'bg-emerald-100 text-emerald-700' },
  in_use: { label: 'W uzyciu', color: 'bg-blue-100 text-blue-700' },
  maintenance: { label: 'Serwis', color: 'bg-orange-100 text-orange-700' },
  retired: { label: 'Wycofany', color: 'bg-gray-100 text-gray-600' },
};

interface EmployeeOption {
  id: string;
  name: string;
}

interface OrderOption {
  id: string;
  label: string;
}

// Aggregated material row for the materials tab
interface MaterialSummary {
  material_type_id: string;
  name: string;
  unit: string;
  warehouse_total: number;
  employee_total: number;
  total: number;
  breakdown: MaterialStock[];
}

export default function WarehousePage() {
  const [activeTab, setActiveTab] = useState('warehouses');
  const supabase = createClient();

  // --- Shared data ---
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Equipment state ---
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [eqFilterType, setEqFilterType] = useState('all');
  const [eqFilterStatus, setEqFilterStatus] = useState('all');
  const [eqFilterLocation, setEqFilterLocation] = useState('all');

  // --- Materials state ---
  const [materialStock, setMaterialStock] = useState<MaterialStock[]>([]);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);

  // --- Movements state ---
  const [movements, setMovements] = useState<MaterialMovement[]>([]);
  const [movDateFrom, setMovDateFrom] = useState('');
  const [movDateTo, setMovDateTo] = useState('');
  const [movPageSize] = useState(50);
  const [movHasMore, setMovHasMore] = useState(false);
  const [movLoadingMore, setMovLoadingMore] = useState(false);

  // --- Orders for picker ---
  const [recentOrders, setRecentOrders] = useState<OrderOption[]>([]);
  const [orderSearch, setOrderSearch] = useState('');

  // --- Dialogs ---
  const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false);
  const [warehouseEditDialogOpen, setWarehouseEditDialogOpen] = useState(false);
  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [consumeDialogOpen, setConsumeDialogOpen] = useState(false);
  const [materialTransferDialogOpen, setMaterialTransferDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // --- Forms ---
  const [whForm, setWhForm] = useState({ name: '', address: '' });
  const [whEditForm, setWhEditForm] = useState({ id: '', name: '', address: '', is_active: true });
  const [eqForm, setEqForm] = useState({
    serial_number: '', type_id: '', location_type: 'warehouse' as 'warehouse' | 'employee',
    warehouse_id: '', employee_id: '', notes: '',
  });
  const [transferEqId, setTransferEqId] = useState('');
  const [transferForm, setTransferForm] = useState({
    location_type: 'warehouse' as 'warehouse' | 'employee',
    warehouse_id: '', employee_id: '',
  });
  const [receiveForm, setReceiveForm] = useState({
    material_type_id: '', location_type: 'warehouse' as 'warehouse' | 'employee',
    warehouse_id: '', employee_id: '', quantity: '',
  });
  const [consumeForm, setConsumeForm] = useState({
    material_type_id: '', location_type: 'warehouse' as 'warehouse' | 'employee',
    warehouse_id: '', employee_id: '', quantity: '', order_id: '',
  });
  const [matTransferForm, setMatTransferForm] = useState({
    material_type_id: '',
    from_warehouse_id: '' as string | null,
    from_employee_id: '' as string | null,
    to_location_type: 'warehouse' as 'warehouse' | 'employee',
    to_warehouse_id: '',
    to_employee_id: '',
    quantity: '',
    notes: '',
  });

  // =========== FETCH ===========
  const fetchBase = useCallback(async () => {
    const [whRes, etRes, mtRes, empRes] = await Promise.all([
      supabase.from('warehouses').select('*').order('name'),
      supabase.from('equipment_types').select('*').order('name'),
      supabase.from('material_types').select('*').order('name'),
      supabase.from('employees').select('id, user:profiles(full_name)').eq('is_active', true),
    ]);

    if (whRes.data) {
      // Enrich warehouses with counts
      const [eqCount, stockCount] = await Promise.all([
        supabase.from('equipment').select('warehouse_id'),
        supabase.from('material_stock').select('warehouse_id, quantity'),
      ]);
      const enriched = whRes.data.map((w: any) => ({
        ...w,
        equipment_count: (eqCount.data || []).filter((e: any) => e.warehouse_id === w.id).length,
        material_stock_count: (stockCount.data || [])
          .filter((s: any) => s.warehouse_id === w.id)
          .reduce((sum: number, s: any) => sum + (s.quantity || 0), 0),
      }));
      setWarehouses(enriched);
    }
    if (etRes.data) setEquipmentTypes(etRes.data);
    if (mtRes.data) setMaterialTypes(mtRes.data);
    if (empRes.data) {
      setEmployees(empRes.data.map((e: any) => ({
        id: e.id,
        name: e.user?.full_name || 'Nieznany',
      })));
    }
  }, []);

  const fetchEquipment = useCallback(async () => {
    const { data } = await supabase
      .from('equipment')
      .select(`
        *,
        type:equipment_types(id, name),
        warehouse:warehouses(id, name),
        employee:employees(id, user:profiles(full_name))
      `)
      .order('created_at', { ascending: false });
    if (data) setEquipment(data as Equipment[]);
  }, []);

  const fetchMaterials = useCallback(async () => {
    const { data } = await supabase
      .from('material_stock')
      .select(`
        *,
        material_type:material_types(id, name, unit),
        warehouse:warehouses(id, name),
        employee:employees(id, user:profiles(full_name))
      `)
      .gt('quantity', 0)
      .order('material_type_id');
    if (data) setMaterialStock(data as MaterialStock[]);
  }, []);

  const fetchMovements = useCallback(async () => {
    let query = supabase
      .from('material_movements')
      .select(`
        *,
        material_type:material_types(id, name, unit),
        from_warehouse:warehouses!material_movements_from_warehouse_id_fkey(id, name),
        from_employee:employees!material_movements_from_employee_id_fkey(id, user:profiles(full_name)),
        to_warehouse:warehouses!material_movements_to_warehouse_id_fkey(id, name),
        to_employee:employees!material_movements_to_employee_id_fkey(id, user:profiles(full_name))
      `)
      .order('created_at', { ascending: false })
      .range(0, movPageSize - 1);

    if (movDateFrom) query = query.gte('created_at', movDateFrom);
    if (movDateTo) query = query.lte('created_at', movDateTo + 'T23:59:59');

    const { data } = await query;
    if (data) {
      setMovHasMore(data.length === movPageSize);
      setMovements(data as MaterialMovement[]);
    }
  }, [movDateFrom, movDateTo, movPageSize]);

  const loadMoreMovements = useCallback(async () => {
    setMovLoadingMore(true);
    const offset = movements.length;
    let query = supabase
      .from('material_movements')
      .select(`
        *,
        material_type:material_types(id, name, unit),
        from_warehouse:warehouses!material_movements_from_warehouse_id_fkey(id, name),
        from_employee:employees!material_movements_from_employee_id_fkey(id, user:profiles(full_name)),
        to_warehouse:warehouses!material_movements_to_warehouse_id_fkey(id, name),
        to_employee:employees!material_movements_to_employee_id_fkey(id, user:profiles(full_name))
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + movPageSize - 1);

    if (movDateFrom) query = query.gte('created_at', movDateFrom);
    if (movDateTo) query = query.lte('created_at', movDateTo + 'T23:59:59');

    const { data } = await query;
    if (data) {
      setMovHasMore(data.length === movPageSize);
      setMovements(prev => [...prev, ...(data as MaterialMovement[])]);
    }
    setMovLoadingMore(false);
  }, [movements.length, movDateFrom, movDateTo, movPageSize]);

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, scheduled_date, status, client:clients(name)')
      .order('scheduled_date', { ascending: false })
      .limit(50);
    if (data) {
      setRecentOrders(data.map((o: any) => ({
        id: o.id,
        label: `${o.scheduled_date} - ${o.client?.name || 'Brak klienta'} (${o.status})`,
      })));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchBase(), fetchEquipment(), fetchMaterials(), fetchMovements(), fetchOrders()])
      .finally(() => setLoading(false));
  }, [fetchBase, fetchEquipment, fetchMaterials, fetchMovements, fetchOrders]);

  // =========== HANDLERS ===========

  const handleAddWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await supabase.from('warehouses').insert({
      name: whForm.name,
      address: whForm.address || null,
    });
    setSaving(false);
    setWarehouseDialogOpen(false);
    setWhForm({ name: '', address: '' });
    fetchBase();
  };

  const handleEditWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/warehouses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: whEditForm.id,
        name: whEditForm.name,
        address: whEditForm.address || null,
        is_active: whEditForm.is_active,
      }),
    });
    setSaving(false);
    setWarehouseEditDialogOpen(false);
    fetchBase();
  };

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await supabase.from('equipment').insert({
      serial_number: eqForm.serial_number,
      type_id: eqForm.type_id,
      warehouse_id: eqForm.location_type === 'warehouse' && eqForm.warehouse_id ? eqForm.warehouse_id : null,
      employee_id: eqForm.location_type === 'employee' && eqForm.employee_id ? eqForm.employee_id : null,
      status: 'available',
      notes: eqForm.notes || null,
    });
    setSaving(false);
    setEquipmentDialogOpen(false);
    setEqForm({ serial_number: '', type_id: '', location_type: 'warehouse', warehouse_id: '', employee_id: '', notes: '' });
    fetchEquipment();
    fetchBase();
  };

  const handleTransferEquipment = async () => {
    if (!transferEqId) return;
    setSaving(true);
    await supabase.from('equipment').update({
      warehouse_id: transferForm.location_type === 'warehouse' && transferForm.warehouse_id ? transferForm.warehouse_id : null,
      employee_id: transferForm.location_type === 'employee' && transferForm.employee_id ? transferForm.employee_id : null,
    }).eq('id', transferEqId);
    setSaving(false);
    setTransferDialogOpen(false);
    setTransferEqId('');
    setTransferForm({ location_type: 'warehouse', warehouse_id: '', employee_id: '' });
    fetchEquipment();
    fetchBase();
  };

  const handleChangeEquipmentStatus = async (eqId: string, newStatus: EquipmentStatus) => {
    await fetch('/api/equipment', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: eqId, status: newStatus }),
    });
    fetchEquipment();
  };

  const handleReceiveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'receive',
        material_type_id: receiveForm.material_type_id,
        warehouse_id: receiveForm.location_type === 'warehouse' ? receiveForm.warehouse_id || null : null,
        employee_id: receiveForm.location_type === 'employee' ? receiveForm.employee_id || null : null,
        quantity: Number(receiveForm.quantity),
      }),
    });
    setSaving(false);
    setReceiveDialogOpen(false);
    setReceiveForm({ material_type_id: '', location_type: 'warehouse', warehouse_id: '', employee_id: '', quantity: '' });
    fetchMaterials();
    fetchMovements();
    fetchBase();
  };

  const handleConsumeMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'consume',
        material_type_id: consumeForm.material_type_id,
        warehouse_id: consumeForm.location_type === 'warehouse' ? consumeForm.warehouse_id || null : null,
        employee_id: consumeForm.location_type === 'employee' ? consumeForm.employee_id || null : null,
        quantity: Number(consumeForm.quantity),
        order_id: consumeForm.order_id || null,
      }),
    });
    setSaving(false);
    setConsumeDialogOpen(false);
    setConsumeForm({ material_type_id: '', location_type: 'warehouse', warehouse_id: '', employee_id: '', quantity: '', order_id: '' });
    fetchMaterials();
    fetchMovements();
    fetchBase();
  };

  const handleTransferMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'transfer',
        material_type_id: matTransferForm.material_type_id,
        from_warehouse_id: matTransferForm.from_warehouse_id || null,
        from_employee_id: matTransferForm.from_employee_id || null,
        to_warehouse_id: matTransferForm.to_location_type === 'warehouse' ? matTransferForm.to_warehouse_id || null : null,
        to_employee_id: matTransferForm.to_location_type === 'employee' ? matTransferForm.to_employee_id || null : null,
        quantity: Number(matTransferForm.quantity),
        notes: matTransferForm.notes || null,
      }),
    });
    setSaving(false);
    setMaterialTransferDialogOpen(false);
    setMatTransferForm({
      material_type_id: '', from_warehouse_id: '', from_employee_id: '',
      to_location_type: 'warehouse', to_warehouse_id: '', to_employee_id: '',
      quantity: '', notes: '',
    });
    fetchMaterials();
    fetchMovements();
    fetchBase();
  };

  // =========== DERIVED DATA ===========

  const filteredEquipment = equipment.filter(eq => {
    if (eqFilterType !== 'all' && eq.type_id !== eqFilterType) return false;
    if (eqFilterStatus !== 'all' && eq.status !== eqFilterStatus) return false;
    if (eqFilterLocation !== 'all') {
      if (eqFilterLocation.startsWith('wh:') && eq.warehouse_id !== eqFilterLocation.slice(3)) return false;
      if (eqFilterLocation.startsWith('emp:') && eq.employee_id !== eqFilterLocation.slice(4)) return false;
    }
    return true;
  });

  const materialSummaries: MaterialSummary[] = materialTypes.map(mt => {
    const stocks = materialStock.filter(s => s.material_type_id === mt.id);
    const warehouseTotal = stocks
      .filter(s => s.warehouse_id)
      .reduce((sum, s) => sum + s.quantity, 0);
    const employeeTotal = stocks
      .filter(s => s.employee_id)
      .reduce((sum, s) => sum + s.quantity, 0);
    return {
      material_type_id: mt.id,
      name: mt.name,
      unit: mt.unit,
      warehouse_total: warehouseTotal,
      employee_total: employeeTotal,
      total: warehouseTotal + employeeTotal,
      breakdown: stocks,
    };
  });

  const nonZeroMaterials = materialSummaries.filter(m => m.total > 0);
  const allMaterialsZero = materialSummaries.length > 0 && nonZeroMaterials.length === 0;

  const filteredOrders = useMemo(() => {
    if (!orderSearch) return recentOrders;
    const lower = orderSearch.toLowerCase();
    return recentOrders.filter(o => o.label.toLowerCase().includes(lower) || o.id.toLowerCase().includes(lower));
  }, [recentOrders, orderSearch]);

  const getLocationName = (eq: Equipment) => {
    if (eq.warehouse) return eq.warehouse.name;
    if (eq.employee?.user) return eq.employee.user.full_name;
    return '-';
  };

  const getLocationIcon = (eq: Equipment) => {
    if (eq.warehouse) return <MapPin className="h-3.5 w-3.5 text-gray-400" />;
    if (eq.employee) return <User className="h-3.5 w-3.5 text-gray-400" />;
    return null;
  };

  const formatMovementLocation = (
    warehouse: { id: string; name: string } | null | undefined,
    employee: { id: string; user: { full_name: string } | null } | null | undefined
  ) => {
    if (warehouse) return warehouse.name;
    if (employee?.user) return employee.user.full_name;
    return '-';
  };

  // Helper to open material transfer dialog with source pre-filled from a stock row
  const openMaterialTransferDialog = (stock: MaterialStock) => {
    setMatTransferForm({
      material_type_id: stock.material_type_id,
      from_warehouse_id: stock.warehouse_id,
      from_employee_id: stock.employee_id,
      to_location_type: 'warehouse',
      to_warehouse_id: '',
      to_employee_id: '',
      quantity: '',
      notes: '',
    });
    setMaterialTransferDialogOpen(true);
  };

  // =========== RENDER ===========
  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Magazyn"
        subtitle="Zarzadzaj magazynami, sprzetem i materialami"
        icon={<Package className="h-5 w-5" />}
      />

      <div className="p-6">
        <Tabs defaultValue="warehouses" onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="warehouses" className="gap-2">
              <WarehouseIcon className="h-4 w-4" /> Magazyny
            </TabsTrigger>
            <TabsTrigger value="equipment" className="gap-2">
              <Wrench className="h-4 w-4" /> Sprzety
            </TabsTrigger>
            <TabsTrigger value="materials" className="gap-2">
              <Layers className="h-4 w-4" /> Materialy
            </TabsTrigger>
            <TabsTrigger value="movements" className="gap-2">
              <History className="h-4 w-4" /> Ruchy
            </TabsTrigger>
          </TabsList>

          {/* ========== TAB 1: WAREHOUSES ========== */}
          <TabsContent value="warehouses">
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700"
                  onClick={() => { setWhForm({ name: '', address: '' }); setWarehouseDialogOpen(true); }}
                >
                  <Plus className="h-4 w-4" /> Dodaj magazyn
                </Button>
              </div>

              {loading ? (
                <LoadingSpinner />
              ) : warehouses.length === 0 ? (
                <EmptyState icon={WarehouseIcon} text="Brak magazynow" subtext="Dodaj pierwszy magazyn" />
              ) : (
                <Card className="rounded-2xl border-gray-100 shadow-sm">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nazwa</TableHead>
                          <TableHead>Adres</TableHead>
                          <TableHead className="text-center">Sprzety</TableHead>
                          <TableHead className="text-center">Materialy (szt.)</TableHead>
                          <TableHead className="text-center">Aktywny</TableHead>
                          <TableHead className="text-right">Akcje</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {warehouses.map(wh => (
                          <TableRow key={wh.id}>
                            <TableCell className="font-medium">{wh.name}</TableCell>
                            <TableCell className="text-gray-500">{wh.address || '-'}</TableCell>
                            <TableCell className="text-center">{wh.equipment_count || 0}</TableCell>
                            <TableCell className="text-center">{wh.material_stock_count || 0}</TableCell>
                            <TableCell className="text-center">
                              <Badge className={wh.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}>
                                {wh.is_active ? 'Tak' : 'Nie'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline" size="sm"
                                className="h-7 rounded-lg text-xs gap-1"
                                onClick={() => {
                                  setWhEditForm({
                                    id: wh.id,
                                    name: wh.name,
                                    address: wh.address || '',
                                    is_active: wh.is_active,
                                  });
                                  setWarehouseEditDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3 w-3" /> Edytuj
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ========== TAB 2: EQUIPMENT ========== */}
          <TabsContent value="equipment">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Select value={eqFilterType} onValueChange={v => setEqFilterType(v ?? 'all')}>
                  <SelectTrigger className="w-44 h-9 rounded-xl"><SelectValue placeholder="Typ" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie typy</SelectItem>
                    {equipmentTypes.map(et => (
                      <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={eqFilterStatus} onValueChange={v => setEqFilterStatus(v ?? 'all')}>
                  <SelectTrigger className="w-44 h-9 rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie statusy</SelectItem>
                    {(Object.entries(STATUS_MAP) as [EquipmentStatus, { label: string }][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={eqFilterLocation} onValueChange={v => setEqFilterLocation(v ?? 'all')}>
                  <SelectTrigger className="w-52 h-9 rounded-xl"><SelectValue placeholder="Lokalizacja" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie lokalizacje</SelectItem>
                    {warehouses.map(w => (
                      <SelectItem key={'wh:' + w.id} value={'wh:' + w.id}>{w.name}</SelectItem>
                    ))}
                    {employees.map(e => (
                      <SelectItem key={'emp:' + e.id} value={'emp:' + e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex-1" />
                <Button
                  className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    setEqForm({ serial_number: '', type_id: '', location_type: 'warehouse', warehouse_id: '', employee_id: '', notes: '' });
                    setEquipmentDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> Dodaj sprzet
                </Button>
              </div>

              {loading ? (
                <LoadingSpinner />
              ) : filteredEquipment.length === 0 ? (
                <EmptyState icon={Wrench} text="Brak sprzetu" subtext="Dodaj pierwszy sprzet" />
              ) : (
                <Card className="rounded-2xl border-gray-100 shadow-sm">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nr seryjny</TableHead>
                          <TableHead>Typ</TableHead>
                          <TableHead>Lokalizacja</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Notatki</TableHead>
                          <TableHead className="text-right">Akcje</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEquipment.map(eq => {
                          const st = STATUS_MAP[eq.status] || STATUS_MAP.available;
                          return (
                            <TableRow key={eq.id}>
                              <TableCell className="font-mono font-medium">{eq.serial_number}</TableCell>
                              <TableCell>{eq.type?.name || '-'}</TableCell>
                              <TableCell>
                                <span className="flex items-center gap-1.5">
                                  {getLocationIcon(eq)}
                                  {getLocationName(eq)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={eq.status}
                                  onValueChange={(v) => handleChangeEquipmentStatus(eq.id, v as EquipmentStatus)}
                                >
                                  <SelectTrigger className={`h-7 w-32 rounded-lg text-[11px] border-0 ${st.color}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(Object.entries(STATUS_MAP) as [EquipmentStatus, { label: string; color: string }][]).map(([k, v]) => (
                                      <SelectItem key={k} value={k}>
                                        <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] ${v.color}`}>{v.label}</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="text-gray-500 max-w-[200px] truncate">{eq.notes || '-'}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline" size="sm"
                                  className="h-7 rounded-lg text-xs gap-1"
                                  onClick={() => {
                                    setTransferEqId(eq.id);
                                    setTransferForm({ location_type: 'warehouse', warehouse_id: '', employee_id: '' });
                                    setTransferDialogOpen(true);
                                  }}
                                >
                                  <ArrowRightLeft className="h-3 w-3" /> Przenies
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ========== TAB 3: MATERIALS ========== */}
          <TabsContent value="materials">
            <div className="space-y-4">
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  className="h-9 rounded-xl text-sm gap-2"
                  onClick={() => {
                    setConsumeForm({ material_type_id: '', location_type: 'warehouse', warehouse_id: '', employee_id: '', quantity: '', order_id: '' });
                    setOrderSearch('');
                    setConsumeDialogOpen(true);
                  }}
                >
                  <ArrowUpFromLine className="h-4 w-4" /> Wydaj material
                </Button>
                <Button
                  className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    setReceiveForm({ material_type_id: '', location_type: 'warehouse', warehouse_id: '', employee_id: '', quantity: '' });
                    setReceiveDialogOpen(true);
                  }}
                >
                  <ArrowDownToLine className="h-4 w-4" /> Przyjmij material
                </Button>
              </div>

              {loading ? (
                <LoadingSpinner />
              ) : materialSummaries.length === 0 ? (
                <EmptyState icon={Layers} text="Brak materialow" subtext="Przyjmij material aby rozpoczac" />
              ) : allMaterialsZero ? (
                <EmptyState icon={Layers} text="Wszystkie stany zerowe" subtext="Brak materialow na stanie - przyjmij material aby rozpoczac" />
              ) : nonZeroMaterials.length === 0 ? (
                <EmptyState icon={Layers} text="Brak materialow" subtext="Przyjmij material aby rozpoczac" />
              ) : (
                <Card className="rounded-2xl border-gray-100 shadow-sm">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8" />
                          <TableHead>Material</TableHead>
                          <TableHead>Jednostka</TableHead>
                          <TableHead className="text-right">W magazynach</TableHead>
                          <TableHead className="text-right">U pracownikow</TableHead>
                          <TableHead className="text-right">Lacznie</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {nonZeroMaterials.map(ms => (
                          <>
                            <TableRow
                              key={ms.material_type_id}
                              className="cursor-pointer"
                              onClick={() => setExpandedMaterial(
                                expandedMaterial === ms.material_type_id ? null : ms.material_type_id
                              )}
                            >
                              <TableCell>
                                {expandedMaterial === ms.material_type_id
                                  ? <ChevronDown className="h-4 w-4 text-gray-400" />
                                  : <ChevronRight className="h-4 w-4 text-gray-400" />
                                }
                              </TableCell>
                              <TableCell className="font-medium">{ms.name}</TableCell>
                              <TableCell className="text-gray-500">{ms.unit}</TableCell>
                              <TableCell className="text-right">{ms.warehouse_total}</TableCell>
                              <TableCell className="text-right">{ms.employee_total}</TableCell>
                              <TableCell className="text-right font-semibold">{ms.total}</TableCell>
                            </TableRow>
                            {expandedMaterial === ms.material_type_id && ms.breakdown.map(stock => (
                              <TableRow key={stock.id} className="bg-gray-50/50">
                                <TableCell />
                                <TableCell colSpan={2} className="text-sm text-gray-500 pl-8">
                                  <span className="flex items-center gap-1.5">
                                    {stock.warehouse
                                      ? <><MapPin className="h-3 w-3" /> {stock.warehouse.name}</>
                                      : stock.employee?.user
                                        ? <><User className="h-3 w-3" /> {stock.employee.user.full_name}</>
                                        : '-'
                                    }
                                  </span>
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                  {stock.warehouse_id ? stock.quantity : ''}
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                  {stock.employee_id ? stock.quantity : ''}
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                  <span className="flex items-center justify-end gap-2">
                                    <span className="font-medium">{stock.quantity}</span>
                                    <Button
                                      variant="outline" size="sm"
                                      className="h-6 rounded-md text-[10px] gap-1 px-2"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openMaterialTransferDialog(stock);
                                      }}
                                    >
                                      <ArrowRightLeft className="h-2.5 w-2.5" /> Przenies
                                    </Button>
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ========== TAB 4: MOVEMENTS ========== */}
          <TabsContent value="movements">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Od</Label>
                  <Input
                    type="date"
                    className="h-9 rounded-xl w-44"
                    value={movDateFrom}
                    onChange={e => setMovDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Do</Label>
                  <Input
                    type="date"
                    className="h-9 rounded-xl w-44"
                    value={movDateTo}
                    onChange={e => setMovDateTo(e.target.value)}
                  />
                </div>
                <div className="flex-1" />
                <Button variant="outline" className="h-9 rounded-xl text-sm" onClick={fetchMovements}>
                  Filtruj
                </Button>
              </div>

              {loading ? (
                <LoadingSpinner />
              ) : movements.length === 0 ? (
                <EmptyState icon={History} text="Brak ruchow" subtext="Historia ruchow materialow pojawi sie tutaj" />
              ) : (
                <>
                <Card className="rounded-2xl border-gray-100 shadow-sm">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Material</TableHead>
                          <TableHead>Typ</TableHead>
                          <TableHead>Z</TableHead>
                          <TableHead>Do</TableHead>
                          <TableHead className="text-right">Ilosc</TableHead>
                          <TableHead>Zlecenie</TableHead>
                          <TableHead>Notatki</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {movements.map(mov => (
                          <TableRow key={mov.id}>
                            <TableCell className="text-sm text-gray-500">
                              {new Date(mov.created_at).toLocaleString('pl-PL', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </TableCell>
                            <TableCell className="font-medium">
                              {mov.material_type?.name || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge className={
                                mov.movement_type === 'receive' ? 'bg-emerald-100 text-emerald-700' :
                                mov.movement_type === 'consume' ? 'bg-red-100 text-red-700' :
                                'bg-blue-100 text-blue-700'
                              }>
                                {mov.movement_type === 'receive' ? 'Przyjecie' :
                                 mov.movement_type === 'consume' ? 'Wydanie' : 'Transfer'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-gray-500">
                              {formatMovementLocation(mov.from_warehouse, mov.from_employee)}
                            </TableCell>
                            <TableCell className="text-sm text-gray-500">
                              {formatMovementLocation(mov.to_warehouse, mov.to_employee)}
                            </TableCell>
                            <TableCell className="text-right font-medium">{mov.quantity}</TableCell>
                            <TableCell className="text-sm text-gray-500">
                              {mov.order_id ? mov.order_id.slice(0, 8) + '...' : '-'}
                            </TableCell>
                            <TableCell className="text-sm text-gray-500 max-w-[150px] truncate">
                              {mov.notes || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                {movHasMore && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      className="rounded-xl text-sm"
                      onClick={loadMoreMovements}
                      disabled={movLoadingMore}
                    >
                      {movLoadingMore ? 'Ładowanie...' : 'Załaduj więcej'}
                    </Button>
                  </div>
                )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ========== DIALOG: ADD WAREHOUSE ========== */}
      <Dialog open={warehouseDialogOpen} onOpenChange={setWarehouseDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nowy magazyn</DialogTitle></DialogHeader>
          <form onSubmit={handleAddWarehouse} className="space-y-4">
            <div className="space-y-2">
              <Label>Nazwa</Label>
              <Input required value={whForm.name} onChange={e => setWhForm({ ...whForm, name: e.target.value })} placeholder="Magazyn glowny" />
            </div>
            <div className="space-y-2">
              <Label>Adres</Label>
              <Input value={whForm.address} onChange={e => setWhForm({ ...whForm, address: e.target.value })} placeholder="ul. Przykladowa 1, Warszawa" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setWarehouseDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                {saving ? 'Zapisywanie...' : 'Dodaj'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== DIALOG: EDIT WAREHOUSE ========== */}
      <Dialog open={warehouseEditDialogOpen} onOpenChange={setWarehouseEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edytuj magazyn</DialogTitle></DialogHeader>
          <form onSubmit={handleEditWarehouse} className="space-y-4">
            <div className="space-y-2">
              <Label>Nazwa</Label>
              <Input required value={whEditForm.name} onChange={e => setWhEditForm({ ...whEditForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Adres</Label>
              <Input value={whEditForm.address} onChange={e => setWhEditForm({ ...whEditForm, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="wh_active" value="true"
                    checked={whEditForm.is_active}
                    onChange={() => setWhEditForm({ ...whEditForm, is_active: true })}
                  />
                  Aktywny
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="wh_active" value="false"
                    checked={!whEditForm.is_active}
                    onChange={() => setWhEditForm({ ...whEditForm, is_active: false })}
                  />
                  Nieaktywny
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setWarehouseEditDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                {saving ? 'Zapisywanie...' : 'Zapisz'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== DIALOG: ADD EQUIPMENT ========== */}
      <Dialog open={equipmentDialogOpen} onOpenChange={setEquipmentDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nowy sprzet</DialogTitle></DialogHeader>
          <form onSubmit={handleAddEquipment} className="space-y-4">
            <div className="space-y-2">
              <Label>Numer seryjny</Label>
              <Input required value={eqForm.serial_number} onChange={e => setEqForm({ ...eqForm, serial_number: e.target.value })} placeholder="SN-001" />
            </div>
            <div className="space-y-2">
              <Label>Typ sprzetu</Label>
              <Select value={eqForm.type_id} onValueChange={v => setEqForm({ ...eqForm, type_id: v ?? '' })}>
                <SelectTrigger><SelectValue placeholder="Wybierz typ" /></SelectTrigger>
                <SelectContent>
                  {equipmentTypes.map(et => (
                    <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lokalizacja</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="eq_location" value="warehouse"
                    checked={eqForm.location_type === 'warehouse'}
                    onChange={() => setEqForm({ ...eqForm, location_type: 'warehouse', employee_id: '' })}
                  />
                  Magazyn
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="eq_location" value="employee"
                    checked={eqForm.location_type === 'employee'}
                    onChange={() => setEqForm({ ...eqForm, location_type: 'employee', warehouse_id: '' })}
                  />
                  Pracownik
                </label>
              </div>
              {eqForm.location_type === 'warehouse' ? (
                <Select value={eqForm.warehouse_id} onValueChange={v => setEqForm({ ...eqForm, warehouse_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Wybierz magazyn" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={eqForm.employee_id} onValueChange={v => setEqForm({ ...eqForm, employee_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Wybierz pracownika" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label>Notatki</Label>
              <Input value={eqForm.notes} onChange={e => setEqForm({ ...eqForm, notes: e.target.value })} placeholder="Dodatkowe informacje..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setEquipmentDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving || !eqForm.type_id} className="bg-blue-600 hover:bg-blue-700">
                {saving ? 'Zapisywanie...' : 'Dodaj'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== DIALOG: TRANSFER EQUIPMENT ========== */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Przenies sprzet</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nowa lokalizacja</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="transfer_location" value="warehouse"
                    checked={transferForm.location_type === 'warehouse'}
                    onChange={() => setTransferForm({ ...transferForm, location_type: 'warehouse', employee_id: '' })}
                  />
                  Magazyn
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="transfer_location" value="employee"
                    checked={transferForm.location_type === 'employee'}
                    onChange={() => setTransferForm({ ...transferForm, location_type: 'employee', warehouse_id: '' })}
                  />
                  Pracownik
                </label>
              </div>
              {transferForm.location_type === 'warehouse' ? (
                <Select value={transferForm.warehouse_id} onValueChange={v => setTransferForm({ ...transferForm, warehouse_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Wybierz magazyn" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={transferForm.employee_id} onValueChange={v => setTransferForm({ ...transferForm, employee_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Wybierz pracownika" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>Anuluj</Button>
              <Button
                disabled={saving || (!transferForm.warehouse_id && !transferForm.employee_id)}
                className="bg-blue-600 hover:bg-blue-700"
                onClick={handleTransferEquipment}
              >
                {saving ? 'Przenoszenie...' : 'Przenies'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========== DIALOG: RECEIVE MATERIAL ========== */}
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Przyjmij material</DialogTitle></DialogHeader>
          <form onSubmit={handleReceiveMaterial} className="space-y-4">
            <div className="space-y-2">
              <Label>Typ materialu</Label>
              <Select value={receiveForm.material_type_id} onValueChange={v => setReceiveForm({ ...receiveForm, material_type_id: v ?? '' })}>
                <SelectTrigger><SelectValue placeholder="Wybierz material" /></SelectTrigger>
                <SelectContent>
                  {materialTypes.map(mt => (
                    <SelectItem key={mt.id} value={mt.id}>{mt.name} ({mt.unit})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lokalizacja</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="receive_location" value="warehouse"
                    checked={receiveForm.location_type === 'warehouse'}
                    onChange={() => setReceiveForm({ ...receiveForm, location_type: 'warehouse', employee_id: '' })}
                  />
                  Magazyn
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="receive_location" value="employee"
                    checked={receiveForm.location_type === 'employee'}
                    onChange={() => setReceiveForm({ ...receiveForm, location_type: 'employee', warehouse_id: '' })}
                  />
                  Pracownik
                </label>
              </div>
              {receiveForm.location_type === 'warehouse' ? (
                <Select value={receiveForm.warehouse_id} onValueChange={v => setReceiveForm({ ...receiveForm, warehouse_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Wybierz magazyn" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={receiveForm.employee_id} onValueChange={v => setReceiveForm({ ...receiveForm, employee_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Wybierz pracownika" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label>Ilosc</Label>
              <Input type="number" min="1" required value={receiveForm.quantity} onChange={e => setReceiveForm({ ...receiveForm, quantity: e.target.value })} placeholder="0" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setReceiveDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving || !receiveForm.material_type_id} className="bg-blue-600 hover:bg-blue-700">
                {saving ? 'Zapisywanie...' : 'Przyjmij'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== DIALOG: CONSUME MATERIAL ========== */}
      <Dialog open={consumeDialogOpen} onOpenChange={setConsumeDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Wydaj material</DialogTitle></DialogHeader>
          <form onSubmit={handleConsumeMaterial} className="space-y-4">
            <div className="space-y-2">
              <Label>Typ materialu</Label>
              <Select value={consumeForm.material_type_id} onValueChange={v => setConsumeForm({ ...consumeForm, material_type_id: v ?? '' })}>
                <SelectTrigger><SelectValue placeholder="Wybierz material" /></SelectTrigger>
                <SelectContent>
                  {materialTypes.map(mt => (
                    <SelectItem key={mt.id} value={mt.id}>{mt.name} ({mt.unit})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lokalizacja</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="consume_location" value="warehouse"
                    checked={consumeForm.location_type === 'warehouse'}
                    onChange={() => setConsumeForm({ ...consumeForm, location_type: 'warehouse', employee_id: '' })}
                  />
                  Magazyn
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="consume_location" value="employee"
                    checked={consumeForm.location_type === 'employee'}
                    onChange={() => setConsumeForm({ ...consumeForm, location_type: 'employee', warehouse_id: '' })}
                  />
                  Pracownik
                </label>
              </div>
              {consumeForm.location_type === 'warehouse' ? (
                <Select value={consumeForm.warehouse_id} onValueChange={v => setConsumeForm({ ...consumeForm, warehouse_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Wybierz magazyn" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={consumeForm.employee_id} onValueChange={v => setConsumeForm({ ...consumeForm, employee_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Wybierz pracownika" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label>Ilosc</Label>
              <Input type="number" min="1" required value={consumeForm.quantity} onChange={e => setConsumeForm({ ...consumeForm, quantity: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Zlecenie (opcjonalnie)</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  className="pl-8"
                  placeholder="Szukaj zlecenia..."
                  value={orderSearch}
                  onChange={e => {
                    setOrderSearch(e.target.value);
                    if (consumeForm.order_id) {
                      setConsumeForm({ ...consumeForm, order_id: '' });
                    }
                  }}
                />
              </div>
              {consumeForm.order_id ? (
                <div className="flex items-center gap-2 text-sm bg-blue-50 rounded-lg px-3 py-2">
                  <span className="flex-1 truncate">
                    {recentOrders.find(o => o.id === consumeForm.order_id)?.label || consumeForm.order_id.slice(0, 8) + '...'}
                  </span>
                  <Button
                    type="button" variant="ghost" size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => { setConsumeForm({ ...consumeForm, order_id: '' }); setOrderSearch(''); }}
                  >
                    Usun
                  </Button>
                </div>
              ) : (
                filteredOrders.length > 0 && orderSearch.length > 0 && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto">
                    {filteredOrders.slice(0, 10).map(order => (
                      <button
                        key={order.id}
                        type="button"
                        className="w-full text-left text-sm px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
                        onClick={() => {
                          setConsumeForm({ ...consumeForm, order_id: order.id });
                          setOrderSearch('');
                        }}
                      >
                        {order.label}
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setConsumeDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving || !consumeForm.material_type_id} className="bg-red-600 hover:bg-red-700">
                {saving ? 'Zapisywanie...' : 'Wydaj'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== DIALOG: TRANSFER MATERIAL ========== */}
      <Dialog open={materialTransferDialogOpen} onOpenChange={setMaterialTransferDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Przenies material</DialogTitle></DialogHeader>
          <form onSubmit={handleTransferMaterial} className="space-y-4">
            <div className="space-y-2">
              <Label>Typ materialu</Label>
              <Select
                value={matTransferForm.material_type_id}
                onValueChange={v => setMatTransferForm({ ...matTransferForm, material_type_id: v ?? '' })}
              >
                <SelectTrigger><SelectValue placeholder="Wybierz material" /></SelectTrigger>
                <SelectContent>
                  {materialTypes.map(mt => (
                    <SelectItem key={mt.id} value={mt.id}>{mt.name} ({mt.unit})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Zrodlo</Label>
              <p className="text-sm text-gray-500">
                {matTransferForm.from_warehouse_id
                  ? warehouses.find(w => w.id === matTransferForm.from_warehouse_id)?.name || 'Magazyn'
                  : matTransferForm.from_employee_id
                    ? employees.find(e => e.id === matTransferForm.from_employee_id)?.name || 'Pracownik'
                    : 'Nie wybrano'
                }
              </p>
            </div>

            <div className="space-y-2">
              <Label>Cel</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="mat_transfer_location" value="warehouse"
                    checked={matTransferForm.to_location_type === 'warehouse'}
                    onChange={() => setMatTransferForm({ ...matTransferForm, to_location_type: 'warehouse', to_employee_id: '' })}
                  />
                  Magazyn
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="mat_transfer_location" value="employee"
                    checked={matTransferForm.to_location_type === 'employee'}
                    onChange={() => setMatTransferForm({ ...matTransferForm, to_location_type: 'employee', to_warehouse_id: '' })}
                  />
                  Pracownik
                </label>
              </div>
              {matTransferForm.to_location_type === 'warehouse' ? (
                <Select value={matTransferForm.to_warehouse_id} onValueChange={v => setMatTransferForm({ ...matTransferForm, to_warehouse_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Wybierz magazyn" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={matTransferForm.to_employee_id} onValueChange={v => setMatTransferForm({ ...matTransferForm, to_employee_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Wybierz pracownika" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Ilosc</Label>
              <Input
                type="number" min="1" required
                value={matTransferForm.quantity}
                onChange={e => setMatTransferForm({ ...matTransferForm, quantity: e.target.value })}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label>Notatki (opcjonalnie)</Label>
              <Input
                value={matTransferForm.notes}
                onChange={e => setMatTransferForm({ ...matTransferForm, notes: e.target.value })}
                placeholder="Powod transferu..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setMaterialTransferDialogOpen(false)}>Anuluj</Button>
              <Button
                type="submit"
                disabled={saving || !matTransferForm.material_type_id || (!matTransferForm.to_warehouse_id && !matTransferForm.to_employee_id)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving ? 'Przenoszenie...' : 'Przenies'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========== HELPER COMPONENTS ==========

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
    </div>
  );
}

function EmptyState({ icon: Icon, text, subtext }: { icon: any; text: string; subtext: string }) {
  return (
    <div className="text-center py-20 text-gray-400">
      <Icon className="h-12 w-12 mx-auto mb-3 opacity-40" />
      <p className="font-medium">{text}</p>
      <p className="text-sm mt-1">{subtext}</p>
    </div>
  );
}
