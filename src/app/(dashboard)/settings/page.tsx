'use client';

import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Bell, Shield, Palette, Globe } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div>
      <Topbar title="Ustawienia" />
      <div className="p-6">
        <Tabs defaultValue="company" className="space-y-6">
          <TabsList>
            <TabsTrigger value="company" className="gap-2"><Building2 className="h-4 w-4" />Firma</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2"><Bell className="h-4 w-4" />Powiadomienia</TabsTrigger>
            <TabsTrigger value="security" className="gap-2"><Shield className="h-4 w-4" />Bezpieczeństwo</TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2"><Globe className="h-4 w-4" />Integracje</TabsTrigger>
          </TabsList>

          <TabsContent value="company">
            <Card>
              <CardHeader><CardTitle>Dane firmy</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Nazwa firmy</Label><Input defaultValue="Wulkanizacja Mobilna" /></div>
                  <div className="space-y-2"><Label>NIP</Label><Input defaultValue="1234567890" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Telefon</Label><Input defaultValue="+48 800 123 456" /></div>
                  <div className="space-y-2"><Label>Email</Label><Input defaultValue="kontakt@wulkanizacja-mobilna.pl" /></div>
                </div>
                <div className="space-y-2"><Label>Adres siedziby</Label><Input defaultValue="ul. Główna 1, 00-001 Warszawa" /></div>
                <Separator />
                <div className="space-y-4">
                  <h4 className="font-medium">Godziny pracy (domyślne)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Od</Label><Input type="time" defaultValue="07:00" /></div>
                    <div className="space-y-2"><Label>Do</Label><Input type="time" defaultValue="18:00" /></div>
                  </div>
                  <div className="space-y-2"><Label>Czas trwania slotu (minuty)</Label><Input type="number" defaultValue="30" /></div>
                </div>
                <Button>Zapisz zmiany</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader><CardTitle>Powiadomienia</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {[
                  { label: 'Nowe zlecenie', desc: 'Powiadom gdy pojawi się nowe zlecenie' },
                  { label: 'Zmiana statusu', desc: 'Powiadom o zmianie statusu zlecenia' },
                  { label: 'SMS do klienta', desc: 'Automatycznie wyślij SMS z potwierdzeniem wizyty' },
                  { label: 'Przypomnienie', desc: 'Wyślij przypomnienie klientowi dzień przed wizytą' },
                  { label: 'Raport dzienny', desc: 'Wyślij email z podsumowaniem dnia' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-gray-500">{item.desc}</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                ))}
                <Button>Zapisz ustawienia</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader><CardTitle>Bezpieczeństwo</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Aktualne hasło</Label><Input type="password" /></div>
                <div className="space-y-2"><Label>Nowe hasło</Label><Input type="password" /></div>
                <div className="space-y-2"><Label>Powtórz nowe hasło</Label><Input type="password" /></div>
                <Button>Zmień hasło</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations">
            <Card>
              <CardHeader><CardTitle>Integracje</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Smifybot (Voicebot)</p>
                    <p className="text-sm text-gray-500">Automatyczne rezerwacje przez telefon</p>
                  </div>
                  <Button variant="outline" disabled>Wkrótce</Button>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">API Key</p>
                    <p className="text-sm text-gray-500">Klucz do REST API systemu</p>
                  </div>
                  <Button variant="outline">Wygeneruj klucz</Button>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Webhook URL</p>
                    <p className="text-sm text-gray-500">Endpoint do odbierania powiadomień</p>
                  </div>
                  <Input className="w-64" placeholder="https://your-webhook.com/endpoint" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
