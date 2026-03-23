# Porównanie z konkurencją FSM + Plan wdrożeniowy RouteTire

> Data: 2026-03-23 | Na podstawie rozmowy z klientem (właściciel mobilnej wulkanizacji)

---

## 1. PORÓWNANIE Z KONKURENCJĄ

### Tabela funkcji

| Funkcja | RouteTire (obecny stan) | GeoTask (Globema) | Comarch FSM | Synchroteam | IBPM FSM |
|---|---|---|---|---|---|
| **Optymalizacja tras** | ❌ Brak geo-optymalizacji | ✅ Google Maps, AI | ✅ AI + lokalizacja | ✅ GPS routing | ✅ Algorytmy optymalizacji |
| **Mapa live dyspozytora** | ✅ Leaflet + GPS | ✅ Google Maps | ✅ Real-time | ✅ GPS tracking | ✅ Real-time |
| **Okna czasowe (np. 8-12)** | ❌ Sloty 30-min | ✅ Okna czasowe | ✅ SLA windows | ✅ Time windows | ✅ Okna |
| **Priorytety zleceń** | ✅ 4 poziomy | ✅ Priorytety | ✅ SLA + priorytety | ✅ Priorytety | ✅ VIP/priorytety |
| **Auto-przydzielanie** | ⚠️ Region + balans | ✅ Smart assign | ✅ AI matching | ✅ Auto-dispatch | ✅ Auto-assign |
| **Aplikacja mobilna** | ⚠️ Web responsive | ✅ Native iOS/Android | ✅ Native + offline | ✅ Native | ✅ Native |
| **Rezerwacja online** | ✅ 4-krokowy wizard | ❌ Brak | ❌ Portal klienta | ⚠️ Basic | ❌ Brak |
| **Multi-auto booking** | ❌ Jedno auto | ❌ N/A | ❌ N/A | ❌ N/A | ❌ N/A |
| **Upselling** | ❌ Brak | ❌ Brak | ❌ Brak | ❌ Brak | ❌ Brak |
| **Depozyty opon** | ⚠️ Tylko jako usługa | ❌ Brak (ogólny FSM) | ❌ Brak | ❌ Brak | ❌ Brak |
| **Czas pracy** | ⚠️ Tylko GPS | ✅ Czas na zadaniu | ✅ Raporty + SLA | ✅ Time tracking | ✅ Raporty |
| **Rotacja pojazdów** | ✅ Vehicle assignments | ⚠️ Basic fleet | ✅ Fleet mgmt | ⚠️ Basic | ⚠️ Basic |
| **SMS/Email** | ✅ Templates ready | ✅ Powiadomienia | ✅ Omnichannel | ✅ SMS | ✅ Email |
| **Raporty/analityka** | ✅ KPI + CSV | ✅ BI analytics | ✅ Zaawansowane BI | ✅ Reports | ✅ Reports |
| **Tryb offline** | ❌ Brak | ✅ Offline mode | ✅ Full offline | ✅ Offline | ⚠️ Partial |
| **Magazyn/inwentarz** | ✅ Pełny CRUD | ⚠️ Basic | ✅ Integracja ERP | ⚠️ Parts tracking | ⚠️ Basic |
| **Branżowe (wulkanizacja)** | ✅ Dedykowane | ❌ Ogólny FSM | ❌ Ogólny FSM | ❌ Ogólny FSM | ❌ Ogólny FSM |

### Porównanie kosztów

| Rozwiązanie | Koszt miesięczny | Model |
|---|---|---|
| **RouteTire** | ~30 USD (~120 PLN) | Supabase 25$ + Railway ~5$ |
| **GeoTask** | Wycena indywidualna (est. 1000-5000+ PLN/mies.) | Per-user, wdrożenie od 15+ pojazdów |
| **Comarch FSM** | Wycena indywidualna (est. 3000-10000+ PLN/mies.) | Enterprise, wdrożenie + subskrypcja |
| **Synchroteam** | ~22-64 USD/user/mies. (~100-280 PLN/user) | Per-user SaaS |
| **Fieldworker** | ~29 USD/user/mies. (~125 PLN/user) | Per-user SaaS |
| **Konkurencja z rozmowy** | ~2000 PLN/mies. netto (3000 pierwotnie) | Dedykowany development |

> Przy 5 pracownikach: Synchroteam = 500-1400 PLN/mies., GeoTask = est. 2000+ PLN/mies.
> RouteTire = stała opłata ~120 PLN/mies. niezależnie od liczby użytkowników.

### Przewagi RouteTire

1. **Koszt** - 10-50x tańszy w utrzymaniu niż konkurencja
2. **Branżowość** - dedykowany dla mobilnej wulkanizacji (depozyty, worki na opony, upselling)
3. **Rezerwacja online** - większość FSM tego nie ma, a Booksy nie integruje z FSM
4. **Brak opłat per-user** - skaluje się bez dodatkowych kosztów
5. **Pełna kontrola** - własny kod, brak vendor lock-in

### Luki do uzupełnienia (vs GeoTask/Comarch)

1. **Optymalizacja tras geo** - KRYTYCZNE (to jest #1 wartość GeoTask)
2. **Okna czasowe** - "przyjedziemy między 8 a 12"
3. **Czas pracy na zleceniu** - start/stop timer
4. **Widok trasy kierowcy** - polyline na mapie live dyspozytora

---

## 2. PLAN WDROŻENIOWY

### Faza 1: OPTYMALIZACJA TRAS (priorytet #1 - "więcej pieniędzy")
> Cel: Więcej zleceń, mniej kilometrów

#### 1.1 Geo-scoring w auto-assign
**Obecny stan:** Algorytm assign scoruje po regionie (+10) i balansie obciążenia. Brak kalkulacji odległości.

**Do zrobienia:**
- Dodanie kalkulacji odległości Haversine między lokalizacją pracownika a zleceniem
- Scoring: bliżej = wyższy score (np. <5km: +20, <10km: +15, <20km: +10)
- Uwzględnienie kolejności zleceń (minimalizacja łącznej trasy)
- Uwzględnienie lokalizacji poprzedniego zlecenia pracownika (nie bazy)

**Pliki do modyfikacji:**
- `src/app/api/assign/route.ts` - algorytm scoringu
- `src/app/(dashboard)/map/page.tsx` - wizualizacja sugerowanych przydziałów

#### 1.2 Widok trasy kierowcy na mapie (dla dyspozytora)
**Cel:** Dyspozytor widzi trasę kierowcy i może dorzucić zlecenie "po drodze"

**Do zrobienia:**
- Polyline trasy (kolejność zleceń) na mapie live
- Wskaźnik "po drodze" - gdy nowe zlecenie jest blisko trasy kierowcy
- Kliknięcie na mapę = "przydziel do najbliższego pracownika"
- Panel boczny: lista zleceń w kolejności trasy + ETA

**Pliki do modyfikacji:**
- `src/app/(dashboard)/map/page.tsx` - polyline + interakcja
- Nowy endpoint API: `src/app/api/route-suggest/route.ts`

#### 1.3 Sugestie "po drodze" przy nowym zleceniu
**Cel:** Dzwoni klient z awarią → dyspozytor widzi kto jest najbliżej/po drodze

**Do zrobienia:**
- Przy tworzeniu zlecenia: automatyczna sugestia "Pracownik X jest 3km stąd, będzie za ~15 min"
- Ranking pracowników wg aktualnej pozycji GPS + pozostałych zleceń
- Wskaźnik "wciśnięcia" zlecenia między istniejące (ile czasu/km doliczy)

---

### Faza 2: OKNA CZASOWE + PRIORYTETYZACJA
> Cel: Elastyczne umawianie klientów, obsługa pilnych zleceń

#### 2.1 Okna czasowe zamiast sztywnych godzin
**Obecny stan:** Booking pozwala wybrać konkretny slot 30-minutowy.

**Do zrobienia:**
- Nowy typ slotu: "okno" (np. 08:00-12:00, 12:00-16:00)
- Klient wybiera okno, system przydziela konkretną godzinę wewnętrznie
- API availability zwraca okna zamiast slotów (lub oba tryby)
- W panelu dyspozytora: widok okien + drag-drop w ramach okna

**Pliki do modyfikacji:**
- `src/app/api/availability/route.ts` - tryb okien
- `src/app/booking/page.tsx` - UI okien
- `src/app/(dashboard)/calendar/page.tsx` - widok okien
- Schemat DB: `orders` - nowe pole `time_window` (zamiast `scheduled_time_start/end`)

#### 2.2 Priorytet "pilne" z automatyką
**Obecny stan:** Jest pole priority, ale nie wpływa na logikę.

**Do zrobienia:**
- Priorytet `urgent` → auto-sugestia najbliższego pracownika
- Alert dyspozytora przy nowym zleceniu urgent
- Na mapie: migający pin dla pilnych zleceń
- Auto-reorganizacja trasy (przesunięcie normalnych zleceń)

---

### Faza 3: DEPOZYTY OPON (ewidencja magazynu)
> Cel: Pełna ewidencja przechowywanych opon klientów

#### 3.1 Nowy moduł: Magazyn depozytowy
**Do zrobienia:**

**Baza danych - nowa tabela `tire_deposits`:**
```sql
CREATE TABLE tire_deposits (
  id UUID PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  vehicle_info TEXT,              -- "BMW X5 2020, WE12345"
  tire_brand TEXT,                -- "Continental"
  tire_size TEXT,                 -- "225/45 R17"
  tire_type TEXT,                 -- 'letnie' | 'zimowe' | 'całoroczne'
  quantity INTEGER DEFAULT 4,
  condition TEXT,                 -- 'dobre' | 'do wymiany' | 'uszkodzone'
  storage_location TEXT,          -- "Regał A3, półka 2"
  season TEXT,                    -- '2025/2026 zima'
  received_date DATE,
  expected_pickup DATE,
  picked_up_date DATE,
  order_id UUID REFERENCES orders(id),  -- powiązanie ze zleceniem
  photos TEXT[],
  notes TEXT,
  status TEXT DEFAULT 'stored',   -- 'stored' | 'picked_up' | 'disposed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**UI:**
- `/deposits` - lista depozytów z wyszukiwaniem po kliencie/pojeździe
- Widok: rejestr + lokalizacja na magazynie
- Powiadomienia SMS do klienta: "Pora na wymianę opon! Twoje opony czekają."
- Raport: ile opon na magazynie, ile miejsc wolnych
- Przy zleceniu wymiany: auto-podpowiedź "Ten klient ma opony u nas na magazynie"

#### 3.2 Integracja z booking
- Przy rezerwacji online: opcja "Mam opony na depozycie" (auto-wypełnia dane)
- Automatyczne powiązanie depozytu ze zleceniem

---

### Faza 4: BOOKING 2.0 (multi-auto + upselling)
> Cel: Więcej przychodu z każdej rezerwacji

#### 4.1 Multi-auto booking
**Obecny stan:** Klient może wybrać usługi, ale nie może określić liczby aut.

**Do zrobienia:**
- Krok "Pojazdy" w wizardzie: dodawanie wielu aut
- Każde auto = osobny zestaw usług (np. auto 1: wymiana, auto 2: wymiana + przechowywanie)
- Sumowanie łącznego czasu i ceny
- Tworzenie wielu zleceń (1 per auto) pod jedną rezerwacją

**Pliki do modyfikacji:**
- `src/app/booking/page.tsx` - nowy krok + stan pojazdów
- `src/app/api/orders/route.ts` - batch tworzenie zleceń

#### 4.2 Upselling przy rezerwacji
**Do zrobienia:**
- Po wybraniu usług → sekcja "Polecane dodatki":
  - Worki na opony (30 PLN)
  - Przechowywanie opon (200 PLN/sezon)
  - Uzupełnienie płynu do spryskiwaczy (15 PLN)
  - Kontrola ciśnienia (gratis)
- Logika: jeśli wybrano "Wymiana opon" → pokaż "Przechowywanie" jako upsell
- Pole "upsell_source" w DB do śledzenia konwersji

---

### Faza 5: CZAS PRACY PRACOWNIKÓW
> Cel: Rozliczanie godzin pracy i czasu na zleceniu

#### 5.1 Timer na zleceniu
**Do zrobienia:**

**Baza danych - nowa tabela `work_logs`:**
```sql
CREATE TABLE work_logs (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  order_id UUID REFERENCES orders(id),
  type TEXT,              -- 'travel' | 'service' | 'break' | 'availability'
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**UI:**
- Pracownik: przycisk Start/Stop na zleceniu (w widoku mobilnym)
- Dyspozytor: podgląd czasu pracy każdego pracownika
- Typy: dojazd → usługa → przerwa → dojazd do kolejnego
- Raport: czas usługi vs czas dyspozycyjności vs czas dojazdu

#### 5.2 Raport godzinowy
- Tygodniowy/miesięczny zestawienie per pracownik
- Kolumny: czas usługi | czas dojazdu | czas wolny | łącznie
- Eksport do CSV/PDF
- Integracja z obecnym modułem raportów

---

### Faza 6: USPRAWNIENIA MAPY DYSPOZYTORA
> Cel: Mapa jako główne narzędzie pracy dyspozytora

#### 6.1 Zaawansowana mapa
**Do zrobienia:**
- Trasy polilinowe (kolejność zleceń każdego pracownika)
- Kolor trasy = kolor pracownika/regionu
- Kliknięcie na zlecenie → "Przydziel do..." z listą pracowników posortowaną wg odległości
- Filtr: pokaż tylko pracowników "w trasie" / "dostępnych"
- Auto-refresh co 30s (real-time GPS)
- Klaster pinów gdy zoom out

#### 6.2 Quick-assign z mapy
- Drag & drop zlecenia na pracownika (na mapie)
- Popup: "Pracownik X → Zlecenie Y, doliczy ~12 min do trasy"
- Konfirmacja + auto-reorganizacja kolejności

---

## 3. HARMONOGRAM WDROŻENIOWY

| Faza | Zakres | Priorytet | Zależności |
|---|---|---|---|
| **Faza 1** | Optymalizacja tras geo | KRYTYCZNY | Dane GPS pracowników, koordynaty zleceń |
| **Faza 2** | Okna czasowe + priorytety | WYSOKI | Faza 1 (routing) |
| **Faza 3** | Depozyty opon | WYSOKI | Niezależne |
| **Faza 4** | Booking 2.0 (multi-auto, upselling) | ŚREDNI | Faza 3 (depozyty) |
| **Faza 5** | Czas pracy pracowników | ŚREDNI | Niezależne |
| **Faza 6** | Zaawansowana mapa dyspozytora | ŚREDNI | Faza 1 (trasy) |

### Kolejność (rekomendowana):
```
Faza 1 (optymalizacja) ──→ Faza 2 (okna czasowe) ──→ Faza 6 (mapa)
                                                          ↑
Faza 3 (depozyty) ──→ Faza 4 (booking 2.0) ─────────────┘

Faza 5 (czas pracy) ─────────────────────────────────────┘
```

Fazy 1, 3 i 5 mogą startować równolegle (niezależne od siebie).

---

## 4. PODSUMOWANIE

### Gdzie RouteTire wygrywa już dziś:
- Koszt (120 PLN vs 2000-10000 PLN/mies.)
- Dedykowane dla wulkanizacji (nikt inny tego nie ma)
- Rezerwacja online (GeoTask/Comarch tego nie mają)
- Brak opłat per-user

### Co musi mieć żeby dorównać GeoTask:
- Optymalizacja tras (Faza 1) - to jest core value GeoTask
- Okna czasowe (Faza 2) - standard rynkowy
- Widok trasy na mapie (Faza 6) - "klient dzwoni, dyspozytor patrzy kto jest po drodze"

### Co da przewagę nad GeoTask:
- Depozyty opon (Faza 3) - żaden FSM tego nie ma
- Upselling w booking (Faza 4) - żaden FSM tego nie ma
- Multi-auto booking (Faza 4) - unikalne dla branży
- Timer na zleceniu z raportami (Faza 5) - w uproszczonej formie

---

## 5. ŹRÓDŁA

- [GeoTask (Globema)](https://geotask.globema.com/)
- [GeoTask FAQ](https://mobilnypracownik.pl/faq-najczestsze-pytania/)
- [Comarch FSM](https://www.comarch.pl/field-service-management/)
- [Comarch FSM Mobile](https://www.comarch.pl/field-service-management/aplikacja-mobilna-comarch-fsm/)
- [Synchroteam Pricing](https://www.synchroteam.com/pricing.php)
- [SAP FSM](https://www.sap.com/poland/products/scm/field-service-management.html)
- [IBPM FSM](https://fsm.ibpm.pl/)
- [Fieldworker](https://orbis-software.pl/integracje/fieldworker)
- [Porównanie 7 FSM (Wello)](https://pl.wello.solutions/7-najlepszych-programow-do-zarzadzania-serwisem-terenowym-fsm-recenzje-ekspertow-i-porownanie/)
- [GeoTask na Capterra](https://www.capterra.com/p/251525/GeoTask/)
- [Pirios - 10 powodów FSM](https://pirios.com/blog/10-powodow-dla-ktorych-warto-wybrac-system-fsm/)
