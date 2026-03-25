'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { Phone, Loader2 } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ClientResult {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

export interface HereSuggestion {
  id: string;
  title: string;
  address: {
    label?: string;
    street?: string;
    houseNumber?: string;
    city?: string;
    postalCode?: string;
  };
}

// ─── ClientSearchSection Component ──────────────────────────────────────────

export function ClientSearchSection({
  phoneInput,
  setPhoneInput,
  clientResults,
  searchingClient,
  selectedClient,
  setSelectedClient,
  clientName,
  setClientName,
  clientEmail,
  setClientEmail,
  address,
  setAddress,
  city,
  setCity,
  phoneRef,
}: {
  phoneInput: string;
  setPhoneInput: (v: string) => void;
  clientResults: ClientResult[];
  searchingClient: boolean;
  selectedClient: ClientResult | null;
  setSelectedClient: (c: ClientResult | null) => void;
  clientName: string;
  setClientName: (v: string) => void;
  clientEmail: string;
  setClientEmail: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  phoneRef: React.RefObject<HTMLInputElement | null>;
}) {
  // ── HERE address autocomplete ──
  const [addressSuggestions, setAddressSuggestions] = useState<HereSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const addressContainerRef = useRef<HTMLDivElement>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAddressSuggestions = useCallback((q: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (q.length < 3) { setAddressSuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/here-autocomplete?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setAddressSuggestions(data.items ?? []);
        setShowAddressSuggestions(true);
      } catch { /* silent */ }
    }, 300);
  }, []);

  const selectAddressSuggestion = useCallback(async (s: HereSuggestion) => {
    setShowAddressSuggestions(false);
    setAddressSuggestions([]);
    const street = [s.address.street, s.address.houseNumber].filter(Boolean).join(' ');
    setAddress(street);
    setCity(s.address.city ?? '');
  }, [setAddress, setCity]);

  // Close address suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addressContainerRef.current && !addressContainerRef.current.contains(e.target as Node)) {
        setShowAddressSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectClient = useCallback((c: ClientResult) => {
    setSelectedClient(c);
    setPhoneInput(c.phone);
    setClientName(c.name || '');
    setClientEmail(c.email || '');
    setAddress(c.address || '');
    setCity(c.city || '');
  }, [setSelectedClient, setPhoneInput, setClientName, setClientEmail, setAddress, setCity]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
        <Phone className="h-4 w-4 text-orange-500" /> Klient
      </h2>

      {/* Phone input */}
      <div className="relative mb-3">
        <label className="block text-xs font-medium text-gray-600 mb-1">Telefon</label>
        <input
          ref={phoneRef}
          type="tel"
          value={phoneInput}
          onChange={e => { setPhoneInput(e.target.value); setSelectedClient(null); }}
          placeholder="Wpisz numer telefonu..."
          autoFocus
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
        />
        {searchingClient && (
          <Loader2 className="absolute right-3 top-8 h-4 w-4 animate-spin text-gray-400" />
        )}
        {/* Client search results dropdown */}
        {clientResults.length > 0 && !selectedClient && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
            {clientResults.map(c => (
              <button
                key={c.id}
                onClick={() => selectClient(c)}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-gray-100 last:border-0"
              >
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-500">{c.phone} {c.address ? `- ${c.address}` : ''}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Name + Email row */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Imie i nazwisko</label>
          <input
            type="text"
            value={clientName}
            onChange={e => setClientName(e.target.value)}
            placeholder="Jan Kowalski"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email (opcjonalnie)</label>
          <input
            type="email"
            value={clientEmail}
            onChange={e => setClientEmail(e.target.value)}
            placeholder="jan@example.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
          />
        </div>
      </div>

      {/* Address with HERE autocomplete */}
      <div className="relative mb-3" ref={addressContainerRef}>
        <label className="block text-xs font-medium text-gray-600 mb-1">Adres</label>
        <input
          type="text"
          value={address}
          onChange={e => { setAddress(e.target.value); fetchAddressSuggestions(e.target.value); }}
          placeholder="ul. Marszalkowska 1"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
        />
        {showAddressSuggestions && addressSuggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
            {addressSuggestions.map(s => (
              <button
                key={s.id}
                onClick={() => selectAddressSuggestion(s)}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-gray-100 last:border-0 text-sm text-gray-700"
              >
                {s.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Miasto</label>
        <input
          type="text"
          value={city}
          onChange={e => setCity(e.target.value)}
          placeholder="Warszawa"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
        />
      </div>
    </section>
  );
}
