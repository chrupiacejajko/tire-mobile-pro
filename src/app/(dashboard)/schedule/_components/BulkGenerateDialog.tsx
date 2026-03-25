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
  to_date: string;
  start_time: string;
  end_time: string;
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
  function toggleDutyEmployee(empId: string) {
    setDutyForm(prev => {
      const groups = { ...prev.employee_groups };
      if (groups[empId]) { delete groups[empId]; } else { groups[empId] = 'A'; }
      return { ...prev, employee_groups: groups };
    });
  }

  function setDutyGroup(empId: string, group: 'A' | 'B') {
    setDutyForm(prev => ({ ...prev, employee_groups: { ...prev.employee_groups, [empId]: group } }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" /> Generuj dyżury 48/48
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Pracownicy i grupy</Label>
            <p className="text-[11px] text-gray-400">
              Grupa A — dyżur zaczyna od daty startowej. Grupa B — startuje 2 dni później.
            </p>
            <div className="max-h-52 overflow-y-auto border border-gray-100 rounded-xl p-2 space-y-1">
              {employees.map(e => {
                const selected = !!dutyForm.employee_groups[e.id];
                return (
                  <div key={e.id} className={cn('flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors', selected ? 'bg-emerald-50' : 'hover:bg-gray-50')}>
                    <Checkbox checked={selected} onCheckedChange={() => toggleDutyEmployee(e.id)} />
                    <span className="text-sm flex-1 font-medium">{e.name}</span>
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
            {Object.keys(dutyForm.employee_groups).length > 0 && (
              <p className="text-[11px] text-gray-400">
                Wybrano {Object.keys(dutyForm.employee_groups).length} pracowników
                — A: {Object.values(dutyForm.employee_groups).filter(g => g === 'A').length},
                B: {Object.values(dutyForm.employee_groups).filter(g => g === 'B').length}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Od</Label>
              <Input type="date" value={dutyForm.from_date} onChange={e => setDutyForm(f => ({ ...f, from_date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Do</Label>
              <Input type="date" value={dutyForm.to_date} onChange={e => setDutyForm(f => ({ ...f, to_date: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Godzina startu</Label>
              <Input type="time" value={dutyForm.start_time} onChange={e => setDutyForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Godzina końca</Label>
              <Input type="time" value={dutyForm.end_time} onChange={e => setDutyForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              disabled={Object.keys(dutyForm.employee_groups).length === 0 || !dutyForm.from_date || !dutyForm.to_date}
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
