'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Loader2, Truck } from 'lucide-react';

import { ClientSearchSection, type ClientResult } from './_components/ClientSearchSection';
import { ServiceSelector, type ServiceOption } from './_components/ServiceSelector';
import {
  SchedulingSection,
  getTimeWindowValues,
  type SchedulingType,
  type Priority,
  type TimeWindowPreset,
} from './_components/SchedulingSection';
import { WorkerSuggestions, type WorkerSuggestion } from './_components/WorkerSuggestions';

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DispatchPage() {
  const searchParams = useSearchParams();
  const prefillEmployeeId = searchParams.get('employee_id');
  const prefillDate = searchParams.get('date');
  const prefillTime = searchParams.get('time');

  // ── Client ──────────────────────────────────────────────────────────────
  const [phoneInput, setPhoneInput] = useState('');
  const [clientResults, setClientResults] = useState<ClientResult[]>([]);
  const [searchingClient, setSearchingClient] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');

  // ── Services ────────────────────────────────────────────────────────────
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());

  // ── Scheduling ──────────────────────────────────────────────────────────
  const [schedulingType, setSchedulingType] = useState<SchedulingType>(prefillTime ? 'fixed_time' : 'time_window');
  const [selectedDate, setSelectedDate] = useState(prefillDate ?? todayStr());
  const [selectedTime, setSelectedTime] = useState(prefillTime ?? '10:00');
  const [flexibility, setFlexibility] = useState(0);
  const [windowPreset, setWindowPreset] = useState<TimeWindowPreset>('morning');
  const [customWindowStart, setCustomWindowStart] = useState('08:00');
  const [customWindowEnd, setCustomWindowEnd] = useState('12:00');

  // ── Details ─────────────────────────────────────────────────────────────
  const [priority, setPriority] = useState<Priority>('normal');
  const [notes, setNotes] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');

  // ── Worker suggestions ──────────────────────────────────────────────────
  const [workerSuggestions, setWorkerSuggestions] = useState<WorkerSuggestion[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<string | null>(prefillEmployeeId);
  const [autoAssign, setAutoAssign] = useState(false);

  // ── Submission ──────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resultOrderId, setResultOrderId] = useState('');
  const [resultEmployee, setResultEmployee] = useState('');
  const [resultPlate, setResultPlate] = useState('');
  const [resultTravelMinutes, setResultTravelMinutes] = useState<number | null>(null);
  const [resultAutoAssigned, setResultAutoAssigned] = useState(false);
  const [resultSuggestions, setResultSuggestions] = useState<WorkerSuggestion[]>([]);
  const [error, setError] = useState('');

  // ── Refs ────────────────────────────────────────────────────────────────
  const phoneRef = useRef<HTMLInputElement>(null);
  const clientSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-focus phone on mount ───────────────────────────────────────────
  useEffect(() => {
    phoneRef.current?.focus();
  }, []);

  // ── Load services ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/services')
      .then(r => r.json())
      .then(data => {
        const list = data.services || data;
        if (Array.isArray(list)) setServices(list);
      })
      .catch(() => {});
  }, []);

  // ── Client search (debounce 500ms, 4+ digits) ──────────────────────────
  useEffect(() => {
    if (clientSearchTimer.current) clearTimeout(clientSearchTimer.current);
    const digits = phoneInput.replace(/\D/g, '');
    if (digits.length < 4) {
      setClientResults([]);
      return;
    }
    setSearchingClient(true);
    clientSearchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/search?phone=${encodeURIComponent(digits)}`);
        const data = await res.json();
        setClientResults(data.clients ?? []);
      } catch {
        setClientResults([]);
      }
      setSearchingClient(false);
    }, 500);
  }, [phoneInput]);

  // ── Toggle service ──────────────────────────────────────────────────────
  const toggleService = (id: string) => {
    setSelectedServiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Auto-set for ASAP ──────────────────────────────────────────────────
  useEffect(() => {
    if (schedulingType === 'asap') {
      setSelectedDate(todayStr());
      setPriority('urgent');
      setAutoAssign(true);
    }
  }, [schedulingType]);

  // ── Fetch worker suggestions ────────────────────────────────────────────
  useEffect(() => {
    if (!address || !selectedDate) {
      setWorkerSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoadingWorkers(true);
      try {
        const res = await fetch(`/api/dispatcher/workers?date=${selectedDate}&address=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}`);
        const data = await res.json();
        if (data.suggestions) {
          setWorkerSuggestions(data.suggestions);
        }
      } catch {
        setWorkerSuggestions([]);
      }
      setLoadingWorkers(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [address, city, selectedDate]);

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);

    const tw = getTimeWindowValues(schedulingType, windowPreset, customWindowStart, customWindowEnd);
    const timeWindowName = schedulingType === 'time_window' && windowPreset !== 'custom'
      ? windowPreset : undefined;

    const payload: Record<string, unknown> = {
      client_name: clientName,
      client_phone: phoneInput,
      client_email: clientEmail || undefined,
      address,
      city,
      scheduled_date: selectedDate,
      service_ids: Array.from(selectedServiceIds),
      notes: [notes, vehicleInfo ? `Pojazd: ${vehicleInfo}` : ''].filter(Boolean).join('\n') || undefined,
      priority,
      scheduling_type: schedulingType,
      source: 'dispatcher',
      auto_assign: autoAssign,
    };

    if (schedulingType === 'fixed_time') {
      payload.scheduled_time = selectedTime;
      payload.flexibility_minutes = flexibility;
    } else if (schedulingType === 'time_window') {
      payload.time_window = timeWindowName;
      payload.time_window_start = tw.start;
      payload.time_window_end = tw.end;
    }

    if (selectedWorker && !autoAssign) {
      payload.auto_assign = false;
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        if (selectedWorker && !autoAssign) {
          try {
            const supabaseRes = await fetch('/api/orders/assign-worker', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ order_id: data.order_id, employee_id: selectedWorker }),
            });
            const assignData = await supabaseRes.json();
            if (assignData.employee_name) {
              setResultEmployee(assignData.employee_name);
            }
          } catch { /* best effort */ }
        } else if (data.assigned_employee) {
          setResultEmployee(data.assigned_employee);
          setResultPlate(data.assigned_plate || '');
          setResultTravelMinutes(data.estimated_travel_minutes ?? null);
          setResultAutoAssigned(!!data.auto_assigned);
        }

        if (data.suggestions?.length > 0) {
          setResultSuggestions(data.suggestions);
        }

        setResultOrderId(data.order_id);
        setSuccess(true);
      } else {
        setError(data.error || 'Nie udalo sie utworzyc zlecenia');
      }
    } catch {
      setError('Blad serwera');
    }
    setSubmitting(false);
  };

  // ── Reset form ──────────────────────────────────────────────────────────
  const resetForm = () => {
    setPhoneInput('');
    setClientResults([]);
    setSelectedClient(null);
    setClientName('');
    setClientEmail('');
    setAddress('');
    setCity('');
    setSelectedServiceIds(new Set());
    setSchedulingType('time_window');
    setSelectedDate(todayStr());
    setSelectedTime('10:00');
    setFlexibility(0);
    setWindowPreset('morning');
    setPriority('normal');
    setNotes('');
    setVehicleInfo('');
    setWorkerSuggestions([]);
    setSelectedWorker(null);
    setAutoAssign(false);
    setSuccess(false);
    setResultOrderId('');
    setResultEmployee('');
    setResultPlate('');
    setResultTravelMinutes(null);
    setResultAutoAssigned(false);
    setResultSuggestions([]);
    setError('');
    phoneRef.current?.focus();
  };

  // ─── SUCCESS SCREEN ─────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Zlecenie utworzone!</h2>
          <p className="text-sm text-gray-600 mb-4">
            Nr: <span className="font-mono font-bold">{resultOrderId?.slice(0, 8).toUpperCase()}</span>
          </p>
          {resultAutoAssigned && resultEmployee && (
            <div className="mx-auto mb-4 max-w-md rounded-lg border border-green-300 bg-green-100 px-4 py-3 text-left">
              <p className="text-sm font-semibold text-green-800">
                Zlecenie przypisane do {resultEmployee}
                {resultPlate && <span className="text-green-700"> ({resultPlate})</span>}
              </p>
              {resultTravelMinutes !== null && (
                <p className="text-xs text-green-700 mt-1">
                  Szacowany dojazd: ~{resultTravelMinutes} min
                </p>
              )}
            </div>
          )}
          {!resultAutoAssigned && resultEmployee && (
            <p className="text-sm text-gray-700 mb-4">
              Przypisano do: <span className="font-semibold">{resultEmployee}</span>
            </p>
          )}
          {!resultEmployee && resultSuggestions.length > 0 && (
            <div className="mx-auto mb-4 max-w-md text-left">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Sugerowani pracownicy:</p>
              <div className="space-y-2">
                {resultSuggestions.slice(0, 3).map(s => (
                  <div key={s.employee_id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.employee_name}</p>
                      {s.plate && <p className="text-xs text-gray-500">{s.plate}</p>}
                    </div>
                    <div className="text-right">
                      {s.travel_minutes != null && (
                        <p className="text-xs text-gray-600">~{s.travel_minutes} min</p>
                      )}
                      {s.reason && (
                        <p className="text-xs text-orange-600">{s.reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 justify-center mt-6">
            <button
              onClick={resetForm}
              className="rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
            >
              Nowe zlecenie
            </button>
            <a
              href={`/orders`}
              className="rounded-xl bg-gray-100 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Lista zlecen
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── FORM ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Nowe zlecenie</h1>
        <p className="text-sm text-gray-500">Szybkie tworzenie zlecenia z rozmowy telefonicznej</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── LEFT COLUMN (60%) ─────────────────────────────────────────── */}
        <div className="flex-1 lg:w-[60%] space-y-6">
          <ClientSearchSection
            phoneInput={phoneInput}
            setPhoneInput={setPhoneInput}
            clientResults={clientResults}
            searchingClient={searchingClient}
            selectedClient={selectedClient}
            setSelectedClient={setSelectedClient}
            clientName={clientName}
            setClientName={setClientName}
            clientEmail={clientEmail}
            setClientEmail={setClientEmail}
            address={address}
            setAddress={setAddress}
            city={city}
            setCity={setCity}
            phoneRef={phoneRef}
          />

          <ServiceSelector
            services={services}
            selectedServiceIds={selectedServiceIds}
            onToggleService={toggleService}
          />

          <SchedulingSection
            schedulingType={schedulingType}
            setSchedulingType={setSchedulingType}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedTime={selectedTime}
            setSelectedTime={setSelectedTime}
            flexibility={flexibility}
            setFlexibility={setFlexibility}
            windowPreset={windowPreset}
            setWindowPreset={setWindowPreset}
            customWindowStart={customWindowStart}
            setCustomWindowStart={setCustomWindowStart}
            customWindowEnd={customWindowEnd}
            setCustomWindowEnd={setCustomWindowEnd}
            priority={priority}
            setPriority={setPriority}
            notes={notes}
            setNotes={setNotes}
            vehicleInfo={vehicleInfo}
            setVehicleInfo={setVehicleInfo}
          />
        </div>

        {/* ── RIGHT COLUMN (40%) ────────────────────────────────────────── */}
        <div className="lg:w-[40%] space-y-6">
          <WorkerSuggestions
            services={services}
            selectedServiceIds={selectedServiceIds}
            workerSuggestions={workerSuggestions}
            loadingWorkers={loadingWorkers}
            selectedWorker={selectedWorker}
            setSelectedWorker={setSelectedWorker}
            autoAssign={autoAssign}
            setAutoAssign={setAutoAssign}
            address={address}
            selectedDate={selectedDate}
            error={error}
            submitting={submitting}
            phoneInput={phoneInput}
            clientName={clientName}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
}
