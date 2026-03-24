'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin, Phone, CheckCircle, Navigation, Camera, ChevronDown,
  ChevronUp, Clock, Circle, Loader2, AlertCircle, Star, ArrowRight, Play,
  Compass, Check, Type, Hash, ToggleLeft, CheckSquare, Calendar, PenTool,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

// ── Shift types & helpers ────────────────────────────────────────────────────

interface Shift {
  id: string;
  employee_id: string;
  date: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
}

function formatShiftTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  status: string;
  priority: string;
  scheduled_time_start: string | null;
  time_window: string | null;
  description: string | null;
  notes: string | null;
  services: any[];
  client_name: string;
  client_phone: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  navigate_url: string | null;
  photos_taken: number;
}

interface SubTask {
  id: string;
  step_name: string;
  step_order: number;
  is_required: boolean;
  is_completed: boolean;
  completed_at: string | null;
  notes: string | null;
}

interface ClosureCode {
  id: string;
  label: string;
}

interface WorkerData {
  date: string;
  employee_id: string;
  tasks: Task[];
  stats: { total: number; completed: number; remaining: number; progress_pct: number };
  next_task_id: string | null;
}

interface NearbyOrder {
  id: string;
  client_name: string;
  address: string;
  distance_km: number;
  services: string[];
  time_window: string | null;
  priority: string;
  total_price: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIME_WINDOW_LABELS: Record<string, string> = {
  morning: '08:00–12:00',
  afternoon: '12:00–16:00',
  evening: '16:00–20:00',
};

const STATUS_CONFIG = {
  pending:     { label: 'Oczekuje',   bg: 'bg-gray-100',    text: 'text-gray-600',    dot: 'bg-gray-400' },
  in_progress: { label: 'W trakcie',  bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  completed:   { label: 'Ukończone',  bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled:   { label: 'Anulowane', bg: 'bg-red-100',     text: 'text-red-600',     dot: 'bg-red-400' },
};

// ── Form Field Types ──────────────────────────────────────────────────────────

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

interface FormTemplateData {
  id: string;
  name: string;
  fields: FormField[];
}

// ── Signature Canvas ──────────────────────────────────────────────────────────

function SignatureCanvas({
  value,
  onChange,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => {
    drawing.current = false;
    if (canvasRef.current) {
      onChange(canvasRef.current.toDataURL());
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };

  return (
    <div className="space-y-1">
      <canvas
        ref={canvasRef}
        width={300}
        height={120}
        className="w-full border border-gray-300 rounded-xl bg-white touch-none"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <button type="button" onClick={clearCanvas} className="text-xs text-gray-400 hover:text-red-500">
        Wyczysc podpis
      </button>
    </div>
  );
}

// ── Dynamic Form Renderer ─────────────────────────────────────────────────────

function DynamicFormFields({
  template,
  formData,
  onDataChange,
  errors,
}: {
  template: FormTemplateData;
  formData: Record<string, any>;
  onDataChange: (fieldId: string, value: any) => void;
  errors: Record<string, string>;
}) {
  const sortedFields = [...template.fields].sort((a, b) => a.order - b.order);
  const photoFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handlePhotoFile = (fieldId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      onDataChange(fieldId, ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">{template.name}</p>
      {sortedFields.map(field => {
        const err = errors[field.id];
        return (
          <div key={field.id} className="space-y-1">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
              {field.label}
              {field.required && <span className="text-red-400 text-xs">*</span>}
            </label>

            {field.type === 'text' && (
              <input
                type="text"
                value={formData[field.id] || ''}
                onChange={e => onDataChange(field.id, e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400"
              />
            )}

            {field.type === 'number' && (
              <input
                type="number"
                value={formData[field.id] ?? ''}
                min={field.min}
                max={field.max}
                step="any"
                onChange={e => onDataChange(field.id, e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400"
                placeholder={field.min !== undefined && field.max !== undefined ? `${field.min} - ${field.max}` : ''}
              />
            )}

            {field.type === 'boolean' && (
              <button
                type="button"
                onClick={() => onDataChange(field.id, !formData[field.id])}
                className={cn(
                  'flex items-center gap-3 w-full p-2.5 rounded-xl border transition-colors',
                  formData[field.id] ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'
                )}
              >
                <div className={cn(
                  'h-6 w-10 rounded-full transition-colors relative',
                  formData[field.id] ? 'bg-emerald-500' : 'bg-gray-300'
                )}>
                  <div className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    formData[field.id] ? 'translate-x-4' : 'translate-x-0.5'
                  )} />
                </div>
                <span className="text-sm text-gray-700">{formData[field.id] ? 'Tak' : 'Nie'}</span>
              </button>
            )}

            {field.type === 'select' && (
              <select
                value={formData[field.id] || ''}
                onChange={e => onDataChange(field.id, e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-sm bg-white"
              >
                <option value="">Wybierz...</option>
                {(field.options || []).map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}

            {field.type === 'multiselect' && (
              <div className="space-y-1.5">
                {(field.options || []).map(opt => {
                  const selected = Array.isArray(formData[field.id]) && formData[field.id].includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        const current: string[] = Array.isArray(formData[field.id]) ? formData[field.id] : [];
                        const next = selected ? current.filter(v => v !== opt) : [...current, opt];
                        onDataChange(field.id, next);
                      }}
                      className={cn(
                        'flex items-center gap-2 w-full p-2 rounded-lg border text-sm transition-colors text-left',
                        selected ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-700'
                      )}
                    >
                      <div className={cn(
                        'h-4 w-4 rounded border flex items-center justify-center flex-shrink-0',
                        selected ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300'
                      )}>
                        {selected && <Check className="h-3 w-3" />}
                      </div>
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {field.type === 'photo' && (
              <div>
                <input
                  ref={el => { photoFileRefs.current[field.id] = el; }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => handlePhotoFile(field.id, e)}
                />
                <button
                  type="button"
                  onClick={() => photoFileRefs.current[field.id]?.click()}
                  className="w-full border-2 border-dashed border-gray-300 rounded-xl py-3 flex items-center justify-center gap-2 text-gray-400 hover:border-orange-300 hover:text-orange-400 transition-colors text-sm"
                >
                  <Camera className="h-5 w-5" />
                  {formData[field.id] ? 'Zmien zdjecie' : 'Zrob zdjecie'}
                </button>
                {formData[field.id] && (
                  <img src={formData[field.id]} alt="" className="h-20 w-20 mt-2 rounded-lg object-cover" />
                )}
              </div>
            )}

            {field.type === 'date' && (
              <input
                type="date"
                value={formData[field.id] || ''}
                onChange={e => onDataChange(field.id, e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400"
              />
            )}

            {field.type === 'signature' && (
              <SignatureCanvas
                value={formData[field.id] || ''}
                onChange={v => onDataChange(field.id, v)}
              />
            )}

            {err && <p className="text-xs text-red-500">{err}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ── Complete Modal ─────────────────────────────────────────────────────────────

function CompleteModal({
  task,
  onConfirm,
  onClose,
  closureCodes,
  employeeId,
}: {
  task: Task;
  onConfirm: (notes: string, photos: string[], closureCodeId: string) => Promise<void>;
  onClose: () => void;
  closureCodes: ClosureCode[];
  employeeId: string | null;
}) {
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [closureCode, setClosureCode] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Form templates state
  const [formTemplates, setFormTemplates] = useState<FormTemplateData[]>([]);
  const [formDataMap, setFormDataMap] = useState<Record<string, Record<string, any>>>({});
  const [formErrors, setFormErrors] = useState<Record<string, Record<string, string>>>({});
  const [formsLoading, setFormsLoading] = useState(true);

  // Fetch form templates linked to this task's services
  useEffect(() => {
    const fetchFormTemplates = async () => {
      setFormsLoading(true);
      try {
        const serviceIds = (task.services || [])
          .map((s: any) => typeof s === 'string' ? null : s?.service_id)
          .filter(Boolean);

        if (serviceIds.length === 0) {
          setFormsLoading(false);
          return;
        }

        // Fetch services with their form_template_ids
        const svcRes = await fetch(`/api/form-templates?all=true`);
        const svcData = await svcRes.json();
        const allTemplates: FormTemplateData[] = svcData.templates || [];

        // Fetch which services are linked to which template
        // We need to check the services table for form_template_id
        const serviceCheckRes = await fetch('/api/form-templates/linked-services?' + serviceIds.map((id: string) => `service_ids=${id}`).join('&'));
        let linkedTemplateIds: string[] = [];

        if (serviceCheckRes.ok) {
          const linkData = await serviceCheckRes.json();
          linkedTemplateIds = linkData.template_ids || [];
        } else {
          // Fallback: fetch services directly to check form_template_id
          // This handles case when linked-services endpoint doesn't exist
          setFormsLoading(false);
          return;
        }

        const templates = allTemplates.filter(t => linkedTemplateIds.includes(t.id));
        setFormTemplates(templates);

        // Initialize form data
        const initData: Record<string, Record<string, any>> = {};
        for (const tpl of templates) {
          initData[tpl.id] = {};
          for (const field of tpl.fields) {
            if (field.type === 'boolean') initData[tpl.id][field.id] = false;
            else if (field.type === 'multiselect') initData[tpl.id][field.id] = [];
            else initData[tpl.id][field.id] = '';
          }
        }
        setFormDataMap(initData);
      } catch {
        // Silently fail — forms are optional
      }
      setFormsLoading(false);
    };

    fetchFormTemplates();
  }, [task.services]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        setPhotos(prev => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const updateFormData = (templateId: string, fieldId: string, value: any) => {
    setFormDataMap(prev => ({
      ...prev,
      [templateId]: { ...prev[templateId], [fieldId]: value },
    }));
    // Clear error for this field
    setFormErrors(prev => {
      const tplErrors = { ...prev[templateId] };
      delete tplErrors[fieldId];
      return { ...prev, [templateId]: tplErrors };
    });
  };

  const validateForms = (): boolean => {
    const allErrors: Record<string, Record<string, string>> = {};
    let hasErrors = false;

    for (const tpl of formTemplates) {
      const tplErrors: Record<string, string> = {};
      const data = formDataMap[tpl.id] || {};

      for (const field of tpl.fields) {
        const value = data[field.id];
        if (field.required) {
          const isEmpty = value === undefined || value === null || value === '' ||
            (Array.isArray(value) && value.length === 0);
          if (isEmpty) {
            tplErrors[field.id] = 'Pole wymagane';
            hasErrors = true;
          }
        }
      }
      allErrors[tpl.id] = tplErrors;
    }

    setFormErrors(allErrors);
    return !hasErrors;
  };

  const handleConfirm = async () => {
    if (!closureCode) return;

    // Validate forms first
    if (formTemplates.length > 0 && !validateForms()) return;

    setLoading(true);
    try {
      // Submit form data for each template
      for (const tpl of formTemplates) {
        await fetch('/api/form-submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: task.id,
            template_id: tpl.id,
            employee_id: employeeId,
            data: formDataMap[tpl.id] || {},
          }),
        });
      }

      // Then complete the order
      await onConfirm(notes, photos, closureCode);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-0">
      <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto" />
        <h2 className="text-lg font-bold text-gray-900">Zakończ zlecenie</h2>
        <p className="text-sm text-gray-500">{task.client_name} — {task.address}</p>

        {/* Form Templates */}
        {formsLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 text-orange-400 animate-spin" />
            <span className="text-sm text-gray-400 ml-2">Ladowanie formularzy...</span>
          </div>
        ) : formTemplates.length > 0 && (
          <div className="space-y-4 border-b border-gray-100 pb-4">
            {formTemplates.map(tpl => (
              <DynamicFormFields
                key={tpl.id}
                template={tpl}
                formData={formDataMap[tpl.id] || {}}
                onDataChange={(fieldId, value) => updateFormData(tpl.id, fieldId, value)}
                errors={formErrors[tpl.id] || {}}
              />
            ))}
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Notatki (opcjonalne)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Opisz wykonaną pracę, uwagi..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 resize-none"
          />
        </div>

        {/* Photo */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Zdjęcia dokumentacyjne {photos.length > 0 && <span className="text-orange-500">({photos.length})</span>}
          </label>
          <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 rounded-xl py-4 flex flex-col items-center gap-2 text-gray-400 hover:border-orange-300 hover:text-orange-400 transition-colors"
          >
            <Camera className="h-6 w-6" />
            <span className="text-sm">Zrób zdjęcie lub wybierz z galerii</span>
          </button>
          {photos.length > 0 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <img key={i} src={p} alt="" className="h-16 w-16 rounded-lg object-cover flex-shrink-0" />
              ))}
            </div>
          )}
        </div>

        {/* Closure code */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Powód zakończenia</label>
          <select
            value={closureCode}
            onChange={e => setClosureCode(e.target.value)}
            className="w-full p-2.5 rounded-xl border border-gray-200 text-sm bg-white"
          >
            <option value="">Wybierz...</option>
            {closureCodes.map(cc => (
              <option key={cc.id} value={cc.id}>{cc.label}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 font-medium">
            Anuluj
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !closureCode}
            className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
            Ukończ
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  isNext,
  onComplete,
  subtasks,
  enforceOrder,
  onExpand,
  onCompleteSubtask,
}: {
  task: Task;
  isNext: boolean;
  onComplete: (t: Task) => void;
  subtasks: SubTask[];
  enforceOrder: boolean;
  onExpand: (orderId: string) => void;
  onCompleteSubtask: (subtaskId: string) => void;
}) {
  const [expanded, setExpanded] = useState(isNext && task.status !== 'completed');
  const cfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const done = task.status === 'completed';

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${
      done ? 'border-emerald-200 bg-emerald-50/40 opacity-70' :
      isNext ? 'border-orange-300 bg-orange-50/40 shadow-lg shadow-orange-100' :
      'border-gray-200 bg-white'
    }`}>
      {/* Header */}
      <button
        className="w-full px-4 py-4 flex items-start gap-3 text-left"
        onClick={() => {
          const willExpand = !expanded;
          setExpanded(willExpand);
          if (willExpand) onExpand(task.id);
        }}
      >
        {/* Status icon */}
        <div className="mt-0.5 flex-shrink-0">
          {done
            ? <CheckCircle className="h-6 w-6 text-emerald-500" />
            : isNext
              ? <div className="h-6 w-6 rounded-full bg-orange-500 flex items-center justify-center"><ArrowRight className="h-3.5 w-3.5 text-white" /></div>
              : <Circle className="h-6 w-6 text-gray-300" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={`font-semibold text-sm ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
              {task.client_name}
            </p>
            {task.priority === 'urgent' && (
              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">PILNE</span>
            )}
            {isNext && !done && (
              <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">NASTĘPNE</span>
            )}
          </div>
          <p className="text-xs text-gray-400 truncate flex items-center gap-1">
            <MapPin className="h-3 w-3 flex-shrink-0" />{task.address}
          </p>
          <div className="flex items-center gap-3 mt-1">
            {task.scheduled_time_start && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="h-3 w-3" />{task.scheduled_time_start}
              </span>
            )}
            {task.time_window && (
              <span className="text-xs text-blue-500">{TIME_WINDOW_LABELS[task.time_window]}</span>
            )}
            {task.distance_km !== null && !done && (
              <span className="text-xs text-gray-400">{task.distance_km} km</span>
            )}
            {task.photos_taken > 0 && (
              <span className="text-xs text-gray-400 flex items-center gap-0.5">
                <Camera className="h-3 w-3" />{task.photos_taken}
              </span>
            )}
          </div>
        </div>

        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />}
      </button>

      {/* Expanded */}
      {expanded && !done && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {task.description && (
            <p className="text-sm text-gray-600">{task.description}</p>
          )}

          {task.services.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {task.services.map((s: any, i: number) => (
                <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                  {typeof s === 'string' ? s : s?.name ?? ''}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {task.navigate_url && (
              <a
                href={task.navigate_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white font-medium text-sm"
              >
                <Navigation className="h-4 w-4" />
                Nawiguj
              </a>
            )}
            {task.client_phone && (
              <a
                href={`tel:${task.client_phone}`}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm"
              >
                <Phone className="h-4 w-4" />
                Zadzwoń
              </a>
            )}
          </div>

          {/* Czynności */}
          {subtasks.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Czynności</p>
              {subtasks.map((st, i) => {
                const canComplete = !enforceOrder || subtasks.slice(0, i).every(s => s.is_completed);
                return (
                  <div key={st.id} className={cn(
                    'flex items-center gap-3 p-2.5 rounded-xl border transition-all',
                    st.is_completed ? 'bg-emerald-50 border-emerald-200' : canComplete ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'
                  )}>
                    <button
                      disabled={st.is_completed || !canComplete}
                      onClick={() => onCompleteSubtask(st.id)}
                      className={cn(
                        'h-6 w-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                        st.is_completed ? 'bg-emerald-500 border-emerald-500 text-white' : canComplete ? 'border-gray-300 hover:border-emerald-400' : 'border-gray-200'
                      )}
                    >
                      {st.is_completed && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm', st.is_completed ? 'text-emerald-700 line-through' : 'text-gray-800')}>
                        {st.step_order}. {st.step_name}
                      </p>
                      {st.is_required && !st.is_completed && (
                        <span className="text-[10px] text-red-400">Wymagane</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => onComplete(task)}
            className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-200"
          >
            <CheckCircle className="h-5 w-5" />
            Zakończ zlecenie
          </button>
        </div>
      )}
    </div>
  );
}

// ── Nearby Order Card ──────────────────────────────────────────────────────────

function NearbyOrderCard({
  order,
  onAccept,
  accepting,
}: {
  order: NearbyOrder;
  onAccept: (orderId: string) => void;
  accepting: string | null;
}) {
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900">{order.client_name}</p>
          <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3 flex-shrink-0" />{order.address}
          </p>
        </div>
        <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
          {order.distance_km} km
        </span>
      </div>

      {order.services.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {order.services.map((s, i) => (
            <span key={i} className="text-xs bg-white text-gray-600 px-2 py-0.5 rounded-lg border border-gray-200">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-gray-500">
        {order.time_window && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />{TIME_WINDOW_LABELS[order.time_window] ?? order.time_window}
          </span>
        )}
        {order.priority === 'urgent' && (
          <span className="text-red-600 font-bold">PILNE</span>
        )}
        {order.total_price > 0 && (
          <span>{order.total_price} zl</span>
        )}
      </div>

      <button
        onClick={() => onAccept(order.id)}
        disabled={accepting === order.id}
        className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
      >
        {accepting === order.id ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle className="h-4 w-4" />
        )}
        Przyjmij zlecenie
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MobilePage() {
  const { user } = useAuth();
  const [data, setData] = useState<WorkerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [completeTask, setCompleteTask] = useState<Task | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftSeconds, setShiftSeconds] = useState(0);
  const [nearbyOrders, setNearbyOrders] = useState<NearbyOrder[]>([]);
  const [nearbyExpanded, setNearbyExpanded] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [acceptingOrder, setAcceptingOrder] = useState<string | null>(null);
  const [taskSubtasks, setTaskSubtasks] = useState<Record<string, SubTask[]>>({});
  const [enforceOrders, setEnforceOrders] = useState<Record<string, boolean>>({});
  const [closureCodes, setClosureCodes] = useState<ClosureCode[]>([]);

  // Get employee_id from user profile
  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/employees?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d?.employee_id) setEmployeeId(d.employee_id); })
      .catch(() => {});
  }, [user?.id]);

  const load = useCallback(async (empId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`/api/worker/tasks?date=${today}&employee_id=${empId}`);
    const json = await res.json();
    setData(json);
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);
    load(employeeId).finally(() => setLoading(false));
  }, [employeeId, load]);

  // Fetch shift on mount
  useEffect(() => {
    if (!employeeId) return;
    const today = new Date().toISOString().split('T')[0];
    fetch(`/api/shifts?date=${today}&employee_id=${employeeId}`)
      .then(r => r.json())
      .then(d => { if (d?.shift) setShift(d.shift); })
      .catch(() => {});
  }, [employeeId]);

  // Fetch nearby unassigned orders using GPS
  const loadNearby = useCallback(async () => {
    setNearbyLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 }),
      );
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(
        `/api/worker/nearby?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&date=${today}&radius=15`,
      );
      const json = await res.json();
      setNearbyOrders(json.nearby || []);
    } catch {
      // GPS denied or fetch failed — silently ignore
      setNearbyOrders([]);
    } finally {
      setNearbyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    loadNearby();
  }, [employeeId, loadNearby]);

  // Fetch closure codes on mount
  useEffect(() => {
    fetch('/api/closure-codes')
      .then(r => r.json())
      .then(d => { if (d?.codes) setClosureCodes(d.codes); })
      .catch(() => {});
  }, []);

  const fetchSubtasks = useCallback(async (orderId: string) => {
    try {
      const res = await fetch(`/api/subtasks?order_id=${orderId}`);
      const data = await res.json();
      setTaskSubtasks(prev => ({ ...prev, [orderId]: data.subtasks ?? [] }));
      setEnforceOrders(prev => ({ ...prev, [orderId]: data.enforce_order ?? false }));
    } catch { /* ignore */ }
  }, []);

  const handleCompleteSubtask = useCallback(async (subtaskId: string) => {
    if (!employeeId) return;
    try {
      const res = await fetch('/api/subtasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: subtaskId, is_completed: true, completed_by: employeeId }),
      });
      if (res.ok) {
        // Refresh subtasks for the affected task
        const data = await res.json();
        if (data.order_id) {
          fetchSubtasks(data.order_id);
        }
      }
    } catch { /* ignore */ }
  }, [employeeId, fetchSubtasks]);

  const handleAcceptOrder = async (orderId: string) => {
    if (!employeeId) return;
    setAcceptingOrder(orderId);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/planner/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, employee_id: employeeId, date: today }),
      });
      if (res.ok) {
        // Refresh both task list and nearby orders
        await Promise.all([load(employeeId), loadNearby()]);
      }
    } catch { /* ignore */ }
    finally { setAcceptingOrder(null); }
  };

  // Timer effect: tick every second while shift is active
  useEffect(() => {
    if (!shift || shift.clock_out) {
      setShiftSeconds(0);
      return;
    }
    const calcSeconds = () => {
      const elapsed = (Date.now() - new Date(shift.clock_in).getTime()) / 1000;
      return Math.max(0, Math.floor(elapsed));
    };
    setShiftSeconds(calcSeconds());
    const interval = setInterval(() => setShiftSeconds(calcSeconds()), 1000);
    return () => clearInterval(interval);
  }, [shift]);

  const handleClockIn = async () => {
    if (!employeeId) return;
    setShiftLoading(true);
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, action: 'clock_in' }),
      });
      const d = await res.json();
      if (d?.shift) setShift(d.shift);
    } catch { /* ignore */ }
    finally { setShiftLoading(false); }
  };

  const handleClockOut = async () => {
    if (!employeeId) return;
    setShiftLoading(true);
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, action: 'clock_out' }),
      });
      const d = await res.json();
      if (d?.shift) setShift(d.shift);
    } catch { /* ignore */ }
    finally { setShiftLoading(false); }
  };

  const handleBreak = async () => {
    if (!employeeId) return;
    setShiftLoading(true);
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, action: 'add_break', break_minutes: 15 }),
      });
      const d = await res.json();
      if (d?.shift) setShift(d.shift);
    } catch { /* ignore */ }
    finally { setShiftLoading(false); }
  };

  const handleComplete = async (notes: string, photos: string[], closureCodeId: string) => {
    if (!completeTask) return;
    const res = await fetch('/api/worker/tasks/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: completeTask.id, notes, photos, closure_code_id: closureCodeId }),
    });
    if (res.ok) {
      setSuccessId(completeTask.id);
      setCompleteTask(null);
      if (employeeId) load(employeeId);
      setTimeout(() => setSuccessId(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 text-orange-500 animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Ładowanie zleceń...</p>
        </div>
      </div>
    );
  }

  if (!employeeId || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-gray-300 mx-auto" />
          <p className="text-gray-500">Nie znaleziono profilu pracownika</p>
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen bg-gray-50 pb-safe">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-safe-top pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-400 capitalize">{today}</p>
            <h1 className="text-lg font-bold text-gray-900">Moje zlecenia</h1>
          </div>
          <button
            onClick={() => employeeId && load(employeeId)}
            className="p-2 rounded-xl bg-gray-100 text-gray-500"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{data.stats.completed} z {data.stats.total} ukończonych</span>
            <span className="font-semibold text-gray-900">{data.stats.progress_pct}%</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${data.stats.progress_pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Success toast */}
      {successId && (
        <div className="fixed top-24 left-4 right-4 z-50 bg-emerald-500 text-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="h-5 w-5" />
          <span className="font-medium">Zlecenie ukończone!</span>
        </div>
      )}

      {/* Shift section */}
      <div className="px-4 pt-4">
        {!shift || shift.clock_out ? (
          <motion.button
            onClick={handleClockIn}
            disabled={shiftLoading}
            whileTap={{ scale: 0.97 }}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-lg shadow-lg shadow-emerald-500/30 disabled:opacity-60"
          >
            {shiftLoading ? (
              <Loader2 className="h-5 w-5 inline mr-2 animate-spin" />
            ) : (
              <Play className="h-5 w-5 inline mr-2" />
            )}
            Rozpocznij zmian\u0119
          </motion.button>
        ) : (
          <div className="p-4 rounded-2xl bg-white border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Czas zmiany</p>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatShiftTime(shiftSeconds)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Przerwa</p>
                <p className="text-lg font-bold text-amber-600">{shift.break_minutes}m</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBreak}
                disabled={shiftLoading}
                className="flex-1 py-2.5 rounded-xl bg-amber-50 text-amber-700 font-semibold text-sm border border-amber-200 disabled:opacity-60"
              >
                \u2615 Przerwa +15min
              </button>
              <button
                onClick={handleClockOut}
                disabled={shiftLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-700 font-semibold text-sm border border-red-200 disabled:opacity-60"
              >
                \u23f9 Zako\u0144cz zmian\u0119
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="p-4 space-y-3">
        {data.stats.remaining === 0 && (
          <div className="text-center py-8 space-y-2">
            <div className="text-5xl">🎉</div>
            <p className="font-bold text-gray-900 text-lg">Wszystko gotowe!</p>
            <p className="text-gray-400 text-sm">Ukończyłeś wszystkie zlecenia na dziś</p>
          </div>
        )}

        {data.tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            isNext={task.id === data.next_task_id}
            onComplete={setCompleteTask}
            subtasks={taskSubtasks[task.id] ?? []}
            enforceOrder={enforceOrders[task.id] ?? false}
            onExpand={fetchSubtasks}
            onCompleteSubtask={handleCompleteSubtask}
          />
        ))}
      </div>

      {/* Nearby unassigned orders */}
      <div className="px-4 pb-4">
        <button
          onClick={() => setNearbyExpanded(e => !e)}
          className="w-full flex items-center justify-between py-3"
        >
          <div className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-blue-500" />
            <span className="font-semibold text-gray-800 text-sm">
              Zlecenia w okolicy
              {nearbyOrders.length > 0 && (
                <span className="ml-1 text-blue-600">({nearbyOrders.length})</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {nearbyLoading && <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />}
            {nearbyExpanded
              ? <ChevronUp className="h-4 w-4 text-gray-400" />
              : <ChevronDown className="h-4 w-4 text-gray-400" />
            }
          </div>
        </button>

        {nearbyExpanded && (
          <div className="space-y-3">
            {nearbyOrders.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                {nearbyLoading ? 'Szukam zlecen w okolicy...' : 'Brak zlecen w poblizu'}
              </p>
            ) : (
              nearbyOrders.map(order => (
                <NearbyOrderCard
                  key={order.id}
                  order={order}
                  onAccept={handleAcceptOrder}
                  accepting={acceptingOrder}
                />
              ))
            )}
            <button
              onClick={loadNearby}
              disabled={nearbyLoading}
              className="w-full py-2 text-sm text-blue-500 font-medium"
            >
              {nearbyLoading ? 'Odswiezam...' : 'Odswiez lokalizacje'}
            </button>
          </div>
        )}
      </div>

      {/* Complete modal */}
      {completeTask && (
        <CompleteModal
          task={completeTask}
          onConfirm={handleComplete}
          onClose={() => setCompleteTask(null)}
          closureCodes={closureCodes}
          employeeId={employeeId}
        />
      )}
    </div>
  );
}
