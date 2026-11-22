# Plan realizacji

Status: **jest podstawowy przepływ Go opisany w README**. Etapy poniżej opisują odbiór pełnego [v0.1](PRODUCT.md); nie są jeszcze zakończone. Podstawowa obsługa preview została dodana na bezpośrednią prośbę o model zmian, bez realizacji pełnego visual diffa.

Nie przyjmujemy dat z raportu jako terminu dostawy. Estymację aktualizujemy po etapie 0, na podstawie działającego prototypu i dostępnego czasu.

Aktualizacja po zamówieniu wyglądu flow: działają renderer SVG/JS offline, pierwszy zestaw reguł AWS i podstawowe testy diagramu desktop/mobile. React Flow/ELK z poniższych pierwotnych zadań zastąpiono małym osadzonym viewerem; pełne kryteria v0.1 nadal wymagają osobnego odbioru.

## CLI uruchamiane w docelowym projekcie

- [x] Dodać `InfraLens preview`: preview z niezmienionymi zasobami, zapis `infralens.html`, automatyczne otwarcie oraz `--no-open`.
- [x] Opisać build binarki i instalację w `PATH`; zachować `graph`, `render` i `mock-topology`.
- [ ] Potwierdzić integrację z prawdziwym backendem Pulumi i otwarcie systemowej przeglądarki.

## Opisy przepływu

- [x] Powiązać opisy endpointów, zdarzeń, filtrów i wybranych parametrów z dowodami integracji; dodać referencje DynamoDB i obsługę strumieni.
- [x] Pokazać krótkie etykiety, podgląd i pełne szczegóły w inspektorze przy zachowaniu starszego formatu grafu.

## Etap 0 — potwierdzenie podstaw

- [ ] Przygotować syntetyczny eksport i bezpieczny, zanonimizowany eksport z rzeczywistego Pulumi CLI; zapisać wersję generatora.
- [ ] Sprawdzić oficjalny format potrzebnych pól, wersjonowanie eksportu, oznaczenia sekretów i propertyDependencies.
- [x] Zrobić diagram SVG/JS w jednym HTML otwieranym przez `file://`, z layoutem, zoomem i inspektorem.
- [ ] Sprawdzić sposób bundlowania bez workerów/assetów wymagających osobnego pliku lub sieci.
- [ ] Sprawdzić licencje wybranych wersji zależności przed ich włączeniem.
- [ ] Rozstrzygnąć pytania blokujące z [rejestru decyzji](DECISIONS.md).

**Odbiór:** znany i zapisany zakres kompatybilności wejścia, działający prototyp offline oraz potwierdzona baza techniczna. Jeśli prototyp obala założenie, aktualizujemy architekturę przed budową reszty.

## Etap 1 — eksport Pulumi → bezpieczny graph JSON

- [ ] Dodać minimalny moduł Go, punkt wejścia CLI i model grafu.
- [ ] Parsować potrzebne pola eksportu, ignorując dodatkowe pola w obsługiwanym formacie.
- [ ] Nadać deterministyczne ID, odczytać nazwę/typ/provider i rozpoznać stack/provider nodes.
- [ ] Zbudować `contains` z parent oraz `depends_on` z dependencies i propertyDependencies.
- [ ] Scalać powtórzone relacje, zachowując wszystkie różne źródła dowodów.
- [ ] Obsłużyć brakujące cele i odfiltrowane zasoby techniczne bez tworzenia fałszywych połączeń.
- [ ] Wprowadzić jeden profil minimalizacji danych; nie kopiować dowolnych właściwości do modelu publicznego.
- [ ] Dodać `graph --input ... --output ...`, walidację grafu i bezpieczne komunikaty błędów.
- [ ] Przetestować parser, relacje, stabilne ID, fixture’y graniczne i wycieki canary do JSON/logów.

**Odbiór:** fixture’y dają oczekiwany graf, każda krawędź ma istniejące końce i evidence, a wynik nie zawiera surowych wartości zasobów.

## Etap 2 — graph → interaktywny HTML

- [ ] Zastąpić dane prototypowe rzeczywistym modelem grafu.
- [ ] Dodać automatyczny layout, zoom/pan, wyszukiwanie i panel wybranego zasobu.
- [ ] Pokazać rodzica i zależności w odmienny, opisany legendą sposób oraz evidence w panelu.
- [ ] Dodać przełącznik zależności, pusty widok i obsługę błędu layoutu.
- [ ] Zapewnić etykiety kontrolek, widoczny fokus i dostęp do wyszukiwania/panelu z klawiatury.
- [ ] Osadzić bundle w Go i dodać `render --input ... --output ...`.
- [ ] Zapisywać wynik bez pozostawiania uszkodzonego pliku po błędzie; odrzucać kolizję ścieżki wejścia i wyjścia.
- [ ] Przetestować osadzanie JSON, `</script>` i traktowanie tekstu użytkownika jako tekstu.

**Odbiór:** binarka generuje jeden kompletny HTML z eksportu; interakcje i evidence działają po otwarciu pliku bez serwera.

## Etap 3 — odbiór v0.1

- [ ] Uruchomić test artefaktu przez `file://` w Chromium i Firefox, wykrywający próby połączeń sieciowych.
- [ ] Sprawdzić canary we wszystkich wyjściach obu komend, także w błędach i polach zagnieżdżonych.
- [ ] Sprawdzić ręcznie czytelność małego grafu, rodziców i cyklicznych zależności.
- [ ] Dodać powtarzalny build, podstawowe CI backendu/frontendu oraz instrukcję lokalnego uruchomienia.
- [ ] Dołączyć bezpieczny przykład wejściowy, opis obsługiwanych wersji i ograniczeń.
- [ ] Uzupełnić licencję projektu po decyzji właściciela oraz wymagane notices zależności.
- [ ] Przejść wszystkie kryteria z `PRODUCT.md` i zapisać faktyczne wyniki walidacji.

**Odbiór:** wszystkie kryteria v0.1 spełnione, ograniczenia opisane. Dopiero wtedy wybieramy następny etap z roadmapy.

## Zasady prowadzenia prac

- Testy chronią kontrakt: znaczenie relacji, prywatność, format wejścia i samodzielność HTML. Nie robimy snapshotu całego HTML jako głównego testu poprawności.
- Fixture’y i logi w repo nie zawierają prawdziwych sekretów ani danych konta.
- Nie uruchamiamy wdrożeń, preview ani pobierania danych z chmury w ramach standardowego renderowania i testów.
- Odkryta luka w kontrakcie trafia do decyzji i zakresu przed implementacją dodatkowej funkcji.
