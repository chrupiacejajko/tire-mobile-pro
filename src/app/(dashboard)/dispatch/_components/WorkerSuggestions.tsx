'use client';

import { Truck, Loader2, Check } from 'lucide-react';
import type { ServiceOption } from './ServiceSelector';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WorkerSuggestion {
  employee_id: string;
  employee_name: string;
  plate: string | null;
  current_orders: number;
  gps_distance_km: number | null;
  is_driving: boolean;
  is_nearby: boolean;
  travel_minutes?: number;
  distance_km?: number;
  reason?: string;
}

// ─── WorkerSuggestions Component ────────────────────────────────────────────

export function WorkerSuggestions({
  services,
  selectedServiceIds,
  workerSuggestions,
  loadingWorkers,
  selectedWorker,
  setSelectedWorker,
  autoAssign,
  setAutoAssign,
  address,
  selectedDate,
  error,
  submitting,
  phoneInput,
  clientName,
  onSubmit,
}: {
  services: ServiceOption[];
  selectedServiceIds: Set<string>;
  workerSuggestions: WorkerSuggestion[];
  loadingWorkers: boolean;
  selectedWorker: string | null;
  setSelectedWorker: (id: string | null) => void;
  autoAssign: boolean;
  setAutoAssign: (v: boolean) => void;
  address: string;
  selectedDate: string;
  error: string;
  submitting: boolean;
  phoneInput: string;
  clientName: string;
  onSubmit: () => void;
}) {
  const selectedServices = services.filter(s => selectedServiceIds.has(s.id));
  const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 sticky top-4">
      <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
        <Check className="h-4 w-4 text-orange-500" /> Podglad i przypisanie
      </h2>

      {/* Summary card */}
      <div className="rounded-lg bg-gray-50 p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Podsumowanie</p>
        {selectedServices.length > 0 ? (
          <div className="space-y-1 mb-3">
            {selectedServices.map(s => (
              <div key={s.id} className="flex justify-between text-sm">
                <span className="text-gray-700">{s.name}</span>
                <span className="text-gray-900 font-medium">{Number(s.price)} zl</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-3">Brak wybranych uslug</p>
        )}
        <div className="border-t border-gray-200 pt-2 flex justify-between">
          <span className="text-sm font-semibold text-gray-700">
            Lacznie ({totalDuration} min)
          </span>
          <span className="text-lg font-bold text-orange-600">{totalPrice} zl</span>
        </div>
      </div>

      {/* Worker suggestions panel */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase">Sugerowani pracownicy</p>
          {loadingWorkers && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
        </div>

        {!address || !selectedDate ? (
          <p className="text-xs text-gray-400">Wypelnij adres i date, aby zobaczyc sugestie</p>
        ) : workerSuggestions.length === 0 && !loadingWorkers ? (
          <p className="text-xs text-gray-400">Brak dostepnych pracownikow</p>
        ) : (
          <div className="space-y-2">
            {workerSuggestions.slice(0, 3).map(w => (
              <div
                key={w.employee_id}
                className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                  selectedWorker === w.employee_id
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => { setSelectedWorker(w.employee_id); setAutoAssign(false); }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{w.employee_name}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                      {w.plate && (
                        <span className="flex items-center gap-1">
                          <Truck className="h-3 w-3" /> {w.plate}
                        </span>
                      )}
                      {w.gps_distance_km !== null && (
                        <span>{w.gps_distance_km} km</span>
                      )}
                      <span>{w.current_orders} zlecen</span>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setSelectedWorker(w.employee_id); setAutoAssign(false); }}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                      selectedWorker === w.employee_id
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-orange-100'
                    }`}
                  >
                    {selectedWorker === w.employee_id ? 'Wybrany' : 'Przypisz'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Auto-assign toggle */}
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoAssign}
            onChange={e => { setAutoAssign(e.target.checked); if (e.target.checked) setSelectedWorker(null); }}
            className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
          />
          <span className="text-xs text-gray-700">Automatycznie przypisz najlepszego</span>
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={onSubmit}
        disabled={submitting || !phoneInput || !clientName || selectedServiceIds.size === 0}
        className="w-full rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Tworzenie...
          </>
        ) : (
          'Utworz zlecenie'
        )}
      </button>
    </section>
  );
}
