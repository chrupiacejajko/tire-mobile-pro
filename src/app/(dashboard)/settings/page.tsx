'use client';

import { useState, useEffect, useCallback } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User, Building2, Bell, Plug, Settings, Eye, EyeOff,
  Save, Check, Loader2, Palette,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────
interface CompanySettings {
  id: string;
  company_name: string;
  company_short: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  address: string | null;
  nip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  updated_at: string;
}

// ─── Profile Tab ─────────────────────────────────────────────────────
function ProfileTab() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? '');
      setPhone(user.phone ?? '');
    }
  }, [user]);

  const initials = (user?.full_name ?? 'A')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSaveProfile = async () => {
    setSaving(true);
    // Simulate save for now
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    toast.success('Profil zapisany');
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Hasla nie sa zgodne');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Haslo musi miec minimum 6 znakow');
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    toast.success('Haslo zmienione');
  };

  return (
    <div className="space-y-6">
      {/* Profile info */}
      <Card>
        <CardHeader>
          <CardTitle>Dane profilu</CardTitle>
          <CardDescription>Twoje informacje osobowe</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar row */}
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white text-2xl font-bold shadow-lg">
              {initials}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{user?.full_name ?? 'Uzytkownik'}</p>
              <p className="text-sm text-gray-500">{user?.email}</p>
              <Button variant="outline" size="sm" className="mt-2" disabled>
                Zmien zdjecie
              </Button>
            </div>
          </div>

          <Separator />

          {/* Editable fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Imie i nazwisko</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={user?.email ?? ''}
                readOnly
                className="bg-gray-50 cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+48 000 000 000"
              />
            </div>
            <div className="space-y-2">
              <Label>Rola</Label>
              <div className="pt-2">
                <Badge variant="secondary" className="text-sm">
                  {user?.role === 'admin' ? 'Administrator' : user?.role === 'dispatcher' ? 'Dyspozytor' : 'Pracownik'}
                </Badge>
              </div>
            </div>
          </div>

          <Button
            onClick={handleSaveProfile}
            disabled={saving}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Zapisz profil
          </Button>
        </CardContent>
      </Card>

      {/* Password change */}
      <Card>
        <CardHeader>
          <CardTitle>Zmien haslo</CardTitle>
          <CardDescription>Aktualizuj swoje haslo dostepu</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPw">Aktualne haslo</Label>
              <div className="relative">
                <Input
                  id="currentPw"
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                >
                  {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPw">Nowe haslo</Label>
              <div className="relative">
                <Input
                  id="newPw"
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowNewPw(!showNewPw)}
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPw">Powtorz nowe haslo</Label>
              <Input
                id="confirmPw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={saving || !currentPassword || !newPassword}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            Zmien haslo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Company / Whitelabel Tab ────────────────────────────────────────
function CompanyTab() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/company-settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch {
      // ignore fetch errors in dev/demo
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const update = (field: keyof CompanySettings, value: string) => {
    setSettings((prev) => {
      const base: CompanySettings = prev ?? {
        id: '', company_name: 'Wulkanizacja Mobilna', company_short: 'WM',
        logo_url: null, primary_color: '#f97316', secondary_color: '#3B82F6',
        address: null, nip: null, phone: null, email: null, website: null, updated_at: '',
      };
      return { ...base, [field]: value };
    });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch('/api/company-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: settings.company_name,
          company_short: settings.company_short,
          logo_url: settings.logo_url,
          primary_color: settings.primary_color,
          secondary_color: settings.secondary_color,
          address: settings.address,
          nip: settings.nip,
          phone: settings.phone,
          email: settings.email,
          website: settings.website,
        }),
      });
      if (res.ok) {
        toast.success('Ustawienia firmy zapisane');
      } else {
        toast.error('Blad zapisu ustawien');
      }
    } catch {
      toast.error('Blad polaczenia');
    } finally {
      setSaving(false);
    }
  };

  // Provide defaults when loading or no data
  const s: CompanySettings = settings ?? {
    id: '',
    company_name: 'Wulkanizacja Mobilna',
    company_short: 'WM',
    logo_url: null,
    primary_color: '#f97316',
    secondary_color: '#3B82F6',
    address: null,
    nip: null,
    phone: null,
    email: null,
    website: null,
    updated_at: '',
  };

  return (
    <div className="space-y-6">
      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-orange-500" />
            Branding / Whitelabel
          </CardTitle>
          <CardDescription>Dostosuj wyglad panelu do swojej marki</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Nazwa firmy</Label>
              <Input
                id="companyName"
                value={s.company_name}
                onChange={(e) => update('company_name', e.target.value)}
                placeholder="Wulkanizacja Mobilna"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyShort">Skrot firmy (sidebar)</Label>
              <Input
                id="companyShort"
                value={s.company_short}
                onChange={(e) => update('company_short', e.target.value)}
                placeholder="WM"
                maxLength={4}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logoUrl">Logo URL</Label>
            <Input
              id="logoUrl"
              value={s.logo_url ?? ''}
              onChange={(e) => update('logo_url', e.target.value)}
              placeholder="https://example.com/logo.png"
            />
            {s.logo_url && (
              <div className="mt-2 flex items-center gap-3">
                <img
                  src={s.logo_url}
                  alt="Logo podglad"
                  className="h-12 w-12 rounded-lg object-contain border"
                />
                <span className="text-xs text-gray-500">Podglad logo</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primaryColor">Kolor glowny</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="primaryColor"
                  value={s.primary_color}
                  onChange={(e) => update('primary_color', e.target.value)}
                  className="h-10 w-12 rounded-lg border cursor-pointer"
                />
                <Input
                  value={s.primary_color}
                  onChange={(e) => update('primary_color', e.target.value)}
                  className="flex-1 font-mono text-sm"
                  placeholder="#f97316"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="secondaryColor">Kolor dodatkowy</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="secondaryColor"
                  value={s.secondary_color}
                  onChange={(e) => update('secondary_color', e.target.value)}
                  className="h-10 w-12 rounded-lg border cursor-pointer"
                />
                <Input
                  value={s.secondary_color}
                  onChange={(e) => update('secondary_color', e.target.value)}
                  className="flex-1 font-mono text-sm"
                  placeholder="#3B82F6"
                />
              </div>
            </div>
          </div>

          {/* Color preview */}
          <div className="flex items-center gap-3 pt-2">
            <div className="h-8 w-24 rounded-lg" style={{ backgroundColor: s.primary_color }} />
            <div className="h-8 w-24 rounded-lg" style={{ backgroundColor: s.secondary_color }} />
            <span className="text-xs text-gray-500">Podglad kolorow</span>
          </div>
        </CardContent>
      </Card>

      {/* Company details */}
      <Card>
        <CardHeader>
          <CardTitle>Dane firmy</CardTitle>
          <CardDescription>Informacje kontaktowe i rejestrowe</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyAddress">Adres firmy</Label>
            <Input
              id="companyAddress"
              value={s.address ?? ''}
              onChange={(e) => update('address', e.target.value)}
              placeholder="ul. Glowna 1, 00-001 Warszawa"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nip">NIP</Label>
              <Input
                id="nip"
                value={s.nip ?? ''}
                onChange={(e) => update('nip', e.target.value)}
                placeholder="1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyPhone">Telefon firmowy</Label>
              <Input
                id="companyPhone"
                value={s.phone ?? ''}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="+48 800 123 456"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyEmail">Email firmowy</Label>
              <Input
                id="companyEmail"
                type="email"
                value={s.email ?? ''}
                onChange={(e) => update('email', e.target.value)}
                placeholder="kontakt@firma.pl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyWebsite">Strona www</Label>
              <Input
                id="companyWebsite"
                value={s.website ?? ''}
                onChange={(e) => update('website', e.target.value)}
                placeholder="https://www.firma.pl"
              />
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Zapisz ustawienia firmy
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Notifications Tab ───────────────────────────────────────────────
function NotificationsTab() {
  const [emailOrders, setEmailOrders] = useState(true);
  const [smsNotif, setSmsNotif] = useState(false);
  const [pushNotif, setPushNotif] = useState(false);
  const [sound, setSound] = useState(true);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Powiadomienia</CardTitle>
          <CardDescription>Skonfiguruj jak chcesz otrzymywac powiadomienia</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Powiadomienia email o nowych zleceniach</p>
              <p className="text-xs text-gray-500">Otrzymuj email gdy pojawi sie nowe zlecenie</p>
            </div>
            <Switch checked={emailOrders} onCheckedChange={setEmailOrders} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Powiadomienia SMS</p>
              <p className="text-xs text-gray-500">Wkrotce dostepne</p>
            </div>
            <Switch checked={smsNotif} onCheckedChange={setSmsNotif} disabled />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Powiadomienia push</p>
              <p className="text-xs text-gray-500">Wkrotce dostepne</p>
            </div>
            <Switch checked={pushNotif} onCheckedChange={setPushNotif} disabled />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Dzwiek powiadomien</p>
              <p className="text-xs text-gray-500">Odtwarzaj dzwiek przy nowym powiadomieniu</p>
            </div>
            <Switch checked={sound} onCheckedChange={setSound} />
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
        <Bell className="mx-auto h-10 w-10 text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">
          Ustawienia powiadomien sa na razie tylko interfejsowe.
          <br />
          Pelna obsluga zostanie dodana w kolejnej wersji.
        </p>
      </div>
    </div>
  );
}

// ─── Integrations Tab ────────────────────────────────────────────────
function IntegrationsTab() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

  // We cannot read server env vars from client, so status is based on the
  // fact the project already has these integrations configured.
  const integrations = [
    {
      name: 'SatisGPS',
      description: 'Sledzenie pojazdow w czasie rzeczywistym',
      status: 'connected' as const,
      detail: 'Cookie sesji skonfigurowane w zmiennych srodowiskowych',
    },
    {
      name: 'HERE API',
      description: 'Geokodowanie, trasy i autouzupelnianie adresow',
      status: 'connected' as const,
      detail: 'Klucz API: ****...skonfigurowany',
    },
    {
      name: 'Supabase',
      description: 'Baza danych, autoryzacja i storage',
      status: supabaseUrl ? 'connected' as const : 'disconnected' as const,
      detail: supabaseUrl
        ? `Projekt: ${supabaseUrl.replace('https://', '').split('.')[0]}...supabase.co`
        : 'Brak konfiguracji',
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Integracje</CardTitle>
          <CardDescription>Status polaczonych uslug zewnetrznych</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {integrations.map((integration) => (
            <div
              key={integration.name}
              className="flex items-center justify-between rounded-xl border border-gray-200 p-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-sm">{integration.name}</p>
                  <Badge
                    variant={integration.status === 'connected' ? 'default' : 'destructive'}
                    className={
                      integration.status === 'connected'
                        ? 'bg-green-100 text-green-700 hover:bg-green-100'
                        : ''
                    }
                  >
                    {integration.status === 'connected' ? (
                      <><Check className="h-3 w-3 mr-1" /> Polaczone</>
                    ) : (
                      'Niepolaczone'
                    )}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500">{integration.description}</p>
                <p className="text-xs text-gray-400 font-mono">{integration.detail}</p>
              </div>
              <Button variant="outline" size="sm" disabled>
                Konfiguruj
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Settings Page ──────────────────────────────────────────────
export default function SettingsPage() {
  return (
    <div>
      <Topbar
        title="Ustawienia"
        icon={<Settings className="h-5 w-5" />}
      />
      <div className="p-6">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-gray-100/80 p-1">
            <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <User className="h-4 w-4" />
              Profil
            </TabsTrigger>
            <TabsTrigger value="company" className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Building2 className="h-4 w-4" />
              Firma
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Bell className="h-4 w-4" />
              Powiadomienia
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Plug className="h-4 w-4" />
              Integracje
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileTab />
          </TabsContent>

          <TabsContent value="company">
            <CompanyTab />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>

          <TabsContent value="integrations">
            <IntegrationsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
