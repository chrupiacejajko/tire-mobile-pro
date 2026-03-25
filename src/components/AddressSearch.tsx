'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, MapPin, Navigation, Store, Loader2, X } from 'lucide-react';
import { parseCoordinates } from '@/lib/geo';
import { cn } from '@/lib/utils';

interface AddressSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: {
    address: string;
    lat: number;
    lng: number;
    type: 'address' | 'poi' | 'coordinates';
  }) => void;
  placeholder?: string;
  className?: string;
  centerLat?: number;
  centerLng?: number;
}

interface AutocompleteItem {
  id: string;
  title: string;
  address?: { label?: string };
}

interface DiscoverItem {
  title: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
}

export default function AddressSearch({
  value,
  onChange,
  onSelect,
  placeholder = 'Szukaj adresu, miejsca lub wklej współrzędne…',
  className,
  centerLat,
  centerLng,
}: AddressSearchProps) {
  const [addresses, setAddresses] = useState<AutocompleteItem[]>([]);
  const [places, setPlaces] = useState<DiscoverItem[]>([]);
  const [parsedCoords, setParsedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchResults = useCallback(
    async (query: string) => {
      if (query.length < 3) {
        setAddresses([]);
        setPlaces([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const atParam =
        centerLat != null && centerLng != null
          ? `&at=${centerLat},${centerLng}`
          : '';

      try {
        const [autoRes, discoverRes] = await Promise.all([
          fetch(`/api/here-autocomplete?q=${encodeURIComponent(query)}`),
          fetch(
            `/api/here-discover?q=${encodeURIComponent(query)}${atParam}`,
          ),
        ]);

        const autoData = await autoRes.json();
        const discoverData = await discoverRes.json();

        setAddresses(autoData.items ?? []);
        setPlaces(discoverData.items ?? []);
      } catch {
        setAddresses([]);
        setPlaces([]);
      } finally {
        setLoading(false);
      }
    },
    [centerLat, centerLng],
  );

  function handleInputChange(newValue: string) {
    onChange(newValue);
    setActiveIndex(-1);

    // Check for coordinates first (instant, no API)
    const coords = parseCoordinates(newValue);
    setParsedCoords(coords);

    // Debounce API calls
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(newValue), 300);

    setIsOpen(true);
  }

  async function handleSelectAddress(item: AutocompleteItem) {
    setIsOpen(false);
    setLoading(true);

    try {
      const res = await fetch(`/api/here-lookup?id=${encodeURIComponent(item.id)}`);
      const data = await res.json();

      if (data.lat != null && data.lng != null) {
        const address = item.address?.label ?? item.title;
        onChange(address);
        onSelect({ address, lat: data.lat, lng: data.lng, type: 'address' });
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  function handleSelectPlace(item: DiscoverItem) {
    setIsOpen(false);
    const address = item.address || item.title;
    onChange(address);
    onSelect({ address, lat: item.lat, lng: item.lng, type: 'poi' });
  }

  async function handleSelectCoords(coords: { lat: number; lng: number }) {
    setIsOpen(false);
    setLoading(true);

    // Reverse geocode for display address
    try {
      const res = await fetch(
        `/api/geocode?lat=${coords.lat}&lng=${coords.lng}`,
      );
      const data = await res.json();
      const address =
        data.address || data.label || `${coords.lat}, ${coords.lng}`;
      onChange(address);
      onSelect({ address, lat: coords.lat, lng: coords.lng, type: 'coordinates' });
    } catch {
      const address = `${coords.lat}, ${coords.lng}`;
      onChange(address);
      onSelect({ address, lat: coords.lat, lng: coords.lng, type: 'coordinates' });
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    onChange('');
    setAddresses([]);
    setPlaces([]);
    setParsedCoords(null);
    setIsOpen(false);
    inputRef.current?.focus();
  }

  // Build flat list for keyboard navigation
  const allItems: { type: 'coords' | 'address' | 'place'; index: number }[] = [];
  if (parsedCoords) allItems.push({ type: 'coords', index: 0 });
  addresses.forEach((_, i) => allItems.push({ type: 'address', index: i }));
  places.forEach((_, i) => allItems.push({ type: 'place', index: i }));

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || allItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < allItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : allItems.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      const selected = allItems[activeIndex];
      if (selected.type === 'coords' && parsedCoords) {
        handleSelectCoords(parsedCoords);
      } else if (selected.type === 'address') {
        handleSelectAddress(addresses[selected.index]);
      } else if (selected.type === 'place') {
        handleSelectPlace(places[selected.index]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  const hasResults = parsedCoords || addresses.length > 0 || places.length > 0;
  let flatIdx = -1;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => hasResults && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-8 w-full rounded-lg border border-input bg-transparent pl-8 pr-8 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {isOpen && hasResults && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          <div className="max-h-72 overflow-y-auto py-1">
            {/* Coordinates section */}
            {parsedCoords && (
              <>
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  <Navigation className="mr-1 inline h-3 w-3" />
                  Współrzędne
                </div>
                {(() => {
                  flatIdx++;
                  return (
                    <button
                      type="button"
                      onClick={() => handleSelectCoords(parsedCoords)}
                      className={cn(
                        'w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent',
                        activeIndex === flatIdx && 'bg-accent',
                      )}
                    >
                      <span className="font-medium">
                        {parsedCoords.lat.toFixed(5)}, {parsedCoords.lng.toFixed(5)}
                      </span>
                    </button>
                  );
                })()}
              </>
            )}

            {/* Address section */}
            {addresses.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  <MapPin className="mr-1 inline h-3 w-3" />
                  Adresy
                </div>
                {addresses.map((item, i) => {
                  flatIdx++;
                  const idx = flatIdx;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectAddress(item)}
                      className={cn(
                        'w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent',
                        activeIndex === idx && 'bg-accent',
                      )}
                    >
                      <span>{item.address?.label ?? item.title}</span>
                    </button>
                  );
                })}
              </>
            )}

            {/* POI/Places section */}
            {places.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  <Store className="mr-1 inline h-3 w-3" />
                  Miejsca
                </div>
                {places.map((item, i) => {
                  flatIdx++;
                  const idx = flatIdx;
                  return (
                    <button
                      key={`${item.title}-${item.lat}-${item.lng}`}
                      type="button"
                      onClick={() => handleSelectPlace(item)}
                      className={cn(
                        'w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent',
                        activeIndex === idx && 'bg-accent',
                      )}
                    >
                      <div className="font-medium">{item.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.category && (
                          <span className="mr-1.5">{item.category} ·</span>
                        )}
                        {item.address}
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
