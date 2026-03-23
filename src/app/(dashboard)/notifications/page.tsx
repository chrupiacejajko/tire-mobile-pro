'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Bell, MessageSquare, Mail, Plus, Edit, Trash2, Send, Clock, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

interface Template {
  id: string;
  name: string;
  type: 'sms' | 'email';
  trigger_event: string;
  subject: string | null;
  body: string;
  is_active: boolean;
}

interface NotifRow {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const triggerLabels: Record<string, string> = {
  order_created: 'Nowe zlecenie',
  order_reminder: 'Przypomnienie',
  order_in_progress: 'W drodze',
  order_completed: 'Ukończone',
};

export default function NotificationsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [notifications, setNotifications] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', type: 'sms' as 'sms' | 'email', trigger_event: 'order_created',
    subject: '', body: '', is_active: true,
  });

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [tplRes, notifRes] = await Promise.all([
      supabase.from('notification_templates').select('*').order('trigger_event, type'),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    if (tplRes.data) setTemplates(tplRes.data as Template[]);
    if (notifRes.data) setNotifications(notifRes.data as NotifRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, subject: form.type === 'email' ? form.subject : null };
    if (editingTemplate) {
      await supabase.from('notification_templates').update(payload).eq('id', editingTemplate.id);
    } else {
      await supabase.from('notification_templates').insert(payload);
    }
    setSaving(false);
    setDialogOpen(false);
    setEditingTemplate(null);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('notification_templates').delete().eq('id', id);
    fetchData();
  };

  const toggleTemplate = async (id: string, isActive: boolean) => {
    await supabase.from('notification_templates').update({ is_active: !isActive }).eq('id', id);
    fetchData();
  };

  const markAllRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
    fetchData();
  };

  const openEdit = (t: Template) => {
    setForm({ name: t.name, type: t.type, trigger_event: t.trigger_event, subject: t.subject || '', body: t.body, is_active: t.is_active });
    setEditingTemplate(t);
    setDialogOpen(true);
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

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
            </TabsList>
            <Button className="h-9 rounded-xl text-sm gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={() => { setForm({ name: '', type: 'sms', trigger_event: 'order_created', subject: '', body: '', is_active: true }); setEditingTemplate(null); setDialogOpen(true); }}>
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
                            {tpl.type === 'sms' ? <MessageSquare className="h-4 w-4 text-blue-500" /> : <Mail className="h-4 w-4 text-violet-500" />}
                            <Badge variant="outline" className="text-[10px] rounded-lg">{tpl.type.toUpperCase()}</Badge>
                          </div>
                          <Badge className="text-[10px] rounded-lg bg-gray-100 text-gray-600">{triggerLabels[tpl.trigger_event] || tpl.trigger_event}</Badge>
                        </div>
                        <h3 className="text-sm font-bold mb-1">{tpl.name}</h3>
                        {tpl.subject && <p className="text-xs text-gray-500 mb-1">Temat: {tpl.subject}</p>}
                        <p className="text-xs text-gray-400 line-clamp-2">{tpl.body}</p>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t">
                          <div className="flex items-center gap-2">
                            <Switch checked={tpl.is_active} onCheckedChange={() => toggleTemplate(tpl.id, tpl.is_active)} />
                            <span className="text-[11px] text-gray-500">{tpl.is_active ? 'Aktywny' : 'Wyłączony'}</span>
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
                <h3 className="text-sm font-bold mb-2">Dostępne placeholdery</h3>
                <div className="flex flex-wrap gap-2">
                  {['{client_name}', '{date}', '{time}', '{address}', '{price}', '{services}', '{eta}'].map(p => (
                    <code key={p} className="text-xs bg-gray-100 px-2 py-1 rounded-lg">{p}</code>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Aby podłączyć SMS: skonfiguruj SMSAPI.pl lub Twilio w ustawieniach.
                  Aby podłączyć Email: skonfiguruj Resend lub SendGrid.
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
                    <p className="text-sm font-medium">Brak powiadomień</p>
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
        </Tabs>
      </div>

      {/* Template Dialog */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) setEditingTemplate(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingTemplate ? 'Edytuj szablon' : 'Nowy szablon'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nazwa</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Kanał</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: (v ?? 'sms') as 'sms' | 'email' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Wyzwalacz</Label>
              <Select value={form.trigger_event} onValueChange={v => setForm({ ...form, trigger_event: v ?? 'order_created' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="order_created">Nowe zlecenie</SelectItem>
                  <SelectItem value="order_reminder">Przypomnienie (1 dzień przed)</SelectItem>
                  <SelectItem value="order_in_progress">Pracownik w drodze</SelectItem>
                  <SelectItem value="order_completed">Zlecenie ukończone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.type === 'email' && (
              <div className="space-y-2"><Label>Temat emaila</Label><Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></div>
            )}
            <div className="space-y-2"><Label>Treść</Label><Textarea rows={4} required value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Witaj {client_name}! ..." /></div>
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
