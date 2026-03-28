# RouteTire — lista bugów i problemów

Legenda:

- `CONFIRMED` — potwierdzone kodem i/lub runtime
- `LIKELY` — mocno prawdopodobne, ale bez pełnego dowodu runtime
- `HYPOTHESIS` — podejrzenie do dalszej weryfikacji

## Tabela problemów

| ID | Status | Priorytet | Obszar | Problem | Dowód | Skutek biznesowy | Rekomendowana naprawa |
|---|---|---|---|---|---|---|---|
| RT-001 | CONFIRMED | critical | Security/API | `68/102` route handlerów API z service-role lub server client nie ma auth guarda. | skan repo; `src/proxy.ts`, `src/lib/supabase/middleware.ts` | prywatne dane i mutacje są publicznie dostępne | dodać centralny auth baseline dla API |
| RT-002 | CONFIRMED | critical | Orders/API | `GET /api/orders` bez auth zwraca PII klientów i dane operacyjne. | runtime `curl /api/orders?limit=1`; `src/app/api/orders/route.ts` | wyciek danych klientów i planu pracy | zamknąć endpoint i ograniczyć payload |
| RT-003 | CONFIRMED | critical | Tracking | `GET /api/tracking/[id]` bez auth ujawnia live lokalizację kierowcy i pojazd. | runtime `curl /api/tracking/<id>`; `src/app/api/tracking/[id]/route.ts` | wyciek lokalizacji pracowników | signed token + TTL + minimalny payload |
| RT-004 | CONFIRMED | critical | Tracking | `POST /api/tracking/actions` jest publiczny i gotowy do mutacji zlecenia. | `src/app/api/tracking/actions/route.ts`; runtime bez auth nie zwraca `401` | każdy z UUID może anulować/przełożyć wizytę | wyłączyć albo zabezpieczyć tokenem |
| RT-005 | CONFIRMED | critical | Schedule/API | `/api/work-schedules` jest publiczne. | `src/app/api/work-schedules/route.ts`; runtime `curl /api/work-schedules?...` | wyciek i sabotaż grafików | auth + RBAC |
| RT-006 | CONFIRMED | critical | DB/Schema | Live DB nie ma pól z migracji `029_order_time_fields.sql`. | migracja `029`; runtime `column orders.planned_start_time does not exist` | worker/planner operują na nieistniejącym modelu czasu | wykonać rollout migracji lub wycofać kod |
| RT-007 | CONFIRMED | critical | Data integrity | W live DB istnieją rekordy `scheduled_time_end < scheduled_time_start`. | query DB zwróciła 6 rekordów | ETA, planner i raporty są skażone złymi danymi | constraints + naprawa danych + sanity jobs |
| RT-008 | CONFIRMED | critical | Planner/Time | Planner i drag update zapisują tylko `scheduled_time_start`, nie aktualizują końca. | `src/app/api/planner/insert/route.ts`, `optimize/route.ts`, `orders/update-time/route.ts` | konflikt czasów i niespójność między ekranami | zapisywać start i end razem |
| RT-009 | CONFIRMED | high | Gantt | Lock na Gantt jest atrapą, bo live DB nie ma `orders.is_locked`. | `src/app/api/orders/lock/route.ts`; query DB bez kolumny | fałszywe poczucie blokady zlecenia | dodać kolumnę lub usunąć feature |
| RT-010 | CONFIRMED | high | Calendar | Kalendarz odpytuje `work_schedules.is_night_shift`, którego live DB nie ma. | runtime na `/calendar` po loginie: `400 column ... does not exist` | błędne ładowanie grafiku w kalendarzu | uzgodnić schema z query |
| RT-011 | LIKELY | high | Calendar/Orders | Tworzenie zlecenia z kalendarza omija `/api/orders` i zapisuje bezpośrednio do DB. | `src/app/(dashboard)/calendar/_components/OrderCreationDialog.tsx` | brak jednej walidacji, side effectów i audytu | spiąć create flow przez backend service |
| RT-012 | LIKELY | high | Calendar/Orders | Quick assign/reassign w kalendarzu omija backend biznesowy. | `src/app/(dashboard)/calendar/page.tsx` | rozjazd logiki między ekranami | użyć dedykowanego API assign |
| RT-013 | CONFIRMED | high | Tracking/UX | Publiczny tracking pokazuje self-care, ale cancel kończy się `401`. | runtime Playwright na `/tracking/f572...`; `POST /api/orders/cancel -> 401` | klient klika poprawne CTA i dostaje błąd | przepiąć UI lub ukryć CTA |
| RT-014 | CONFIRMED | high | Tracking/UX | Publiczny tracking pokazuje self-care, ale reschedule kończy się `401`. | runtime Playwright na `/tracking/f572...`; `POST /api/orders/reschedule -> 401` | broken flow zmiany terminu | przepiąć UI lub ukryć CTA |
| RT-015 | CONFIRMED | high | Worker | Worker shell pyta o notifications złym kontraktem. | runtime `GET /api/worker-notifications?unread_only=true -> 400`; `worker-shell.tsx`, `api/worker-notifications/route.ts` | worker nie widzi alertów i badge’a | ujednolicić query params i response shape |
| RT-016 | LIKELY | critical | Worker | Start/arrive/complete może wybuchać przez brak kolumn `planned_*` i `actual_*`. | `src/app/api/worker/tasks/*`; live DB bez tych kolumn | worker lifecycle może nie działać na realnych zadaniach | najpierw schema, potem flow |
| RT-017 | LIKELY | high | Schedule | Edycja zmiany może utworzyć duplikat po zmianie `start_at`. | `useScheduleData.ts`, `api/work-schedules/route.ts` | fałszywe capacity i konflikty dyżurów | dodać update po `id` |
| RT-018 | LIKELY | high | Auto-assign | Algorytm dopasowania czasowego liczy od bieżącej godziny, nie od planowanego slotu. | `src/lib/auto-assign.ts:247-265` | złe sugestie pracowników dla przyszłych terminów | liczyć od planowanego dnia i zmiany |
| RT-019 | LIKELY | high | Planner/Geo | Planner używa fallbacku Warszawy przy braku GPS pracownika. | `api/planner/insert`, `api/planner/optimize` | błędny scoring tras poza Warszawą | używać ostatniej pozycji/regionu |
| RT-020 | CONFIRMED | medium | Reports | Raport dzienny używa statusu `pending`, którego schema nie dopuszcza. | `src/app/api/reports/daily/route.ts`; migracja `020` | KPI i raporty operacyjne są mylące | ujednolicić status machine |
| RT-021 | CONFIRMED | medium | Notifications | SMS/push/email są placeholderami lub stubami. | `src/lib/sms.ts`, `push-notifications.ts`, `api/notify/route.ts` | system udaje gotową komunikację | wdrożyć providerów lub ukryć funkcje |
| RT-022 | CONFIRMED | high | Security/Secrets | W repo jest hardcoded Supabase service-role key. | `scripts/seed-production.js:4-10` | kompromitacja środowiska i pełny dostęp do DB | usunąć sekret i zrotować klucze |
| RT-023 | CONFIRMED | medium | Schema/Types | `ServiceCategory` w kodzie i migracji nie zgadza się z live danymi. | `src/lib/types/index.ts:15`; query DB zwraca 7 innych kategorii | UI i logika usług pracują na fałszywym modelu | zaktualizować typy i migracje |
| RT-024 | CONFIRMED | medium | Login/UX | Login ma martwe CTA i mylący format identyfikatora. | `login/page.tsx`; runtime pokazuje przycisk `G` i tylko tekstowy pseudo-reset | frustracja i błędy logowania | uprościć ekran logowania |
| RT-025 | CONFIRMED | medium | Code quality | Brak testów i duży dług lintowy. | `npm run lint -> 553 problemów`; brak testów | wysokie ryzyko regresji | dodać testy P0 i porządkować modułami |

## Verified bugs

- RT-001, RT-002, RT-003, RT-004, RT-005, RT-006, RT-007, RT-008
- RT-009, RT-010, RT-013, RT-014, RT-015
- RT-020, RT-021, RT-022, RT-023, RT-024, RT-025

## Suspected issues

- RT-011, RT-012, RT-016, RT-017, RT-018, RT-019

## Missing features

- bezpieczny self-care klienta,
- realny lock/pin na Gantt,
- prawdziwe integracje SMS/push,
- pełny audit log operacyjny,
- startup check dla schema drift.

## Architectural risks

- brak jednego source of truth dla `orders`,
- direct client writes do tabel domenowych,
- manualny auth model,
- schema drift bez guardrail,
- monolityczne komponenty o wysokim couplingu.

## UX traps

- login nie komunikuje poprawnego formatu loginu,
- social login i „zapomniałeś?” wyglądają na gotowe, ale nie są,
- tracking pokazuje klientowi realne CTA, które kończą się `401`,
- Gantt sprawia wrażenie trwałego, mimo że część akcji jest papierowa,
- worker preview z demo danymi może zostać uznany za realny widok.
