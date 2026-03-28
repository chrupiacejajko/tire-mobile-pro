# RouteTire — findings architektoniczne

Legenda:

- `CONFIRMED` — potwierdzone kodem i/lub runtime
- `LIKELY` — mocno prawdopodobne, ale bez pełnego dowodu runtime
- `HYPOTHESIS` — podejrzenie do dalszej weryfikacji

## 1. Werdykt architektoniczny

RouteTire nie ma jednego spójnego backendowego rdzenia domenowego. System działa jako mieszanka:

1. direct write z UI do Supabase,
2. route handlerów z `getAdminClient()` i ręcznymi regułami biznesowymi,
3. typów i migracji opisujących model, którego live DB nie gwarantuje.

Efekt:

- auth nie jest enforced centralnie,
- `orders` nie mają jednego source of truth,
- model czasu jest rozjechany między UI, API i DB,
- część funkcji istnieje tylko „na papierze”.

Ocena: `CONFIRMED / HIGH RISK`

## 2. Topologia systemu

### Warstwy

- frontend App Router: `src/app/**`
- backend route handlers: `src/app/api/**`
- logika domenowa i helpery: `src/lib/**`
- baza i rollout modelu: `supabase/migrations/**`

### Najbardziej obciążone domeny

- `orders`
- `planner`
- `work_schedules`
- `worker`
- `tracking`

### Największe hotspoty couplingowe

- `src/app/(dashboard)/map/page.tsx`
- `src/app/(dashboard)/orders/page.tsx`
- `src/app/(dashboard)/warehouse/page.tsx`
- `src/app/(dashboard)/map/_components/WorkerDaySidebar.tsx`
- `src/app/(dashboard)/reports/page.tsx`

Wniosek: `CONFIRMED` duże pliki i szeroki coupling utrudniają ownership, testowanie i bezpieczne zmiany.

## 3. Źródła prawdy i rozjazdy

| Obszar | Deklarowany model | Faktyczny model | Wniosek |
|---|---|---|---|
| Auth | `profiles.role`, middleware, proxy | ręczne guardy per route | `CONFIRMED` brak centralnego enforcementu |
| Orders | `/api/orders` + typy TS | direct writes z kalendarza plus route handlery | `CONFIRMED` brak jednego source of truth |
| Czas zlecenia | migracja `029` i pola `planned_*`/`actual_*` | live DB dalej na legacy `scheduled_*` | `CONFIRMED` schema drift |
| Worker lifecycle | endpointy `start-driving/arrive/complete` | zapis do nieistniejących kolumn | `LIKELY` broken runtime na realnych zadaniach |
| Tracking | publiczny read-only portal | read po UUID + osobny publiczny write endpoint | `CONFIRMED` błędna granica zaufania |
| Grafiki | `work_schedules(start_at,duration_minutes)` | publiczne API i create/update zmieszane w `POST` | `CONFIRMED` ryzyko duplikatów i sabotażu |

## 4. Potwierdzone rozjazdy frontend <-> backend <-> DB

### A. Worker notifications

- frontend: `src/app/worker/worker-shell.tsx`
- backend: `src/app/api/worker-notifications/route.ts`
- runtime: `GET /api/worker-notifications?unread_only=true -> 400`

Wniosek: `CONFIRMED` frontend i backend używają innego kontraktu.

### B. Tracking self-care

- frontend: `src/app/tracking/[id]/self-care-actions.tsx`
- backend prywatny: `src/app/api/orders/cancel/route.ts`, `reschedule/route.ts`
- backend publiczny: `src/app/api/tracking/actions/route.ts`
- runtime: UI wysyła requesty do prywatnych endpointów i dostaje `401`

Wniosek: `CONFIRMED` UI nie jest spięte z właściwą ścieżką publiczną, a ścieżka publiczna jest niebezpieczna.

### C. Order time model

- typy/migracja: `src/lib/types/index.ts`, `supabase/migrations/029_order_time_fields.sql`
- live DB: brak kolumn `planned_*`, `actual_*`, `order_time_type`, `service_duration_minutes`
- backend: `src/app/api/worker/tasks/*`, `src/app/api/orders/update-time/route.ts`

Wniosek: `CONFIRMED` kod używa modelu, którego live DB nie ma.

### D. Work schedules in calendar

- frontend runtime query: `work_schedules?...select=employee_id,start_at,duration_minutes,end_at,is_night_shift`
- live DB: brak `is_night_shift`

Wniosek: `CONFIRMED` UI już pracuje na innym schemacie niż live DB.

### E. Service categories

- typy: `src/lib/types/index.ts:15`
- migracja: `029_order_time_fields.sql`
- live DB: `dojazd`, `naprawa`, `pakiet`, `przechowywanie`, `serwis`, `wymiana`

Wniosek: `CONFIRMED` model domeny usług jest fałszywie uproszczony.

## 5. Najważniejsze antywzorce

### 1. Service-role w publicznie osiągalnych route handlerach

Opis:
- route handler staje się jedynym zabezpieczeniem,
- jeśli guard zostanie pominięty, RLS nie chroni niczego.

Ocena:
- `CONFIRMED / CRITICAL`

### 2. Direct client writes do tabel biznesowych

Opis:
- UI kalendarza zapisuje do `orders` bez centralnej walidacji,
- backend business rules stają się opcjonalne.

Ocena:
- `CONFIRMED / HIGH`

### 3. Schema drift bez guardrail

Opis:
- migracje są w repo,
- live DB jest w innym stanie,
- aplikacja nie wykrywa tego przy starcie.

Ocena:
- `CONFIRMED / CRITICAL`

### 4. Monolityczne client components

Opis:
- ogromne pliki mieszają rendering, fetch, business rules i UI state,
- każda zmiana ma duży blast radius.

Ocena:
- `CONFIRMED / HIGH`

### 5. Granica public/private oparta o raw UUID

Opis:
- `orders.id` działa jednocześnie jako identyfikator domenowy i publiczny token dostępu,
- to za mało dla operacji read/write na danych operacyjnych.

Ocena:
- `CONFIRMED / CRITICAL`

## 6. Architektoniczne ryzyka operacyjne

- `CONFIRMED` brak spójnego modelu czasu powoduje, że planner, worker i raporty mogą wzajemnie produkować złe dane.
- `CONFIRMED` publiczne API z service-role oznacza, że błąd pojedynczego route handlera jest incydentem bezpieczeństwa.
- `LIKELY` direct writes z UI sprawiają, że bugfix w backendzie nie naprawi wszystkich ścieżek.
- `LIKELY` brak testów kontraktowych oznacza, że podobne rozjazdy będą wracać.

## 7. Rekomendowany kierunek przebudowy

### Natychmiast

- zamknąć prywatne API domyślnie,
- odciąć publiczne `tracking/actions`,
- ukryć papierowe funkcje z UI,
- uruchomić sanity check danych czasu i grafików.

### Krótki termin

- wprowadzić jedną warstwę `orders service`,
- rozdzielić publiczne i prywatne capability w trackingu,
- zakończyć rollout lub rollback modelu `planned_*`/`actual_*`,
- wprowadzić update grafików po `id`.

### Średni termin

- dodać startup check dla schema drift,
- zbudować kontraktowe testy UI/API dla worker, planner i tracking,
- rozbić największe moduły na mniejsze komponenty domenowe.

## 8. Verified bugs

- publiczne API z service-role,
- publiczny tracking read i publiczny tracking write,
- schema drift względem migracji `029`,
- fake Gantt lock,
- calendar query do nieistniejącego `is_night_shift`,
- worker notifications contract mismatch.

## 9. Suspected issues

- worker lifecycle na realnych zadaniach może nie działać przez brak `actual_*`,
- edycja grafiku może duplikować zmiany,
- auto-assign i optimizer mogą liczyć błędne wyniki przez model czasu i fallback GPS.

## 10. Open questions

- Czy istnieje środowisko, na którym migracja `029` jest faktycznie wdrożona?
- Czy 48h dyżury są intencjonalne biznesowo?
- Czy `tracking/actions` to porzucony eksperyment, czy aktywna ścieżka produktu?
