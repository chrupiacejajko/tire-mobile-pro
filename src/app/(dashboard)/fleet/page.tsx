'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Truck, Pencil, Trash2, User, MapPin, X, Wrench } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

interface SkillInfo {
  id: string;
  name: string;
  color: string | null;
}

interface VehicleRow {
  id: string;
  plate_number: string;
  brand: string;
  model: string;
  year: number | null;
  satis_device_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  current_driver?: string | null;
  current_assignment_id?: string | null;
  skills: SkillInfo[];
}

interface EmployeeOption {
  id: string;
  name: string;
}

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [allSkills, setAllSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleRow | null>(null);
  const [assigningVehicle, setAssigningVehicle] = useState<VehicleRow | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingVehicle, setDeletingVehicle] = useState<VehicleRow | null>(null);

  const [form, setForm] = useState({
    plate_number: '', brand: '', model: '', year: '', satis_device_id: '', notes: '', is_active: true,
  });
  const [formSkillIds, setFormSkillIds] = useState<string[]>([]);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch vehicles via API (now includes skills)
    const vehiclesRes = await fetch('/api/vehicles');
    const vehiclesData: Array<{
      id: string; plate_number: string; brand: string; model: string;
      year: number | null; satis_device_id: string | null; notes: string | null;
      is_active: boolean; created_at: string;
      skills: SkillInfo[];
    }> = await vehiclesRes.json();

    // Fetch active assignments
    const { data: assignments } = await supabase
      .from('vehicle_assignments')
      .select('id, vehicle_id, employee:employees(user:profiles(full_name))')
      .eq('is_active', true);

    // Fetch employees for assignment
    const { data: empData } = await supabase
      .from('employees')
      .select('id, user:profiles(full_name)')
      .eq('is_active', true);

    // Fetch active skills
    const skillsRes = await fetch('/api/skills?active=true');
    const skillsData = await skillsRes.json();
    if (Array.isArray(skillsData)) setAllSkills(skillsData);

    if (Array.isArray(vehiclesData)) {
      const enriched: VehicleRow[] = vehiclesData.map(v => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assignment = (assignments || []).find((a: any) => a.vehicle_id === v.id);
        return {
          ...v,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          current_driver: assignment ? (assignment as any).employee?.user?.full_name ?? null : null,
          current_assignment_id: assignment?.id || null,
        };
      });
      setVehicles(enriched);
    }

    if (empData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setEmployees(empData.map((e: any) => ({ id: e.id, name: e.user?.full_name || 'Nieznany' })));
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setForm({ plate_number: '', brand: '', model: '', year: '', satis_device_id: '', notes: '', is_active: true });
    setFormSkillIds([]);
    setEditingVehicle(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      plate_number: form.plate_number,
      brand: form.brand,
      model: form.model,
      year: form.year ? Number(form.year) : null,
      satis_device_id: form.satis_device_id || null,
      notes: form.notes || null,
      is_active: form.is_active,
      skill_ids: formSkillIds,
    };

    if (editingVehicle) {
      await fetch('/api/vehicles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingVehicle.id, ...payload }),
      });
    } else {
      await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    setSaving(false);
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const openDelete = (v: VehicleRow) => {
    setDeletingVehicle(v);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingVehicle) return;
    setSaving(true);
    await supabase.from('vehicles').update({ is_active: false }).eq('id', deletingVehicle.id);
    setSaving(false);
    setDeleteDialogOpen(false);
    setDeletingVehicle(null);
    fetchData();
  };

  const openEdit = (v: VehicleRow) => {
    setForm({
      plate_number: v.plate_number, brand: v.brand, model: v.model,
      year: v.year?.toString() || '', satis_device_id: v.satis_device_id || '', notes: v.notes || '',
      is_active: v.is_active,
    });
    setFormSkillIds(v.skills.map(s => s.id));
    setEditingVehicle(v);
    setDialogOpen(true);
  };

  const assignDriver = async () => {
    if (!assigningVehicle || !selectedEmployee) return;
    setSaving(true);

    await supabase.from('vehicle_assignments')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('vehicle_id', assigningVehicle.id)
      .eq('is_active', true);

    await supabase.from('vehicle_assignments')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('employee_id', selectedEmployee)
      .eq('is_active', true);

    await supabase.from('vehicle_assignments').insert({
      vehicle_id: assigningVehicle.id,
      employee_id: selectedEmployee,
    });

    setSaving(false);
    setAssignDialogOpen(false);
    setSelectedEmployee('');
    setAssigningVehicle(null);
    fetchData();
  };

  const unassignDriver = async (vehicleId: string) => {
    await supabase.from('vehicle_assignments')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('vehicle_id', vehicleId)
      .eq('is_active', true);
    fetchData();
  };

  const toggleSkill = (skillId: string) => {
    setFormSkillIds(prev =>
      prev.includes(skillId) ? prev.filter(id => id !== skillId) : [...prev, skillId]
    );
  };

  const activeCount = vehicles.filter(v => v.is_active).length;
  const assignedCount = vehicles.filter(v => v.current_driver).length;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Flota"
        subtitle="Zarządzaj pojazdami i przypisaniami"
        icon={<Truck className="h-5 w-5" />}
        actions={
          <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Dodaj pojazd
          </Button>
        }
      />
      <div className="p-6 space-y-6">
        {/* Stats */}
        <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-3" variants={ANIM.container} initial="hidden" animate="show">
          {[
            { label: 'Pojazdy', value: vehicles.length, color: 'from-blue-500 to-blue-600' },
            { label: 'W użyciu', value: assignedCount, color: 'from-emerald-500 to-emerald-600' },
            { label: 'Wolne', value: activeCount - assignedCount, color: 'from-amber-500 to-amber-600' },
          ].map(s => (
            <motion.div key={s.label} variants={ANIM.item}
              className={`rounded-2xl bg-gradient-to-br ${s.color} p-4 text-white shadow-lg`}>
              <p className="text-sm text-white/80">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Vehicle cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : vehicles.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Truck className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Brak pojazdów</p>
            <p className="text-sm mt-1">Dodaj swoje busy do floty</p>
          </div>
        ) : (
          <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" variants={ANIM.container} initial="hidden" animate="show">
            {vehicles.map(vehicle => (
              <motion.div key={vehicle.id} variants={ANIM.item} whileHover={{ y: -2 }}>
                <Card className={`rounded-2xl border-gray-100 shadow-sm ${!vehicle.is_active ? 'opacity-50' : ''}`}>
                  <CardContent className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                          <Truck className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-base font-bold text-gray-900">{vehicle.plate_number}</p>
                          <p className="text-sm text-gray-500">{vehicle.brand} {vehicle.model} {vehicle.year || ''}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-orange-500 hover:text-orange-600 hover:bg-orange-50" onClick={() => openEdit(vehicle)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => openDelete(vehicle)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Satis GPS ID */}
                    {vehicle.satis_device_id && (
                      <div className="flex items-center gap-2 mb-3 text-xs text-gray-400">
                        <MapPin className="h-3 w-3" />
                        Satis GPS: {vehicle.satis_device_id}
                      </div>
                    )}

                    {/* Skills / Umiejętności */}
                    {vehicle.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {vehicle.skills.map(skill => (
                          <Badge
                            key={skill.id}
                            className="text-[10px] rounded-md px-1.5 py-0.5"
                            style={{
                              backgroundColor: skill.color ? `${skill.color}20` : '#e0e7ff',
                              color: skill.color || '#4338ca',
                              borderColor: skill.color ? `${skill.color}40` : '#c7d2fe',
                            }}
                          >
                            <Wrench className="h-2.5 w-2.5 mr-0.5" />
                            {skill.name}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Current driver */}
                    <div className="rounded-xl bg-gray-50 p-3 mb-3">
                      {vehicle.current_driver ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                              <User className="h-4 w-4 text-emerald-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{vehicle.current_driver}</p>
                              <p className="text-[11px] text-gray-400">Aktualny kierowca</p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" className="h-7 rounded-lg text-xs"
                              onClick={() => { setAssigningVehicle(vehicle); setAssignDialogOpen(true); }}>
                              Zmień
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-red-400"
                              onClick={() => unassignDriver(vehicle.id)} title="Odepnij kierowcę">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-gray-400">Brak kierowcy</p>
                          <Button variant="outline" size="sm" className="h-7 rounded-lg text-xs"
                            onClick={() => { setAssigningVehicle(vehicle); setAssignDialogOpen(true); }}>
                            <User className="h-3 w-3 mr-1" /> Przypisz
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Status */}
                    <Badge variant={vehicle.is_active ? 'default' : 'secondary'} className="text-[10px] rounded-lg">
                      {vehicle.is_active ? 'Aktywny' : 'Nieaktywny'}
                    </Badge>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Add/Edit Vehicle Dialog */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingVehicle ? 'Edytuj pojazd' : 'Nowy pojazd'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nr rejestracyjny</Label><Input required value={form.plate_number} onChange={e => setForm({ ...form, plate_number: e.target.value })} placeholder="WA 12345" /></div>
              <div className="space-y-2"><Label>Rok produkcji</Label><Input type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} placeholder="2021" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Marka</Label><Input required value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="VW" /></div>
              <div className="space-y-2"><Label>Model</Label><Input required value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="Transporter" /></div>
            </div>
            <div className="space-y-2"><Label>ID urządzenia Satis GPS</Label><Input value={form.satis_device_id} onChange={e => setForm({ ...form, satis_device_id: e.target.value })} placeholder="np. SATIS-001 lub IMEI urządzenia" /></div>
            <div className="space-y-2"><Label>Notatki</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Dodatkowe info..." /></div>

            {/* Skills multi-select */}
            {allSkills.length > 0 && (
              <div className="space-y-2">
                <Label>Umiejętności pojazdu</Label>
                <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {allSkills.map(skill => (
                    <label key={skill.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                      <Checkbox
                        checked={formSkillIds.includes(skill.id)}
                        onCheckedChange={() => toggleSkill(skill.id)}
                      />
                      <span className="text-sm flex items-center gap-1.5">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: skill.color || '#6366f1' }}
                        />
                        {skill.name}
                      </span>
                    </label>
                  ))}
                </div>
                {formSkillIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {formSkillIds.map(sid => {
                      const sk = allSkills.find(s => s.id === sid);
                      return sk ? (
                        <Badge
                          key={sid}
                          className="text-[10px] rounded-md cursor-pointer"
                          style={{
                            backgroundColor: sk.color ? `${sk.color}20` : '#e0e7ff',
                            color: sk.color || '#4338ca',
                          }}
                          onClick={() => toggleSkill(sid)}
                        >
                          {sk.name} <X className="h-2.5 w-2.5 ml-0.5" />
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            )}

            {editingVehicle && (
              <div className="flex items-center gap-3">
                <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: !!v })} />
                <Label>{form.is_active ? 'Aktywny' : 'Nieaktywny'}</Label>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving} className={editingVehicle ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}>
                {saving ? 'Zapisywanie...' : 'Zapisz'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Driver Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={o => { setAssignDialogOpen(o); if (!o) { setAssigningVehicle(null); setSelectedEmployee(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Przypisz kierowcę do {assigningVehicle?.plate_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Wybierz pracownika</Label>
              <Select value={selectedEmployee} onValueChange={v => setSelectedEmployee(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Wybierz kierowcę" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Anuluj</Button>
              <Button disabled={!selectedEmployee || saving} className="bg-emerald-600 hover:bg-emerald-700" onClick={assignDriver}>
                {saving ? 'Przypisuję...' : 'Przypisz'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={o => { setDeleteDialogOpen(o); if (!o) setDeletingVehicle(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dezaktywuj pojazd</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">
            Czy na pewno chcesz dezaktywować pojazd <strong>{deletingVehicle?.plate_number}</strong> ({deletingVehicle?.brand} {deletingVehicle?.model})? Pojazd zostanie oznaczony jako nieaktywny.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
            <Button className="bg-red-500 hover:bg-red-600" onClick={handleDelete} disabled={saving}>
              {saving ? 'Dezaktywuję...' : 'Dezaktywuj'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
