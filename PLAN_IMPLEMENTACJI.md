# Plan implementacji — ustalenia z rozmowy produktowej

## Status: ETAP 1 + ETAP 2 + AUDYT UKOŃCZONE
**Ostatni commit:** `519eb58` (27.03.2026)
**Build:** CLEAN — zero TypeScript errors

---

## Co jest zrobione (commit 519eb58)

### Etap 1 — MVP
- [x] Migracja 029 — nowe pola czasowe (min/max_arrival, planned_start/end, actual times)
- [x] Typy TypeScript (Order, OrderTimeType, ServiceCategory)
- [x] Naprawa generowania dyżurów (usunięto "godzina końca")
- [x] Usługi — kategorie main/additional
- [x] Mapa poziom 1 — sidebar z kalendarzem pracownika, pinezki zleceń
- [x] Gantt — oś godzinowa 6-22, proporcjonalne boxy, przerwy
- [x] Worker app — 4 przyciski (wyjeżdżam/rozpoczynam/zakończyłem/wracam)

### Etap 2
- [x] Mapa poziom 2 — OrderInsertSidebar, wybór usługi, slot finding z dyżurami
- [x] Logika powrotu na bazę (próg 30 min, dialog z analizą)
- [x] Powiadomienie przed pierwszym zleceniem dnia (banner w worker app)
- [x] Ostrzeżenie kolejne zlecenie (w return-to-base dialog)
- [x] Kolorowanie zleceń na Gancie (zielony/żółty/czerwony/niebieski)
- [ ] Rezerwacja online — NIE ZROBIONE
- [ ] Integracja Komarch API — NIE ZROBIONE (wymaga dokumentacji od Komarch)

### Dodatkowe (poza planem)
- [x] Unified right sidebar (Pracownicy + Znajdź termin w tabach)
- [x] Drill-down left sidebar (pojazdy → kalendarz → zlecenie)
- [x] Collapsible nav sidebar z framer-motion + localStorage
- [x] Filtr regionów w planerze
- [x] Gap indicator między zleceniami (progress bar + czas)
- [x] Time mode "Teraz"/"Na godz." w Znajdź termin
- [x] Filtr dyżurów — bez dyżuru = nie proponuj
- [x] GET /api/services endpoint

### Audyt P0 — krytyczne naprawy
- [x] Skills dual-system — auto-assign czyta z employee_skills junction table
- [x] Orders: nowe pola czasowe wyświetlane (timeline w detail)
- [x] Orders: realtime subscription (useOrdersRealtime)
- [x] Orders: unassign nie kasuje scheduled_time
- [x] Worker forms: integracja z /worker/tasks/[id] (DynamicFormFields, 11 typów)

### Audyt P1 — ważne naprawy
- [x] Orders: date filter + employee filter + create via API + proper dialogs
- [x] Services: error handling z toast, delete confirmation, search, dead code cleanup
- [x] Warehouse: transfer UI, equipment status edit, warehouse edit, order picker, pagination
- [x] GPS History: auto-zoom, loading spinner, no-data message, CSV/KML export

### Audyt P2 — polish
- [x] Polskie znaki w raportach (przychód, zamówienia, marża, zł)
- [x] Skills delete confirmation + 409 error surfacing
- [x] Usunięto duplicate /skills page
- [x] Skills search/filter w services tab

---

## Co zostało do zrobienia

### Rezerwacja online
- Klient rezerwuje termin przez stronę
- Wykorzystuje usługi (main/additional) z cenami i czasami
- Integracja z "Znajdź termin" algorytmem

### Integracja Komarch API
- Faktury, magazyn
- Wymaga uzyskania dokumentacji API od Komarch

### Znane ograniczenia
- `required_skill_ids UUID[]` kolumna w services — wymaga migracji ALTER TABLE jeśli nie istnieje
- Material-to-service link (auto-consumption) — nie zaimplementowane
- Worker-side material view — nie zaimplementowane
- Order edit dialog (zmiana daty/adresu) — nie zaimplementowane
- Order history timeline UI — dane w `order_history` table, brak UI

---

## Architektura kluczowych komponentów

### Mapa (/map)
- `page.tsx` — główna strona, left sidebar (pojazdy/kalendarz), right sidebar (pracownicy/znajdź termin)
- `_components/WorkerDaySidebar.tsx` — kalendarz dnia pracownika (embedded mode w left sidebar)
- `_components/OrderInsertSidebar.tsx` — algorytm szukania slotów (embedded w right sidebar tab)

### Planner (/planner)
- `page.tsx` — główna strona z filtrami regionów
- `_components/GanttView.tsx` — widok Gantt z kolorami
- `_components/RouteCard.tsx` — karta trasy z gap indicators
- `_components/StopCard.tsx` — karta przystanku z oknami czasowymi

### Worker (/worker)
- `page.tsx` — główna strona z 4 przyciskami + return-to-base dialog
- `tasks/[id]/page.tsx` — szczegóły zlecenia
- `tasks/[id]/_components/CompletionForm.tsx` — formularz zakończenia z form templates

### Shared
- `src/components/forms/DynamicFormFields.tsx` — shared form renderer (11 field types)
- `src/components/layout/sidebar.tsx` — collapsible nav sidebar
- `src/lib/auto-assign.ts` — auto-assign z skill matching (junction table)
- `src/lib/geo.ts` — haversine, etaMinutes
