'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  MapPin, CheckCircle2, AlertTriangle, XCircle, Loader2,
  RefreshCw, Navigation, ShieldCheck, Eye,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ── Types ────────────────────────────────────────────────────────────────────
type ComplianceStatus = 'confirmed' | 'nearby' | 'suspicious' | 'no_match';

interface ComplianceRecord {
  order_id: string;
  client_name: string;
  address: string;
  scheduled_date: string;
  scheduled_time: string;
  employee_name: string;
  plate_number: string;
  status: ComplianceStatus;
  gps_distance_meters: number | null;
  gps_timestamp: string | null;
  client_lat: number | null;
  client_lng: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
}

interface ComplianceSummary {
  total: number;
  confirmed: number;
  nearby: number;
  suspicious: number;
  no_match: number;
  compliance_pct: number;
}

const STATUS_CONFIG: Record<ComplianceStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  confirmed: { label: 'Potwierdzone', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  nearby: { label: 'W poblizu', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Navigation },
  suspicious: { label: 'Podejrzane', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: AlertTriangle },
  no_match: { label: 'Brak danych GPS', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: XCircle },
};

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } },
  item: { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } },
};

function formatDistance(meters: number | null): string {
  if (meters === null) return '-';
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function GpsCompliancePage() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [employeeId, setEmployeeId] = useState('');
  const [records, setRecords] = useState<ComplianceRecord[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);

  // Load employee list for filter
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('employees')
      .select('id, user:profiles(full_name)')
      .eq('is_active', true)
      .then(({ data }) => {
        setEmployees(
          (data || []).map((e: any) => ({
            id: e.id,
            name: (e.user as any)?.full_name ?? 'Pracownik',
          }))
        );
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (employeeId && employeeId !== 'all') params.set('employee_id', employeeId);
      const res = await fetch(`/api/reports/gps-compliance?${params}`);
      const data = await res.json();
      setRecords(data.results || []);
      setSummary(data.summary || null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [from, to, employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Raport GPS"
        subtitle="Weryfikacja obecnosci pracownika u klienta"
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Odswiez
          </Button>
        }
      />

      <div className="p-4 lg:p-6 space-y-5">
        {/* Filters */}
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Od</label>
                <Input
                  type="date"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                  className="rounded-xl text-sm w-40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Do</label>
                <Input
                  type="date"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  className="rounded-xl text-sm w-40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Pracownik</label>
                <Select value={employeeId} onValueChange={(v) => setEmployeeId(v ?? '')}>
                  <SelectTrigger className="rounded-xl text-sm w-52">
                    <SelectValue placeholder="Wszyscy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszyscy</SelectItem>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" className="rounded-xl" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Filtruj'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {summary && (
          <motion.div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
            variants={ANIM.container}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={ANIM.item}>
              <Card className="rounded-2xl border-gray-100 shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
                  <p className="text-xs text-gray-500 mt-1">Razem</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={ANIM.item}>
              <Card className="rounded-2xl border-emerald-100 shadow-sm bg-emerald-50/50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{summary.confirmed}</p>
                  <p className="text-xs text-emerald-600 mt-1">Potwierdzone</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={ANIM.item}>
              <Card className="rounded-2xl border-amber-100 shadow-sm bg-amber-50/50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-amber-700">{summary.nearby}</p>
                  <p className="text-xs text-amber-600 mt-1">W poblizu</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={ANIM.item}>
              <Card className="rounded-2xl border-orange-100 shadow-sm bg-orange-50/50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-orange-700">{summary.suspicious}</p>
                  <p className="text-xs text-orange-600 mt-1">Podejrzane</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={ANIM.item}>
              <Card className="rounded-2xl border-red-100 shadow-sm bg-red-50/50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">{summary.no_match}</p>
                  <p className="text-xs text-red-600 mt-1">Brak GPS</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={ANIM.item}>
              <Card className="rounded-2xl border-blue-100 shadow-sm bg-blue-50/50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">{summary.compliance_pct}%</p>
                  <p className="text-xs text-blue-600 mt-1">Compliance</p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}

        {/* Table */}
        <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : records.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <MapPin className="h-8 w-8 mb-2" />
                <p className="text-sm">Brak danych do wyswietlenia</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Data</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Klient</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Adres</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Pracownik</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden lg:table-cell">Pojazd</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Odleglosc GPS</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => {
                      const cfg = STATUS_CONFIG[r.status];
                      const StatusIcon = cfg.icon;
                      const isExpanded = expandedId === r.order_id;

                      return (
                        <motion.tr
                          key={r.order_id}
                          className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                          onClick={() => setExpandedId(isExpanded ? null : r.order_id)}
                          layout
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{r.scheduled_date}</div>
                            <div className="text-xs text-gray-500">{r.scheduled_time}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900 truncate max-w-[160px]">{r.client_name}</div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <div className="text-xs text-gray-500 truncate max-w-[200px]">{r.address}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-700">{r.employee_name}</div>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <div className="text-xs text-gray-500">{r.plate_number || '-'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
                              <StatusIcon className="h-3 w-3" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-mono text-gray-700">
                              {formatDistance(r.gps_distance_meters)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Eye className="h-3.5 w-3.5 text-gray-400" />
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Expanded detail rows rendered outside table for simplicity */}
                {expandedId && (() => {
                  const r = records.find(rec => rec.order_id === expandedId);
                  if (!r) return null;
                  return (
                    <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <h4 className="font-semibold text-gray-700 mb-2">Lokalizacja klienta</h4>
                          <p className="text-gray-600">
                            {r.client_lat !== null && r.client_lng !== null
                              ? `${r.client_lat.toFixed(6)}, ${r.client_lng.toFixed(6)}`
                              : 'Brak wspolrzednych'}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">{r.address}</p>
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-700 mb-2">Lokalizacja GPS pracownika</h4>
                          <p className="text-gray-600">
                            {r.gps_lat !== null && r.gps_lng !== null
                              ? `${r.gps_lat.toFixed(6)}, ${r.gps_lng.toFixed(6)}`
                              : 'Brak danych GPS'}
                          </p>
                          {r.gps_timestamp && (
                            <p className="text-xs text-gray-400 mt-1">
                              Czas GPS: {new Date(r.gps_timestamp).toLocaleString('pl-PL')}
                            </p>
                          )}
                        </div>
                        <div className="md:col-span-2">
                          <p className="text-xs text-gray-500">
                            Odleglosc: <span className="font-semibold">{formatDistance(r.gps_distance_meters)}</span>
                            {r.client_lat && r.client_lng && r.gps_lat && r.gps_lng && (
                              <> | <a
                                href={`https://www.google.com/maps/dir/${r.gps_lat},${r.gps_lng}/${r.client_lat},${r.client_lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 underline"
                              >
                                Pokaz na mapie
                              </a></>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
