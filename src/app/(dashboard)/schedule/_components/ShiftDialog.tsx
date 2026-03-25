'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { WorkSchedule } from './ShiftBlock';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EmployeeInfo {
  id: string;
  name: string;
  region_id: string | null;
  default_vehicle_id: string | null;
  region_name?: string | null;
  region_color?: string | null;
}

export interface VehicleInfo {
  id: string;
  plate_number: string;
  brand: string;
  model: string;
  is_active: boolean;
}

export interface RegionInfo {
  id: string;
  name: string;
  color: string;
}

export interface EditForm {
  employee_id: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  vehicle_id: string;
  region_id: string;
  notes: string;
  isNew: boolean;
  originalDate: string;
}

// ─── ShiftDialog Component ──────────────────────────────────────────────────

export function ShiftDialog({
  open,
  onOpenChange,
  editForm,
  setEditForm,
  employees,
  vehicles,
  regions,
  conflictError,
  savingSchedule,
  onSave,
  onDelete,
  onEmployeeChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editForm: EditForm;
  setEditForm: React.Dispatch<React.SetStateAction<EditForm>>;
  employees: EmployeeInfo[];
  vehicles: VehicleInfo[];
  regions: RegionInfo[];
  conflictError: string | null;
  savingSchedule: boolean;
  onSave: () => void;
  onDelete: () => void;
  onEmployeeChange: (empId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editForm.isNew ? 'Nowy dyżur' : 'Edytuj dyżur'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Employee */}
          <div className="space-y-2">
            <Label>Pracownik</Label>
            <Select value={editForm.employee_id} onValueChange={v => onEmployeeChange(v ?? '')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Początek dyżuru</Label>
              <Input type="date" value={editForm.start_date}
                onChange={e => {
                  const s = e.target.value;
                  const nextDay = new Date(s + 'T00:00:00');
                  nextDay.setDate(nextDay.getDate() + 1);
                  setEditForm(f => ({ ...f, start_date: s, end_date: nextDay.toISOString().split('T')[0] }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Godzina startu</Label>
              <Input type="time" value={editForm.start_time}
                onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Koniec dyżuru</Label>
              <Input type="date" value={editForm.end_date}
                onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Godzina końca</Label>
              <Input type="time" value={editForm.end_time}
                onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))}
              />
            </div>
          </div>

          {/* Vehicle */}
          <div className="space-y-2">
            <Label>Pojazd</Label>
            <Select value={editForm.vehicle_id}
              onValueChange={v => setEditForm(f => ({ ...f, vehicle_id: v === '__none__' ? '' : (v ?? '') }))}>
              <SelectTrigger><SelectValue placeholder="Wybierz pojazd" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Brak —</SelectItem>
                {vehicles.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.plate_number} ({v.brand} {v.model})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Region */}
          <div className="space-y-2">
            <Label>Obszar</Label>
            <Select value={editForm.region_id}
              onValueChange={v => setEditForm(f => ({ ...f, region_id: v === '__none__' ? '' : (v ?? '') }))}>
              <SelectTrigger><SelectValue placeholder="Wybierz obszar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Brak —</SelectItem>
                {regions.map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      {r.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notatki</Label>
            <Textarea value={editForm.notes} rows={2} placeholder="Opcjonalne…"
              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* Conflict error */}
          <AnimatePresence>
            {conflictError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
                <span>{conflictError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between pt-1">
            <div>
              {!editForm.isNew && (
                <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" /> Usuń
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
              <Button className="bg-blue-600 hover:bg-blue-700 gap-1.5" onClick={onSave} disabled={savingSchedule}>
                {savingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Zapisz
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
