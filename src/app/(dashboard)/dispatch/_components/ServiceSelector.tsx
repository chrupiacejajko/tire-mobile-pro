'use client';

import { Zap } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ServiceOption {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  category: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function groupByCategory(services: ServiceOption[]) {
  const groups: Record<string, ServiceOption[]> = {};
  for (const s of services) {
    const cat = s.category || 'Inne';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  }
  return groups;
}

// ─── ServiceSelector Component ──────────────────────────────────────────────

export function ServiceSelector({
  services,
  selectedServiceIds,
  onToggleService,
}: {
  services: ServiceOption[];
  selectedServiceIds: Set<string>;
  onToggleService: (id: string) => void;
}) {
  const grouped = groupByCategory(services);
  const selectedServices = services.filter(s => selectedServiceIds.has(s.id));
  const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
        <Zap className="h-4 w-4 text-orange-500" /> Uslugi
      </h2>

      {Object.entries(grouped).map(([cat, svcs]) => (
        <div key={cat} className="mb-4 last:mb-0">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{cat}</p>
          <div className="space-y-1">
            {svcs.map(s => {
              const selected = selectedServiceIds.has(s.id);
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                    selected ? 'bg-orange-50 border border-orange-200' : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleService(s.id)}
                    className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="flex-1 text-sm text-gray-800">{s.name}</span>
                  <span className="text-xs text-gray-500">{s.duration_minutes} min</span>
                  <span className="text-sm font-semibold text-gray-900">{Number(s.price)} zl</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {selectedServiceIds.size > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-600">{selectedServiceIds.size} uslug, {totalDuration} min</span>
          <span className="text-base font-bold text-orange-600">{totalPrice} zl</span>
        </div>
      )}
    </section>
  );
}
