'use client';

import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { EmployeeInfo } from './ShiftDialog';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DutyForm {
  employee_groups: Record<string, 'A' | 'B'>;
  from_date: string;
  start_time: string;
  end_time: string;
  duration_hours: string;
  shift_count: string;
}

// ─── BulkGenerateDialog Component ───────────────────────────────────────────

export function BulkGenerateDialog({
  open,
  onOpenChange,
  dutyForm,
  setDutyForm,
  employees,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dutyForm: DutyForm;
  setDutyForm: React.Dispatch<React.SetStateAction<DutyForm>>;
  employees: EmployeeInfo[];
  onGenerate: () => void;
}) {
  const selectedCount = Object.keys(dutyForm.employee_groups).length;
  const MAX_EMPLOYEES = 2;

  function toggleDutyEmployee(empId: string) {
    setDutyForm(prev => {
      const groups = { ...prev.employee_groups };
      if (groups[empId]) {
        delete groups[empId];
      } else {
        // Max 2 employees
        if (Object.keys(groups).length >= MAX_EMPLOYEES) return prev;
        groups[empId] = 'A';
      }
      return { ...prev, employee_groups: groups };
    });
  }

  function setDutyGroup(empId: string, group: 'A' | 'B') {
    setDutyForm(prev => ({ ...prev, employee_groups: { ...prev.employee_groups, [empId]: group } }));
  }

  // Compute end_date and end_time from start + duration + count
  const durationH = Number(dutyForm.duration_hours) || 48;
  const shiftCount = Number(dutyForm.shift_count) || 1;
  const totalDays = Math.ceil((durationH * shiftCount * 2) / 24) + 4; // rough estimate for 48/48

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" /> Generuj dyżury
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Employee selection (max 2) */}
          <div className="space-y-2">
            <Label>Pracownicy (maks. {MAX_EMPLOYEES})</Label>
            <p className="text-[11px] text-gray-400">
              Grupa A — dyżur zaczyna od daty startowej. Grupa B — startuje po przerwie.
            </p>
            <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-xl p-2 space-y-1">
              {employees.map(e => {
                const selected = !!dutyForm.employee_groups[e.id];
                const disabled = !selected && selectedCount >= MAX_EMPLOYEES;
                return (
                  <div key={e.id} className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors',
                    selected ? 'bg-emerald-50' : disabled ? 'opacity-40' : 'hover:bg-gray-50',
                  )}>
                    <Checkbox
                      checked={selected}
                      disabled={disabled}
                      onCheckedChange={() => toggleDutyEmployee(e.id)}
                    />
                    <span className="text-sm flex-1 font-medium">{e.name}</span>
                    {e.region_name && (
                      <span className="text-[10px] text-gray-400 mr-2">{e.region_name}</span>
                    )}
                    {selected && (
                      <div className="flex items-center gap-1">
                        {(['A', 'B'] as const).map(g => (
                          <button
                            key={g} type="button"
                            onClick={() => setDutyGroup(e.id, g)}
                            className={cn(
                              'px-2.5 py-0.5 text-[11px] font-bold rounded-lg transition-colors',
                              dutyForm.employee_groups[e.id] === g
                                ? g === 'A' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
                            )}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {selectedCount > 0 && (
              <p className="text-[11px] text-gray-400">
                Wybrano {selectedCount}/{MAX_EMPLOYEES} pracowników
                — A: {Object.values(dutyForm.employee_groups).filter(g => g === 'A').length},
                B: {Object.values(dutyForm.employee_groups).filter(g => g === 'B').length}
              </p>
            )}
          </div>

          {/* Schedule params */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data rozpoczęcia</Label>
              <Input type="date" value={dutyForm.from_date}
                onChange={e => setDutyForm(f => ({ ...f, from_date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Czas trwania dyżuru (godz.)</Label>
              <Input type="number" min="1" max="96" value={dutyForm.duration_hours}
                onChange={e => setDutyForm(f => ({ ...f, duration_hours: e.target.value }))}
                placeholder="48" />
              <p className="text-[10px] text-gray-400">48 = 2 dni ON, 24 = 1 dzień ON</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Godzina startu</Label>
              <Input type="time" value={dutyForm.start_time}
                onChange={e => setDutyForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Godzina końca</Label>
              <Input type="time" value={dutyForm.end_time}
                onChange={e => setDutyForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ilość rotacji do wygenerowania</Label>
            <Input type="number" min="1" max="30" value={dutyForm.shift_count}
              onChange={e => setDutyForm(f => ({ ...f, shift_count: e.target.value }))}
              placeholder="4" className="max-w-[120px]" />
          </div>

          {/* Summary */}
          {dutyForm.from_date && (
            <div className="p-3 bg-emerald-50 rounded-xl text-xs text-emerald-700">
              <strong>Podsumowanie:</strong> {Math.ceil(durationH / 24)} dni ON / {Math.ceil(durationH / 24)} dni OFF × {shiftCount} rotacji,
              start {dutyForm.from_date}, godziny {dutyForm.start_time || '07:00'}–{dutyForm.end_time || '23:00'}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              disabled={selectedCount === 0 || !dutyForm.from_date}
              onClick={onGenerate}
            >
              <Shield className="h-4 w-4" /> Generuj
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
