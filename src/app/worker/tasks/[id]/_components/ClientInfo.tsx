'use client';

import { Phone, MapPin, ChevronRight, Navigation } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ClientInfo({
  clientName,
  clientPhone,
  address,
  distanceKm,
  navigateUrl,
}: {
  clientName: string;
  clientPhone: string | null;
  address: string;
  distanceKm: number | null;
  navigateUrl: string | null;
}) {
  const mapsUrl = navigateUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <div className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Client name */}
      <div className="px-5 pt-5 pb-3">
        <h1 className="text-xl font-bold text-gray-900 leading-tight tracking-tight">{clientName}</h1>
      </div>

      {/* Phone — tap to call */}
      {clientPhone && (
        <a
          href={`tel:${clientPhone}`}
          className="flex items-center gap-3 px-5 py-3.5 border-t border-gray-100 active:bg-gray-50 transition-colors"
          style={{ minHeight: 56 }}
        >
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Phone className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400">Telefon</p>
            <p className="text-sm font-semibold text-emerald-700">{clientPhone}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </a>
      )}

      {/* Address — tap to navigate */}
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 px-5 py-3.5 border-t border-gray-100 active:bg-gray-50 transition-colors"
        style={{ minHeight: 56 }}
      >
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <MapPin className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400">Adres</p>
          <p className="text-sm text-gray-900">{address}</p>
          {distanceKm !== null && (
            <p className="text-xs text-gray-400 mt-0.5">{distanceKm} km</p>
          )}
        </div>
        <Navigation className="w-4 h-4 text-gray-300" />
      </a>
    </div>
  );
}
