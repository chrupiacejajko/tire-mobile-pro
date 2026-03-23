'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Satellite, CheckCircle2, XCircle, Loader2, MapPin,
  Zap, Clock, Truck, Info, Copy, RefreshCw,
} from 'lucide-react';

interface SyncResult {
  success: boolean;
  processed: number;
  stored: number;
  vehicles: { plate: string; lat: number; lng: number; status: string; stored: boolean }[];
  error?: string;
}

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } },
  item: { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } },
};

const statusColors: Record<string, string> = {
  driving: 'bg-blue-100 text-blue-700',
  working: 'bg-green-100 text-green-700',
  online: 'bg-gray-100 text-gray-600',
  offline: 'bg-red-100 text-red-600',
};

const statusLabels: Record<string, string> = {
  driving: 'W trasie',
  working: 'Na miejscu',
  online: 'Dostępny',
  offline: 'Offline',
};

export default function IntegrationsPage() {
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    if (!jsonInput.trim()) {
      setError('Wklej JSON z Satis GPS');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonInput.trim());
    } catch {
      setError('Nieprawidłowy JSON — sprawdź czy skopiowałeś cały response');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/satisgps/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `Błąd HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError('Błąd połączenia z API');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setJsonInput('');
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Integracje"
        subtitle="Połączenia z zewnętrznymi systemami"
        icon={<Zap className="h-5 w-5" />}
      />

      <div className="p-6 max-w-5xl mx-auto">
        <motion.div
          variants={ANIM.container}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >
          {/* Satis GPS Card */}
          <motion.div variants={ANIM.item}>
            <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
              <CardHeader className="pb-4 border-b border-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
                      <Satellite className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Satis GPS</CardTitle>
                      <p className="text-xs text-gray-400 mt-0.5">Śledzenie lokalizacji busów w czasie rzeczywistym</p>
                    </div>
                  </div>
                  <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 rounded-full px-3">
                    Konfiguracja
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {/* How it works */}
                <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                    <Info className="h-4 w-4" /> Jak to działa?
                  </p>
                  <ol className="text-sm text-blue-700 space-y-1.5 list-decimal list-inside">
                    <li>Otwórz <strong>maps.satisgps.com</strong> w przeglądarce i zaloguj się</li>
                    <li>Naciśnij <kbd className="bg-blue-100 px-1.5 py-0.5 rounded text-xs font-mono">F12</kbd> → zakładka <strong>Network</strong> → odśwież stronę</li>
                    <li>Znajdź request do <code className="bg-blue-100 px-1 rounded text-xs">Default.aspx</code> → kliknij → <strong>Response</strong></li>
                    <li>Skopiuj cały JSON (zacznij od <code className="bg-blue-100 px-1 rounded text-xs">{`{"controls":[`}</code>)</li>
                    <li>Wklej poniżej i kliknij <strong>Synchronizuj</strong></li>
                  </ol>
                </div>

                {/* JSON Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Wklej JSON z Satis GPS
                  </label>
                  <Textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder='{"controls":[{"ServerID":"_0","ChildControls":[...]}]}'
                    className="font-mono text-xs h-36 resize-none rounded-xl border-gray-200 bg-gray-50 focus:bg-white"
                  />
                  <p className="text-[11px] text-gray-400">
                    Satis GPS używa WebForms — dane pojazdu są w środku zagnieżdżonego JSON-a.
                    System automatycznie je wyciągnie.
                  </p>
                </div>

                {/* Error */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4"
                  >
                    <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </motion.div>
                )}

                {/* Result */}
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl p-4">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-green-800">
                          Synchronizacja udana — {result.processed} pojazdów odczytano, {result.stored} zapisano
                        </p>
                        <p className="text-xs text-green-600 mt-0.5">
                          {result.stored < result.processed
                            ? `${result.processed - result.stored} pojazdów nie znaleziono w bazie (dodaj je w Flotcie)`
                            : 'Wszystkie pojazdy zaktualizowane'}
                        </p>
                      </div>
                    </div>

                    {result.vehicles.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Pojazdy</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {result.vehicles.map((v, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"
                            >
                              <div className={`h-2 w-2 rounded-full ${v.stored ? 'bg-green-500' : 'bg-gray-300'}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-bold">{v.plate}</span>
                                  <Badge className={`text-[10px] rounded-full px-2 py-0 ${statusColors[v.status] || statusColors.offline}`}>
                                    {statusLabels[v.status] || v.status}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  <MapPin className="h-2.5 w-2.5 inline mr-0.5" />
                                  {v.lat.toFixed(4)}, {v.lng.toFixed(4)}
                                </p>
                              </div>
                              {!v.stored && (
                                <span className="text-[10px] text-gray-400">nie w bazie</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    onClick={handleSync}
                    disabled={loading || !jsonInput.trim()}
                    className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white flex-1"
                  >
                    {loading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Synchronizuję...</>
                    ) : (
                      <><RefreshCw className="h-4 w-4 mr-2" /> Synchronizuj pozycje</>
                    )}
                  </Button>
                  {(jsonInput || result) && (
                    <Button
                      variant="outline"
                      onClick={handleClear}
                      className="rounded-xl border-gray-200"
                    >
                      Wyczyść
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Future integrations */}
          <motion.div variants={ANIM.item}>
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-gray-500">Planowane integracje</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { name: 'Smifybot', desc: 'Voicebot do rezerwacji telefonicznych', icon: '🤖', soon: true },
                  { name: 'SMSAPI.pl', desc: 'Powiadomienia SMS dla klientów', icon: '📱', soon: true },
                  { name: 'Fakturownia', desc: 'Automatyczne wystawianie faktur', icon: '🧾', soon: true },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl opacity-60"
                  >
                    <span className="text-xl">{item.icon}</span>
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{item.desc}</p>
                      <Badge className="mt-2 text-[10px] bg-gray-100 text-gray-500 rounded-full">Wkrótce</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
