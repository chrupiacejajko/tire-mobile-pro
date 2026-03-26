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
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';

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
  id: string;
  employee_id: string;
  start_at: string;           // datetime-local format: YYYY-MM-DDTHH:MM
  duration_hours: number;
  vehicle_id: string;
  region_id: string;
  notes: string;
  isNew: boolean;
}

// ─── Duration presets ────────────────────────────────────────────────────────

const DURATION_PRESETS = [
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '48h', hours: 48 },
  { label: '72h', hours: 72 },
];

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
  // Compute end datetime for display
  const endAt = editForm.start_at
    ? new Date(new Date(editForm.start_at).getTime() + editForm.duration_hours * 3600_000)
    : null;
  const endStr = endAt
    ? `${String(endAt.getDate()).padStart(2, '0')}.${String(endAt.getMonth() + 1).padStart(2, '0')} ${String(endAt.getHours()).padStart(2, '0')}:${String(endAt.getMinutes()).padStart(2, '0')}`
    : '';

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
              <SelectTrigger>
                <span className={editForm.employee_id ? 'text-gray-900' : 'text-gray-400 text-sm'}>
                  {editForm.employee_id
                    ? (employees.find(e => e.id === editForm.employee_id)?.name || 'Wybierz pracownika')
                    : 'Wybierz pracownika'}
                </span>
              </SelectTrigger>
              <SelectContent>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Start datetime */}
          <div className="space-y-2">
            <Label>Początek dyżuru</Label>
            <Input type="datetime-local" value={editForm.start_at}
              onChange={e => setEditForm(f => ({ ...f, start_at: e.target.value }))}
            />
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label>Czas trwania (godziny)</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={168} step={0.5}
                value={editForm.duration_hours}
                onChange={e => setEditForm(f => ({ ...f, duration_hours: Number(e.target.value) || 1 }))}
                className="w-24"
              />
              <div className="flex gap-1">
                {DURATION_PRESETS.map(p => (
                  <button key={p.hours} type="button"
                    onClick={() => setEditForm(f => ({ ...f, duration_hours: p.hours }))}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                      editForm.duration_hours === p.hours
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {endStr && (
              <p className="text-xs text-gray-400">
                Koniec: {endStr} ({Math.round(editForm.duration_hours)}h = {Math.ceil(editForm.duration_hours / 24)} dni)
              </p>
            )}
          </div>

          {/* Vehicle */}
          <div className="space-y-2">
            <Label>Pojazd</Label>
            <Select value={editForm.vehicle_id || '__none__'}
              onValueChange={v => setEditForm(f => ({ ...f, vehicle_id: v === '__none__' ? '' : (v ?? '') }))}>
              <SelectTrigger>
                <span className={editForm.vehicle_id ? 'text-gray-900' : 'text-gray-400 text-sm'}>
                  {editForm.vehicle_id
                    ? (() => { const v = vehicles.find(v => v.id === editForm.vehicle_id); return v ? `${v.plate_number} (${v.brand} ${v.model})` : '— Brak —'; })()
                    : '— Brak —'}
                </span>
              </SelectTrigger>
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
            <Select value={editForm.region_id || '__none__'}
              onValueChange={v => setEditForm(f => ({ ...f, region_id: v === '__none__' ? '' : (v ?? '') }))}>
              <SelectTrigger>
                <span className={editForm.region_id ? 'text-gray-900' : 'text-gray-400 text-sm'}>
                  {editForm.region_id
                    ? (() => { const r = regions.find(r => r.id === editForm.region_id); return r ? r.name : '— Brak —'; })()
                    : '— Brak —'}
                </span>
              </SelectTrigger>
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
              <Button className="bg-blue-600 hover:bg-blue-700 gap-1.5" onClick={onSave} disabled={savingSchedule || !editForm.employee_id}>
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
