# RouteTire / Wulkanizacja Mobilna — pełny audyt systemu

Data audytu: 2026-03-28  
Środowisko: lokalny dev server `http://localhost:3001`, dane i klucze z `.env.local`  
Zakres: frontend, backend, API, schema/db, logika biznesowa, UX/UI, runtime, operacje

## Legenda

- `CONFIRMED` — potwierdzone kodem i/lub runtime.
- `LIKELY` — bardzo mocny sygnał z kodu, ale bez pełnego potwierdzenia runtime na żywych mutacjach.
- `HYPOTHESIS` — sensowne podejrzenie, ale wymaga dalszej weryfikacji.

## Metodologia

- przeskanowane repo: `37` stron App Router, `102` route handlery API, ~`57 794` linii TS/TSX,
- przeczytane kluczowe moduły: auth, orders, calendar, planner, map, worker, tracking, work schedules, notifications, reports, DB migrations,
- uruchomione `npm run build` i `npm run lint`,
- uruchomiony runtime lokalny na porcie `3001`,
- wykonane smoke testy Playwright i ręczne requesty `curl`,
- wykonane zapytania do live DB przez `DATABASE_URL`.

---

## 1. Executive Summary

### Czym jest RouteTire

RouteTire to operacyjny system do mobilnej wulkanizacji: przyjmowanie zleceń, planowanie i harmonogramowanie, dispatcher map, worker app, tracking klienta, grafiki pracowników, raporty, regiony, flota, magazyn i komunikacja.

### Obecny stan projektu

Projekt jest szeroki funkcjonalnie, ale nie jest gotowy jako production-grade system operacyjny. To nie jest pusty mockup: build działa, główne ekrany się renderują, planner/mapa/kalendarz/worker istnieją i mają realną logikę. Jednocześnie system ma kilka krytycznych rozjazdów między UI, backendem i bazą, które wprost psują operacje albo bezpieczeństwo.

### Werdykt

**Stan projektu: częściowo gotowy produktowo, ale niebezpieczny i niespójny operacyjnie.**

Najkrócej:

- produkt wygląda szeroko i ambitnie,
- technicznie ma cechy systemu „na pół wdrożonego”,
- krytyczne flow klienta, workera i dispatchera są częściowo atrapami albo działają na rozjechanym modelu danych.

### Największe ryzyka

- `CONFIRMED / CRITICAL` Publiczne API z service-role.
  Dowód: skan `68/102` route handlerów bez `checkAuth/withAuth`; `src/proxy.ts`, `src/lib/supabase/middleware.ts`, `src/app/api/orders/route.ts`, `src/app/api/work-schedules/route.ts`, `src/app/api/regions/route.ts`.
- `CONFIRMED / CRITICAL` Publiczny tracking ujawnia live pozycję pracownika i pojazd.
  Dowód: `GET /api/tracking/[id]` zwraca GPS i dane kierowcy bez auth.
- `CONFIRMED / CRITICAL` Publiczne self-care klienta jest zepsute, a obok istnieje osobny publiczny mutate endpoint bez auth.
  Dowód: UI trackingu woła `POST /api/orders/cancel` i `POST /api/orders/reschedule`, oba kończą się `401`; równolegle istnieje `POST /api/tracking/actions` bez auth.
- `CONFIRMED / CRITICAL` Live DB nie odpowiada schematowi zakładanemu przez kod.
  Dowód: migracja `029_order_time_fields.sql` istnieje w repo, ale live DB nie ma `planned_start_time`, `actual_*`, `order_time_type`, `service_duration_minutes`; runtime zwraca `column orders.planned_start_time does not exist`.
- `CONFIRMED / CRITICAL` Dane harmonogramów są już uszkodzone.
  Dowód: w live DB istnieją rekordy `scheduled_time_end < scheduled_time_start`.

### Największe braki

- brak jednego source of truth dla `orders` i logiki czasu,
- brak domyślnej ochrony prywatnych endpointów,
- brak pełnego rollout discipline między migracjami w repo a live DB,
- brak testów kontraktowych i E2E na krytycznych flow,
- brak realnych integracji SMS/push mimo UI sugerującego gotowość.

### Ogólna ocena jakości

- produktowo: `6/10`,
- architektonicznie: `3/10`,
- bezpieczeństwo: `1/10`,
- spójność danych: `2/10`,
- UX: `5/10`,
- operacyjna gotowość do realnej pracy: `3/10`.

---

## 2. Mapa systemu

### Moduły

- Operacje / dispatcher: `/dashboard`, `/map`, `/planner`, `/calendar`, `/orders`, `/dispatch`
- Workforce: `/employees`, `/schedule`, `/worker`, `/worker/tasks/[id]`, `/worker/route`, `/worker/summary`
- Klient: `/booking`, `/tracking/[id]`, `/invite/[token]`
- Wsparcie operacyjne: `/fleet`, `/gps-history`, `/reports`, `/services`, `/regions`, `/notifications`, `/warehouse`, `/deposits`, `/forms`, `/recurring`
- Backend: `src/app/api/**`

### Główne domeny

- `orders`
- `clients`
- `employees` / `profiles`
- `work_schedules`
- `employee_locations`
- `vehicles` / `vehicle_assignments`
- `services`
- `worker_notifications` / `alerts` / `notification_templates`

### Relacje

- `orders.client_id -> clients.id`
- `orders.employee_id -> employees.id`
- `employees.user_id -> profiles.id`
- `work_schedules.employee_id -> employees.id`
- `employee_locations.employee_id -> employees.id`
- `vehicle_assignments.employee_id -> employees.id`

### Faktyczne źródła prawdy

| Obszar | Deklarowane źródło prawdy | Faktyczne źródło prawdy | Ocena |
|---|---|---|---|
| Auth i role | `profiles.role` + middleware | manualne guardy w pojedynczych route handlerach | `CONFIRMED` rozjazd |
| Zlecenia | `/api/orders` + typy | miks direct Supabase writes z UI i route handlerów | `CONFIRMED` rozjazd |
| Czas zlecenia | migracja `029` + typy TS | legacy `scheduled_*` plus częściowo nieistniejące `planned_*` | `CONFIRMED` rozjazd |
| Grafiki | `work_schedules(start_at, duration_minutes)` | tabela live + UI + publiczny endpoint | `CONFIRMED` rozjazd |
| Self-care klienta | tracking UI | UI woła inne endpointy niż publiczny tracking actions | `CONFIRMED` rozjazd |

### Najważniejsze flow

- utworzenie zlecenia z panelu,
- utworzenie zlecenia z kalendarza,
- quick assign / reassign,
- planowanie w Gantt,
- grafiki pracowników,
- worker lifecycle,
- publiczny tracking klienta,
- self-care klienta,
- powiadomienia.

### Macierz weryfikacji flow

| Flow | Static audit | Runtime | Werdykt |
|---|---|---|---|
| Logowanie admina | tak | tak | `CONFIRMED` działa z pełnym mailem `admin@wulkanizacja.pl` |
| UI logowania: social / forgot password | tak | tak | `CONFIRMED` mylące / atrapy |
| Dashboard admin | tak | tak | `CONFIRMED` ładuje się |
| Mapa dispatchera | tak | tak | `CONFIRMED` ładuje się po loginie |
| Kalendarz | tak | tak | `CONFIRMED` renderuje się, ale robi błędne query `is_night_shift` |
| Otwarcie modala „Nowe zlecenie” | tak | tak | `CONFIRMED` modal się otwiera |
| Tworzenie zlecenia z kalendarza | tak | nie | `LIKELY` omija centralny backend, ale nie wykonywałem mutacji na live danych |
| Planner / Gantt load | tak | częściowo | `LIKELY` kod silnie wskazuje problemy czasu; nie wykonałem pełnych mutacji drag/drop na live danych |
| Gantt lock | tak | pośrednio | `CONFIRMED` feature papierowy, bo live DB nie ma `is_locked` |
| Schedule load/edit | tak | częściowo | `LIKELY` edycja może dublować zmiany; nie robiłem mutacji na live danych |
| Worker shell | tak | tak | `CONFIRMED` ładuje demo preview i robi błędny request notifications |
| Worker lifecycle start/arrive/complete | tak | nie | `LIKELY` kod zapisuje do nieistniejących kolumn |
| Publiczny tracking read | tak | tak | `CONFIRMED` działa i ujawnia dane operacyjne |
| Tracking cancel | tak | tak | `CONFIRMED` broken flow, `401` |
| Tracking reschedule | tak | tak | `CONFIRMED` broken flow, `401` |
| Powiadomienia SMS/push | tak | nie | `CONFIRMED` placeholdery po kodzie |

---

## 3. Audit funkcjonalny

### 3.1 Auth i prywatne API

Status weryfikacji: static `tak`, runtime `tak`

Expected behavior:
- prywatne moduły i API powinny wymagać sesji i roli,
- publiczne endpointy powinny być jawnie oznaczone i ograniczone do minimalnego payloadu.

Actual behavior:
- dashboard jako UI jest chroniony klientowo,
- `/api/*` przechodzi przez `proxy.ts`,
- większość route handlerów z service-role nie ma auth guarda.

Evidence:
- `src/proxy.ts:72-85`
- `src/lib/supabase/middleware.ts:32-46`
- skan route handlerów: `68/102` bez guarda
- runtime `curl /api/orders?limit=1`, `curl /api/work-schedules?...`, `curl /api/regions`

Risk:
- `CONFIRMED / CRITICAL` wyciek danych klientów, grafików i lokalizacji,
- `CONFIRMED / CRITICAL` nieautoryzowane mutacje i sabotaż planu pracy.

### 3.2 Zlecenia i centralna logika orders

Status weryfikacji: static `tak`, runtime `częściowo`

Expected behavior:
- wszystkie create/update/assign/reschedule/cancel powinny przechodzić przez jedną backendową ścieżkę z walidacją, audit trail i side effectami.

Actual behavior:
- `/api/orders` ma część logiki biznesowej,
- kalendarz tworzy i aktualizuje `orders` bezpośrednio przez klienta Supabase,
- publiczny `GET /api/orders` zwraca pełne dane zleceń.

Evidence:
- `src/app/api/orders/route.ts`
- `src/app/(dashboard)/calendar/_components/OrderCreationDialog.tsx:369-408`
- `src/app/(dashboard)/calendar/page.tsx:255-281`
- runtime `GET /api/orders?limit=1`

Risk:
- `CONFIRMED / HIGH` rozjazd walidacji i side effectów,
- `LIKELY / HIGH` niespójne statusy, brak historii zmian i trudne regresje.

### 3.3 Kalendarz

Status weryfikacji: static `tak`, runtime `tak`

Expected behavior:
- kalendarz powinien pokazywać poprawne zlecenia i grafiki,
- create/assign actions powinny być spójne z backendem,
- błędy zależne od schematu nie powinny wyciekać do klienta.

Actual behavior:
- ekran renderuje się i otwiera modal „Nowe zlecenie”,
- kalendarz odpytuje `work_schedules.is_night_shift`, którego live DB nie ma,
- create i quick assign omijają `/api/orders`.

Evidence:
- runtime po loginie: `400` z Supabase `column work_schedules.is_night_shift does not exist`
- `src/app/(dashboard)/calendar/_components/OrderCreationDialog.tsx`
- `src/app/(dashboard)/calendar/page.tsx`

Risk:
- `CONFIRMED / HIGH` kalendarz działa na niezgodnym schemacie,
- `LIKELY / HIGH` część działań planistycznych zapisuje dane poza centralnym kontraktem.

### 3.4 Planner i Gantt

Status weryfikacji: static `tak`, runtime `częściowo`

Expected behavior:
- planner powinien utrzymywać spójne `start/end`, uwzględniać konflikty i dawać trwałe akcje typu lock, insert, unassign, optimize.

Actual behavior:
- planner ma heurystykę, snapshoty i rozbudowane UI,
- commit z optimize/insert/update-time zapisuje tylko `scheduled_time_start`,
- lock istnieje w UI, ale live DB nie ma `orders.is_locked`,
- część błędów jest połykana przez `catch {}`.

Evidence:
- `src/app/api/planner/insert/route.ts:311-319`
- `src/app/api/planner/optimize/route.ts:738-744`
- `src/app/api/orders/update-time/route.ts:20-38`
- `src/app/api/orders/lock/route.ts:13-38`
- `src/app/(dashboard)/planner/_components/GanttView.tsx:363-383`
- query live DB: brak kolumny `is_locked`

Risk:
- `CONFIRMED / CRITICAL` planner może psuć spójność czasu,
- `CONFIRMED / HIGH` lock to fałszywe poczucie bezpieczeństwa,
- `LIKELY / HIGH` optymalizacja może dawać błędne wyniki przy braku GPS i fallbacku Warszawy.

### 3.5 Grafiki / dyżury / schedule

Status weryfikacji: static `tak`, runtime `częściowo`

Expected behavior:
- grafiki powinny być prywatne, konflikt-free i bezpiecznie edytowalne.

Actual behavior:
- moduł grafiku jest szeroki i obsługuje długie dyżury,
- endpoint `/api/work-schedules` jest publiczny,
- edycja istniejącej zmiany idzie przez `POST` bez `id`,
- upsert opiera się o `(employee_id,start_at)`.

Evidence:
- `src/app/api/work-schedules/route.ts`
- `src/app/(dashboard)/schedule/_components/useScheduleData.ts:247-307`
- query live DB: wielokrotne `duration_minutes = 2880`
- runtime `curl /api/work-schedules?...`

Risk:
- `CONFIRMED / CRITICAL` wyciek i możliwość mutacji grafików,
- `LIKELY / HIGH` edycja po zmianie `start_at` duplikuje dyżur,
- `LIKELY / MEDIUM` planner capacity może być fałszywy przez długie dyżury.

### 3.6 Worker app

Status weryfikacji: static `tak`, runtime `tak` dla shell, `nie` dla pełnych mutacji

Expected behavior:
- worker powinien dostać prawdziwe zadania, powiadomienia i poprawne przejścia statusów.

Actual behavior:
- `/worker` ładuje się po loginie admina jako preview z demo danymi,
- shell odpala błędny request notifications,
- lifecycle API zapisuje do kolumn, których live DB nie ma.

Evidence:
- runtime po loginie `/worker` pokazuje demo stan: `Jan`, `0/6`, `34 km`
- runtime `GET /api/worker-notifications?unread_only=true -> 400 {"error":"employee_id is required"}`
- `src/app/worker/worker-shell.tsx:63-68`
- `src/app/api/worker-notifications/route.ts:13-18,45-48`
- `src/app/api/worker/tasks/[id]/start-driving/route.ts`
- `src/app/api/worker/tasks/[id]/arrive/route.ts`
- `src/app/api/worker/tasks/complete/route.ts`

Risk:
- `CONFIRMED / HIGH` worker shell ma broken notifications contract,
- `LIKELY / CRITICAL` realny start/arrive/complete może wybuchać przez brak kolumn,
- `LIKELY / MEDIUM` admin preview maskuje prawdziwe błędy.

### 3.7 Tracking klienta i self-care

Status weryfikacji: static `tak`, runtime `tak`

Expected behavior:
- klient powinien mieć bezpieczny read-only tracking albo poprawnie zabezpieczony self-care.

Actual behavior:
- publiczny tracking SSR działa po samym UUID zlecenia,
- zwraca dane technika, pojazdu i live GPS,
- UI pokazuje „Zmień termin” i „Anuluj wizytę”,
- obie akcje w UI kończą się `401`,
- istnieje osobny publiczny mutate endpoint bez auth.

Evidence:
- `src/app/api/tracking/[id]/route.ts`
- `src/app/tracking/[id]/self-care-actions.tsx`
- `src/app/api/orders/cancel/route.ts`
- `src/app/api/orders/reschedule/route.ts`
- `src/app/api/tracking/actions/route.ts`
- runtime:
  - `GET /api/tracking/<id>` zwraca live GPS i pojazd,
  - `POST /api/orders/cancel -> 401`,
  - `POST /api/orders/reschedule -> 401`,
  - `POST /api/tracking/actions` bez auth nie zwraca `401`.

Risk:
- `CONFIRMED / CRITICAL` wyciek lokalizacji i danych operacyjnych,
- `CONFIRMED / HIGH` broken self-care w UI,
- `CONFIRMED / CRITICAL` obok istnieje publiczny write endpoint.

### 3.8 Mapa dispatchera

Status weryfikacji: static `tak`, runtime `tak`

Expected behavior:
- mapa powinna pokazywać realny stan GPS, pracowników i zleceń bez ukrytych rozjazdów modelu.

Actual behavior:
- ekran się ładuje i pokazuje listę pracowników, pojazdy GPS i status online,
- dane wyglądają realnie, ale opierają się na tym samym otwartym modelu danych i ręcznej logice auth,
- wcześniejszy test `networkidle` timeoutował przez połączenia live/realtime.

Evidence:
- runtime po loginie `/map` renderuje pracowników, pojazdy i lokalizacje,
- console warnings z runtime o realtime/SSE,
- `src/app/(dashboard)/map/page.tsx`

Risk:
- `LIKELY / HIGH` duży komponent i live integrations utrudniają stabilność,
- `HYPOTHESIS / MEDIUM` stale połączenia realtime mogą generować ukryte problemy wydajnościowe.

### 3.9 Notyfikacje / SMS / email / push

Status weryfikacji: static `tak`, runtime `nie`

Expected behavior:
- powiadomienia powinny mieć realnych providerów, retry i poprawny audit trail.

Actual behavior:
- część ścieżek tylko loguje placeholder,
- push jest stubem,
- UI może sugerować gotowość komunikacji, której realnie nie ma.

Evidence:
- `src/lib/sms.ts:7-12`
- `src/lib/worker/push-notifications.ts:8-16`
- `src/app/api/notify/route.ts:58-92`
- `src/lib/notification-dispatcher.ts:86-88`

Risk:
- `CONFIRMED / MEDIUM` system obiecuje komunikację, której realnie nie wysyła.

### 3.10 Raporty

Status weryfikacji: static `tak`, runtime `nie`

Expected behavior:
- raporty powinny liczyć dane na rzeczywistych statusach i spójnym modelu zleceń.

Actual behavior:
- dzienny raport używa statusu `pending`, którego schema nie dopuszcza.

Evidence:
- `src/app/api/reports/daily/route.ts:77-78,111-113`
- `src/lib/types/index.ts:7`
- `supabase/migrations/020_order_status_consistency.sql`

Risk:
- `CONFIRMED / MEDIUM` KPI są częściowo z definicji fałszywe.

---

## 4. Audit UX/UI

- `CONFIRMED` Login jest mylący.
  Evidence: `src/app/(auth)/login/page.tsx:23-25`; runtime UI pokazuje pole `LOGIN`, a kod auto-dopina `@routetire.pl`, podczas gdy demo login działa jako pełny mail `admin@wulkanizacja.pl`.
  Risk: użytkownik nie wie, czy ma wpisać login, mail czy alias.

- `CONFIRMED` „Zapomniałeś?” nie jest resetem hasła.
  Evidence: `src/app/(auth)/login/page.tsx:96-99`.
  Risk: UI obiecuje flow, którego nie ma.

- `CONFIRMED` Social login jest atrapą.
  Evidence: `src/app/(auth)/login/page.tsx:147-159`; runtime button text to samo `G`.
  Risk: obniżenie zaufania i fałszywe affordance.

- `CONFIRMED` Tracking klienta pokazuje pełny self-care, który kończy się `401`.
  Evidence: runtime Playwright na `/tracking/f572...`.
  Risk: klient klika poprawne CTA i dostaje błąd autoryzacji zamiast realnej akcji.

- `CONFIRMED` Gantt ukrywa błędy.
  Evidence: `src/app/(dashboard)/planner/_components/GanttView.tsx` ma `catch {}` przy akcjach lock/reopt.
  Risk: dispatcher nie wie, czy zmiana się utrwaliła.

- `LIKELY` Grafik jest mało czytelny dla wielodniowych dyżurów.
  Evidence: zapis typu `22:00–→`, długie dyżury `2880 min`.
  Risk: błędna interpretacja zmian i capacity.

- `LIKELY` Worker preview z demo danymi utrudnia diagnostykę.
  Evidence: runtime `/worker` po loginie admina pokazuje „Jan”, `0/6`, `34 km`.
  Risk: łatwo przegapić, że patrzymy na mock, a nie prawdziwe zadania.

---

## 5. Audit logiki biznesowej

### Harmonogramowanie i model czasu

- `CONFIRMED` System jednocześnie zakłada, że `scheduled_time_end` istnieje, że „end time is NEVER stored”, i że worker/planner operuje na `planned_*`/`actual_*`.
- `CONFIRMED` Dane live już zawierają rekordy `end < start`.
- `Risk`: cały obszar ETA, capacity, kolizji i raportowania jest niewiarygodny.

### Przypisania pracowników

- `LIKELY` Quick assign/reassign z kalendarza omija centralne walidacje.
- `LIKELY` Edycja grafiku po zmianie `start_at` może zostawić stary dyżur i dodać nowy.
- `Risk`: jeden pracownik może wyglądać na wolnego albo zajętego w zależności od ekranu.

### Optymalizacja tras

- `LIKELY` Auto-assign liczy dostępność od bieżącego zegara systemowego zamiast od planowanego terminu.
  Evidence: `src/lib/auto-assign.ts:247`.
- `LIKELY` Planner używa fallbacku Warszawy przy braku GPS.
  Evidence: `src/app/api/planner/insert/route.ts`, `src/app/api/planner/optimize/route.ts`.
- `Risk`: sugestie tras i pracowników mogą być błędne szczególnie poza Warszawą i dla przyszłych dni.

### Statusy i raportowanie

- `CONFIRMED` raport dzienny używa statusu `pending`, którego nie ma,
- `LIKELY` część ekranów zakłada inne mapowanie statusów niż worker lifecycle,
- `Risk`: mylące KPI, błędne SLA i nieczytelny stan operacji.

### Dostępność, dyżury, okna czasowe

- `CONFIRMED` live dane zawierają długie dyżury `2880 min`,
- `HYPOTHESIS` jeśli to nie jest świadomy model on-call, capacity planning jest przeszacowany,
- `Risk`: system może przydzielać ludzi w nierealny sposób.

---

## 6. Audit techniczny

### Architektura

- `CONFIRMED` brak jednego backendowego rdzenia domenowego,
- `CONFIRMED` direct client writes do `orders`,
- `CONFIRMED` service-role w route handlerach bez centralnej ochrony,
- `CONFIRMED` schema drift bez guardrail na starcie aplikacji.

### Jakość kodu

- `CONFIRMED` `npm run build` przechodzi,
- `CONFIRMED` `npm run lint` kończy się `553` problemami (`379` errors, `174` warnings),
- `CONFIRMED` brak testów jednostkowych i E2E dla krytycznych obszarów.

### Dead code / stubs / commented intent

- `CONFIRMED` placeholdery w SMS, push i części notify,
- `CONFIRMED` seed produkcyjny jest stary względem aktualnego modelu grafików,
- `LIKELY` część dokumentacji statusów i parity docs opisuje coś, co nie działa w praktyce.

### Performance / maintainability

- `CONFIRMED` monolityczne komponenty:
  - `src/app/(dashboard)/map/page.tsx` — `2859` linii
  - `src/app/(dashboard)/orders/page.tsx` — `1473`
  - `src/app/(dashboard)/warehouse/page.tsx` — `1448`
  - `src/app/(dashboard)/map/_components/WorkerDaySidebar.tsx` — `1439`
- `CONFIRMED` liczne `catch {}` i problemy hooków zgłaszane przez lint.

### Operacje i sekrety

- `CONFIRMED` `scripts/seed-production.js` zawiera hardcoded Supabase service role key,
- `CONFIRMED` ten sam seed używa starego modelu `work_schedules`,
- `Risk`: wyciek sekretów plus fałszywe poczucie, że seed „produkcyjny” jest wiarygodny.

---

## 7. Lista bugów i problemów

| ID | Status | Priorytet | Obszar | Problem | Dowód | Skutek biznesowy | Rekomendowana naprawa |
|---|---|---|---|---|---|---|---|
| RT-001 | CONFIRMED | critical | Security/API | Prywatne API z service-role są publiczne. | skan `68/102`; `src/proxy.ts`, `src/lib/supabase/middleware.ts` | wyciek danych i nieautoryzowane mutacje | domyślnie blokować API i dopiero jawnie otwierać publiczne trasy |
| RT-002 | CONFIRMED | critical | Orders/API | `GET /api/orders` bez auth zwraca PII i plan pracy. | runtime `curl /api/orders?limit=1`; `src/app/api/orders/route.ts` | wyciek danych klientów | dodać auth i ograniczyć payload |
| RT-003 | CONFIRMED | critical | Tracking | `GET /api/tracking/[id]` bez auth ujawnia live lokalizację i pojazd. | runtime `curl /api/tracking/<id>`; `src/app/api/tracking/[id]/route.ts` | wyciek lokalizacji pracowników | signed token z TTL, minimalny payload |
| RT-004 | CONFIRMED | critical | Tracking | `POST /api/tracking/actions` jest publiczny. | `src/app/api/tracking/actions/route.ts`; runtime bez auth nie zwraca `401` | nieautoryzowane anulowanie/przekładanie wizyt | wyłączyć lub zabezpieczyć tokenem i audytem |
| RT-005 | CONFIRMED | critical | Schedule/API | `/api/work-schedules` jest publiczne. | `src/app/api/work-schedules/route.ts`; runtime `curl /api/work-schedules` | wyciek i sabotaż grafików | auth + RBAC |
| RT-006 | CONFIRMED | critical | DB/Schema | Live DB nie ma pól z migracji `029`. | `supabase/migrations/029_order_time_fields.sql`; runtime `column orders.planned_start_time does not exist` | worker i planner zapisują w nieistniejący model | rollout migracji i startup check |
| RT-007 | CONFIRMED | critical | Data integrity | Live DB ma rekordy `scheduled_time_end < scheduled_time_start`. | query DB z 6 rekordami | zły ETA, konflikty i fałszywe raporty | constraints, naprawa danych, sanity job |
| RT-008 | CONFIRMED | critical | Planner/Time | Planner zapisuje tylko start, nie aktualizuje końca. | `api/planner/insert`, `api/planner/optimize`, `api/orders/update-time` | rozjazd czasu na kilku ekranach | przeliczać i zapisywać start + end razem |
| RT-009 | CONFIRMED | high | Gantt | Lock jest atrapą, bo DB nie ma `is_locked`. | `src/app/api/orders/lock/route.ts`; brak kolumny live DB | dispatcher wierzy w blokadę, której nie ma | dodać kolumnę albo usunąć feature |
| RT-010 | CONFIRMED | high | Calendar | Kalendarz robi query do nieistniejącego `work_schedules.is_night_shift`. | runtime `400` po loginie na `/calendar` | błędy loadu i niezgodny schema contract | uzgodnić schema i query |
| RT-011 | LIKELY | high | Calendar/Orders | Tworzenie zlecenia w kalendarzu omija `/api/orders`. | `OrderCreationDialog.tsx` | brak wspólnej walidacji i side effectów | spiąć create przez backend service |
| RT-012 | LIKELY | high | Calendar/Orders | Quick assign/reassign omija backend biznesowy. | `calendar/page.tsx` | brak historii zmian i walidacji | użyć dedykowanego API |
| RT-013 | CONFIRMED | high | Tracking/UX | Self-care klienta kończy się `401`. | runtime Playwright na `/tracking/f572...`; `self-care-actions.tsx` | klient widzi funkcję, która nie działa | przepiąć UI albo ukryć CTA |
| RT-014 | CONFIRMED | high | Worker | Notifications badge jest zepsuty przez zły kontrakt. | runtime `400 /api/worker-notifications?unread_only=true`; `worker-shell.tsx` | worker nie widzi alertów | ujednolicić parametry i response shape |
| RT-015 | LIKELY | critical | Worker | Start/arrive/complete może wybuchać przez brak kolumn `actual_*`. | `api/worker/tasks/*`; live DB bez tych kolumn | worker lifecycle może nie działać | najpierw schema, potem mutacje |
| RT-016 | LIKELY | high | Schedule | Edycja zmiany może utworzyć duplikat po zmianie `start_at`. | `useScheduleData.ts`, `api/work-schedules/route.ts` | fałszywe capacity i konflikty | osobny update po `id` |
| RT-017 | LIKELY | high | Auto-assign | Dopasowanie czasowe liczone jest od „teraz”, nie od planowanego dnia. | `src/lib/auto-assign.ts:247-265` | zły dobór pracownika dla przyszłych zleceń | liczyć od slotu planowanego |
| RT-018 | LIKELY | high | Planner/Geo | Fallback Warszawy deformuje scoring tras. | `api/planner/insert`, `api/planner/optimize` | złe priorytety tras poza Warszawą | używać ostatniej pozycji/regionu |
| RT-019 | CONFIRMED | medium | Reports | Raport dzienny używa statusu `pending`, którego nie ma. | `api/reports/daily/route.ts`; migracja `020` | fałszywe KPI | ujednolicić status machine |
| RT-020 | CONFIRMED | medium | Notifications | SMS/push/email są placeholderami lub stubami. | `src/lib/sms.ts`, `push-notifications.ts`, `api/notify/route.ts` | komunikacja tylko udaje gotową | wdrożyć providerów lub ukryć funkcje |
| RT-021 | CONFIRMED | high | Security/Secrets | W repo siedzi hardcoded service-role key. | `scripts/seed-production.js:4-10` | pełna kompromitacja środowiska | usunąć i zrotować klucz |
| RT-022 | CONFIRMED | medium | Schema/Types | `ServiceCategory` w kodzie nie zgadza się z live danymi. | `src/lib/types/index.ts:15`; query DB kategorii | filtry i logika usług pracują na fałszywym modelu | urealnić typy i migracje |
| RT-023 | CONFIRMED | medium | Login/UX | Login ma martwe CTA i mylący model identyfikatora. | `login/page.tsx`; runtime przycisk `G` | frustracja i spadek zaufania | uprościć ekran logowania |
| RT-024 | CONFIRMED | medium | Code quality | Brak testów i ogromny dług lintowy. | `npm run lint`; brak testów | wysokie ryzyko regresji | dodać testy P0 i obniżać dług modułami |

---

## 8. Lista brakujących rzeczy

### Brakujące funkcje

- bezpieczny self-care klienta,
- prawdziwy lock/pin na Gantt,
- realne SMS/push,
- centralna historia zmian `orders`,
- detekcja schema drift przy starcie.

### Brakujące stany i walidacje

- walidacja `scheduled_time_end >= scheduled_time_start`,
- walidacja spójności modelu czasu po optimize/drag/drop,
- jawne błędy w Gantt po nieudanej akcji,
- blokada tworzenia konfliktowych grafików.

### Brakujące połączenia frontend/backend

- tracking UI nie używa bezpiecznego publicznego flow,
- worker shell nie używa poprawnego kontraktu notifications,
- kalendarz nie używa centralnego backendu `orders`.

### Brakujące zabezpieczenia

- domyślny auth wrapper dla API,
- signed tokens dla trackingu/self-care,
- secret scanning i rotacja kluczy,
- rollout checklist dla migracji.

### Brakujące testy

- auth regression tests dla wszystkich admin/service endpoints,
- contract tests UI <-> API dla worker notifications,
- tests dla planner time math,
- E2E dla tracking cancel/reschedule,
- integrity tests dla `orders` i `work_schedules`.

---

## 9. Quick wins

- zamknąć publiczne endpointy `orders`, `regions`, `work-schedules`, `tracking/actions`, `services`, `reports`,
- ukryć self-care CTA do czasu poprawnego flow,
- naprawić kontrakt `worker-notifications`,
- poprawić kalendarzowe query `is_night_shift`,
- usunąć z UI lock, jeśli nie ma trwałego zapisu,
- poprawić `reports/daily` i ekran logowania,
- usunąć hardcoded service-role key z repo i natychmiast zrotować sekret.

---

## 10. Strategic fixes

- zbudować jedną warstwę backend services dla `orders`, `tracking`, `schedule`, `worker`,
- zakończyć migrację z legacy `scheduled_*` do spójnego modelu czasu albo świadomie z niej zrezygnować,
- wprowadzić policy: brak direct client writes do tabel domenowych,
- dodać startup/CI check na schema drift,
- rozbić największe komponenty na mniejsze moduły domenowe,
- dodać kontraktowe i E2E smoke testy na najważniejsze flow operacyjne.

---

## 11. Plan działania

### Natychmiast

1. Zablokować publiczne endpointy z service-role.
2. Wyłączyć lub zabezpieczyć `api/tracking/actions`.
3. Ukryć self-care CTA w trackingu klienta.
4. Naprawić integralność `scheduled_time_*` i uruchomić sanity scan.
5. Zrotować wycieknięty service-role key.

### W tym tygodniu

1. Dokończyć rollout migracji `029` albo wycofać kod zależny od nowych pól.
2. Naprawić `worker-notifications`.
3. Naprawić kalendarzowe query `is_night_shift`.
4. Rozdzielić create/update grafików po `id`.
5. Spiąć create/assign zleceń przez jeden backend.

### W tym miesiącu

1. Uporządkować model czasu.
2. Zrefaktorować auth layer i route guards.
3. Dodać testy kontraktowe `orders/planner/worker/tracking`.
4. Rozbić największe komponenty i zmniejszyć coupling.

### Później

1. Rozbudować optimizer o realne constraints i explainability.
2. Dodać observability, audit log i alerting.
3. Dopiąć prawdziwe komunikatory i retry policies.

---

## 12. Verified bugs

- `CONFIRMED / CRITICAL` publiczne API z service-role,
- `CONFIRMED / CRITICAL` publiczny read tracking z live GPS,
- `CONFIRMED / CRITICAL` publiczny mutate endpoint tracking actions,
- `CONFIRMED / CRITICAL` live schema drift względem migracji `029`,
- `CONFIRMED / CRITICAL` uszkodzone dane `scheduled_time_end`,
- `CONFIRMED / HIGH` broken self-care klienta (`401`),
- `CONFIRMED / HIGH` broken notifications contract workera,
- `CONFIRMED / HIGH` fake Gantt lock,
- `CONFIRMED / HIGH` kalendarz odpytuje nieistniejącą kolumnę `is_night_shift`,
- `CONFIRMED / MEDIUM` raport dzienny używa nieistniejącego statusu `pending`,
- `CONFIRMED / MEDIUM` login ma martwe CTA,
- `CONFIRMED / HIGH` hardcoded service-role key w repo.

## 13. Suspected issues

- `LIKELY / CRITICAL` worker lifecycle wysypie się na `actual_*`,
- `LIKELY / HIGH` edycja grafiku duplikuje zmiany po zmianie `start_at`,
- `LIKELY / HIGH` create/assign z kalendarza omija ważne reguły biznesowe,
- `LIKELY / HIGH` auto-assign wybiera złego pracownika dla przyszłych zleceń,
- `LIKELY / HIGH` fallback Warszawy zniekształca optimizer,
- `LIKELY / MEDIUM` admin preview workera maskuje realne problemy operacyjne.

## 14. Missing features

- bezpieczne self-care klienta,
- realne SMS/push,
- prawdziwy trwały lock/pin na Gantt,
- kontraktowe testy backend/frontend,
- detekcja schema drift,
- pełny audit log zmian operacyjnych.

## 15. Architectural risks

- brak jednego source of truth dla `orders`,
- direct writes z UI do tabel biznesowych,
- manualny i niespójny auth model,
- schema drift bez guardrail,
- duże komponenty o wysokim couplingu.

## 16. UX traps

- ekran logowania nie komunikuje poprawnego formatu loginu,
- social login i reset hasła wyglądają na gotowe, ale nie są,
- tracking klienta pokazuje działające CTA, które kończą się `401`,
- Gantt sprawia wrażenie trwałego, mimo że część akcji jest papierowa,
- worker preview po adminie wygląda jak realna praca, choć to demo.

## 17. Pytania otwarte

- Czy 48h dyżury są intencjonalnym modelem on-call, czy artefaktem generatora?
- Czy `api/tracking/actions` to stary endpoint, który miał zastąpić obecne self-care?
- Czy migracja `029` została wdrożona gdzie indziej, a `.env.local` wskazuje starszą bazę?
- Czy kalendarz celowo omija `/api/orders`, czy to skrót techniczny?

## 18. Miejsca, których nie dało się zweryfikować

- recurring orders na realnych danych,
- forms/templates na realnych danych,
- alerts i część worker notifications na realnych rekordach,
- depozyty i część flow magazynowych,
- pełne integracje zewnętrzne poza odczytem kodu.

## 19. Założenia

- audyt dotyczy środowiska wskazanego przez lokalne `.env.local`,
- live dane z tego środowiska są reprezentatywne dla aktualnego systemu,
- jeśli nie robiłem mutacji na produkcyjnie wyglądających danych, oznaczałem wnioski jako `LIKELY`, nie `CONFIRMED`,
- brak rekordów w części tabel ograniczał runtime verification niektórych modułów.
