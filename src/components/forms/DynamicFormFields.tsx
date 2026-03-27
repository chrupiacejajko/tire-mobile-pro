'use client';

import { useRef } from 'react';
import { Camera, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FormField {
  id: string;
  type:
    | 'text'
    | 'number'
    | 'boolean'
    | 'select'
    | 'multiselect'
    | 'photo'
    | 'date'
    | 'datetime'
    | 'time'
    | 'signature'
    | 'location';
  label: string;
  required: boolean;
  order: number;
  options?: string[];
  min?: number;
  max?: number;
}

export interface FormTemplateData {
  id: string;
  name: string;
  fields: FormField[];
}

// ── Signature Canvas ─────────────────────────────────────────────────────────

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

// ── Dynamic Form Renderer ────────────────────────────────────────────────────

export default function DynamicFormFields({
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
                  // eslint-disable-next-line @next/next/no-img-element
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

            {field.type === 'datetime' && (
              <input
                type="datetime-local"
                value={formData[field.id] || ''}
                onChange={e => onDataChange(field.id, e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400"
              />
            )}

            {field.type === 'time' && (
              <input
                type="time"
                value={formData[field.id] || ''}
                onChange={e => onDataChange(field.id, e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400"
              />
            )}

            {field.type === 'location' && (
              <input
                type="text"
                value={formData[field.id] || ''}
                onChange={e => onDataChange(field.id, e.target.value)}
                placeholder="np. 52.2297, 21.0122"
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
