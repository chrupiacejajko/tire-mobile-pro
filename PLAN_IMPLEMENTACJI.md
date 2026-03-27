# Plan implementacji — ustalenia z rozmowy produktowej

## Status: ETAP 1 + ETAP 2 UKOŃCZONE (bez rezerwacji online)

---

## Etap 1 — MVP (do wdrożenia teraz)

### 1.1 Migracja bazy danych (029)
**Pola czasowe zlecenia — rozszerzenie tabeli `orders`:**
- `min_arrival_time TIMESTAMPTZ` — minimalny czas przyjazdu (stały po utworzeniu)
- `max_arrival_time TIMESTAMPTZ` — maksymalny czas przyjazdu (stały po utworzeniu)
- `planned_start_time TIMESTAMPTZ` — planowany czas rozpoczęcia (zmienny)
- `service_duration_minutes INTEGER` — czas usługi w minutach (z tabeli services)
- `planned_end_time TIMESTAMPTZ` — wyliczany: planned_start_time + service_duration
- `actual_departure_time TIMESTAMPTZ` — kiedy kierowca kliknął "wyjeżdżam"
- `actual_start_time TIMESTAMPTZ` — kiedy kierowca kliknął "rozpoczynam"
- `actual_end_time TIMESTAMPTZ` — kiedy kierowca kliknął "zakończyłem"
- `order_time_type TEXT` — typ: 'immediate' | 'fixed' | 'window' | 'flexible'

**Trigger:** planned_end_time = planned_start_time + (service_duration_minutes * interval '1 minute')

**Backfill:** istniejące zlecenia — scheduled_time_start → min_arrival_time = max_arrival_time = planned_start_time

### 1.2 Aktualizacja typów TypeScript
- Rozszerzenie `Order` interface o nowe pola
- Nowy typ `OrderTimeType = 'immediate' | 'fixed' | 'window' | 'flexible'`
- Usunięcie `OrderPriority` (priorytet odrzucony)

### 1.3 Naprawa generowania dyżurów
- Usunąć pole "godzina końca" z formularza generowania dyżurów
- Generowanie działa na: pracownik + godzina startu + czas trwania + ilość dyżurów

### 1.4 Usługi — kategorie
- Zastąpić konfigurowalny dropdown "rodzaje usług" dwoma stałymi kategoriami:
  - `main` (usługa główna)
  - `additional` (usługa dodatkowa)
- Pole `category` w tabeli `services` → CHECK ('main', 'additional')

### 1.5 Mapa — poziom 1 (ręczny)
- Wyszukiwarka adresu na górze mapy (już istnieje)
- Pinezki wszystkich nadchodzących zleceń (wyróżniający kolor)
- Domyślnie BEZ tras — same pinezki
- **Kliknięcie na pinezke zlecenia:**
  - Podświetla trasę kierowcy przypisanego do tego zlecenia
  - Otwiera sidebar po LEWEJ z kalendarzem dnia tego kierowcy
  - Kliknięte zlecenie wyróżnione obramówką
- **Kliknięcie na kierowcę (GPS):**
  - Otwiera sidebar po lewej z kalendarzem tego kierowcy
  - Pokazuje jego trasę
- Format sidebara: mix planer + kalendarz (kafelki z osią godzinową, widoczne przerwy)

### 1.6 Gantt — poprawa czytelności
- Oś godzinowa po lewej stronie (format kalendarza)
- Boxy proporcjonalne do czasu trwania usługi
- Widoczne przerwy czasowe między zleceniami
- Wykorzystanie nowych pól czasowych (planned_start, planned_end, service_duration)

### 1.7 Aplikacja pracownika — 4 przyciski
- **Wyjeżdżam na zlecenie** → system: planned_start = now() + travel_time_gps
- **Rozpoczynam pracę** → system: actual_start_time = now()
- **Zakończyłem zlecenie** → system: actual_end_time = now()
- **Wracam na bazę** → system: liczy trasę powrotną, wyświetla na gancie
- Plan dnia w formie kalendarza

---

## Etap 2 (później)

- Mapa poziom 2: wybór usługi → automatyczne przeliczanie tras → filtrowane pinezki
- Logika powrotu na bazę (próg 30 min)
- Powiadomienie przed pierwszym zleceniem dnia
- Ostrzeżenie: czy kierowca zdąży na kolejne zlecenie
- Kolorowanie zleceń na Gancie wg statusu
- Rezerwacja online z usługami
- Integracja Komarch API

---

## Kolejność realizacji

1. [x] Plan implementacji
2. [x] Migracja 029 — nowe pola czasowe (`supabase/migrations/029_order_time_fields.sql`)
3. [x] Typy TypeScript (`src/lib/types/index.ts` — Order, OrderTimeType, ServiceCategory)
4. [x] Naprawa generowania dyżurów (usunięto "godzina końca" z BulkGenerateDialog + API)
5. [x] Usługi — kategorie (main/additional, usunięto zakładkę "rodzaje usług")
6. [x] Mapa — sidebar z kalendarzem pracownika (`WorkerDaySidebar.tsx` + modyfikacja `page.tsx`)
7. [x] Gantt — oś godzinowa 6-22, proporcjonalne boxy, widoczne przerwy (`GanttView.tsx`)
8. [x] Aplikacja pracownika — 4 przyciski + aktualizacja API routes + status `in_transit`
