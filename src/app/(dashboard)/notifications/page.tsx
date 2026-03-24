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
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import { Bell, MessageSquare, Mail, Plus, Edit, Trash2, Clock, Check, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

interface Template {
  id: string;
  name: string;
  trigger: string;
  channel: 'email' | 'sms' | 'both';
  subject: string | null;
  body: string;
  is_active: boolean;
  send_after_time: string | null;
  send_before_time: string | null;
}

interface NotifRow {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const TRIGGER_OPTIONS: { value: string; label: string }[] = [
  { value: 'booking_created', label: 'Nowa rezerwacja' },
  { value: 'order_assigned', label: 'Zlecenie przypisane' },
  { value: 'order_completed', label: 'Zlecenie zakonczone' },
  { value: 'order_cancelled', label: 'Zlecenie anulowane' },
  { value: 'reschedule', label: 'Zmiana terminu' },
  { value: 'reminder_day_before', label: 'Przypomnienie (dzien przed)' },
  { value: 'reminder_morning', label: 'Przypomnienie (rano)' },
  { value: 'en_route', label: 'Pracownik w drodze' },
];

const PLACEHOLDERS = [
  '{{client_name}}', '{{date}}', '{{time_window}}', '{{employee_name}}',
  '{{services}}', '{{total_price}}', '{{tracking_url}}', '{{address}}', '{{order_id}}',
];

const triggerLabel = (trigger: string) =>
  TRIGGER_OPTIONS.find(o => o.value === trigger)?.label || trigger;

// ── Alert Rules ──

interface AlertRule {
  id: string;
  name: string;
  event: string;
  condition: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  sla_breach: 'Przekroczenie terminu (SLA)',
  unassigned_today: 'Nieprzypisane zlecenie na dzis',
  no_progress: 'Brak postepu na zleceniu',
  worker_outside_zone: 'Pracownik poza rejonem',
  order_not_completed: 'Nieukonczone zlecenie na koniec dnia',
};

const EVENT_OPTIONS = Object.entries(EVENT_LABELS).map(([value, label]) => ({ value, label }));

export default function NotificationsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [notifications, setNotifications] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    trigger: 'booking_created',
    channel: 'email' as 'email' | 'sms' | 'both',
    subject: '',
    body: '',
    is_active: true,
    send_after_time: '',
    send_before_time: '',
  });

  // Alert Rules state
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    name: '',
    event: 'sla_breach',
    condition: {} as Record<string, unknown>,
    is_active: true,
  });

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [tplRes, notifRes, rulesRes] = await Promise.all([
      fetch('/api/notification-templates').then(r => r.json()),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30),
      fetch('/api/alert-rules').then(r => r.json()),
    ]);
    setTemplates(tplRes.templates || []);
    if (notifRes.data) setNotifications(notifRes.data as NotifRow[]);
    setAlertRules(rulesRes.rules || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload: any = {
      name: form.name,
      trigger: form.trigger,
      channel: form.channel,
      subject: (form.channel === 'email' || form.channel === 'both') ? form.subject : null,
      body: form.body,
      is_active: form.is_active,
      send_after_time: form.send_after_time || null,
      send_before_time: form.send_before_time || null,
    };

    if (editingTemplate) {
      payload.id = editingTemplate.id;
      await fetch('/api/notification-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/notification-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    setSaving(false);
    setDialogOpen(false);
    setEditingTemplate(null);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/notification-templates?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const toggleTemplate = async (t: Template) => {
    await fetch('/api/notification-templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, is_active: !t.is_active }),
    });
    fetchData();
  };

  const markAllRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
    fetchData();
  };

  const openEdit = (t: Template) => {
    setForm({
      name: t.name,
      trigger: t.trigger,
      channel: t.channel,
      subject: t.subject || '',
      body: t.body,
      is_active: t.is_active,
      send_after_time: t.send_after_time || '',
      send_before_time: t.send_before_time || '',
    });
    setEditingTemplate(t);
    setDialogOpen(true);
  };

  const openNew = () => {
    setForm({
      name: '', trigger: 'booking_created', channel: 'email',
      subject: '', body: '', is_active: true,
      send_after_time: '', send_before_time: '',
    });
    setEditingTemplate(null);
    setDialogOpen(true);
  };

  // ── Alert Rules handlers ──

  const openNewRule = () => {
    setRuleForm({ name: '', event: 'sla_breach', condition: {}, is_active: true });
    setEditingRule(null);
    setRuleDialogOpen(true);
  };

  const openEditRule = (r: AlertRule) => {
    setRuleForm({
      name: r.name,
      event: r.event,
      condition: r.condition || {},
      is_active: r.is_active,
    });
    setEditingRule(r);
    setRuleDialogOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setRuleSaving(true);
    const payload: any = {
      name: ruleForm.name,
      event: ruleForm.event,
      condition: ruleForm.condition,
      is_active: ruleForm.is_active,
    };

    if (editingRule) {
      payload.id = editingRule.id;
      await fetch('/api/alert-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/alert-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    setRuleSaving(false);
    setRuleDialogOpen(false);
    setEditingRule(null);
    fetchData();
  };

  const handleDeleteRule = async (id: string) => {
    await fetch(`/api/alert-rules?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const toggleRule = async (r: AlertRule) => {
    await fetch('/api/alert-rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, is_active: !r.is_active }),
    });
    fetchData();
  };

  const formatCondition = (event: string, condition: Record<string, unknown>): string => {
    if (event === 'no_progress' && condition.minutes_threshold) {
      return `${condition.minutes_threshold} min bez postepu`;
    }
    if (event === 'worker_outside_zone' && condition.max_distance_km) {
      return `Max ${condition.max_distance_km} km`;
    }
    return '-';
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const channelIcon = (ch: string) => {
    if (ch === 'sms') return <MessageSquare className="h-4 w-4 text-green-500" />;
    if (ch === 'email') return <Mail className="h-4 w-4 text-violet-500" />;
    return <Bell className="h-4 w-4 text-orange-500" />;
  };

  const channelLabel = (ch: string) => {
    if (ch === 'sms') return 'SMS';
    if (ch === 'email') return 'Email';
    return 'Email + SMS';
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Powiadomienia"
        subtitle="Szablony SMS/Email i historia"
        icon={<Bell className="h-5 w-5" />}
      />
      <div className="p-6">
        <Tabs defaultValue="templates">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="templates" className="gap-2"><MessageSquare className="h-4 w-4" /> Szablony</TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <Bell className="h-4 w-4" /> Historia
                {unreadCount > 0 && <Badge className="ml-1 h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center">{unreadCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="alert-rules" className="gap-2">
                <ShieldAlert className="h-4 w-4" /> Reguly alertow
              </TabsTrigger>
            </TabsList>
            <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700" onClick={openNew}>
              <Plus className="h-4 w-4" /> Nowy szablon
            </Button>
          </div>

          <TabsContent value="templates">
            {loading ? (
              <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
            ) : (
              <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" variants={ANIM.container} initial="hidden" animate="show">
                {templates.map(tpl => (
                  <motion.div key={tpl.id} variants={ANIM.item} whileHover={{ y: -2 }}>
                    <Card className={`rounded-2xl border-gray-100 shadow-sm ${!tpl.is_active ? 'opacity-50' : ''}`}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {channelIcon(tpl.channel)}
                            <Badge variant="outline" className="text-[10px] rounded-lg">{channelLabel(tpl.channel)}</Badge>
                          </div>
                          <Badge className="text-[10px] rounded-lg bg-gray-100 text-gray-600">{triggerLabel(tpl.trigger)}</Badge>
                        </div>
                        <h3 className="text-sm font-bold mb-1">{tpl.name}</h3>
                        {tpl.subject && <p className="text-xs text-gray-500 mb-1">Temat: {tpl.subject}</p>}
                        <p className="text-xs text-gray-400 line-clamp-2">{tpl.body}</p>
                        {(tpl.send_after_time || tpl.send_before_time) && (
                          <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
                            <Clock className="h-3 w-3" />
                            {tpl.send_after_time && <span>od {tpl.send_after_time}</span>}
                            {tpl.send_before_time && <span>do {tpl.send_before_time}</span>}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t">
                          <div className="flex items-center gap-2">
                            <Switch checked={tpl.is_active} onCheckedChange={() => toggleTemplate(tpl)} />
                            <span className="text-[11px] text-gray-500">{tpl.is_active ? 'Aktywny' : 'Wylaczony'}</span>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEdit(tpl)}><Edit className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-red-500" onClick={() => handleDelete(tpl.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            )}

            <Card className="rounded-2xl border-gray-100 shadow-sm mt-6">
              <CardContent className="p-5">
                <h3 className="text-sm font-bold mb-2">Dostepne placeholdery</h3>
                <div className="flex flex-wrap gap-2">
                  {PLACEHOLDERS.map(p => (
                    <code key={p} className="text-xs bg-gray-100 px-2 py-1 rounded-lg">{p}</code>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Aby podlaczyc SMS: skonfiguruj SMSAPI.pl lub Twilio w ustawieniach.
                  Email wysylany jest przez Resend (RESEND_API_KEY).
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <div className="flex justify-end mb-4">
              {unreadCount > 0 && (
                <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" onClick={markAllRead}>
                  <Check className="h-3 w-3 mr-1" /> Oznacz wszystkie jako przeczytane
                </Button>
              )}
            </div>
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardContent className="p-0">
                {notifications.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Brak powiadomien</p>
                  </div>
                ) : (
                  <motion.div variants={ANIM.container} initial="hidden" animate="show">
                    {notifications.map(n => (
                      <motion.div key={n.id} variants={ANIM.item}
                        className={`flex items-start gap-4 px-5 py-4 border-b border-gray-50 last:border-0 ${!n.is_read ? 'bg-blue-50/30' : ''}`}>
                        <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${!n.is_read ? 'bg-blue-500' : 'bg-gray-300'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{n.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />{new Date(n.created_at).toLocaleString('pl')}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alert-rules">
            <div className="flex justify-end mb-4">
              <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700" onClick={openNewRule}>
                <Plus className="h-4 w-4" /> Dodaj regule
              </Button>
            </div>
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                  </div>
                ) : alertRules.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Brak regul alertow</p>
                    <p className="text-xs mt-1">Dodaj regule, aby otrzymywac alerty o waznych zdarzeniach.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nazwa</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Zdarzenie</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Warunki</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Aktywny</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Akcje</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alertRules.map(rule => (
                          <tr key={rule.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="px-4 py-3 font-medium text-gray-900">{rule.name}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-[11px] rounded-lg">
                                {EVENT_LABELS[rule.event] || rule.event}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {formatCondition(rule.event, rule.condition)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Switch checked={rule.is_active} onCheckedChange={() => toggleRule(rule)} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEditRule(rule)}>
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-red-500" onClick={() => handleDeleteRule(rule.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Template Dialog */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) setEditingTemplate(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingTemplate ? 'Edytuj szablon' : 'Nowy szablon'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nazwa</Label>
                <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Kanal</Label>
                <Select value={form.channel} onValueChange={v => setForm({ ...form, channel: (v ?? 'email') as 'email' | 'sms' | 'both' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="both">Email + SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Wyzwalacz</Label>
              <Select value={form.trigger} onValueChange={v => setForm({ ...form, trigger: v ?? 'booking_created' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIGGER_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(form.channel === 'email' || form.channel === 'both') && (
              <div className="space-y-2">
                <Label>Temat emaila</Label>
                <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="np. Potwierdzenie wizyty {{date}}" />
              </div>
            )}
            <div className="space-y-2">
              <Label>Tresc</Label>
              <Textarea rows={4} required value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Witaj {{client_name}}! ..." />
              <div className="flex flex-wrap gap-1 mt-1">
                {PLACEHOLDERS.map(p => (
                  <button key={p} type="button" onClick={() => setForm(f => ({ ...f, body: f.body + p }))}
                    className="text-[10px] bg-gray-100 hover:bg-blue-50 text-gray-500 hover:text-blue-600 px-1.5 py-0.5 rounded transition-colors">
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Clock className="h-3 w-3" />Wysylaj po</Label>
                <Input type="time" value={form.send_after_time} onChange={e => setForm({ ...form, send_after_time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Clock className="h-3 w-3" />Wysylaj przed</Label>
                <Input type="time" value={form.send_before_time} onChange={e => setForm({ ...form, send_before_time: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
              <span className="text-sm text-gray-700">{form.is_active ? 'Aktywny' : 'Wylaczony'}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">{saving ? 'Zapisywanie...' : 'Zapisz'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Alert Rule Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={o => { setRuleDialogOpen(o); if (!o) setEditingRule(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edytuj regule alertu' : 'Nowa regula alertu'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveRule} className="space-y-4">
            <div className="space-y-2">
              <Label>Nazwa</Label>
              <Input
                required
                value={ruleForm.name}
                onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))}
                placeholder="np. Alert SLA 24h"
              />
            </div>
            <div className="space-y-2">
              <Label>Zdarzenie</Label>
              <Select
                value={ruleForm.event}
                onValueChange={v => setRuleForm(f => ({ ...f, event: v ?? 'sla_breach', condition: {} }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Conditional fields based on event type */}
            {ruleForm.event === 'no_progress' && (
              <div className="space-y-2">
                <Label>Minuty bez postepu</Label>
                <Input
                  type="number"
                  min={1}
                  value={(ruleForm.condition.minutes_threshold as number) || 60}
                  onChange={e => setRuleForm(f => ({
                    ...f,
                    condition: { ...f.condition, minutes_threshold: parseInt(e.target.value) || 60 },
                  }))}
                  placeholder="60"
                />
              </div>
            )}

            {ruleForm.event === 'worker_outside_zone' && (
              <div className="space-y-2">
                <Label>Max odleglosc [km]</Label>
                <Input
                  type="number"
                  min={1}
                  value={(ruleForm.condition.max_distance_km as number) || 50}
                  onChange={e => setRuleForm(f => ({
                    ...f,
                    condition: { ...f.condition, max_distance_km: parseInt(e.target.value) || 50 },
                  }))}
                  placeholder="50"
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              <Switch
                checked={ruleForm.is_active}
                onCheckedChange={v => setRuleForm(f => ({ ...f, is_active: v }))}
              />
              <span className="text-sm text-gray-700">{ruleForm.is_active ? 'Aktywny' : 'Wylaczony'}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setRuleDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={ruleSaving} className="bg-blue-600 hover:bg-blue-700">
                {ruleSaving ? 'Zapisywanie...' : 'Zapisz'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
