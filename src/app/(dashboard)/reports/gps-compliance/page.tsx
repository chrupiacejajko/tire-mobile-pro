'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  MapPin, CheckCircle2, AlertTriangle, XCircle, Loader2,
  RefreshCw, Navigation, ShieldCheck, Eye, FileDown,
  ChevronUp, ChevronDown, Calendar,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';

import 'leaflet/dist/leaflet.css';

// ── Dynamic Leaflet imports ───────────────────────────────────────────────────
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

// ── Fit bounds helper ─────────────────────────────────────────────────────────
function FitBoundsHelper({ bounds }: { bounds: [[number, number], [number, number]] }) {
  const { useMap } = require('react-leaflet');
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }, [map, bounds]);
  return null;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ComplianceStatus = 'confirmed' | 'nearby' | 'suspicious' | 'no_match';
type SortField = 'scheduled_date' | 'gps_distance_meters' | 'status';
type SortDir = 'asc' | 'desc';

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

const STATUS_CONFIG: Record<ComplianceStatus, { label: string; color: string; bg: string; icon: React.ElementType; barColor: string }> = {
  confirmed: { label: 'Potwierdzone', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2, barColor: 'bg-emerald-500' },
  nearby: { label: 'W pobli\u017cu', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Navigation, barColor: 'bg-amber-500' },
  suspicious: { label: 'Podejrzane', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: AlertTriangle, barColor: 'bg-orange-500' },
  no_match: { label: 'Brak danych GPS', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: XCircle, barColor: 'bg-red-500' },
};

const STATUS_ORDER: ComplianceStatus[] = ['confirmed', 'nearby', 'suspicious', 'no_match'];

const ANIM = {
  container: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } },
  item: { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } },
};

function formatDistance(meters: number | null): string {
  if (meters === null) return '-';
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// ── Compliance Donut Chart ────────────────────────────────────────────────────
function ComplianceDonut({ pct }: { pct: number }) {
  const radius = 40;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const getColor = (p: number) => {
    if (p >= 80) return { stroke: '#10b981', bg: 'text-emerald-600' };
    if (p >= 60) return { stroke: '#f59e0b', bg: 'text-amber-600' };
    return { stroke: '#ef4444', bg: 'text-red-600' };
  };

  const c = getColor(pct);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <motion.circle
          cx={50} cy={50} r={radius}
          fill="none"
          stroke={c.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('text-lg font-bold', c.bg)}>{pct}%</span>
      </div>
    </div>
  );
}

// ── Stacked Status Bar ────────────────────────────────────────────────────────
function StatusBar({ summary }: { summary: ComplianceSummary }) {
  if (summary.total === 0) return null;
  const segments = STATUS_ORDER.map(s => ({
    status: s,
    count: summary[s],
    pct: (summary[s] / summary.total) * 100,
  }));

  return (
    <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-100">
      {segments.map(seg => seg.pct > 0 && (
        <motion.div
          key={seg.status}
          className={cn('h-full', STATUS_CONFIG[seg.status].barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${seg.pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          title={`${STATUS_CONFIG[seg.status].label}: ${seg.count}`}
        />
      ))}
    </div>
  );
}

// ── Mini Map Component ────────────────────────────────────────────────────────
function MiniMap({ record }: { record: ComplianceRecord }) {
  const hasClient = record.client_lat !== null && record.client_lng !== null;
  const hasGps = record.gps_lat !== null && record.gps_lng !== null;

  if (!hasClient || !hasGps) {
    return (
      <div className="h-[200px] rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
        <MapPin className="h-5 w-5 mr-2" />
        Brak wystarczaj\u0105cych danych do wy\u015bwietlenia mapy
      </div>
    );
  }

  const clientPos: [number, number] = [record.client_lat!, record.client_lng!];
  const gpsPos: [number, number] = [record.gps_lat!, record.gps_lng!];
  const bounds: [[number, number], [number, number]] = [clientPos, gpsPos];

  return (
    <div className="h-[200px] rounded-xl overflow-hidden border border-gray-200">
      <MapContainer
        center={clientPos}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBoundsHelper bounds={bounds} />
        <CircleMarker center={clientPos} radius={8} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.8 }}>
          <Popup>Lokalizacja klienta</Popup>
        </CircleMarker>
        <CircleMarker center={gpsPos} radius={8} pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.8 }}>
          <Popup>Lokalizacja GPS pracownika</Popup>
        </CircleMarker>
        <Polyline positions={[clientPos, gpsPos]} pathOptions={{ color: '#6b7280', weight: 2, dashArray: '6 4' }} />
      </MapContainer>
    </div>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────
function exportCsv(records: ComplianceRecord[]) {
  const header = 'Data,Godzina,Klient,Adres,Pracownik,Pojazd,Status,Odleg\u0142o\u015b\u0107 (m)\n';
  const rows = records.map(r =>
    [
      r.scheduled_date,
      r.scheduled_time,
      `"${r.client_name.replace(/"/g, '""')}"`,
      `"${r.address.replace(/"/g, '""')}"`,
      `"${r.employee_name.replace(/"/g, '""')}"`,
      r.plate_number || '',
      STATUS_CONFIG[r.status].label,
      r.gps_distance_meters !== null ? String(r.gps_distance_meters) : '',
    ].join(',')
  ).join('\n');
  const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `raport-gps-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Date presets ──────────────────────────────────────────────────────────────
function getDatePreset(preset: 'today' | '7d' | '30d' | 'month'): { from: string; to: string } {
  const today = new Date();
  const toStr = today.toISOString().split('T')[0];
  switch (preset) {
    case 'today':
      return { from: toStr, to: toStr };
    case '7d': {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString().split('T')[0], to: toStr };
    }
    case '30d': {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return { from: d.toISOString().split('T')[0], to: toStr };
    }
    case 'month': {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: d.toISOString().split('T')[0], to: toStr };
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
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
  const [sortField, setSortField] = useState<SortField>('scheduled_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = useState<ComplianceStatus | null>(null);

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

  // Sort and filter
  const displayRecords = useMemo(() => {
    let filtered = statusFilter ? records.filter(r => r.status === statusFilter) : records;

    const statusWeight: Record<ComplianceStatus, number> = { confirmed: 0, nearby: 1, suspicious: 2, no_match: 3 };

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'scheduled_date':
          cmp = `${a.scheduled_date} ${a.scheduled_time}`.localeCompare(`${b.scheduled_date} ${b.scheduled_time}`);
          break;
        case 'gps_distance_meters':
          cmp = (a.gps_distance_meters ?? 99999) - (b.gps_distance_meters ?? 99999);
          break;
        case 'status':
          cmp = statusWeight[a.status] - statusWeight[b.status];
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [records, sortField, sortDir, statusFilter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleDatePreset = (preset: 'today' | '7d' | '30d' | 'month') => {
    const { from: f, to: t } = getDatePreset(preset);
    setFrom(f);
    setTo(t);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="h-3 w-3 text-gray-300 ml-1 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-orange-500 ml-1 inline" />
      : <ChevronDown className="h-3 w-3 text-orange-500 ml-1 inline" />;
  };

  const colCount = 8;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Raport GPS"
        subtitle="Weryfikacja obecno\u015bci pracownika u klienta"
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl text-xs"
              onClick={() => exportCsv(displayRecords)}
              disabled={displayRecords.length === 0}
            >
              <FileDown className="h-3.5 w-3.5 mr-1.5" />
              Eksportuj CSV
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={load} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
              Od\u015bwie\u017c
            </Button>
          </div>
        }
      />

      <div className="p-4 lg:p-6 space-y-5">
        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardContent className="p-4 space-y-3">
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

            {/* Quick date presets */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-gray-400 self-center mr-1">
                <Calendar className="h-3 w-3 inline mr-1" />
                Szybki wybór:
              </span>
              {([
                ['today', 'Dzi\u015b'],
                ['7d', 'Ostatnie 7 dni'],
                ['30d', 'Ostatnie 30 dni'],
                ['month', 'Ten miesi\u0105c'],
              ] as const).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant="outline"
                  className="rounded-xl text-xs h-7 px-3"
                  onClick={() => handleDatePreset(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Summary Cards ────────────────────────────────────────────────── */}
        {summary && (
          <motion.div
            className="space-y-4"
            variants={ANIM.container}
            initial="hidden"
            animate="show"
          >
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Compliance Donut - larger */}
              <motion.div variants={ANIM.item} className="col-span-2 md:col-span-1 lg:col-span-1 row-span-1">
                <Card className="rounded-2xl border-blue-100 shadow-sm bg-gradient-to-br from-blue-50/80 to-white h-full">
                  <CardContent className="p-4 flex flex-col items-center justify-center">
                    <ComplianceDonut pct={summary.compliance_pct} />
                    <p className="text-xs font-medium text-blue-600 mt-1">Zgodno\u015b\u0107 GPS</p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={ANIM.item}>
                <Card className="rounded-2xl border-gray-100 shadow-sm h-full">
                  <CardContent className="p-4 text-center flex flex-col justify-center h-full">
                    <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
                    <p className="text-xs text-gray-500 mt-1">Razem</p>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Status cards - clickable as filter */}
              {STATUS_ORDER.map(status => {
                const cfg = STATUS_CONFIG[status];
                const Icon = cfg.icon;
                const isActive = statusFilter === status;
                return (
                  <motion.div key={status} variants={ANIM.item}>
                    <Card
                      className={cn(
                        'rounded-2xl shadow-sm h-full cursor-pointer transition-all hover:shadow-md',
                        isActive
                          ? 'border-2 border-orange-400 ring-2 ring-orange-200'
                          : `border-${status === 'confirmed' ? 'emerald' : status === 'nearby' ? 'amber' : status === 'suspicious' ? 'orange' : 'red'}-100`,
                        status === 'confirmed' && 'bg-emerald-50/50',
                        status === 'nearby' && 'bg-amber-50/50',
                        status === 'suspicious' && 'bg-orange-50/50',
                        status === 'no_match' && 'bg-red-50/50',
                      )}
                      onClick={() => setStatusFilter(isActive ? null : status)}
                    >
                      <CardContent className="p-4 text-center flex flex-col justify-center h-full">
                        <Icon className={cn('h-4 w-4 mx-auto mb-1', cfg.color)} />
                        <p className={cn('text-2xl font-bold', cfg.color)}>{summary[status]}</p>
                        <p className={cn('text-xs mt-1', cfg.color)}>{cfg.label}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>

            {/* Stacked status bar */}
            <motion.div variants={ANIM.item}>
              <Card className="rounded-2xl border-gray-100 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-500">Rozk\u0142ad status\u00f3w</p>
                    <div className="flex gap-3">
                      {STATUS_ORDER.map(s => (
                        <div key={s} className="flex items-center gap-1">
                          <div className={cn('h-2 w-2 rounded-full', STATUS_CONFIG[s].barColor)} />
                          <span className="text-[10px] text-gray-500">{STATUS_CONFIG[s].label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <StatusBar summary={summary} />
                </CardContent>
              </Card>
            </motion.div>

            {statusFilter && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2"
              >
                <span className="text-xs text-gray-500">
                  Filtr aktywny: <strong className={STATUS_CONFIG[statusFilter].color}>{STATUS_CONFIG[statusFilter].label}</strong>
                </span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setStatusFilter(null)}>
                  Wyczy\u015b\u0107 filtr
                </Button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── Table (Desktop) ──────────────────────────────────────────────── */}
        <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden hidden md:block">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : displayRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <MapPin className="h-8 w-8 mb-2" />
                <p className="text-sm">Brak danych do wy\u015bwietlenia</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th
                        className="text-left px-4 py-3 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700 transition-colors"
                        onClick={() => handleSort('scheduled_date')}
                      >
                        Data <SortIcon field="scheduled_date" />
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Klient</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden lg:table-cell">Adres</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Pracownik</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden xl:table-cell">Pojazd</th>
                      <th
                        className="text-left px-4 py-3 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700 transition-colors"
                        onClick={() => handleSort('status')}
                      >
                        Status <SortIcon field="status" />
                      </th>
                      <th
                        className="text-right px-4 py-3 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700 transition-colors"
                        onClick={() => handleSort('gps_distance_meters')}
                      >
                        Odleg\u0142o\u015b\u0107 GPS <SortIcon field="gps_distance_meters" />
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {displayRecords.map(r => {
                        const cfg = STATUS_CONFIG[r.status];
                        const StatusIcon = cfg.icon;
                        const isExpanded = expandedId === r.order_id;

                        return (
                          <ExpandableRow key={r.order_id}>
                            <tr
                              className={cn(
                                'border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors',
                                isExpanded && 'bg-gray-50/70',
                              )}
                              onClick={() => setExpandedId(isExpanded ? null : r.order_id)}
                            >
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{r.scheduled_date}</div>
                                <div className="text-xs text-gray-500">{r.scheduled_time}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-sm font-medium text-gray-900 truncate max-w-[160px]">{r.client_name}</div>
                              </td>
                              <td className="px-4 py-3 hidden lg:table-cell">
                                <div className="text-xs text-gray-500 truncate max-w-[200px]">{r.address}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-sm text-gray-700">{r.employee_name}</div>
                              </td>
                              <td className="px-4 py-3 hidden xl:table-cell">
                                <div className="text-xs text-gray-500">{r.plate_number || '-'}</div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border', cfg.bg, cfg.color)}>
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
                                <motion.div
                                  animate={{ rotate: isExpanded ? 180 : 0 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <Eye className="h-3.5 w-3.5 text-gray-400" />
                                </motion.div>
                              </td>
                            </tr>

                            {/* Expanded detail row - proper colSpan inside tbody */}
                            <AnimatePresence initial={false}>
                              {isExpanded && (
                                <motion.tr
                                  key={`detail-${r.order_id}`}
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                                >
                                  <td colSpan={colCount} className="p-0">
                                    <motion.div
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      exit={{ opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="bg-gray-50/80 border-b border-gray-100 px-6 py-4"
                                    >
                                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                        {/* Coordinates info */}
                                        <div className="space-y-3">
                                          <div>
                                            <h4 className="font-semibold text-gray-700 mb-1 text-sm">Lokalizacja klienta</h4>
                                            <p className="text-gray-600 text-sm font-mono">
                                              {r.client_lat !== null && r.client_lng !== null
                                                ? `${r.client_lat.toFixed(6)}, ${r.client_lng.toFixed(6)}`
                                                : 'Brak wsp\u00f3\u0142rz\u0119dnych'}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-0.5">{r.address}</p>
                                          </div>
                                          <div>
                                            <h4 className="font-semibold text-gray-700 mb-1 text-sm">Lokalizacja GPS pracownika</h4>
                                            <p className="text-gray-600 text-sm font-mono">
                                              {r.gps_lat !== null && r.gps_lng !== null
                                                ? `${r.gps_lat.toFixed(6)}, ${r.gps_lng.toFixed(6)}`
                                                : 'Brak danych GPS'}
                                            </p>
                                            {r.gps_timestamp && (
                                              <p className="text-xs text-gray-400 mt-0.5">
                                                Czas GPS: {new Date(r.gps_timestamp).toLocaleString('pl-PL')}
                                              </p>
                                            )}
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-500">
                                              Odleg\u0142o\u015b\u0107: <span className="font-semibold">{formatDistance(r.gps_distance_meters)}</span>
                                              {r.client_lat && r.client_lng && r.gps_lat && r.gps_lng && (
                                                <>
                                                  {' | '}
                                                  <a
                                                    href={`https://www.google.com/maps/dir/${r.gps_lat},${r.gps_lng}/${r.client_lat},${r.client_lng}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 underline"
                                                    onClick={e => e.stopPropagation()}
                                                  >
                                                    Poka\u017c na mapie
                                                  </a>
                                                </>
                                              )}
                                            </p>
                                          </div>
                                        </div>

                                        {/* Mini map */}
                                        <div className="lg:col-span-2">
                                          <MiniMap record={r} />
                                        </div>
                                      </div>
                                    </motion.div>
                                  </td>
                                </motion.tr>
                              )}
                            </AnimatePresence>
                          </ExpandableRow>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Mobile Card Layout ───────────────────────────────────────────── */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : displayRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <MapPin className="h-8 w-8 mb-2" />
              <p className="text-sm">Brak danych do wy\u015bwietlenia</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {displayRecords.map(r => {
                const cfg = STATUS_CONFIG[r.status];
                const StatusIcon = cfg.icon;
                const isExpanded = expandedId === r.order_id;

                return (
                  <motion.div
                    key={r.order_id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Card
                      className={cn(
                        'rounded-2xl border-gray-100 shadow-sm overflow-hidden cursor-pointer transition-all',
                        isExpanded && 'ring-1 ring-gray-200',
                      )}
                      onClick={() => setExpandedId(isExpanded ? null : r.order_id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{r.client_name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{r.scheduled_date} {r.scheduled_time}</p>
                          </div>
                          <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ml-2 shrink-0', cfg.bg, cfg.color)}>
                            <StatusIcon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{r.employee_name}</span>
                          <span className="font-mono font-medium text-gray-700">{formatDistance(r.gps_distance_meters)}</span>
                        </div>

                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.25 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                                <div className="text-xs text-gray-500">
                                  <p><span className="font-medium text-gray-700">Adres:</span> {r.address}</p>
                                  {r.plate_number && <p><span className="font-medium text-gray-700">Pojazd:</span> {r.plate_number}</p>}
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <p className="font-medium text-gray-700 mb-0.5">Klient</p>
                                    <p className="text-gray-500 font-mono text-[11px]">
                                      {r.client_lat !== null && r.client_lng !== null
                                        ? `${r.client_lat.toFixed(5)}, ${r.client_lng.toFixed(5)}`
                                        : 'Brak'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-700 mb-0.5">GPS</p>
                                    <p className="text-gray-500 font-mono text-[11px]">
                                      {r.gps_lat !== null && r.gps_lng !== null
                                        ? `${r.gps_lat.toFixed(5)}, ${r.gps_lng.toFixed(5)}`
                                        : 'Brak'}
                                    </p>
                                  </div>
                                </div>
                                <MiniMap record={r} />
                                {r.client_lat && r.client_lng && r.gps_lat && r.gps_lng && (
                                  <a
                                    href={`https://www.google.com/maps/dir/${r.gps_lat},${r.gps_lng}/${r.client_lat},${r.client_lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 underline block"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    Poka\u017c na Google Maps
                                  </a>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helper: wraps two <tr> elements in a React.Fragment ───────────────────────
function ExpandableRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
