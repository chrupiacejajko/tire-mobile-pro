'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Plus, Search, Pencil, UserCog, Trash2, Award, Mail, RotateCcw, Link, MapPin, Eye, EyeOff,
} from 'lucide-react';
import type { Region, Skill } from '@/lib/types';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

const TYPE_LABELS: Record<string, string> = {
  vacation: 'Urlop',
  sick_leave: 'Zwolnienie lekarskie',
  training: 'Szkolenie',
  personal: 'Osobiste',
  other: 'Inne',
};

const TYPE_COLORS: Record<string, string> = {
  vacation: 'bg-blue-100 text-blue-700',
  sick_leave: 'bg-red-100 text-red-700',
  training: 'bg-purple-100 text-purple-700',
  personal: 'bg-amber-100 text-amber-700',
  other: 'bg-gray-100 text-gray-700',
};

/** Sanitize Polish name for fake email — remove diacritics, lowercase, dots for spaces */
function sanitizeForEmail(name: string): string {
  const map: Record<string, string> = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
    'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'a', 'Ć': 'c', 'Ę': 'e', 'Ł': 'l', 'Ń': 'n',
    'Ó': 'o', 'Ś': 's', 'Ź': 'z', 'Ż': 'z',
  };
  return name.split('').map(ch => map[ch] || ch).join('')
    .toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
}

function generateWorkerEmail(firstName: string, lastName: string): string {
  const f = sanitizeForEmail(firstName || 'pracownik');
  const l = sanitizeForEmail(lastName || 'nowy');
  return `${f}.${l}@routetire.pl`;
}

interface UnavailabilityRow {
  id: string;
  employee_id: string;
  type: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  is_recurring: boolean;
  recurrence_day: number | null;
  notes: string | null;
  created_at: string;
  employee?: { id: string; user: { full_name: string } | null } | null;
}

/* -- HERE autocomplete suggestion -- */
interface HereSuggestion {
  id: string;
  title: string;
  address?: { label?: string };
}

interface VehicleOption {
  id: string;
  plate_number: string;
  brand: string | null;
  model: string | null;
}

interface EmployeeRow {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  region_id: string | null;
  default_vehicle_id: string | null;
  skills: string[];
  hourly_rate: number;
  shift_rate: number | null;
  phone_secondary: string | null;
  default_location: string | null;
  default_lat: number | null;
  default_lng: number | null;
  vehicle_info: string | null;
  is_active: boolean;
  working_hours: Record<string, { start: string; end: string } | null>;
  created_at: string;
  user?: { full_name: string; email: string; phone: string | null; role?: string };
  region?: { name: string; color: string } | null;
  default_vehicle?: { id: string; plate_number: string; brand: string | null; model: string | null } | null;
  employee_skills?: { skill_id: string; skill: { id: string; name: string; is_active: boolean } }[];
  account_status?: 'invited' | 'active' | 'blocked' | null;
}

interface EmployeeForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  phone_secondary: string;
  default_location: string;
  default_lat: number | null;
  default_lng: number | null;
  region_id: string;
  default_vehicle_id: string;
  shift_rate: string;
  role: string;
  skill_ids: string[];
}

const emptyForm: EmployeeForm = {
  first_name: '', last_name: '', email: '', phone: '', phone_secondary: '',
  default_location: '', default_lat: null, default_lng: null,
  region_id: '', default_vehicle_id: '', shift_rate: '',
  role: 'worker', skill_ids: [],
};

const SKILL_BADGE_COLORS = [
  'bg-orange-100 text-orange-700',
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
];

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Add dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EmployeeForm>({ ...emptyForm });

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRow | null>(null);
  const [editForm, setEditForm] = useState<EmployeeForm>({ ...emptyForm });
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingEmployee, setDeletingEmployee] = useState<EmployeeRow | null>(null);

  // Unavailability state
  const [unavailabilities, setUnavailabilities] = useState<UnavailabilityRow[]>([]);
  const [unavailLoading, setUnavailLoading] = useState(false);
  const [unavailDialogOpen, setUnavailDialogOpen] = useState(false);
  const [unavailSaving, setUnavailSaving] = useState(false);
  const [unavailFilterEmployee, setUnavailFilterEmployee] = useState('');
  const [unavailFilterType, setUnavailFilterType] = useState('');
  const [unavailForm, setUnavailForm] = useState({
    employee_id: '', type: 'vacation', start_date: '', end_date: '',
    start_time: '', end_time: '', notes: '',
  });

  // Address autocomplete state
  const [addressSuggestions, setAddressSuggestions] = useState<HereSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const addressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addressDetails, setAddressDetails] = useState<{ street: string; postal: string; city: string } | null>(null);

  const handleAddressChange = (value: string, setFormData: React.Dispatch<React.SetStateAction<EmployeeForm>>) => {
    setFormData(f => ({ ...f, default_location: value, default_lat: null, default_lng: null }));
    setAddressDetails(null);
    if (addressTimeoutRef.current) clearTimeout(addressTimeoutRef.current);
    if (value.length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }
    addressTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/here-autocomplete?q=${encodeURIComponent(value)}`);
        if (res.ok) {
          const data = await res.json();
          setAddressSuggestions(data.items || []);
          setShowAddressSuggestions(true);
        }
      } catch {
        setAddressSuggestions([]);
      }
    }, 300);
  };

  const selectAddressSuggestion = async (suggestion: HereSuggestion, setFormData: React.Dispatch<React.SetStateAction<EmployeeForm>>) => {
    setFormData(f => ({ ...f, default_location: suggestion.address?.label || suggestion.title }));
    setShowAddressSuggestions(false);
    setAddressSuggestions([]);
    try {
      const res = await fetch(`/api/here-lookup?id=${encodeURIComponent(suggestion.id)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.lat && data.lng) {
          setFormData(f => ({ ...f, default_lat: data.lat, default_lng: data.lng }));
        }
        setAddressDetails({
          street: data.street || '',
          postal: data.postalCode || '',
          city: data.city || '',
        });
      }
    } catch {
      // ignore
    }
  };

  // Invite state
  const [inviteToast, setInviteToast] = useState<{ message: string; url?: string } | null>(null);

  const handleInvite = async (employeeId: string, action: 'create' | 'resend') => {
    const res = await fetch('/api/admin/workers/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employeeId, action }),
    });
    const data = await res.json();
    if (res.ok && data.invite_url) {
      await navigator.clipboard.writeText(data.invite_url).catch(() => {});
      setInviteToast({ message: 'Link zaproszenia skopiowany do schowka', url: data.invite_url });
      setTimeout(() => setInviteToast(null), 4000);
    } else {
      setInviteToast({ message: data.error || 'Błąd podczas generowania zaproszenia' });
      setTimeout(() => setInviteToast(null), 4000);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [empRes, regRes, vehRes, skillRes] = await Promise.all([
      fetch('/api/employees'),
      fetch('/api/regions'),
      fetch('/api/vehicles'),
      fetch('/api/skills?active=true'),
    ]);

    if (empRes.ok) {
      const data = await empRes.json();
      setEmployees(data);
    }
    if (regRes.ok) {
      const data = await regRes.json();
      setRegions(data);
    }
    if (vehRes.ok) {
      const data = await vehRes.json();
      // vehicles API might return different shapes; normalize
      setVehicles(Array.isArray(data) ? data : []);
    }
    if (skillRes.ok) {
      const data = await skillRes.json();
      setAllSkills(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, []);

  const fetchUnavailabilities = useCallback(async () => {
    setUnavailLoading(true);
    try {
      const res = await fetch('/api/unavailabilities');
      const data = await res.json();
      setUnavailabilities(data.unavailabilities ?? []);
    } catch {
      console.error('Failed to fetch unavailabilities');
    }
    setUnavailLoading(false);
  }, []);

  useEffect(() => { fetchData(); fetchUnavailabilities(); }, [fetchData, fetchUnavailabilities]);

  // ── Add Employee ───────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // For workers, use auto-generated internal email; otherwise use the provided email
    const effectiveEmail = form.role === 'worker'
      ? generateWorkerEmail(form.first_name, form.last_name)
      : form.email;

    await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: form.first_name,
        last_name: form.last_name,
        email: effectiveEmail,
        phone: form.phone,
        phone_secondary: form.phone_secondary,
        default_location: form.default_location || null,
        default_lat: form.default_lat,
        default_lng: form.default_lng,
        region_id: form.region_id || null,
        default_vehicle_id: form.default_vehicle_id || null,
        shift_rate: form.shift_rate || null,
        role: form.role,
        skill_ids: form.skill_ids,
      }),
    });

    setSaving(false);
    setDialogOpen(false);
    setForm({ ...emptyForm });
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    fetchData();
  };

  // ── Edit Employee ──────────────────────────────────────
  const openEdit = (emp: EmployeeRow) => {
    setAddressDetails(null);
    setEditingEmployee(emp);
    setEditForm({
      first_name: emp.first_name || emp.user?.full_name?.split(' ')[0] || '',
      last_name: emp.last_name || emp.user?.full_name?.split(' ').slice(1).join(' ') || '',
      email: emp.user?.email || '',
      phone: emp.user?.phone || '',
      phone_secondary: emp.phone_secondary || '',
      default_location: emp.default_location || '',
      default_lat: emp.default_lat ?? null,
      default_lng: emp.default_lng ?? null,
      region_id: emp.region_id || '',
      default_vehicle_id: emp.default_vehicle_id || '',
      shift_rate: emp.shift_rate != null ? String(emp.shift_rate) : '',
      role: emp.user?.role || 'worker',
      skill_ids: emp.employee_skills?.map(es => es.skill_id) || [],
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setEditSaving(true);

    await fetch('/api/employees', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingEmployee.id,
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        phone: editForm.phone,
        phone_secondary: editForm.phone_secondary,
        default_location: editForm.default_location || null,
        default_lat: editForm.default_lat,
        default_lng: editForm.default_lng,
        role: editForm.role,
        region_id: editForm.region_id || null,
        default_vehicle_id: editForm.default_vehicle_id || null,
        shift_rate: editForm.shift_rate || null,
        skill_ids: editForm.skill_ids,
      }),
    });

    setEditSaving(false);
    setEditDialogOpen(false);
    setEditingEmployee(null);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    fetchData();
  };

  // ── Delete Employee ────────────────────────────────────
  const openDelete = (emp: EmployeeRow) => {
    setDeletingEmployee(emp);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingEmployee) return;
    setEditSaving(true);

    await fetch('/api/employees', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deletingEmployee.id, is_active: false }),
    });

    setEditSaving(false);
    setDeleteDialogOpen(false);
    setDeletingEmployee(null);
    fetchData();
  };

  // ── Unavailabilities ──────────────────────────────────
  const handleCreateUnavailability = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnavailSaving(true);
    try {
      await fetch('/api/unavailabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...unavailForm,
          start_time: unavailForm.start_time || null,
          end_time: unavailForm.end_time || null,
          is_recurring: false,
        }),
      });
    } catch {
      console.error('Failed to create unavailability');
    }
    setUnavailSaving(false);
    setUnavailDialogOpen(false);
    setUnavailForm({ employee_id: '', type: 'vacation', start_date: '', end_date: '', start_time: '', end_time: '', notes: '' });
    fetchUnavailabilities();
  };

  const handleDeleteUnavailability = async (id: string) => {
    await fetch('/api/unavailabilities', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchUnavailabilities();
  };

  const filteredUnavailabilities = unavailabilities.filter(u => {
    if (unavailFilterEmployee && u.employee_id !== unavailFilterEmployee) return false;
    if (unavailFilterType && u.type !== unavailFilterType) return false;
    return true;
  });

  // ── Filtering ─────────────────────────────────────────
  const filtered = employees.filter(e => {
    if (!showInactive && !e.is_active) return false;
    const name = e.first_name && e.last_name
      ? `${e.first_name} ${e.last_name}`
      : e.user?.full_name || '';
    return name.toLowerCase().includes(search.toLowerCase()) ||
      e.region?.name?.toLowerCase().includes(search.toLowerCase());
  });

  const getDisplayName = (emp: EmployeeRow) => {
    if (emp.first_name && emp.last_name) return `${emp.first_name} ${emp.last_name}`;
    return emp.user?.full_name || '?';
  };

  const getInitials = (emp: EmployeeRow) => {
    const name = getDisplayName(emp);
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  // ── Skill toggle helper ───────────────────────────────
  const toggleSkill = (
    currentIds: string[],
    skillId: string,
    setter: (fn: (prev: EmployeeForm) => EmployeeForm) => void
  ) => {
    setter(prev => ({
      ...prev,
      skill_ids: prev.skill_ids.includes(skillId)
        ? prev.skill_ids.filter(id => id !== skillId)
        : [...prev.skill_ids, skillId],
    }));
  };

  // ── Employee Form Fields (shared between add/edit) ────
  const renderFormFields = (
    formData: EmployeeForm,
    setFormData: React.Dispatch<React.SetStateAction<EmployeeForm>>,
    isEdit: boolean
  ) => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Imię *</Label>
          <Input required value={formData.first_name} onChange={e => setFormData(f => ({ ...f, first_name: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Nazwisko *</Label>
          <Input required value={formData.last_name} onChange={e => setFormData(f => ({ ...f, last_name: e.target.value }))} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Telefon służbowy</Label>
          <Input value={formData.phone} onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Telefon prywatny</Label>
          <Input value={formData.phone_secondary} onChange={e => setFormData(f => ({ ...f, phone_secondary: e.target.value }))} />
        </div>
      </div>

      {/* Default location (home address) with HERE autocomplete */}
      <div className="space-y-2 relative">
        <Label className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-orange-500" />
          Adres domowy (punkt startowy)
        </Label>
        <Input
          value={formData.default_location}
          onChange={e => handleAddressChange(e.target.value, setFormData)}
          onFocus={() => { if (addressSuggestions.length > 0) setShowAddressSuggestions(true); }}
          onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 200)}
          placeholder="Wpisz adres..."
        />
        {showAddressSuggestions && addressSuggestions.length > 0 && (
          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-lg max-h-48 overflow-y-auto">
            {addressSuggestions.map(s => (
              <button
                key={s.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 transition-colors"
                onMouseDown={() => selectAddressSuggestion(s, setFormData)}
              >
                {s.address?.label || s.title}
              </button>
            ))}
          </div>
        )}
        {/* Expanded address details after HERE lookup */}
        {addressDetails && formData.default_lat && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] text-gray-400">Ulica</Label>
                <Input value={addressDetails.street} readOnly tabIndex={-1}
                  className="h-8 text-sm bg-gray-50 text-gray-600 cursor-default border-gray-100" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-gray-400">Kod pocztowy</Label>
                <Input value={addressDetails.postal} readOnly tabIndex={-1}
                  className="h-8 text-sm bg-gray-50 text-gray-600 cursor-default border-gray-100" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-gray-400">Miasto</Label>
                <Input value={addressDetails.city} readOnly tabIndex={-1}
                  className="h-8 text-sm bg-gray-50 text-gray-600 cursor-default border-gray-100" />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              📍 GPS: {formData.default_lat.toFixed(5)}, {formData.default_lng?.toFixed(5)}
            </p>
          </motion.div>
        )}
      </div>

      {!isEdit && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-orange-500" />
            {formData.role === 'worker' ? 'Login' : 'Email *'}
          </Label>
          {formData.role === 'worker' ? (
            <>
              <div className="flex items-center gap-0">
                <Input
                  readOnly
                  value={
                    formData.first_name || formData.last_name
                      ? sanitizeForEmail(formData.first_name) + (formData.first_name && formData.last_name ? '.' : '') + sanitizeForEmail(formData.last_name)
                      : ''
                  }
                  className="bg-gray-50 text-gray-600 cursor-default rounded-r-none border-r-0"
                />
                <span className="inline-flex h-9 items-center px-2 border border-l-0 border-gray-200 rounded-r-md bg-gray-100 text-xs text-gray-400 whitespace-nowrap">
                  @routetire.pl
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Pracownik loguje się tym loginem i hasłem do aplikacji
              </p>
            </>
          ) : (
            <Input type="email" required value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Domyślny obszar</Label>
          <Select value={formData.region_id || '__none__'} onValueChange={v => setFormData(f => ({ ...f, region_id: v === '__none__' ? '' : (v ?? '') }))}>
            <SelectTrigger>
              <span className={formData.region_id ? 'text-gray-900' : 'text-gray-400 text-sm'}>
                {formData.region_id
                  ? (regions.find(r => r.id === formData.region_id)?.name || 'Wybierz region')
                  : 'Wybierz region'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Brak</SelectItem>
              {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Domyślny pojazd</Label>
          <Select value={formData.default_vehicle_id || '__none__'} onValueChange={v => setFormData(f => ({ ...f, default_vehicle_id: v === '__none__' ? '' : (v ?? '') }))}>
            <SelectTrigger>
              <span className={formData.default_vehicle_id ? 'text-gray-900' : 'text-gray-400 text-sm'}>
                {formData.default_vehicle_id
                  ? (() => { const v = vehicles.find(v => v.id === formData.default_vehicle_id); return v ? `${v.plate_number}${v.brand ? ` - ${v.brand}` : ''}${v.model ? ` ${v.model}` : ''}` : 'Wybierz pojazd'; })()
                  : 'Wybierz pojazd'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Brak</SelectItem>
              {vehicles.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  {v.plate_number}{v.brand ? ` - ${v.brand}` : ''}{v.model ? ` ${v.model}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Stawka za dyżur (PLN/24h)</Label>
          <Input type="number" value={formData.shift_rate} onChange={e => setFormData(f => ({ ...f, shift_rate: e.target.value }))} placeholder="0" />
        </div>
        <div className="space-y-2">
          <Label>Rola</Label>
          <Select value={formData.role} onValueChange={v => setFormData(f => ({ ...f, role: v ?? 'worker' }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="dispatcher">Dyspozytor</SelectItem>
              <SelectItem value="worker">Pracownik</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Skills multi-select */}
      {allSkills.length > 0 && (
        <div className="space-y-2">
          <Label>Umiejętności</Label>
          <div className="flex flex-wrap gap-2 p-3 border rounded-xl bg-gray-50/50">
            {allSkills.map(skill => {
              const selected = formData.skill_ids.includes(skill.id);
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => toggleSkill(formData.skill_ids, skill.id, setFormData)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-orange-500 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-600'
                  }`}
                >
                  <Award className="h-3 w-3" />
                  {skill.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

    </>
  );

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Pracownicy"
        subtitle="Zarządzaj zespołem"
        icon={<UserCog className="h-5 w-5" />}
      />
      <div className="p-6 space-y-4">
        {/* Toolbar above table */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Szukaj pracownika..." className="pl-9 h-9 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {/* Pokaż nieaktywnych toggle */}
          <button
            type="button"
            onClick={() => setShowInactive(v => !v)}
            className={`flex items-center gap-2 h-9 px-3 rounded-xl border text-sm font-medium transition-colors ${
              showInactive
                ? 'border-orange-300 bg-orange-50 text-orange-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            {showInactive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            Pokaż nieaktywnych
          </button>
          <div className="flex-1" />
          <Button className="h-9 rounded-xl text-sm gap-2 bg-orange-500 hover:bg-orange-600" onClick={() => { setAddressDetails(null); setForm({ ...emptyForm }); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Dodaj pracownika
          </Button>
        </div>

        {/* Employee list */}
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <UserCog className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Brak pracowników</p>
                <p className="text-sm mt-1">Dodaj pierwszego pracownika lub włącz widok nieaktywnych</p>
              </div>
            ) : (
              <motion.div variants={ANIM.container} initial="hidden" animate="show">
                {/* Header */}
                <div className="grid grid-cols-[minmax(180px,1fr)_120px_130px_minmax(160px,1fr)_90px_90px_90px] gap-3 px-5 py-3 border-b bg-gray-50/50 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  <span>Pracownik</span><span>Telefon</span><span>Obszar</span><span>Umiejętności</span><span>Stawka</span><span>Status</span><span></span>
                </div>
                {filtered.map(emp => (
                  <motion.div
                    key={emp.id}
                    variants={ANIM.item}
                    className={`grid grid-cols-[minmax(180px,1fr)_120px_130px_minmax(160px,1fr)_90px_90px_90px] gap-3 items-center px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${!emp.is_active ? 'opacity-50' : ''}`}
                  >
                    {/* Name + login */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white text-xs font-bold">
                        {getInitials(emp)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{getDisplayName(emp)}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {emp.user?.email?.replace('@routetire.pl', '') || '—'}
                        </p>
                      </div>
                    </div>

                    {/* Phone */}
                    <span className="text-sm text-gray-600 truncate">{emp.user?.phone || '-'}</span>

                    {/* Region */}
                    <div className="flex items-center gap-1.5">
                      {emp.region && <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: emp.region.color }} />}
                      <span className="text-sm text-gray-600 truncate">{emp.region?.name || '-'}</span>
                    </div>

                    {/* Skills */}
                    <div className="flex flex-wrap gap-1">
                      {emp.employee_skills && emp.employee_skills.length > 0 ? (
                        emp.employee_skills.map((es, idx) => (
                          <Badge key={es.skill_id} className={`text-[10px] rounded-lg ${SKILL_BADGE_COLORS[idx % SKILL_BADGE_COLORS.length]}`}>
                            {es.skill?.name || '?'}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </div>

                    {/* Shift rate */}
                    <span className="text-sm font-medium">
                      {emp.shift_rate != null ? `${Number(emp.shift_rate)} zł` : '-'}
                    </span>

                    {/* Status */}
                    <Badge variant={emp.is_active ? 'default' : 'secondary'} className="text-[10px] rounded-lg">
                      {emp.is_active ? 'Aktywny' : 'Nieaktywny'}
                    </Badge>

                    {/* Actions */}
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-orange-500 hover:text-orange-600 hover:bg-orange-50" onClick={() => openEdit(emp)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {emp.account_status === 'invited' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                          title="Ponów zaproszenie"
                          onClick={() => handleInvite(emp.id, 'resend')}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-50"
                          title="Wyślij zaproszenie"
                          onClick={() => handleInvite(emp.id, 'create')}
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => openDelete(emp)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Invite toast ── */}
      {inviteToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white text-sm px-5 py-3 rounded-2xl shadow-2xl">
          <Link className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <span>{inviteToast.message}</span>
          <button
            onClick={() => setInviteToast(null)}
            className="ml-2 text-gray-400 hover:text-white text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Add Unavailability Dialog ── */}
      <Dialog open={unavailDialogOpen} onOpenChange={setUnavailDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nowa niedostępność</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateUnavailability} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pracownik</Label>
                <Select value={unavailForm.employee_id} onValueChange={v => setUnavailForm({ ...unavailForm, employee_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Wybierz pracownika" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{getDisplayName(emp)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Typ</Label>
                <Select value={unavailForm.type} onValueChange={v => setUnavailForm({ ...unavailForm, type: v ?? 'vacation' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Data od</Label><Input type="date" required value={unavailForm.start_date} onChange={e => setUnavailForm({ ...unavailForm, start_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>Data do</Label><Input type="date" required value={unavailForm.end_date} onChange={e => setUnavailForm({ ...unavailForm, end_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Godzina od (opcjonalnie)</Label><Input type="time" value={unavailForm.start_time} onChange={e => setUnavailForm({ ...unavailForm, start_time: e.target.value })} /></div>
              <div className="space-y-2"><Label>Godzina do (opcjonalnie)</Label><Input type="time" value={unavailForm.end_time} onChange={e => setUnavailForm({ ...unavailForm, end_time: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Notatki</Label><Input value={unavailForm.notes} onChange={e => setUnavailForm({ ...unavailForm, notes: e.target.value })} placeholder="Opcjonalne notatki..." /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setUnavailDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={unavailSaving || !unavailForm.employee_id} className="bg-orange-500 hover:bg-orange-600">
                {unavailSaving ? 'Zapisywanie...' : 'Dodaj'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add Employee Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nowy pracownik</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {renderFormFields(form, setForm, false)}
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600">
                {saving ? 'Tworzenie...' : 'Dodaj pracownika'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Employee Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={o => { setEditDialogOpen(o); if (!o) setEditingEmployee(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edytuj pracownika</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            {renderFormFields(editForm, setEditForm, true)}
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setEditDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={editSaving} className="bg-orange-500 hover:bg-orange-600">
                {editSaving ? 'Zapisywanie...' : 'Zapisz zmiany'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={o => { setDeleteDialogOpen(o); if (!o) setDeletingEmployee(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dezaktywuj pracownika</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">
            Czy na pewno chcesz dezaktywować pracownika <strong>{deletingEmployee ? getDisplayName(deletingEmployee) : ''}</strong>? Pracownik zostanie oznaczony jako nieaktywny.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
            <Button className="bg-red-500 hover:bg-red-600" onClick={handleDelete} disabled={editSaving}>
              {editSaving ? 'Dezaktywuję...' : 'Dezaktywuj'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
