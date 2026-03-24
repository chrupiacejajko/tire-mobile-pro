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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Plus, ClipboardList, Edit, Trash2, Type, Hash, ToggleLeft,
  ChevronDown, CheckSquare, Camera, Calendar, PenTool, ArrowUp, ArrowDown, X, Link2, Unlink,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ── Types ────────────────────────────────────────────────────────────────────

interface FormField {
  id: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'photo' | 'date' | 'signature';
  label: string;
  required: boolean;
  order: number;
  options?: string[];
  min?: number;
  max?: number;
}

interface FormTemplate {
  id: string;
  name: string;
  description: string | null;
  fields: FormField[];
  is_active: boolean;
  created_at: string;
}

interface ServiceRow {
  id: string;
  name: string;
  form_template_id: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

const FIELD_TYPES: { value: FormField['type']; label: string; icon: React.ElementType }[] = [
  { value: 'text', label: 'Tekst', icon: Type },
  { value: 'number', label: 'Liczba', icon: Hash },
  { value: 'boolean', label: 'Tak/Nie', icon: ToggleLeft },
  { value: 'select', label: 'Lista wyboru', icon: ChevronDown },
  { value: 'multiselect', label: 'Wielokrotny wybór', icon: CheckSquare },
  { value: 'photo', label: 'Zdjęcie', icon: Camera },
  { value: 'date', label: 'Data', icon: Calendar },
  { value: 'signature', label: 'Podpis', icon: PenTool },
];

function getFieldIcon(type: FormField['type']) {
  const cfg = FIELD_TYPES.find(t => t.value === type);
  if (!cfg) return Type;
  return cfg.icon;
}

function getFieldLabel(type: FormField['type']) {
  return FIELD_TYPES.find(t => t.value === type)?.label ?? type;
}

let fieldCounter = 0;
function nextFieldId() {
  fieldCounter += 1;
  return `f${Date.now()}_${fieldCounter}`;
}

// ── Field Editor Row ─────────────────────────────────────────────────────────

function FieldRow({
  field,
  index,
  total,
  onChange,
  onMove,
  onDelete,
}: {
  field: FormField;
  index: number;
  total: number;
  onChange: (f: FormField) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const Icon = getFieldIcon(field.type);
  const needsOptions = field.type === 'select' || field.type === 'multiselect';
  const isNumber = field.type === 'number';
  const [optionInput, setOptionInput] = useState('');

  const addOption = () => {
    const val = optionInput.trim();
    if (!val) return;
    const opts = [...(field.options || []), val];
    onChange({ ...field, options: opts });
    setOptionInput('');
  };

  const removeOption = (i: number) => {
    const opts = (field.options || []).filter((_, idx) => idx !== i);
    onChange({ ...field, options: opts });
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 flex-shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <Input
            value={field.label}
            onChange={e => onChange({ ...field, label: e.target.value })}
            placeholder="Nazwa pola"
            className="h-8 text-sm font-medium"
          />
        </div>
        <Badge variant="outline" className="text-[10px] flex-shrink-0">{getFieldLabel(field.type)}</Badge>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onMove(-1)} disabled={index === 0}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onMove(1)} disabled={index === total - 1}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-red-500" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <Checkbox
            checked={field.required}
            onCheckedChange={(v) => onChange({ ...field, required: !!v })}
          />
          Wymagane
        </label>
      </div>

      {isNumber && (
        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Min</Label>
            <Input
              type="number"
              value={field.min ?? ''}
              onChange={e => onChange({ ...field, min: e.target.value ? Number(e.target.value) : undefined })}
              className="h-8 text-sm"
              placeholder="np. 0"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Max</Label>
            <Input
              type="number"
              value={field.max ?? ''}
              onChange={e => onChange({ ...field, max: e.target.value ? Number(e.target.value) : undefined })}
              className="h-8 text-sm"
              placeholder="np. 10"
            />
          </div>
        </div>
      )}

      {needsOptions && (
        <div className="space-y-2">
          <Label className="text-xs">Opcje</Label>
          <div className="flex flex-wrap gap-1.5">
            {(field.options || []).map((opt, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-lg">
                {opt}
                <button type="button" onClick={() => removeOption(i)} className="text-gray-400 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={optionInput}
              onChange={e => setOptionInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
              placeholder="Dodaj opcję..."
              className="h-8 text-sm flex-1"
            />
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={addOption}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Link Services Dialog ─────────────────────────────────────────────────────

function LinkServicesDialog({
  open,
  onOpenChange,
  templateId,
  templateName,
  services,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templateId: string;
  templateName: string;
  services: ServiceRow[];
  onRefresh: () => void;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  const linked = services.filter(s => s.form_template_id === templateId);
  const unlinked = services.filter(s => !s.form_template_id);

  const linkService = async (serviceId: string) => {
    setSaving(true);
    await supabase.from('services').update({ form_template_id: templateId }).eq('id', serviceId);
    onRefresh();
    setSaving(false);
  };

  const unlinkService = async (serviceId: string) => {
    setSaving(true);
    await supabase.from('services').update({ form_template_id: null }).eq('id', serviceId);
    onRefresh();
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Powiąż usługi z &ldquo;{templateName}&rdquo;</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {linked.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Powiązane</p>
              {linked.map(s => (
                <div key={s.id} className="flex items-center justify-between p-2.5 rounded-xl border border-orange-200 bg-orange-50">
                  <span className="text-sm text-gray-800">{s.name}</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={() => unlinkService(s.id)} disabled={saving}>
                    <Unlink className="h-3 w-3 mr-1" /> Odłącz
                  </Button>
                </div>
              ))}
            </div>
          )}
          {unlinked.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Dostępne usługi</p>
              {unlinked.map(s => (
                <div key={s.id} className="flex items-center justify-between p-2.5 rounded-xl border border-gray-200">
                  <span className="text-sm text-gray-800">{s.name}</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-orange-600" onClick={() => linkService(s.id)} disabled={saving}>
                    <Link2 className="h-3 w-3 mr-1" /> Powiąż
                  </Button>
                </div>
              ))}
            </div>
          )}
          {linked.length === 0 && unlinked.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Brak usług do powiązania</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function FormsPage() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<FormTemplate | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);
  const [saving, setSaving] = useState(false);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [linkDialogTemplate, setLinkDialogTemplate] = useState<FormTemplate | null>(null);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [tplRes, svcRes] = await Promise.all([
      supabase.from('form_templates').select('*').order('name'),
      supabase.from('services').select('id, name, form_template_id'),
    ]);
    if (tplRes.data) setTemplates(tplRes.data as FormTemplate[]);
    if (svcRes.data) setServices(svcRes.data as ServiceRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setFields([]);
    setEditingTemplate(null);
  };

  const openEdit = (t: FormTemplate) => {
    setName(t.name);
    setDescription(t.description || '');
    setFields([...t.fields]);
    setEditingTemplate(t);
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || fields.length === 0) return;
    setSaving(true);

    const orderedFields = fields.map((f, i) => ({ ...f, order: i + 1 }));
    const payload = { name: name.trim(), description: description.trim() || null, fields: orderedFields };

    if (editingTemplate) {
      await fetch('/api/form-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingTemplate.id, ...payload }),
      });
    } else {
      await fetch('/api/form-templates', {
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

  const handleDelete = async (id: string) => {
    await supabase.from('form_templates').delete().eq('id', id);
    fetchData();
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await fetch('/api/form-templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !isActive }),
    });
    fetchData();
  };

  const addField = (type: FormField['type']) => {
    const newField: FormField = {
      id: nextFieldId(),
      type,
      label: '',
      required: false,
      order: fields.length + 1,
    };
    if (type === 'select' || type === 'multiselect') {
      newField.options = [];
    }
    setFields(prev => [...prev, newField]);
    setAddFieldOpen(false);
  };

  const updateField = (idx: number, f: FormField) => {
    setFields(prev => prev.map((field, i) => i === idx ? f : field));
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= fields.length) return;
    setFields(prev => {
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  };

  const deleteField = (idx: number) => {
    setFields(prev => prev.filter((_, i) => i !== idx));
  };

  const getLinkedServicesCount = (templateId: string) =>
    services.filter(s => s.form_template_id === templateId).length;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Szablony formularzy"
        subtitle={`${templates.length} szablonów`}
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <Button className="h-9 rounded-xl text-sm gap-2 bg-orange-500 hover:bg-orange-600" onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Dodaj szablon
          </Button>
        }
      />

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <ClipboardList className="h-12 w-12 text-gray-300" />
            <p className="text-gray-500">Brak szablonów formularzy</p>
            <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Utwórz pierwszy szablon
            </Button>
          </div>
        ) : (
          <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" variants={ANIM.container} initial="hidden" animate="show">
            {templates.map(tpl => {
              const linkedCount = getLinkedServicesCount(tpl.id);
              return (
                <motion.div key={tpl.id} variants={ANIM.item} whileHover={{ y: -2 }}>
                  <Card className={`rounded-2xl border-gray-100 shadow-sm ${!tpl.is_active ? 'opacity-50' : ''}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-gray-900 truncate">{tpl.name}</h3>
                          {tpl.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{tpl.description}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs text-gray-500">{tpl.fields.length} pól</span>
                        <span className="text-xs text-orange-600 font-medium">{linkedCount} usług</span>
                      </div>

                      {/* Field type pills */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {tpl.fields.slice(0, 5).map(f => {
                          const Icon = getFieldIcon(f.type);
                          return (
                            <span key={f.id} className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              <Icon className="h-2.5 w-2.5" /> {f.label || f.type}
                            </span>
                          );
                        })}
                        {tpl.fields.length > 5 && (
                          <span className="text-[10px] text-gray-400">+{tpl.fields.length - 5}</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t">
                        <div className="flex items-center gap-2">
                          <Switch checked={tpl.is_active} onCheckedChange={() => toggleActive(tpl.id, tpl.is_active)} />
                          <span className="text-xs text-gray-500">{tpl.is_active ? 'Aktywny' : 'Nieaktywny'}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-orange-500" onClick={() => setLinkDialogTemplate(tpl)} title="Powiąż z usługami">
                            <Link2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEdit(tpl)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-red-500" onClick={() => handleDelete(tpl.id)}>
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

      {/* Template Editor Dialog */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edytuj szablon' : 'Nowy szablon formularza'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-2">
              <Label>Nazwa szablonu</Label>
              <Input required value={name} onChange={e => setName(e.target.value)} placeholder="np. Protokół wymiany opon" />
            </div>
            <div className="space-y-2">
              <Label>Opis (opcjonalnie)</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Krótki opis formularza..." rows={2} />
            </div>

            {/* Fields */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Pola formularza ({fields.length})</Label>
              </div>
              {fields.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Dodaj pola do formularza</p>
              )}
              {fields.map((field, idx) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  index={idx}
                  total={fields.length}
                  onChange={f => updateField(idx, f)}
                  onMove={dir => moveField(idx, dir)}
                  onDelete={() => deleteField(idx)}
                />
              ))}

              {/* Add field selector */}
              {addFieldOpen ? (
                <div className="border-2 border-dashed border-orange-300 rounded-xl p-4 bg-orange-50/50">
                  <p className="text-xs font-semibold text-gray-500 mb-3">Wybierz typ pola</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {FIELD_TYPES.map(ft => (
                      <button
                        key={ft.value}
                        type="button"
                        onClick={() => addField(ft.value)}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-200 bg-white hover:border-orange-400 hover:bg-orange-50 transition-colors"
                      >
                        <ft.icon className="h-5 w-5 text-orange-600" />
                        <span className="text-xs font-medium text-gray-700">{ft.label}</span>
                      </button>
                    ))}
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setAddFieldOpen(false)}>
                    Anuluj
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed border-gray-300 text-gray-500 hover:border-orange-400 hover:text-orange-600"
                  onClick={() => setAddFieldOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" /> Dodaj pole
                </Button>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button
                type="submit"
                disabled={saving || !name.trim() || fields.length === 0}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {saving ? 'Zapisywanie...' : 'Zapisz szablon'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link services dialog */}
      {linkDialogTemplate && (
        <LinkServicesDialog
          open={!!linkDialogTemplate}
          onOpenChange={o => { if (!o) setLinkDialogTemplate(null); }}
          templateId={linkDialogTemplate.id}
          templateName={linkDialogTemplate.name}
          services={services}
          onRefresh={fetchData}
        />
      )}
    </div>
  );
}
