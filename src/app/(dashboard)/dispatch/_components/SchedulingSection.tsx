'use client';

import {
  Calendar, CircleAlert, ClockArrowUp, CalendarRange, Shuffle, AlertCircle,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SchedulingType = 'asap' | 'fixed_time' | 'time_window' | 'flexible';
export type Priority = 'normal' | 'high' | 'urgent';
export type TimeWindowPreset = 'morning' | 'afternoon' | 'evening' | 'custom';

// ─── Constants ──────────────────────────────────────────────────────────────

const WINDOW_PRESETS: Record<string, { label: string; start: string; end: string }> = {
  morning:   { label: 'Rano 8-12',         start: '08:00', end: '12:00' },
  afternoon: { label: 'Popoudnie 12-16', start: '12:00', end: '16:00' },
  evening:   { label: 'Wieczor 16-20',    start: '16:00', end: '20:00' },
};

const FLEXIBILITY_OPTIONS = [0, 30, 60, 90, 120, 150, 180, 240];
const FLEXIBILITY_LABELS: Record<number, string> = {
  0: 'Na czas',
  30: 'Do 30 min',
  60: 'Do 1h',
  90: 'Do 1.5h',
  120: 'Do 2h',
  150: 'Do 2.5h',
  180: 'Do 3h',
  240: 'Do 4h',
};

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─── Exported helper for parent to resolve time window values ───────────────

export function getTimeWindowValues(
  schedulingType: SchedulingType,
  windowPreset: TimeWindowPreset,
  customWindowStart: string,
  customWindowEnd: string,
) {
  if (schedulingType === 'time_window') {
    if (windowPreset === 'custom') {
      return { start: customWindowStart, end: customWindowEnd };
    }
    const preset = WINDOW_PRESETS[windowPreset];
    return preset ? { start: preset.start, end: preset.end } : { start: '08:00', end: '12:00' };
  }
  return { start: null, end: null };
}

// ─── SchedulingSection Component ────────────────────────────────────────────

export function SchedulingSection({
  schedulingType,
  setSchedulingType,
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
  flexibility,
  setFlexibility,
  windowPreset,
  setWindowPreset,
  customWindowStart,
  setCustomWindowStart,
  customWindowEnd,
  setCustomWindowEnd,
  priority,
  setPriority,
  notes,
  setNotes,
  vehicleInfo,
  setVehicleInfo,
}: {
  schedulingType: SchedulingType;
  setSchedulingType: (v: SchedulingType) => void;
  selectedDate: string;
  setSelectedDate: (v: string) => void;
  selectedTime: string;
  setSelectedTime: (v: string) => void;
  flexibility: number;
  setFlexibility: (v: number) => void;
  windowPreset: TimeWindowPreset;
  setWindowPreset: (v: TimeWindowPreset) => void;
  customWindowStart: string;
  setCustomWindowStart: (v: string) => void;
  customWindowEnd: string;
  setCustomWindowEnd: (v: string) => void;
  priority: Priority;
  setPriority: (v: Priority) => void;
  notes: string;
  setNotes: (v: string) => void;
  vehicleInfo: string;
  setVehicleInfo: (v: string) => void;
}) {
  return (
    <>
      {/* SECTION 3: TERMIN */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-orange-500" /> Termin
        </h2>

        {/* Scheduling type selector — 4 cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
          {([
            { type: 'asap' as const, label: 'Na juz (ASAP)', Icon: CircleAlert, color: 'text-red-500', desc: 'Dzisiaj, jak najszybciej' },
            { type: 'fixed_time' as const, label: 'Konkretna godzina', Icon: ClockArrowUp, color: 'text-blue-500', desc: 'Dokladny czas' },
            { type: 'time_window' as const, label: 'Okno czasowe', Icon: CalendarRange, color: 'text-orange-500', desc: 'Zakres godzin' },
            { type: 'flexible' as const, label: 'Elastyczny', Icon: Shuffle, color: 'text-violet-500', desc: 'System wybiera' },
          ]).map(opt => (
            <button
              key={opt.type}
              onClick={() => setSchedulingType(opt.type)}
              className={`rounded-xl border-2 p-3 text-left transition-all ${
                schedulingType === opt.type
                  ? 'border-orange-500 bg-orange-50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <opt.Icon className={`h-5 w-5 ${schedulingType === opt.type ? 'text-orange-500' : opt.color}`} />
              <p className="text-xs font-semibold text-gray-900 mt-1.5">{opt.label}</p>
              <p className="text-[10px] text-gray-500">{opt.desc}</p>
            </button>
          ))}
        </div>

        {/* Conditional fields based on scheduling type */}
        {schedulingType !== 'asap' && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Data</label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              min={todayStr()}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
            />
          </div>
        )}

        {schedulingType === 'fixed_time' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Godzina</label>
              <input
                type="time"
                value={selectedTime}
                onChange={e => setSelectedTime(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Elastycznosc</label>
              <div className="flex gap-2">
                {FLEXIBILITY_OPTIONS.map(f => (
                  <button
                    key={f}
                    onClick={() => setFlexibility(f)}
                    className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      flexibility === f
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {FLEXIBILITY_LABELS[f] || `${f} min`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {schedulingType === 'time_window' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Okno czasowe</label>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {(['morning', 'afternoon', 'evening', 'custom'] as const).map(w => (
                  <button
                    key={w}
                    onClick={() => setWindowPreset(w)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      windowPreset === w
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {w === 'custom' ? 'Wlasne' : WINDOW_PRESETS[w].label}
                  </button>
                ))}
              </div>
            </div>
            {windowPreset === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Od</label>
                  <input
                    type="time"
                    value={customWindowStart}
                    onChange={e => setCustomWindowStart(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Do</label>
                  <input
                    type="time"
                    value={customWindowEnd}
                    onChange={e => setCustomWindowEnd(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {schedulingType === 'asap' && (
          <p className="text-sm text-orange-600 font-medium">
            Zlecenie na dzisiaj ({todayStr()}), priorytet: pilny
          </p>
        )}
      </section>

      {/* SECTION 4: SZCZEGOLY */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-orange-500" /> Szczegoly
        </h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Priorytet</label>
            <div className="flex gap-2">
              {([
                { value: 'normal' as const, label: 'Normalny' },
                { value: 'high' as const, label: 'Wysoki' },
                { value: 'urgent' as const, label: 'Pilny' },
              ]).map(p => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    priority === p.value
                      ? p.value === 'urgent' ? 'bg-red-500 text-white' : p.value === 'high' ? 'bg-yellow-500 text-white' : 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notatki</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Dodatkowe informacje..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pojazd (opcjonalnie)</label>
            <input
              type="text"
              value={vehicleInfo}
              onChange={e => setVehicleInfo(e.target.value)}
              placeholder="Marka, model, nr rejestracyjny"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
            />
          </div>
        </div>
      </section>
    </>
  );
}
