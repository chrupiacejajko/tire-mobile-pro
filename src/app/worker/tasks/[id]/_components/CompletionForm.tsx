'use client';

import { useState, useEffect, useRef } from 'react';
import { Camera, ImagePlus, X, Loader2, CheckCircle2, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import DynamicFormFields from '@/components/forms/DynamicFormFields';
import type { FormTemplateData } from '@/components/forms/DynamicFormFields';

interface ClosureCode {
  id: string;
  label: string;
  icon?: string;
  color?: string;
}

interface TaskService {
  name?: string;
  service_id?: string;
  price?: number;
  quantity?: number;
}

const DEFAULT_CLOSURE_CODES: ClosureCode[] = [
  { id: 'done_ok',       label: 'Wykonane',        color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { id: 'partial',       label: 'Czesciowo',        color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { id: 'client_absent', label: 'Klient nieobecny', color: 'text-red-700 bg-red-50 border-red-200' },
  { id: 'wrong_address', label: 'Zly adres',        color: 'text-orange-700 bg-orange-50 border-orange-200' },
  { id: 'rescheduled',   label: 'Przelozono',       color: 'text-blue-700 bg-blue-50 border-blue-200' },
  { id: 'other',         label: 'Inny',             color: 'text-gray-700 bg-gray-50 border-gray-200' },
];

function PhotoPreviews({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  if (files.length === 0) return null;
  return (
    <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
      {files.map((file, i) => {
        const url = URL.createObjectURL(file);
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative flex-shrink-0 w-20 h-20"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Zdjecie ${i + 1}`}
              className="w-20 h-20 object-cover rounded-2xl"
              onLoad={() => URL.revokeObjectURL(url)}
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg"
            >
              <X className="w-3 h-3" />
            </motion.button>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function CompletionForm({
  onComplete,
  completing,
  error,
  closureCodes,
  orderId,
  taskServices,
  employeeId,
}: {
  onComplete: (data: { notes: string; photos: File[]; closureCodeId: string | null }) => void;
  completing: boolean;
  error: string | null;
  closureCodes?: ClosureCode[];
  orderId?: string;
  taskServices?: Array<TaskService | string>;
  employeeId?: string | null;
}) {
  const [notes, setNotes]             = useState('');
  const [photos, setPhotos]           = useState<File[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ── Form templates state ─────────────────────────────────────────────────
  const [formTemplates, setFormTemplates]   = useState<FormTemplateData[]>([]);
  const [formDataMap, setFormDataMap]       = useState<Record<string, Record<string, any>>>({});
  const [formErrors, setFormErrors]         = useState<Record<string, Record<string, string>>>({});
  const [formsLoading, setFormsLoading]     = useState(false);
  const [formSubmitError, setFormSubmitError] = useState<string | null>(null);

  const codes = closureCodes ?? DEFAULT_CLOSURE_CODES;

  // ── Fetch linked form templates ──────────────────────────────────────────
  useEffect(() => {
    if (!taskServices || taskServices.length === 0) return;

    const fetchFormTemplates = async () => {
      setFormsLoading(true);
      try {
        const serviceIds = taskServices
          .map((s: any) => typeof s === 'string' ? null : s?.service_id)
          .filter(Boolean) as string[];

        if (serviceIds.length === 0) {
          setFormsLoading(false);
          return;
        }

        // Fetch all templates
        const svcRes = await fetch('/api/form-templates?all=true');
        const svcData = await svcRes.json();
        const allTemplates: FormTemplateData[] = (svcData.templates || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          fields: (t.fields || []).map((f: any) => ({
            id: f.id,
            type: f.field_type || f.type,
            label: f.name || f.label,
            required: f.is_required ?? f.required ?? false,
            order: f.sort_order ?? f.order ?? 0,
            options: f.options,
            min: f.min,
            max: f.max,
          })),
        }));

        // Fetch which services are linked to which templates
        const serviceCheckRes = await fetch(
          '/api/form-templates/linked-services?' +
          serviceIds.map(id => `service_ids=${id}`).join('&')
        );

        if (!serviceCheckRes.ok) {
          setFormsLoading(false);
          return;
        }

        const linkData = await serviceCheckRes.json();
        const linkedTemplateIds: string[] = linkData.template_ids || [];

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
        // Silently fail -- forms are optional
      }
      setFormsLoading(false);
    };

    fetchFormTemplates();
  }, [taskServices]);

  // ── Form data helpers ────────────────────────────────────────────────────

  const updateFormData = (templateId: string, fieldId: string, value: any) => {
    setFormDataMap(prev => ({
      ...prev,
      [templateId]: { ...prev[templateId], [fieldId]: value },
    }));
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
          const isEmpty =
            value === undefined ||
            value === null ||
            value === '' ||
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

  // ── Submit handler ───────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setFormSubmitError(null);

    // Validate form templates if any exist
    if (formTemplates.length > 0 && !validateForms()) return;

    // Submit form data for each template BEFORE completing the order
    if (formTemplates.length > 0 && orderId) {
      try {
        for (const tpl of formTemplates) {
          const res = await fetch('/api/form-submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_id: orderId,
              template_id: tpl.id,
              employee_id: employeeId || null,
              data: formDataMap[tpl.id] || {},
            }),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error ?? 'Blad wysylania formularza');
          }
        }
      } catch (err: unknown) {
        setFormSubmitError(err instanceof Error ? err.message : 'Blad wysylania formularza');
        return;
      }
    }

    // Then complete the order
    onComplete({ notes, photos, closureCodeId: selectedCode });
  };

  // ── Photo handlers ───────────────────────────────────────────────────────

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPhotos(prev => [...prev, ...files].slice(0, 5));
    if (e.target === fileInputRef.current)   fileInputRef.current!.value   = '';
    if (e.target === cameraInputRef.current) cameraInputRef.current!.value = '';
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3 pb-24">

      {/* ── Form Templates ──────────────────────────────────────────────────── */}
      {formsLoading ? (
        <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-5">
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 text-orange-400 animate-spin" />
            <span className="text-sm text-gray-400 ml-2">Ladowanie formularzy...</span>
          </div>
        </div>
      ) : formTemplates.length > 0 && (
        <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-5 space-y-4">
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

      {/* ── Closure code grid ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Status zakonczenia
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {codes.map(code => {
            const isSelected = code.id === selectedCode;
            return (
              <motion.button
                key={code.id}
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => setSelectedCode(isSelected ? null : code.id)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-2xl border-2 py-3.5 px-3 text-sm font-semibold transition-all',
                  isSelected
                    ? 'border-orange-500 bg-orange-50 text-orange-700 ring-2 ring-orange-500/15'
                    : code.color ?? 'text-gray-700 bg-gray-50 border-gray-200',
                )}
                style={{ minHeight: 48 }}
              >
                {isSelected && <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
                {code.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Photos ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Zdjecia ({photos.length}/5)
        </h2>
        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={photos.length >= 5}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-3 text-sm font-medium text-gray-500 active:bg-gray-50 disabled:opacity-40 transition-colors"
            style={{ minHeight: 48 }}
          >
            <Camera className="w-4 h-4" />
            Aparat
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={photos.length >= 5}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-3 text-sm font-medium text-gray-500 active:bg-gray-50 disabled:opacity-40 transition-colors"
            style={{ minHeight: 48 }}
          >
            <ImagePlus className="w-4 h-4" />
            Galeria
          </motion.button>
        </div>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
        <input ref={fileInputRef}   type="file" accept="image/*" multiple              className="hidden" onChange={handlePhotoChange} />
        <PhotoPreviews files={photos} onRemove={removePhoto} />
      </div>

      {/* ── Notes ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Notatki
        </h2>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Opcjonalne notatki..."
          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-300 focus:bg-white resize-none transition-all"
        />
      </div>

      {/* ── Errors ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {(error || formSubmitError) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-3xl bg-red-50 border border-red-100 p-4 text-sm text-red-700 font-medium"
          >
            {formSubmitError || error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Submit ──────────────────────────────────────────────────────────── */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        type="button"
        onClick={handleSubmit}
        disabled={completing}
        className="flex items-center justify-center gap-2 w-full rounded-2xl bg-emerald-600 text-white text-base font-semibold py-4 disabled:opacity-60 shadow-lg transition-all active:bg-emerald-700"
        style={{ minHeight: 56 }}
      >
        {completing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Konczenie...
          </>
        ) : (
          <>
            <CheckCircle className="w-5 h-5" />
            Zakoncz zlecenie
          </>
        )}
      </motion.button>
    </div>
  );
}
