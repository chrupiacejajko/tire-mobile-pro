# TODO: Pełna parytetowość z GeoTask v23

Status: 🔴 Brakuje | 🟡 Mamy uproszczone | 🟢 Mamy pełne

---

## 🔴 BRAKUJE KOMPLETNIE

### 1. Formularze (Custom Forms Builder)
**GeoTask:** 15 typów pól (tekst, liczba, tak/nie, lista, lista wielokrotna, lokalizacja, data, data+godzina, godzina, pomiar, pomiar obiektu, zdjęcie, podpis, szkic, podformularz). Formularze przypisywane do rodzaju zadania. Walidatory regex. Sterowanie głosowe (aliasy). Formularze z zakładkami.
**U nas:** Tylko pole notes + zdjęcia na zleceniu.
**Priorytet:** 🔥 WYSOKI — klient potrzebuje checklistów per usługa

### 2. Grafik zmian (brygady/pracownicy)
**GeoTask:** Wizualny kalendarz zmian. Tworzenie grafiku na dzień/tydzień/miesiąc. Zmiany nocne. Szablony dni roboczych. Kopiowanie grafiku. Pracownik w wielu brygadach. Pracownik = brygada (solo). Domyślne godziny pracy.
**U nas:** Mamy working_hours JSONB na employee, ale brak UI do grafiku zmian. Brak koncepcji brygad.
**Priorytet:** 🔥 WYSOKI — potrzebne do prawidłowej optymalizacji

### 3. Zlecenia (Work Orders) — grupowanie zadań
**GeoTask:** Zlecenie = kontener na wiele zadań. Ma: numer zlecenia, numer faktury, klienta. Zlecenie zamykane automatycznie gdy wszystkie zadania zakończone. Anulowanie zlecenia.
**U nas:** Zlecenie = zadanie (1:1). Brak grupowania.
**Priorytet:** 🟡 ŚREDNI — na razie 1 zlecenie = 1 wizyta u klienta

### 4. Magazyny (sprzęty + materiały)
**GeoTask:** Pełne zarządzanie magazynem. Typy sprzętów z dokumentacją. Stany sprzętów (aktywny/zlikwidowany). Materiały z jednostkami. Przyjęcie/wydanie/przesunięcie. Historia przesunięć. Zużycie materiałów na zadaniu. Powiadomienia o niskim stanie. Raporty zużycia.
**U nas:** Mamy stronę /warehouse ale jest placeholder. Mamy depozyty opon.
**Priorytet:** 🟡 ŚREDNI — wulkanizacja mobilna nie potrzebuje pełnego magazynu, ale przydałoby się śledzenie materiałów (ile opon/zaworów zużyto)

### 5. Lokalizacje klienta (z godzinami otwarcia)
**GeoTask:** Klient ma wiele lokalizacji (główna + dodatkowe). Lokalizacja własna (baza/magazyn firmy). Każda lokalizacja: adres, koordynaty, godziny otwarcia (dostępność), niedostępności. Hurtowe tworzenie zadań na lokalizacjach. Przepisywanie atrybutów lokalizacji na zadanie.
**U nas:** Klient ma 1 adres. Brak lokalizacji z godzinami.
**Priorytet:** 🟡 ŚREDNI — firmy mogą mieć wiele lokalizacji

### 6. Ładowarki CSV (bulk import)
**GeoTask:** Import z CSV: zadania, pracownicy, brygady, klienci, lokalizacje, sprzęty. Z walidacją i raportowaniem błędów.
**U nas:** Brak importu CSV.
**Priorytet:** 🟡 ŚREDNI — przydatne przy onboardingu nowych klientów

### 7. Parametry ilościowe i kosztowe
**GeoTask:** Na brygadzie/pracowniku: ładowność pojazdu, limit km/dzień, limit zadań/dzień, koszt za km, koszt za godzinę. Na zadaniu: waga, ilość. Optymalizator uwzględnia te limity.
**U nas:** Mamy hourly_rate na employee, ale brak limitów km/zadań i ładowności.
**Priorytet:** 🟡 ŚREDNI — ważne dla optymalizacji kosztowej

### 8. Raport zgodności GPS
**GeoTask:** Porównanie pozycji GPS pracownika z adresem zlecenia. Weryfikacja czy pracownik faktycznie był na miejscu. Raport rozbieżności.
**U nas:** Brak.
**Priorytet:** 🟢 NISKI — trust issue, ale przydatne

### 9. Obszar operacyjny (polygony na mapie)
**GeoTask:** Rysowanie zamkniętych polygonów jako granic rejonu. Automatyczne przypisanie zadania do rejonu na podstawie geolokalizacji. Ograniczenie brygady do obszaru operacyjnego (nie dostanie zadań poza polygonem).
**U nas:** Mamy rejony jako nazwy (Warszawa, Kraków), bez geometrii.
**Priorytet:** 🟢 NISKI — na razie rejony po nazwie wystarczają

### 10. Blokowanie zadań na Gantt
**GeoTask:** Pinowanie zadania do brygady na harmonogramie — optymalizator nie może go przenieść. Wizualne oznaczenie (kłódka). Wizyta = automatycznie zablokowana.
**U nas:** Brak — Gantt jest readonly.
**Priorytet:** 🟡 ŚREDNI — ważne gdy dyspozytor ręcznie układa plan

### 11. Przeliczenie trasy w trakcie (lokalna re-optymalizacja)
**GeoTask:** Gdy coś się zmieni (zadanie anulowane, nowe pilne), dyspozytor może przeliczać trasę dla jednej brygady bez ruszania reszty. Konfiguracja: czy przenosić zadania między brygadami, czy tylko zmieniać kolejność.
**U nas:** Mamy /api/planner/optimize ale tylko globalnie, brak lokalnej re-optymalizacji per pracownik.
**Priorytet:** 🔥 WYSOKI — krytyczne dla dyspozytora

### 12. Konfigurowalny przycisk na apce mobilnej
**GeoTask:** Admin może dodać custom przycisk w apce mobilnej który otwiera URL/telefon/formularz.
**U nas:** Brak.
**Priorytet:** 🟢 NISKI

### 13. Wizyty z konfigurowalnymi triggerami SMS/email
**GeoTask:** Konfiguracja powiadomień: po umówieniu wizyty, dzień przed, w dniu wizyty, zmiana technika, zmiana terminu. Szablony wiadomości z placeholderami. Kontrola czasu wysyłania (np. nie wysyłaj po 20:00). Limit SMS.
**U nas:** Basic email booking confirmation. Brak triggerów, brak szablonów, brak SMS.
**Priorytet:** 🔥 WYSOKI — klient chce powiadomienia

### 14. Plany optymalizacji (scheduler)
**GeoTask:** Konfiguracja automatycznej optymalizacji: codziennie o danej godzinie, dla wybranych rejonów, z wybranymi kryteriami. Raport z każdej optymalizacji.
**U nas:** Mamy /api/planner/auto-optimize endpoint, brak UI do konfiguracji.
**Priorytet:** 🟡 ŚREDNI

### 15. Terminy wizyt (konfiguracja slotów)
**GeoTask:** Konfiguracja okien czasowych per rodzaj zadania. Np. "Wymiana opon" może mieć sloty co 2h, a "Naprawa" sloty co 1h. Definiowanie dostępnych godzin wizyt.
**U nas:** Hardcoded 3 okna: morning/afternoon/evening.
**Priorytet:** 🟡 ŚREDNI

---

## 🟡 MAMY ALE UPROSZCZONE (do rozbudowania)

### 16. Optymalizacja tras
**GeoTask:** 2 silniki (OptaPlanner natywny + Google Maps Route Optimization). Konfigurowalne kryteria: priorytet, umiejętności, rejon, dystans, czas, koszty. Parametry kosztowe per brygada. Koszt nieprzydzielenia zadania. Wynik z raportowaniem przyczyn nieprzydzielenia.
**U nas:** Nearest-neighbor z time windows + haversine/HERE. Brak raportowania przyczyn.
**Do zrobienia:** Dodać raportowanie przyczyn nieprzydzielenia. Dodać parametry kosztowe.

### 17. Gantt na plannerze
**GeoTask:** Interaktywny Gantt z: drag-drop przesuwanie zadań, resize (zmiana czasu trwania), right-click context menu (przydziel/odepnij/zablokuj/kopiuj), tooltip z detalami, konfigurowalne kolumny (brygada, godziny, umiejętności, km), podświetlanie konfliktów (zadanie w niedostępności = czerwone).
**U nas:** Readonly Gantt z kolorowymi blokami. Brak interakcji.
**Do zrobienia:** Drag-drop na Gantt, right-click menu, podświetlanie konfliktów.

### 18. Mapa dyspozytora
**GeoTask:** Google Maps z: konfigurowalnymi ikonami per rodzaj zadania (kształt + kolor), klastry zadań (grupowanie blisko siebie), WMS overlay (własne warstwy mapowe), trasa brygady z kolorami segmentów (czerwony=opóźnienie, zielony=na czas), statusy pracowników z ikonami.
**U nas:** Leaflet z CircleMarkers, piny zleceń, trasy polyline.
**Do zrobienia:** Konfigurowane ikony, klastry, kolorowe segmenty trasy.

### 19. Alerty dyspozytora
**GeoTask:** Konfigurowalne reguły alertów z UI. Typy: zadanie niewykonane, przekroczenie SLA, brak GPS, pracownik poza strefą, nowe zadanie z API. Każdy alert konfigurowalny: warunki, odbiorcy, czas życia.
**U nas:** 3 hardcoded reguły (SLA breach, unassigned today, stale in-progress).
**Do zrobienia:** UI do tworzenia custom reguł alertów.

### 20. Raport produktywności
**GeoTask:** Per brygada/pracownik: czas jazdy, czas pracy na zadaniu, czas postoju, czas oczekiwania, ilość km, ilość zadań, % wykorzystania czasu. Porównanie planowany vs rzeczywisty. Export CSV.
**U nas:** Basic Plan vs Execution + Operational view z completion rate.
**Do zrobienia:** Dodać czas jazdy vs praca vs postój. Export CSV.

### 21. Ślad GPS (historia tras)
**GeoTask:** Odtwarzanie trasy na mapie z animacją. Filtrowanie po dacie i pracowniku. Prędkość w każdym punkcie. Postoje oznaczone.
**U nas:** Basic gps-history z polyline + start/end markers.
**Do zrobienia:** Animacja odtwarzania, oznaczanie postojów, prędkość w punktach.

---

## 🟢 MAMY PEŁNE (lub lepsze niż GeoTask)

- ✅ Booking online z multi-vehicle + upselling + smart windows (GeoTask NIE ma bookingu online!)
- ✅ Portal śledzenia zlecenia dla klienta (/tracking)
- ✅ Self-care portal (zmiana terminu / anulowanie)
- ✅ Subtaski / czynności na zleceniu
- ✅ Kody zamknięcia (8 domyślnych)
- ✅ Niedostępności pracowników (urlopy, chorobowe)
- ✅ Webhooks (konfigurowalne z HMAC signing)
- ✅ Drag & drop na plannerze (unassigned → route)
- ✅ RCP / rejestracja czasu pracy (clock in/out + przerwy)
- ✅ Koszyk zadań w okolicy (mobile nearby tasks)
- ✅ Bufor 60:40 w optymalizacji
- ✅ Cykliczne zlecenia (weekly/biweekly/monthly/quarterly)
- ✅ Raporty finansowe (revenue/costs/margin)
- ✅ Email z potwierdzeniem rezerwacji + link śledzenia
- ✅ HERE API autocomplete adresów
- ✅ Sugestie pracownika na podstawie GPS (proximity-based)
- ✅ Wstawianie zlecenia w trasę (findBestInsertion)
- ✅ SatisGPS integracja (poller + webhook + parser tabeli)
- ✅ Auto-geokodowanie adresów klientów
- ✅ Mobile worker app z zadaniami + timer + zdjęcia + subtaski

---

## KOLEJNOŚĆ IMPLEMENTACJI (sugerowana)

### Sprint A (najwyższy priorytet — core business)
1. Formularze (custom checklists per usługę)
2. Konfigurowalne notyfikacje SMS/email z triggerami
3. Lokalna re-optymalizacja per pracownik

### Sprint B (dispatcher UX)
4. Interaktywny Gantt (drag-drop, resize, right-click, blokowanie)
5. Grafik zmian pracowników
6. Konfigurowalne alerty z UI

### Sprint C (zarządzanie)
7. Ładowarki CSV (bulk import)
8. Parametry kosztowe i limity per pracownik
9. Lokalizacje klienta z godzinami otwarcia
10. Plany optymalizacji z UI

### Sprint D (polish)
11. Obszar operacyjny (polygony na mapie)
12. Raport zgodności GPS
13. Raport produktywności rozszerzony
14. Konfigurowane ikony na mapie + klastry
15. Animacja śladu GPS

---

## NOTATKI Z INSTRUKCJI GEOTASK v23

### Struktura menu GeoTask:
- Planowanie (Gantt + Mapa + Lista zadań — 3 panele jednocześnie)
- Pracownicy i brygady → Pracownicy / Brygady / Grafik
- Zlecenia
- Formularze → Szablony formularzy / Grupy formularzy
- Klienci
- Lokalizacje
- Raporty → Raport z zadań / Raport z formularzy / Alerty / Raport zgodności GPS / Raport produktywności / Ślad GPS / Raport RODO / Podsumowanie optymalizacji
- Ustawienia → Konfiguracja / Firmy / Rejony / Rodzaje zadań i czynności / Umiejętności / Typy lokalizacji / Plany optymalizacji / Notyfikacje / Terminy dla wizyt
- Ładowarki danych

### Kluczowe koncepty GeoTask:
- **Brygada** = zespół pracowników (u nas 1 pracownik = 1 brygada bo jeżdżą solo)
- **Rodzaj zadania** = template z: czas trwania, SLA, priorytet, formularz, umiejętności, czynności, kody zamknięcia
- **Grafik** = dni robocze brygady z godzinami (07:00-15:00, zmiana nocna, itp.)
- **Wizyta** = umówione spotkanie z klientem w konkretnym terminie (generuje notyfikację)
- **Lokalizacja** = stałe miejsce klienta z godzinami otwarcia
- **Optymalizator** = 2 silniki (OptaPlanner + Google Maps Route Optimization)
- **Parametr ilościowy** = ładowność/waga/limit km per brygada

### Hasło do demo GeoTask:
- URL: https://wulkanizacja.geotask.globema.pl
- Login: admin
- Hasło: Administacja12345! (zmienione z 12345)
