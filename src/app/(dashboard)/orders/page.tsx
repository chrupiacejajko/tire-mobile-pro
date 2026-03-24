'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus, Search, Clock, MapPin, ChevronRight, ClipboardList,
  CheckCircle2, Truck, XCircle, ArrowRight, Calendar, User, Phone,
  Play, Square, Timer, Wrench, Navigation, Zap, Star, FileText,
  Camera, PenTool, Save, Check,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { OrderStatus, OrderPriority, Client, Service } from '@/lib/types';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } },
  item: { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

const statusConfig: Record<OrderStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  new: { label: 'Nowe', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: ClipboardList },
  assigned: { label: 'Przydzielone', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: User },
  in_progress: { label: 'W trakcie', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', icon: Truck },
  completed: { label: 'Ukończone', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  cancelled: { label: 'Anulowane', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: XCircle },
};

const priorityConfig: Record<OrderPriority, { label: string; dot: string }> = {
  low: { label: 'Niski', dot: 'bg-gray-400' },
  normal: { label: 'Normalny', dot: 'bg-blue-500' },
  high: { label: 'Wysoki', dot: 'bg-orange-500' },
  urgent: { label: 'Pilny', dot: 'bg-red-500' },
};

interface OrderRow {
  id: string;
  client_id: string;
  employee_id: string | null;
  status: OrderStatus;
  priority: OrderPriority;
  scheduled_date: string;
  scheduled_time_start: string;
  scheduled_time_end: string;
  address: string;
  services: { service_id: string; name: string; price: number; quantity: number }[];
  total_price: number;
  notes: string | null;
  required_skills?: string[] | null;
  created_at: string;
  client?: { name: string; phone: string };
  employee?: { user: { full_name: string } } | null;
}

interface WorkLog {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
}

interface EmployeeSuggestion {
  id: string;
  name: string;
  vehicle_info: string | null;
  order_count: number;
  dist_km: number | null;
  skills_match: boolean;
  nearest_job: { address: string; time: string; client: string | null } | null;
  day_route: { id: string; address: string; time: string; client: string | null }[];
  is_online: boolean;
  gps_status: string | null;
}

// ── Form types for order detail ──────────────────────────────────────────────

interface TemplateField {
  id: string;
  name: string;
  field_type: string;
  is_required: boolean;
  sort_order: number;
  options?: string[] | null;
}

interface FormSubmission {
  id: string;
  order_id: string;
  template_id: string;
  data: Record<string, any>;
  submitted_at: string;
  template: { id: string; name: string; description: string | null };
  template_fields: TemplateField[];
}

interface LinkedTemplate {
  id: string;
  name: string;
  description: string | null;
  fields: TemplateField[];
}

// ── OrderFormsSection ────────────────────────────────────────────────────────

function OrderFormsSection({ order, services }: { order: OrderRow; services: Service[] }) {
  const [templates, setTemplates] = useState<LinkedTemplate[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [formData, setFormData] = useState<Record<string, Record<string, any>>>({});
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFormsData = useCallback(async () => {
    setLoading(true);
    // Get service IDs from order
    const serviceIds = (order.services || []).map(s => s.service_id).filter(Boolean);
    if (serviceIds.length === 0) { setLoading(false); return; }

    // Fetch linked template IDs
    const params = serviceIds.map(id => `service_ids=${id}`).join('&');
    const linkedRes = await fetch(`/api/form-templates/linked-services?${params}`);
    const linkedData = await linkedRes.json();
    const templateIds: string[] = linkedData.template_ids || [];

    if (templateIds.length === 0) { setTemplates([]); setLoading(false); return; }

    // Fetch full templates with fields
    const tplRes = await fetch('/api/form-templates?all=true');
    const tplData = await tplRes.json();
    const allTemplates: LinkedTemplate[] = (tplData.templates || []).filter(
      (t: any) => templateIds.includes(t.id) && t.is_active
    );
    setTemplates(allTemplates);

    // Fetch existing submissions for this order
    const subRes = await fetch(`/api/form-submissions?order_id=${order.id}`);
    const subData = await subRes.json();
    setSubmissions(subData.submissions || []);
    setLoading(false);
  }, [order.id, order.services]);

  useEffect(() => { fetchFormsData(); }, [fetchFormsData]);

  const getSubmission = (templateId: string) =>
    submissions.find(s => s.template_id === templateId);

  const getFormValue = (templateId: string, fieldId: string) =>
    formData[templateId]?.[fieldId];

  const setFormValue = (templateId: string, fieldId: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [templateId]: { ...prev[templateId], [fieldId]: value },
    }));
  };

  const handleSubmitForm = async (templateId: string) => {
    setSavingTemplate(templateId);
    const data = formData[templateId] || {};
    await fetch('/api/form-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: order.id, template_id: templateId, data }),
    });
    await fetchFormsData();
    setSavingTemplate(null);
  };

  if (loading) return null;
  if (templates.length === 0) return null;

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1">
        <FileText className="h-3 w-3" /> Formularze
      </p>
      <div className="space-y-3">
        {templates.map(tpl => {
          const existing = getSubmission(tpl.id);
          if (existing) {
            // Show filled form (readonly)
            return (
              <div key={tpl.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-800">{tpl.name}</p>
                </div>
                <div className="space-y-1.5">
                  {tpl.fields.map(field => {
                    const val = existing.data[field.id];
                    let display = '';
                    if (val === undefined || val === null || val === '') {
                      display = '—';
                    } else if (typeof val === 'boolean') {
                      display = val ? 'Tak' : 'Nie';
                    } else if (Array.isArray(val)) {
                      display = val.join(', ');
                    } else {
                      display = String(val);
                    }
                    return (
                      <div key={field.id} className="flex justify-between text-xs">
                        <span className="text-gray-600">{field.name}</span>
                        <span className="font-medium text-gray-800">{display}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400">
                  Wypełniony {new Date(existing.submitted_at).toLocaleString('pl')}
                </p>
              </div>
            );
          }

          // Show form to fill
          return (
            <div key={tpl.id} className="rounded-xl border border-gray-200 p-3 space-y-3">
              <p className="text-sm font-semibold text-gray-800">{tpl.name}</p>
              {tpl.description && <p className="text-xs text-gray-500">{tpl.description}</p>}
              <div className="space-y-2.5">
                {tpl.fields.map(field => (
                  <FormFieldInput
                    key={field.id}
                    field={field}
                    value={getFormValue(tpl.id, field.id)}
                    onChange={(val) => setFormValue(tpl.id, field.id, val)}
                  />
                ))}
              </div>
              <Button
                size="sm"
                className="w-full rounded-xl h-8 text-xs bg-orange-500 hover:bg-orange-600 gap-1.5"
                disabled={savingTemplate === tpl.id}
                onClick={() => handleSubmitForm(tpl.id)}
              >
                <Save className="h-3 w-3" />
                {savingTemplate === tpl.id ? 'Zapisywanie...' : 'Zapisz formularz'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── FormFieldInput ───────────────────────────────────────────────────────────

function FormFieldInput({
  field,
  value,
  onChange,
}: {
  field: TemplateField;
  value: any;
  onChange: (val: any) => void;
}) {
  const label = (
    <Label className="text-xs">
      {field.name}
      {field.is_required && <span className="text-red-500 ml-0.5">*</span>}
    </Label>
  );

  switch (field.field_type) {
    case 'text':
      return (
        <div className="space-y-1">
          {label}
          <Input
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.name}
            className="h-8 text-sm"
          />
        </div>
      );
    case 'number':
      return (
        <div className="space-y-1">
          {label}
          <Input
            type="number"
            value={value ?? ''}
            onChange={e => onChange(e.target.value ? Number(e.target.value) : '')}
            placeholder={field.name}
            className="h-8 text-sm"
          />
        </div>
      );
    case 'boolean':
      return (
        <div className="flex items-center justify-between">
          {label}
          <Switch checked={!!value} onCheckedChange={onChange} />
        </div>
      );
    case 'select':
      return (
        <div className="space-y-1">
          {label}
          <Select value={value || ''} onValueChange={onChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Wybierz..." />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case 'multiselect':
      return (
        <div className="space-y-1">
          {label}
          <div className="flex flex-wrap gap-1.5">
            {(field.options || []).map(opt => {
              const checked = Array.isArray(value) && value.includes(opt);
              return (
                <label key={opt} className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const arr = Array.isArray(value) ? [...value] : [];
                      if (v) arr.push(opt);
                      else {
                        const idx = arr.indexOf(opt);
                        if (idx >= 0) arr.splice(idx, 1);
                      }
                      onChange(arr);
                    }}
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        </div>
      );
    case 'date':
      return (
        <div className="space-y-1">
          {label}
          <Input
            type="date"
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      );
    case 'datetime':
      return (
        <div className="space-y-1">
          {label}
          <Input
            type="datetime-local"
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      );
    case 'time':
      return (
        <div className="space-y-1">
          {label}
          <Input
            type="time"
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      );
    case 'photo':
      return (
        <div className="space-y-1">
          {label}
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5 w-full">
            <Camera className="h-3 w-3" /> Dodaj zdjęcie
          </Button>
        </div>
      );
    case 'signature':
      return (
        <div className="space-y-1">
          {label}
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5 w-full">
            <PenTool className="h-3 w-3" /> Podpis
          </Button>
        </div>
      );
    case 'location':
      return (
        <div className="space-y-1">
          {label}
          {value ? (
            <p className="text-xs text-gray-600">{typeof value === 'object' ? `${value.lat}, ${value.lng}` : String(value)}</p>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 w-full"
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    pos => onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    () => onChange(null)
                  );
                }
              }}
            >
              <MapPin className="h-3 w-3" /> Pobierz lokalizację
            </Button>
          )}
        </div>
      );
    default:
      return (
        <div className="space-y-1">
          {label}
          <Input
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      );
  }
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [saving, setSaving] = useState(false);

  // Work logs
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [activeLog, setActiveLog] = useState<WorkLog | null>(null);
  const [timerSec, setTimerSec] = useState(0);
  const [workLoading, setWorkLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Employee suggestions
  const [empSuggestions, setEmpSuggestions] = useState<EmployeeSuggestion[]>([]);
  const [loadingEmpSugg, setLoadingEmpSugg] = useState(false);
  const [assigningEmp, setAssigningEmp] = useState<string | null>(null);

  // New order form
  const [form, setForm] = useState({
    client_id: '', scheduled_date: '', scheduled_time_start: '08:00',
    scheduled_time_end: '09:00', address: '', priority: 'normal' as OrderPriority,
    notes: '', service_ids: [] as string[], required_skills: [] as string[],
  });

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [ordersRes, clientsRes, servicesRes] = await Promise.all([
      supabase.from('orders').select('*, client:clients(name, phone), employee:employees(user:profiles(full_name))').order('scheduled_date', { ascending: false }).order('scheduled_time_start'),
      supabase.from('clients').select('id, name, phone, address, city').order('name'),
      supabase.from('services').select('*').eq('is_active', true).order('name'),
    ]);
    if (ordersRes.data) setOrders(ordersRes.data as OrderRow[]);
    if (clientsRes.data) setClients(clientsRes.data as Client[]);
    if (servicesRes.data) setServices(servicesRes.data as Service[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchWorkLogs = useCallback(async (orderId: string) => {
    const res = await fetch(`/api/work-logs?order_id=${orderId}`);
    if (!res.ok) return;
    const json = await res.json();
    setWorkLogs(json.logs || []);
    setActiveLog(json.active_log || null);
  }, []);

  useEffect(() => {
    if (!selectedOrder) { setWorkLogs([]); setActiveLog(null); setEmpSuggestions([]); return; }
    fetchWorkLogs(selectedOrder.id);
    // Fetch employee suggestions for unassigned orders
    if (!selectedOrder.employee_id) {
      setLoadingEmpSugg(true);
      fetch(`/api/orders/suggest-employees?order_id=${selectedOrder.id}`)
        .then(r => r.json())
        .then(d => setEmpSuggestions(d.suggestions ?? []))
        .catch(() => setEmpSuggestions([]))
        .finally(() => setLoadingEmpSugg(false));
    } else {
      setEmpSuggestions([]);
    }
  }, [selectedOrder, fetchWorkLogs]);

  const assignEmployee = async (empId: string) => {
    if (!selectedOrder) return;
    setAssigningEmp(empId);
    await supabase.from('orders').update({
      employee_id: empId,
      status: selectedOrder.status === 'new' ? 'assigned' : selectedOrder.status,
    }).eq('id', selectedOrder.id);
    setAssigningEmp(null);
    setEmpSuggestions([]);
    fetchData();
    setSelectedOrder({ ...selectedOrder, employee_id: empId, status: selectedOrder.status === 'new' ? 'assigned' : selectedOrder.status });
  };

  const buildRouteUrl = (emp: EmployeeSuggestion, orderAddress: string) => {
    const stops = [
      ...emp.day_route.map(o => o.address),
      orderAddress,
    ].filter(Boolean).map(a => encodeURIComponent(a));
    if (stops.length === 1) {
      return `https://www.google.com/maps/search/?api=1&query=${stops[0]}`;
    }
    const dest = stops[stops.length - 1];
    const waypoints = stops.slice(0, -1).join('|');
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}&waypoints=${waypoints}`;
  };

  // Live timer tick when there's an active log
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (activeLog) {
      const calc = () => Math.floor((Date.now() - new Date(activeLog.started_at).getTime()) / 1000);
      setTimerSec(calc());
      timerRef.current = setInterval(() => setTimerSec(calc()), 1000);
    } else {
      setTimerSec(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeLog]);

  const handleWorkTimer = async (action: 'start' | 'stop') => {
    if (!selectedOrder) return;
    setWorkLoading(true);
    await fetch('/api/work-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: selectedOrder.id, action }),
    });
    await fetchWorkLogs(selectedOrder.id);
    setWorkLoading(false);
  };

  const fmtTimer = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const selectedServices = services.filter(s => form.service_ids.includes(s.id));
    const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
    const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);

    // Calculate end time
    const [h, m] = form.scheduled_time_start.split(':').map(Number);
    const endMinutes = h * 60 + m + totalDuration;
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

    const client = clients.find(c => c.id === form.client_id);

    await supabase.from('orders').insert({
      client_id: form.client_id,
      status: 'new',
      priority: form.priority,
      scheduled_date: form.scheduled_date,
      scheduled_time_start: form.scheduled_time_start,
      scheduled_time_end: endTime,
      address: form.address || client?.address || '',
      services: selectedServices.map(s => ({ service_id: s.id, name: s.name, price: Number(s.price), quantity: 1 })),
      total_price: totalPrice,
      notes: form.notes || null,
      required_skills: form.required_skills.length > 0 ? form.required_skills : null,
    });

    setSaving(false);
    setDialogOpen(false);
    setForm({ client_id: '', scheduled_date: '', scheduled_time_start: '08:00', scheduled_time_end: '09:00', address: '', priority: 'normal', notes: '', service_ids: [], required_skills: [] });
    fetchData();
  };

  const updateStatus = async (orderId: string, newStatus: OrderStatus, closureCode?: string) => {
    const oldStatus = orders.find(o => o.id === orderId)?.status || 'new';

    await supabase.from('orders').update({
      status: newStatus,
      ...(newStatus === 'completed' ? { completed_at: new Date().toISOString() } : {}),
    }).eq('id', orderId);

    // Save to order history (audit trail)
    const { data: profile } = await supabase.from('profiles').select('id').eq('role', 'admin').limit(1).single();
    if (profile) {
      await supabase.from('order_history').insert({
        order_id: orderId,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by: profile.id,
        note: closureCode || null,
      });
    }

    fetchData();
    if (selectedOrder?.id === orderId) {
      setSelectedOrder({ ...selectedOrder, status: newStatus });
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchSearch = o.client?.name?.toLowerCase().includes(search.toLowerCase()) || o.id.includes(search);
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusCounts = (Object.keys(statusConfig) as OrderStatus[]).reduce((acc, s) => {
    acc[s] = orders.filter(o => o.status === s).length;
    return acc;
  }, {} as Record<OrderStatus, number>);

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Zlecenia"
        subtitle={`${orders.length} zleceń łącznie`}
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Nowe zlecenie
          </Button>
        }
      />
      <div className="p-6 space-y-6">
        {/* Status cards */}
        <motion.div className="grid grid-cols-2 gap-3 sm:grid-cols-5" variants={ANIM.container} initial="hidden" animate="show">
          {(Object.keys(statusConfig) as OrderStatus[]).map(status => {
            const cfg = statusConfig[status];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={status}
                variants={ANIM.item}
                whileHover={{ scale: 1.02 }}
                className={`rounded-xl border p-4 cursor-pointer transition-all ${statusFilter === status ? cfg.bg + ' ring-2 ring-offset-1' : 'bg-white border-gray-100 hover:border-gray-200'}`}
                onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
              >
                <div className="flex items-center justify-between">
                  <Icon className={`h-5 w-5 ${cfg.color}`} />
                  <span className="text-2xl font-bold text-gray-900">{statusCounts[status]}</span>
                </div>
                <p className={`text-xs font-medium mt-1 ${cfg.color}`}>{cfg.label}</p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Szukaj zlecenia..." className="pl-9 h-9 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {statusFilter !== 'all' && (
            <Button variant="ghost" size="sm" className="h-9 text-xs rounded-xl" onClick={() => setStatusFilter('all')}>
              Wyczyść filtr
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Orders List */}
          <div className="lg:col-span-2">
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="text-center py-20 text-gray-400">
                    <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Brak zleceń</p>
                    <p className="text-sm mt-1">Utwórz pierwsze zlecenie</p>
                  </div>
                ) : (
                  <motion.div variants={ANIM.container} initial="hidden" animate="show">
                    {filteredOrders.map(order => {
                      const sCfg = statusConfig[order.status];
                      const pCfg = priorityConfig[order.priority];
                      return (
                        <motion.div
                          key={order.id}
                          variants={ANIM.item}
                          className={`flex items-center justify-between px-5 py-4 border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${selectedOrder?.id === order.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                          onClick={() => setSelectedOrder(order)}
                          whileHover={{ x: 2 }}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${sCfg.bg} border`}>
                              <sCfg.icon className={`h-5 w-5 ${sCfg.color}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-900">{order.client?.name || 'Nieznany klient'}</p>
                                <div className={`h-1.5 w-1.5 rounded-full ${pCfg.dot}`} title={pCfg.label} />
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="flex items-center gap-1 text-xs text-gray-400">
                                  <Calendar className="h-3 w-3" />{order.scheduled_date}
                                </span>
                                <span className="flex items-center gap-1 text-xs text-gray-400">
                                  <Clock className="h-3 w-3" />{order.scheduled_time_start?.slice(0, 5)}
                                </span>
                                <span className="text-xs font-medium text-gray-600">{order.total_price} zł</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[10px] rounded-lg ${sCfg.bg} ${sCfg.color} border`}>
                              {sCfg.label}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-gray-300" />
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Order Detail Panel */}
          <div>
            <AnimatePresence mode="wait">
              {selectedOrder ? (
                <motion.div
                  key={selectedOrder.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card className="rounded-2xl border-gray-100 shadow-sm sticky top-6">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-bold">Szczegóły zlecenia</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Status badge */}
                      <div className={`rounded-xl p-3 ${statusConfig[selectedOrder.status].bg} border`}>
                        <p className={`text-sm font-semibold ${statusConfig[selectedOrder.status].color}`}>
                          Status: {statusConfig[selectedOrder.status].label}
                        </p>
                      </div>

                      {/* Client info */}
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Klient</p>
                        <p className="text-sm font-medium">{selectedOrder.client?.name}</p>
                        {selectedOrder.client?.phone && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3" />{selectedOrder.client.phone}
                          </p>
                        )}
                      </div>

                      {/* Schedule */}
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Termin</p>
                        <p className="text-sm"><Calendar className="h-3.5 w-3.5 inline mr-1 text-gray-400" />{selectedOrder.scheduled_date}</p>
                        <p className="text-sm mt-0.5"><Clock className="h-3.5 w-3.5 inline mr-1 text-gray-400" />{selectedOrder.scheduled_time_start?.slice(0, 5)} - {selectedOrder.scheduled_time_end?.slice(0, 5)}</p>
                      </div>

                      {/* Address */}
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Adres</p>
                        <p className="text-sm flex items-start gap-1"><MapPin className="h-3.5 w-3.5 mt-0.5 text-gray-400 shrink-0" />{selectedOrder.address}</p>
                      </div>

                      {/* Services */}
                      {selectedOrder.services?.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Usługi</p>
                          {selectedOrder.services.map((s, i) => (
                            <div key={i} className="flex justify-between text-sm py-1">
                              <span className="text-gray-700">{s.name}</span>
                              <span className="font-medium">{s.price} zł</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm pt-2 mt-2 border-t font-bold">
                            <span>Razem</span>
                            <span>{selectedOrder.total_price} zł</span>
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {selectedOrder.notes && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Notatki</p>
                          <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{selectedOrder.notes}</p>
                        </div>
                      )}

                      {/* Required Skills */}
                      {(selectedOrder.required_skills ?? []).length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1">
                            <Wrench className="h-3 w-3" /> Wymagane umiejętności
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {(selectedOrder.required_skills ?? []).map((skill) => (
                              <span key={skill} className="text-[11px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-lg font-medium">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Work Time Tracker */}
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1">
                          <Timer className="h-3 w-3" /> Czas pracy
                        </p>
                        <div className={`rounded-xl p-3 flex items-center justify-between ${activeLog ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50'}`}>
                          <div>
                            <p className={`text-2xl font-mono font-bold tabular-nums ${activeLog ? 'text-emerald-700' : 'text-gray-600'}`}>
                              {activeLog ? fmtTimer(timerSec) : (() => {
                                const total = workLogs.reduce((s, l) => s + (l.duration_minutes ?? 0), 0);
                                return total > 0 ? `${Math.floor(total / 60)}h ${total % 60}m` : '00:00';
                              })()}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {activeLog ? 'Timer aktywny' : workLogs.length > 0 ? `${workLogs.filter(l => l.ended_at).length} wpisów` : 'Brak wpisów'}
                            </p>
                          </div>
                          {activeLog ? (
                            <Button size="sm" disabled={workLoading}
                              className="rounded-xl h-9 px-3 bg-red-500 hover:bg-red-600 text-white gap-1.5"
                              onClick={() => handleWorkTimer('stop')}>
                              <Square className="h-3.5 w-3.5 fill-current" /> Stop
                            </Button>
                          ) : (
                            <Button size="sm" disabled={workLoading || selectedOrder.status === 'completed' || selectedOrder.status === 'cancelled'}
                              className="rounded-xl h-9 px-3 bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5"
                              onClick={() => handleWorkTimer('start')}>
                              <Play className="h-3.5 w-3.5 fill-current" /> Start
                            </Button>
                          )}
                        </div>

                        {/* Log history */}
                        {workLogs.filter(l => l.ended_at).length > 0 && (
                          <div className="mt-2 space-y-1">
                            {workLogs.filter(l => l.ended_at).slice(0, 3).map((log) => (
                              <div key={log.id} className="flex items-center justify-between text-[11px] text-gray-500 px-1">
                                <span>{new Date(log.started_at).toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })} – {new Date(log.ended_at!).toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })}</span>
                                <span className="font-medium text-gray-700">{log.duration_minutes} min</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Employee Suggestion */}
                      {!selectedOrder.employee_id && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1">
                            <Zap className="h-3 w-3 text-amber-500" /> Sugestia przydzielenia
                          </p>
                          {loadingEmpSugg ? (
                            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                              Analizuję dostępność...
                            </div>
                          ) : empSuggestions.length === 0 ? (
                            <p className="text-xs text-gray-400">Brak aktywnych pracowników</p>
                          ) : (
                            <div className="space-y-2">
                              {empSuggestions.map((emp, i) => (
                                <motion.div
                                  key={emp.id}
                                  initial={{ opacity: 0, y: 6 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.05 }}
                                  className={`rounded-xl border p-3 space-y-2 ${i === 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {i === 0 && <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />}
                                      <p className="text-sm font-semibold text-gray-900 truncate">{emp.name}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {emp.is_online && (
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Online" />
                                      )}
                                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${emp.skills_match ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                        {emp.skills_match ? '✓ Umiej.' : '✗ Umiej.'}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 text-[11px] text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <ClipboardList className="h-3 w-3" />
                                      {emp.order_count} zleceń dziś
                                    </span>
                                    {emp.dist_km !== null && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        ~{emp.dist_km} km
                                      </span>
                                    )}
                                  </div>

                                  {emp.nearest_job && (
                                    <p className="text-[10px] text-gray-400 truncate">
                                      Najbliższe: {emp.nearest_job.time} · {emp.nearest_job.client || emp.nearest_job.address}
                                    </p>
                                  )}

                                  {emp.vehicle_info && (
                                    <p className="text-[10px] text-gray-400 truncate">
                                      🚗 {emp.vehicle_info}
                                    </p>
                                  )}

                                  <div className="flex gap-1.5 pt-1">
                                    <Button
                                      size="sm"
                                      disabled={assigningEmp === emp.id}
                                      className={`flex-1 rounded-lg h-7 text-xs gap-1 ${i === 0 ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
                                      onClick={() => assignEmployee(emp.id)}
                                    >
                                      {assigningEmp === emp.id ? (
                                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                      ) : (
                                        <><User className="h-3 w-3" /> Przypisz</>
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="rounded-lg h-7 text-xs px-2 gap-1"
                                      onClick={() => window.open(buildRouteUrl(emp, selectedOrder.address), '_blank')}
                                      title="Otwórz trasę dnia w Google Maps"
                                    >
                                      <Navigation className="h-3 w-3" />
                                      Trasa
                                    </Button>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Assigned employee info */}
                      {selectedOrder.employee_id && selectedOrder.employee && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1">
                            <User className="h-3 w-3" /> Przydzielony pracownik
                          </p>
                          <div className="flex items-center justify-between rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
                            <p className="text-sm font-medium text-blue-800">{selectedOrder.employee.user.full_name}</p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg h-7 text-xs px-2 gap-1 border-blue-200 text-blue-600"
                              onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedOrder.address)}`, '_blank')}
                            >
                              <Navigation className="h-3 w-3" /> Nawiguj
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Forms Section */}
                      <OrderFormsSection order={selectedOrder} services={services} />

                      {/* Status Actions */}
                      <div className="pt-2 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Zmień status</p>
                        <div className="grid grid-cols-2 gap-2">
                          {selectedOrder.status === 'new' && (
                            <Button size="sm" className="rounded-xl text-xs h-8 bg-amber-500 hover:bg-amber-600" onClick={() => updateStatus(selectedOrder.id, 'assigned')}>
                              <ArrowRight className="h-3 w-3 mr-1" /> Przydziel
                            </Button>
                          )}
                          {(selectedOrder.status === 'assigned' || selectedOrder.status === 'new') && (
                            <Button size="sm" className="rounded-xl text-xs h-8 bg-violet-500 hover:bg-violet-600" onClick={() => updateStatus(selectedOrder.id, 'in_progress')}>
                              <Truck className="h-3 w-3 mr-1" /> Rozpocznij
                            </Button>
                          )}
                          {selectedOrder.status === 'in_progress' && (
                            <Button size="sm" className="rounded-xl text-xs h-8 bg-emerald-500 hover:bg-emerald-600" onClick={() => updateStatus(selectedOrder.id, 'completed')}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Ukończ
                            </Button>
                          )}
                          {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                            <Button size="sm" variant="outline" className="rounded-xl text-xs h-8 text-red-500 border-red-200" onClick={() => updateStatus(selectedOrder.id, 'cancelled')}>
                              <XCircle className="h-3 w-3 mr-1" /> Anuluj
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                <Card className="rounded-2xl border-gray-100 shadow-sm">
                  <CardContent className="py-16 text-center text-gray-400">
                    <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Wybierz zlecenie</p>
                  </CardContent>
                </Card>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* New Order Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nowe zlecenie</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateOrder} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Klient</Label>
                <button type="button" className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                  onClick={() => {
                    const name = prompt('Imię i nazwisko / Firma:');
                    const phone = prompt('Telefon:');
                    const address = prompt('Adres:');
                    const city = prompt('Miasto:');
                    if (name && phone && address && city) {
                      supabase.from('clients').insert({ name, phone, address, city, vehicles: [] }).select('id').single()
                        .then(({ data: newClient }) => {
                          if (newClient) {
                            setClients([...clients, { id: newClient.id, name, phone, address, city } as any]);
                            setForm({ ...form, client_id: newClient.id, address: `${address}, ${city}` });
                          }
                        });
                    }
                  }}>
                  + Nowy klient
                </button>
              </div>
              <Select value={form.client_id} onValueChange={v => {
                const client = clients.find(c => c.id === v);
                setForm({ ...form, client_id: v ?? '', address: client ? `${client.address}, ${client.city}` : '' });
              }}>
                <SelectTrigger><SelectValue placeholder="Wybierz klienta" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name} - {c.city}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" required value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Godzina rozpoczęcia</Label>
                <Input type="time" required value={form.scheduled_time_start} onChange={e => setForm({ ...form, scheduled_time_start: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Usługi</Label>
              <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto border rounded-xl p-2">
                {services.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.service_ids.includes(s.id)}
                      onChange={e => {
                        if (e.target.checked) setForm({ ...form, service_ids: [...form.service_ids, s.id] });
                        else setForm({ ...form, service_ids: form.service_ids.filter(id => id !== s.id) });
                      }}
                      className="rounded"
                    />
                    <span className="flex-1">{s.name}</span>
                    <span className="text-gray-500 font-medium">{Number(s.price)} zł</span>
                  </label>
                ))}
              </div>
              {form.service_ids.length > 0 && (
                <p className="text-sm font-medium text-right">
                  Suma: {services.filter(s => form.service_ids.includes(s.id)).reduce((sum, s) => sum + Number(s.price), 0)} zł
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Adres</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Adres zlecenia" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priorytet</Label>
                <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: (v ?? 'normal') as OrderPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Niski</SelectItem>
                    <SelectItem value="normal">Normalny</SelectItem>
                    <SelectItem value="high">Wysoki</SelectItem>
                    <SelectItem value="urgent">Pilny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Required skills */}
            <div className="space-y-2">
              <Label>Wymagane umiejętności / sprzęt</Label>
              <div className="flex flex-wrap gap-2">
                {['wymiana opon', 'wyważanie', 'naprawa', 'PKW', 'LKW', 'motocykl', 'elektryczny', 'ciężarowy'].map(skill => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => {
                      if (form.required_skills.includes(skill)) {
                        setForm({ ...form, required_skills: form.required_skills.filter(s => s !== skill) });
                      } else {
                        setForm({ ...form, required_skills: [...form.required_skills, skill] });
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      form.required_skills.includes(skill)
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-orange-300'
                    }`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
              {form.required_skills.length > 0 && (
                <p className="text-xs text-orange-600">Auto-assign uwzględni wymagane umiejętności</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Notatki</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Dodatkowe informacje..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving || !form.client_id || !form.scheduled_date} className="bg-blue-600 hover:bg-blue-700">
                {saving ? 'Tworzenie...' : 'Utwórz zlecenie'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
