'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
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
import {
  Plus, Wrench, Pencil, Trash2, Clock, DollarSign,
  Award, Car, ListChecks, Settings2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Service, ServiceType, VehicleType, Skill } from '@/lib/types';

// ─── Animation presets ────────────────────────────────────────────────────────
const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

// ─── Constants ────────────────────────────────────────────────────────────────
const categories = [
  { value: 'wymiana', label: 'Wymiana opon', color: 'bg-blue-100 text-blue-700' },
  { value: 'serwis', label: 'Serwis', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'naprawa', label: 'Naprawa', color: 'bg-amber-100 text-amber-700' },
  { value: 'przechowywanie', label: 'Przechowywanie', color: 'bg-violet-100 text-violet-700' },
  { value: 'pakiet', label: 'Pakiet', color: 'bg-rose-100 text-rose-700' },
  { value: 'dojazd', label: 'Dojazd', color: 'bg-gray-100 text-gray-700' },
];

type TabKey = 'uslugi' | 'rodzaje-uslug' | 'rodzaje-pojazdow' | 'umiejetnosci';

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'uslugi', label: 'Usługi', icon: <Wrench className="h-3.5 w-3.5" /> },
  { key: 'rodzaje-uslug', label: 'Rodzaje usług', icon: <ListChecks className="h-3.5 w-3.5" /> },
  { key: 'rodzaje-pojazdow', label: 'Rodzaje pojazdów', icon: <Car className="h-3.5 w-3.5" /> },
  { key: 'umiejetnosci', label: 'Umiejętności', icon: <Award className="h-3.5 w-3.5" /> },
];

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ color = 'border-blue-500' }: { color?: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className={`h-8 w-8 animate-spin rounded-full border-4 ${color} border-t-transparent`} />
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function Empty({ icon, text, sub }: { icon: React.ReactNode; text: string; sub: string }) {
  return (
    <div className="text-center py-20 text-gray-400">
      <div className="mx-auto mb-3 opacity-40 flex justify-center">{icon}</div>
      <p className="font-medium">{text}</p>
      <p className="text-sm mt-1">{sub}</p>
    </div>
  );
}

// ─── SimpleList row for ServiceTypes and VehicleTypes ────────────────────────
function SimpleListRow({
  name,
  isActive,
  onToggle,
  onEdit,
  onDelete,
}: {
  name: string;
  isActive: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      variants={ANIM.item}
      className="grid grid-cols-[1fr_100px_100px] gap-4 items-center px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
    >
      <span className="text-sm font-medium text-gray-900">{name}</span>
      <div>
        <Switch checked={isActive} onCheckedChange={onToggle} />
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-orange-500 hover:text-orange-600 hover:bg-orange-50" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ServicesPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabKey>('uslugi');

  // ── Reference data ──
  const [skills, setSkills] = useState<Skill[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);

  // ── Services ──
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceForm, setServiceForm] = useState({
    name: '', description: '', duration_minutes: '60', price: '0',
    category: 'wymiana', is_active: true,
    vehicle_type_id: '', required_skill_id: '',
  });
  const [serviceSaving, setServiceSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingService, setDeletingService] = useState<Service | null>(null);

  // ── Service types ──
  const [stLoading, setStLoading] = useState(true);
  const [stDialogOpen, setStDialogOpen] = useState(false);
  const [editingSt, setEditingSt] = useState<ServiceType | null>(null);
  const [stForm, setStForm] = useState({ name: '' });
  const [stSaving, setStSaving] = useState(false);

  // ── Vehicle types ──
  const [vtLoading, setVtLoading] = useState(true);
  const [vtDialogOpen, setVtDialogOpen] = useState(false);
  const [editingVt, setEditingVt] = useState<VehicleType | null>(null);
  const [vtForm, setVtForm] = useState({ name: '' });
  const [vtSaving, setVtSaving] = useState(false);

  // ── Skills (Umiejętności tab) ──
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [skillForm, setSkillForm] = useState({ name: '', description: '' });
  const [skillSaving, setSkillSaving] = useState(false);
  const [showActiveSkillsOnly, setShowActiveSkillsOnly] = useState(false);

  // ─── Fetch functions ──────────────────────────────────────────────────────

  const fetchServices = useCallback(async () => {
    setServicesLoading(true);
    const { data } = await supabase.from('services').select('*').order('category, name');
    if (data) setServices(data as Service[]);
    setServicesLoading(false);
  }, []);

  const fetchSkillsRef = useCallback(async () => {
    const res = await fetch('/api/skills');
    if (res.ok) setSkills(await res.json());
  }, []);

  const fetchServiceTypes = useCallback(async () => {
    setStLoading(true);
    try {
      const { data } = await supabase.from('service_types').select('*').order('name');
      if (data) setServiceTypes(data as ServiceType[]);
    } catch {
      // table may not exist yet
    }
    setStLoading(false);
  }, []);

  const fetchVehicleTypes = useCallback(async () => {
    setVtLoading(true);
    try {
      const { data } = await supabase.from('vehicle_types').select('*').order('name');
      if (data) setVehicleTypes(data as VehicleType[]);
    } catch {
      // table may not exist yet
    }
    setVtLoading(false);
  }, []);

  const fetchSkillsTab = useCallback(async () => {
    setSkillsLoading(true);
    const url = showActiveSkillsOnly ? '/api/skills?active=true' : '/api/skills';
    const res = await fetch(url);
    if (res.ok) setSkills(await res.json());
    setSkillsLoading(false);
  }, [showActiveSkillsOnly]);

  // On mount: fetch everything
  useEffect(() => {
    fetchServices();
    fetchSkillsRef();
    fetchServiceTypes();
    fetchVehicleTypes();
  }, [fetchServices, fetchSkillsRef, fetchServiceTypes, fetchVehicleTypes]);

  // Refetch skills when filter or tab changes
  useEffect(() => {
    if (activeTab === 'umiejetnosci') fetchSkillsTab();
  }, [activeTab, fetchSkillsTab]);

  // ─── Services tab handlers ────────────────────────────────────────────────

  const resetServiceForm = () => {
    setServiceForm({ name: '', description: '', duration_minutes: '60', price: '0', category: 'wymiana', is_active: true, vehicle_type_id: '', required_skill_id: '' });
    setEditingService(null);
  };

  const openEditService = (s: Service) => {
    setServiceForm({
      name: s.name,
      description: s.description || '',
      duration_minutes: s.duration_minutes.toString(),
      price: Number(s.price).toString(),
      category: s.category,
      is_active: s.is_active,
      vehicle_type_id: s.vehicle_type_id || '',
      required_skill_id: s.required_skill_id || '',
    });
    setEditingService(s);
    setServiceDialogOpen(true);
  };

  const handleServiceSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setServiceSaving(true);
    const payload = {
      name: serviceForm.name,
      description: serviceForm.description || null,
      duration_minutes: Number(serviceForm.duration_minutes),
      price: Number(serviceForm.price),
      category: serviceForm.category,
      is_active: serviceForm.is_active,
      vehicle_type_id: serviceForm.vehicle_type_id || null,
      required_skill_id: serviceForm.required_skill_id || null,
    };
    if (editingService) {
      await supabase.from('services').update(payload).eq('id', editingService.id);
    } else {
      await supabase.from('services').insert(payload);
    }
    setServiceSaving(false);
    setServiceDialogOpen(false);
    resetServiceForm();
    fetchServices();
  };

  const openDeleteService = (s: Service) => { setDeletingService(s); setDeleteDialogOpen(true); };

  const handleDeleteService = async () => {
    if (!deletingService) return;
    setServiceSaving(true);
    await supabase.from('services').update({ is_active: false }).eq('id', deletingService.id);
    setServiceSaving(false);
    setDeleteDialogOpen(false);
    setDeletingService(null);
    fetchServices();
  };

  const toggleServiceActive = async (id: string, isActive: boolean) => {
    await supabase.from('services').update({ is_active: !isActive }).eq('id', id);
    fetchServices();
  };

  const getCategoryStyle = (cat: string) => categories.find(c => c.value === cat) || categories[0];

  // ─── Service types handlers ───────────────────────────────────────────────

  const handleStSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStSaving(true);
    if (editingSt) {
      await supabase.from('service_types').update({ name: stForm.name }).eq('id', editingSt.id);
    } else {
      await supabase.from('service_types').insert({ name: stForm.name, is_active: true });
    }
    setStSaving(false);
    setStDialogOpen(false);
    setEditingSt(null);
    setStForm({ name: '' });
    fetchServiceTypes();
  };

  const toggleStActive = async (st: ServiceType) => {
    await supabase.from('service_types').update({ is_active: !st.is_active }).eq('id', st.id);
    fetchServiceTypes();
  };

  const deleteServiceType = async (id: string) => {
    await supabase.from('service_types').delete().eq('id', id);
    fetchServiceTypes();
  };

  // ─── Vehicle types handlers ───────────────────────────────────────────────

  const handleVtSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setVtSaving(true);
    if (editingVt) {
      await supabase.from('vehicle_types').update({ name: vtForm.name }).eq('id', editingVt.id);
    } else {
      await supabase.from('vehicle_types').insert({ name: vtForm.name, is_active: true });
    }
    setVtSaving(false);
    setVtDialogOpen(false);
    setEditingVt(null);
    setVtForm({ name: '' });
    fetchVehicleTypes();
  };

  const toggleVtActive = async (vt: VehicleType) => {
    await supabase.from('vehicle_types').update({ is_active: !vt.is_active }).eq('id', vt.id);
    fetchVehicleTypes();
  };

  const deleteVehicleType = async (id: string) => {
    await supabase.from('vehicle_types').delete().eq('id', id);
    fetchVehicleTypes();
  };

  // ─── Skills tab handlers ──────────────────────────────────────────────────

  const handleSkillSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSkillSaving(true);
    if (editingSkill) {
      await fetch('/api/skills', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingSkill.id, name: skillForm.name, description: skillForm.description || null }),
      });
    } else {
      await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: skillForm.name, description: skillForm.description || null }),
      });
    }
    setSkillSaving(false);
    setSkillDialogOpen(false);
    setEditingSkill(null);
    setSkillForm({ name: '', description: '' });
    fetchSkillsTab();
    fetchSkillsRef(); // keep reference data fresh
  };

  const handleSkillDelete = async (id: string) => {
    await fetch(`/api/skills?id=${id}`, { method: 'DELETE' });
    fetchSkillsTab();
    fetchSkillsRef();
  };

  const handleToggleSkillActive = async (skill: Skill) => {
    await fetch('/api/skills', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: skill.id, is_active: !skill.is_active }),
    });
    fetchSkillsTab();
    fetchSkillsRef();
  };

  // ─── Topbar action per tab ────────────────────────────────────────────────

  const topbarAction = (() => {
    switch (activeTab) {
      case 'uslugi':
        return (
          <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={() => { resetServiceForm(); setServiceDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Dodaj usługę
          </Button>
        );
      case 'rodzaje-uslug':
        return (
          <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={() => { setEditingSt(null); setStForm({ name: '' }); setStDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Dodaj rodzaj
          </Button>
        );
      case 'rodzaje-pojazdow':
        return (
          <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={() => { setEditingVt(null); setVtForm({ name: '' }); setVtDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Dodaj rodzaj
          </Button>
        );
      case 'umiejetnosci':
        return (
          <Button className="h-9 rounded-xl text-sm gap-2 bg-orange-500 hover:bg-orange-600"
            onClick={() => { setEditingSkill(null); setSkillForm({ name: '', description: '' }); setSkillDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Dodaj umiejętność
          </Button>
        );
    }
  })();

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Katalog usług"
        subtitle="Zarządzaj usługami i konfiguracją"
        icon={<Wrench className="h-5 w-5" />}
        actions={topbarAction}
      />

      <div className="p-6 space-y-6">
        {/* Tab bar */}
        <div className="flex border-b border-gray-200">
          {tabs.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors',
                activeTab === key ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600',
              )}
            >
              {icon}
              {label}
              {activeTab === key && (
                <motion.div
                  layoutId="tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full"
                />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ════════════════════════════════════════════
              Tab: Usługi
          ════════════════════════════════════════════ */}
          {activeTab === 'uslugi' && (
            <motion.div key="uslugi" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              {servicesLoading ? (
                <Spinner />
              ) : services.length === 0 ? (
                <Empty icon={<Wrench className="h-12 w-12" />} text="Brak usług" sub="Dodaj pierwszą usługę" />
              ) : (
                <motion.div
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                  variants={ANIM.container} initial="hidden" animate="show"
                >
                  {services.map(service => {
                    const catStyle = getCategoryStyle(service.category);
                    const vehicleType = vehicleTypes.find(v => v.id === service.vehicle_type_id);
                    const requiredSkill = skills.find(s => s.id === service.required_skill_id);
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
                            {(vehicleType || requiredSkill) && (
                              <div className="flex flex-wrap gap-1 mb-3">
                                {vehicleType && (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-sky-100 text-sky-700 text-[10px] font-medium px-2 py-0.5">
                                    <Car className="h-3 w-3" />{vehicleType.name}
                                  </span>
                                )}
                                {requiredSkill && (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-orange-100 text-orange-700 text-[10px] font-medium px-2 py-0.5">
                                    <Award className="h-3 w-3" />{requiredSkill.name}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center justify-between pt-3 border-t">
                              <div className="flex items-center gap-2">
                                <Switch checked={service.is_active} onCheckedChange={() => toggleServiceActive(service.id, service.is_active)} />
                                <span className="text-xs text-gray-500">{service.is_active ? 'Aktywna' : 'Nieaktywna'}</span>
                              </div>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-orange-500 hover:text-orange-600 hover:bg-orange-50" onClick={() => openEditService(service)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => openDeleteService(service)}>
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
            </motion.div>
          )}

          {/* ════════════════════════════════════════════
              Tab: Rodzaje usług
          ════════════════════════════════════════════ */}
          {activeTab === 'rodzaje-uslug' && (
            <motion.div key="rodzaje-uslug" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              <Card className="rounded-2xl border-gray-100 shadow-sm">
                <CardContent className="p-0">
                  {stLoading ? (
                    <Spinner color="border-blue-500" />
                  ) : serviceTypes.length === 0 ? (
                    <Empty icon={<ListChecks className="h-12 w-12" />} text="Brak rodzajów usług" sub="Dodaj pierwszy rodzaj usługi" />
                  ) : (
                    <motion.div variants={ANIM.container} initial="hidden" animate="show">
                      <div className="grid grid-cols-[1fr_100px_100px] gap-4 px-5 py-3 border-b bg-gray-50/50 text-xs font-medium text-gray-400 uppercase tracking-wider">
                        <span>Nazwa</span><span>Aktywny</span><span>Akcje</span>
                      </div>
                      {serviceTypes.map(st => (
                        <SimpleListRow
                          key={st.id}
                          name={st.name}
                          isActive={st.is_active}
                          onToggle={() => toggleStActive(st)}
                          onEdit={() => { setEditingSt(st); setStForm({ name: st.name }); setStDialogOpen(true); }}
                          onDelete={() => deleteServiceType(st.id)}
                        />
                      ))}
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════
              Tab: Rodzaje pojazdów
          ════════════════════════════════════════════ */}
          {activeTab === 'rodzaje-pojazdow' && (
            <motion.div key="rodzaje-pojazdow" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              <Card className="rounded-2xl border-gray-100 shadow-sm">
                <CardContent className="p-0">
                  {vtLoading ? (
                    <Spinner color="border-blue-500" />
                  ) : vehicleTypes.length === 0 ? (
                    <Empty icon={<Car className="h-12 w-12" />} text="Brak rodzajów pojazdów" sub="Dodaj pierwszy rodzaj pojazdu" />
                  ) : (
                    <motion.div variants={ANIM.container} initial="hidden" animate="show">
                      <div className="grid grid-cols-[1fr_100px_100px] gap-4 px-5 py-3 border-b bg-gray-50/50 text-xs font-medium text-gray-400 uppercase tracking-wider">
                        <span>Nazwa</span><span>Aktywny</span><span>Akcje</span>
                      </div>
                      {vehicleTypes.map(vt => (
                        <SimpleListRow
                          key={vt.id}
                          name={vt.name}
                          isActive={vt.is_active}
                          onToggle={() => toggleVtActive(vt)}
                          onEdit={() => { setEditingVt(vt); setVtForm({ name: vt.name }); setVtDialogOpen(true); }}
                          onDelete={() => deleteVehicleType(vt.id)}
                        />
                      ))}
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════
              Tab: Umiejętności
          ════════════════════════════════════════════ */}
          {activeTab === 'umiejetnosci' && (
            <motion.div key="umiejetnosci" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch checked={showActiveSkillsOnly} onCheckedChange={v => setShowActiveSkillsOnly(!!v)} />
                <Label className="text-sm text-gray-600">Pokaż tylko aktywne</Label>
              </div>

              <Card className="rounded-2xl border-gray-100 shadow-sm">
                <CardContent className="p-0">
                  {skillsLoading ? (
                    <Spinner color="border-orange-500" />
                  ) : skills.length === 0 ? (
                    <Empty icon={<Award className="h-12 w-12" />} text="Brak umiejętności" sub="Dodaj pierwszą umiejętność" />
                  ) : (
                    <motion.div variants={ANIM.container} initial="hidden" animate="show">
                      <div className="grid grid-cols-[1fr_1fr_100px_100px] gap-4 px-5 py-3 border-b bg-gray-50/50 text-xs font-medium text-gray-400 uppercase tracking-wider">
                        <span>Nazwa</span><span>Opis</span><span>Aktywna</span><span>Akcje</span>
                      </div>
                      {skills.map(skill => (
                        <motion.div
                          key={skill.id}
                          variants={ANIM.item}
                          className="grid grid-cols-[1fr_1fr_100px_100px] gap-4 items-center px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Award className="h-4 w-4 text-orange-500 shrink-0" />
                            <span className="text-sm font-medium text-gray-900">{skill.name}</span>
                          </div>
                          <span className="text-sm text-gray-600 truncate">{skill.description || '-'}</span>
                          <div>
                            <Switch checked={skill.is_active} onCheckedChange={() => handleToggleSkillActive(skill)} />
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                              onClick={() => { setEditingSkill(skill); setSkillForm({ name: skill.name, description: skill.description || '' }); setSkillDialogOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => handleSkillDelete(skill.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ══════════════════════════════════════════════════════════
          Dialogs
      ══════════════════════════════════════════════════════════ */}

      {/* Add/Edit Service */}
      <Dialog open={serviceDialogOpen} onOpenChange={o => { setServiceDialogOpen(o); if (!o) resetServiceForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingService ? 'Edytuj usługę' : 'Nowa usługa'}</DialogTitle></DialogHeader>
          <form onSubmit={handleServiceSave} className="space-y-4">
            <div className="space-y-2"><Label>Nazwa</Label><Input required value={serviceForm.name} onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Opis</Label><Textarea value={serviceForm.description} onChange={e => setServiceForm({ ...serviceForm, description: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Cena (zł)</Label>
                <Input type="number" step="0.01" value={serviceForm.price} onChange={e => setServiceForm({ ...serviceForm, price: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Czas (min)</Label>
                <Input type="number" value={serviceForm.duration_minutes} onChange={e => setServiceForm({ ...serviceForm, duration_minutes: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Kategoria</Label>
                <Select value={serviceForm.category} onValueChange={v => setServiceForm({ ...serviceForm, category: v ?? 'wymiana' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rodzaj pojazdu</Label>
                <Select value={serviceForm.vehicle_type_id || '__none__'} onValueChange={v => setServiceForm({ ...serviceForm, vehicle_type_id: !v || v === '__none__' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Dowolny" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Dowolny</SelectItem>
                    {vehicleTypes.filter(vt => vt.is_active).map(vt => (
                      <SelectItem key={vt.id} value={vt.id}>{vt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Wymagana umiejętność</Label>
                <Select value={serviceForm.required_skill_id || '__none__'} onValueChange={v => setServiceForm({ ...serviceForm, required_skill_id: !v || v === '__none__' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Brak" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Brak</SelectItem>
                    {skills.filter(s => s.is_active).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editingService && (
              <div className="flex items-center gap-3">
                <Switch checked={serviceForm.is_active} onCheckedChange={v => setServiceForm({ ...serviceForm, is_active: !!v })} />
                <Label>{serviceForm.is_active ? 'Aktywna' : 'Nieaktywna'}</Label>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setServiceDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={serviceSaving} className={editingService ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}>
                {serviceSaving ? 'Zapisywanie...' : 'Zapisz'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Service Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={o => { setDeleteDialogOpen(o); if (!o) setDeletingService(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dezaktywuj usługę</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">
            Czy na pewno chcesz dezaktywować usługę <strong>{deletingService?.name}</strong>? Usługa zostanie oznaczona jako nieaktywna.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
            <Button className="bg-red-500 hover:bg-red-600" onClick={handleDeleteService} disabled={serviceSaving}>
              {serviceSaving ? 'Dezaktywuję...' : 'Dezaktywuj'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Service Type */}
      <Dialog open={stDialogOpen} onOpenChange={o => { setStDialogOpen(o); if (!o) { setEditingSt(null); setStForm({ name: '' }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingSt ? 'Edytuj rodzaj usługi' : 'Nowy rodzaj usługi'}</DialogTitle></DialogHeader>
          <form onSubmit={handleStSave} className="space-y-4">
            <div className="space-y-2"><Label>Nazwa</Label><Input required value={stForm.name} onChange={e => setStForm({ name: e.target.value })} placeholder="np. Wymiana sezonowa" /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setStDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={stSaving} className={editingSt ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}>
                {stSaving ? 'Zapisywanie...' : editingSt ? 'Zapisz zmiany' : 'Dodaj'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Vehicle Type */}
      <Dialog open={vtDialogOpen} onOpenChange={o => { setVtDialogOpen(o); if (!o) { setEditingVt(null); setVtForm({ name: '' }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingVt ? 'Edytuj rodzaj pojazdu' : 'Nowy rodzaj pojazdu'}</DialogTitle></DialogHeader>
          <form onSubmit={handleVtSave} className="space-y-4">
            <div className="space-y-2"><Label>Nazwa</Label><Input required value={vtForm.name} onChange={e => setVtForm({ name: e.target.value })} placeholder="np. Samochód osobowy" /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setVtDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={vtSaving} className={editingVt ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}>
                {vtSaving ? 'Zapisywanie...' : editingVt ? 'Zapisz zmiany' : 'Dodaj'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Skill */}
      <Dialog open={skillDialogOpen} onOpenChange={o => { setSkillDialogOpen(o); if (!o) { setEditingSkill(null); setSkillForm({ name: '', description: '' }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingSkill ? 'Edytuj umiejętność' : 'Nowa umiejętność'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSkillSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Nazwa</Label>
              <Input required value={skillForm.name} onChange={e => setSkillForm({ ...skillForm, name: e.target.value })} placeholder="np. Serwis opon osobowych" />
            </div>
            <div className="space-y-2">
              <Label>Opis</Label>
              <Input value={skillForm.description} onChange={e => setSkillForm({ ...skillForm, description: e.target.value })} placeholder="Opis umiejętności (opcjonalnie)" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setSkillDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={skillSaving} className="bg-orange-500 hover:bg-orange-600">
                {skillSaving ? 'Zapisywanie...' : editingSkill ? 'Zapisz zmiany' : 'Dodaj'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
