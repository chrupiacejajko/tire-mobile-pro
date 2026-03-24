'use client';

import { useState, useRef } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Upload, Download, CheckCircle2, AlertCircle, FileText } from 'lucide-react';

type ImportType = 'orders' | 'employees' | 'clients';

const IMPORT_TYPES: { value: ImportType; label: string }[] = [
  { value: 'clients', label: 'Klienci' },
  { value: 'employees', label: 'Pracownicy' },
  { value: 'orders', label: 'Zlecenia' },
];

const CSV_TEMPLATES: Record<ImportType, { headers: string; example: string }> = {
  clients: {
    headers: 'name,phone,email,address,city,lat,lng',
    example: 'Jan Kowalski,+48500100200,jan@example.com,ul. Główna 10,Warszawa,52.2297,21.0122',
  },
  employees: {
    headers: 'full_name,email,phone,role',
    example: 'Adam Nowak,adam@firma.pl,+48600200300,worker',
  },
  orders: {
    headers: 'address,city,scheduled_date,scheduled_time_start,client_name,client_phone,client_email,service_names,priority,notes',
    example: 'ul. Polna 5,Kraków,2026-04-01,09:00,Anna Wiśniewska,+48700300400,,Wymiana opon,normal,Opony zimowe w bagażniku',
  },
};

export default function ImportPage() {
  const [importType, setImportType] = useState<ImportType>('clients');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('type', importType);
      formData.append('file', file);

      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Wystąpił błąd podczas importu');
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message || 'Wystąpił błąd');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = (type: ImportType) => {
    const tpl = CSV_TEMPLATES[type];
    const csv = `${tpl.headers}\n${tpl.example}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `szablon_${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Import CSV"
        subtitle="Importuj dane z plików CSV"
        icon={<Upload className="h-5 w-5" />}
      />

      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Import form */}
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardContent className="p-6 space-y-5">
            <div className="space-y-2">
              <Label>Typ importu</Label>
              <Select value={importType} onValueChange={v => { setImportType(v as ImportType); setFile(null); setResult(null); setError(null); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMPORT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Plik CSV</Label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={e => {
                    setFile(e.target.files?.[0] || null);
                    setResult(null);
                    setError(null);
                  }}
                />
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-orange-500" />
                    <span className="text-sm font-medium text-gray-800">{file.name}</span>
                    <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-8 w-8 mx-auto text-gray-300" />
                    <p className="text-sm text-gray-500">Kliknij aby wybrać plik CSV</p>
                    <p className="text-xs text-gray-400">lub przeciągnij i upuść</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 rounded-xl"
                onClick={() => downloadTemplate(importType)}
              >
                <Download className="h-3.5 w-3.5" /> Pobierz szablon CSV
              </Button>

              <Button
                className="bg-orange-500 hover:bg-orange-600 gap-1.5 rounded-xl"
                disabled={!file || loading}
                onClick={handleImport}
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Importowanie...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" /> Importuj
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${result.errors.length === 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                  <CheckCircle2 className={`h-5 w-5 ${result.errors.length === 0 ? 'text-emerald-600' : 'text-amber-600'}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Import zakończony</p>
                  <p className="text-xs text-gray-500">
                    Zaimportowano: <span className="font-bold text-emerald-600">{result.imported}</span> z {result.total} wierszy
                  </p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Błędy ({result.errors.length})
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-1 bg-red-50 rounded-xl p-3">
                    {result.errors.map((err, i) => (
                      <p key={i} className="text-xs text-red-700">{err}</p>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && (
          <Card className="rounded-2xl border-red-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* CSV Templates Info */}
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardContent className="p-6 space-y-4">
            <p className="text-sm font-semibold text-gray-800">Szablony CSV</p>
            <div className="space-y-3">
              {IMPORT_TYPES.map(t => (
                <div key={t.value} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-700">{t.label}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] text-orange-600"
                      onClick={() => downloadTemplate(t.value)}
                    >
                      <Download className="h-3 w-3 mr-1" /> Pobierz
                    </Button>
                  </div>
                  <p className="text-[11px] text-gray-400 font-mono bg-gray-50 rounded-lg p-2 overflow-x-auto">
                    {CSV_TEMPLATES[t.value].headers}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
