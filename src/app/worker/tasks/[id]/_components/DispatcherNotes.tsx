'use client';

import { StickyNote } from 'lucide-react';

export default function DispatcherNotes({
  notes,
  description,
}: {
  notes: string | null;
  description: string | null;
}) {
  if (!notes && !description) return null;

  return (
    <div className="space-y-3">
      {notes && (
        <div className="bg-[#FFE8D6] rounded-[24px] p-5">
          <div className="flex items-center gap-2 mb-2">
            <StickyNote className="w-4 h-4 text-orange-600" />
            <p className="text-xs font-bold text-orange-700 uppercase tracking-wider">
              Notatka dyspozytora
            </p>
          </div>
          <p className="text-sm text-gray-800 leading-relaxed">{notes}</p>
        </div>
      )}
      {description && (
        <div className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            Opis
          </p>
          <p className="text-sm text-gray-700 leading-relaxed">{description}</p>
        </div>
      )}
    </div>
  );
}
