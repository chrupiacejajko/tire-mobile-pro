'use client';

import { useState, useRef } from 'react';
import { Camera, ImagePlus, X, Loader2, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ClosureCode {
  id: string;
  label: string;
  icon?: string;
  color?: string;
}

const DEFAULT_CLOSURE_CODES: ClosureCode[] = [
  { id: 'done_ok', label: 'Wykonane', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  { id: 'partial', label: 'Czesciowo', color: 'bg-amber-50 border-amber-200 text-amber-700' },
  { id: 'client_absent', label: 'Klient nieobecny', color: 'bg-red-50 border-red-200 text-red-700' },
  { id: 'wrong_address', label: 'Zly adres', color: 'bg-orange-50 border-orange-200 text-orange-700' },
  { id: 'rescheduled', label: 'Przelozono', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { id: 'other', label: 'Inny', color: 'bg-gray-50 border-gray-200 text-gray-700' },
];

function PhotoPreviews({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
      {files.map((file, i) => {
        const url = URL.createObjectURL(file);
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex-shrink-0 w-20 h-20"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Zdjecie ${i + 1}`}
              className="w-20 h-20 object-cover rounded-2xl border border-gray-200"
              onLoad={() => URL.revokeObjectURL(url)}
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
            >
              <X className="w-3 h-3" />
            </button>
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
}: {
  onComplete: (data: { notes: string; photos: File[]; closureCodeId: string | null }) => void;
  completing: boolean;
  error: string | null;
  closureCodes?: ClosureCode[];
}) {
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const codes = closureCodes ?? DEFAULT_CLOSURE_CODES;

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPhotos((prev) => [...prev, ...files].slice(0, 5));
    if (e.target === fileInputRef.current) fileInputRef.current!.value = '';
    if (e.target === cameraInputRef.current) cameraInputRef.current!.value = '';
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Closure code grid */}
      <div className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Status zakonczenia
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {codes.map((code) => (
            <motion.button
              key={code.id}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => setSelectedCode(code.id === selectedCode ? null : code.id)}
              className={cn(
                'flex items-center justify-center rounded-2xl border-2 py-3.5 px-3 text-sm font-semibold transition-all',
                code.id === selectedCode
                  ? 'border-orange-500 bg-orange-50 text-orange-700 ring-2 ring-orange-500/20'
                  : code.color ?? 'bg-gray-50 border-gray-200 text-gray-700',
              )}
              style={{ minHeight: 48 }}
            >
              {code.id === selectedCode && <CheckCircle className="w-4 h-4 mr-1.5 flex-shrink-0" />}
              {code.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Photos */}
      <div className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Zdjecia ({photos.length}/5)
        </h2>
        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={photos.length >= 5}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-3 text-sm text-gray-600 active:bg-gray-50 disabled:opacity-40 transition-colors"
            style={{ minHeight: 48 }}
          >
            <Camera className="w-4 h-4" />
            Aparat
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={photos.length >= 5}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-3 text-sm text-gray-600 active:bg-gray-50 disabled:opacity-40 transition-colors"
            style={{ minHeight: 48 }}
          >
            <ImagePlus className="w-4 h-4" />
            Galeria
          </motion.button>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoChange}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handlePhotoChange}
        />
        <PhotoPreviews files={photos} onRemove={removePhoto} />
      </div>

      {/* Notes */}
      <div className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Notatki
        </h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Opcjonalne notatki..."
          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-300 focus:bg-white resize-none transition-all"
        />
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-[24px] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4 text-sm text-red-700"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit button */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        type="button"
        onClick={() => onComplete({ notes, photos, closureCodeId: selectedCode })}
        disabled={completing}
        className="flex items-center justify-center gap-2 w-full rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-base font-semibold py-4 disabled:opacity-60 shadow-lg transition-all"
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
