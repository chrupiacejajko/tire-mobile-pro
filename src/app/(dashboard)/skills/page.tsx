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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Award } from 'lucide-react';
import type { Skill } from '@/lib/types';

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    const url = showActiveOnly ? '/api/skills?active=true' : '/api/skills';
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setSkills(data);
    }
    setLoading(false);
  }, [showActiveOnly]);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  const openAdd = () => {
    setEditingSkill(null);
    setForm({ name: '', description: '' });
    setDialogOpen(true);
  };

  const openEdit = (skill: Skill) => {
    setEditingSkill(skill);
    setForm({ name: skill.name, description: skill.description || '' });
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (editingSkill) {
      await fetch('/api/skills', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingSkill.id, name: form.name, description: form.description || null }),
      });
    } else {
      await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description || null }),
      });
    }

    setSaving(false);
    setDialogOpen(false);
    setEditingSkill(null);
    fetchSkills();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/skills?id=${id}`, { method: 'DELETE' });
    fetchSkills();
  };

  const handleToggleActive = async (skill: Skill) => {
    await fetch('/api/skills', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: skill.id, is_active: !skill.is_active }),
    });
    fetchSkills();
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Umiejętności"
        subtitle="Zarządzaj umiejętnościami pracowników"
        icon={<Award className="h-5 w-5" />}
        actions={
          <Button className="h-9 rounded-xl text-sm gap-2 bg-orange-500 hover:bg-orange-600" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Dodaj umiejętność
          </Button>
        }
      />
      <div className="p-6 space-y-6">
        {/* Filter toggle */}
        <div className="flex items-center gap-3">
          <Switch checked={showActiveOnly} onCheckedChange={v => setShowActiveOnly(!!v)} />
          <Label className="text-sm text-gray-600">Pokaż tylko aktywne</Label>
        </div>

        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
              </div>
            ) : skills.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <Award className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Brak umiejętności</p>
                <p className="text-sm mt-1">Dodaj pierwszą umiejętność</p>
              </div>
            ) : (
              <motion.div variants={ANIM.container} initial="hidden" animate="show">
                {/* Header */}
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
                      <Switch
                        checked={skill.is_active}
                        onCheckedChange={() => handleToggleActive(skill)}
                      />
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-orange-500 hover:text-orange-600 hover:bg-orange-50" onClick={() => openEdit(skill)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(skill.id)}>
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) setEditingSkill(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSkill ? 'Edytuj umiejętność' : 'Nowa umiejętność'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Nazwa</Label>
              <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="np. Serwis opon osobowych" />
            </div>
            <div className="space-y-2">
              <Label>Opis</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Opis umiejętności (opcjonalnie)" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600">
                {saving ? 'Zapisywanie...' : editingSkill ? 'Zapisz zmiany' : 'Dodaj'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
