# Decyzje, założenia i pytania

Status początkowy: **2026-11-21**. „Założenie robocze” oznacza propozycję używaną do ułożenia planu, a nie potwierdzoną decyzję właściciela ani działającą implementację.

## CLI w docelowym projekcie — 2026-11-21

Przyjęte na prośbę użytkownika: `InfraLens preview` wykonuje preview aktywnego stosu z `--show-sames`, zapisuje `infralens.html` w bieżącym katalogu projektu i otwiera przeglądarkę. Niezmienione zasoby są szare, tworzone zielone, usuwane czerwone; update/replace zachowują bursztynowe oznaczenie. Nie uruchamia `pulumi up`. To rozszerza wcześniejsze D04 dla tej komendy; `graph`/`render` nadal czytają tylko pliki. Dystrybucja: lokalny build binarki instalowanej w `PATH`, bez nowego menedżera pakietów.

## Opisy przepływu — 2026-11-21

Na prośbę użytkownika dopuszczamy w dowodach wybrane wartości konfiguracji: ścieżki API, zdarzenia, filtry i parametry triggerów. `label` i `details` są opcjonalnymi tekstami przy Evidence, z zachowaniem schemaVersion 1. Nie eksportujemy pełnych URL-i, ARN-ów, IP, payloadów i wartości środowiska; oznaczone sekrety pozostają ukryte. Lambda → DynamoDB wynika wyłącznie z jawnych referencji konfiguracji; nie analizujemy IAM ani kodu aplikacji. Szczegóły obejmują wszystkie rozpoznawane reguły, a API Gateway pozostaje w zakresie v2.

## Założenia robocze

Najnowsza aktualizacja po zamówieniu diagramu flow: renderer SVG/JS zastępuje tabelę, bez React/ELK. Adapter rozpoznaje jawne połączenia AWS z evidence; dependencies nadal nie oznaczają ruchu danych. Symulacja używa teraz `deploy`, `infraMocks`, `withStackConfig` i przekazuje rzeczywiście wygenerowane mockowane outputs w kolejności zależności. Wcześniejsze opisy braku takiej propagacji i tabeli są historyczne.


Aktualizacja 2026-11-21 po ustaleniu podziału kodu: adapter Pulumi obsługuje również pojedynczy preview i odczytuje gotowe operacje. Wspólny model przenosi statusy zmian oraz topology before/after; nie tworzymy osobnego pakietu `diff`. Implementacja obejmuje prosty renderer HTML, bez React/ELK. Pozostałe wybory frontendowe nadal są robocze.

Aktualizacja po wymaganiu wspólnego widoku LyricsPipeline: powtarzane `--input` łączy wiele stosów. Nazwane wejścia `org/project/stack=FILE` pozwalają dopasować StackReference do korzeni innych stosów. Zachowujemy korzenie przy wielu wejściach i pokazujemy projekt/stos każdego zasobu. Nie rekonstruujemy przepływu konkretnych wartości outputs ani nie wykonujemy Pulumi. To rozszerzenie podstawowego backendu; pełny interaktywny MVP nadal pozostaje do realizacji.

Aktualizacja po zamówieniu opcji `mock-topology`: dopuszczamy osobną komendę wykonującą zaufany kod Go z istniejącym helperem testowym `runDeployment(t, nil)`. Zwykłe `graph`/`render` nadal tylko odczytują pliki. Symulacja działa w kopii modułu, bez Pulumi CLI i tworzenia stosów; nie jest prawdziwym preview ani sandboxem kodu. Wynik jest jawnie oznaczony jako symulowany, a zasoby jako `create` względem pustego stanu. Pierwszy wspierany przypadek to trzy projekty LyricsPipeline; brak automatycznych, uniwersalnych mocków providerów.

| ID | Założenie | Powód / konsekwencja |
|---|---|---|
| D01 | Pierwsza dostawa to v0.1: Pulumi export → offline HTML. | Mierzalny rezultat bez rozszerzania zakresu na cały raport. |
| D02 | Go osadza wynik buildu React i Vite w jednym HTML. | Komponenty shadcn/ui i Tailwind obsługują interfejs, a własny layout SCC nadal wyznacza pozycje SVG. |
| D03 | `graph` i `render` korzystają z tego samego minimalnego modelu. | Diagnostyka nie może być obejściem ochrony danych. |
| D04 | Brak wykonywania Pulumi i połączeń z chmurą. | Użytkownik dostarcza istniejący plik; nie obsługujemy credentials. |
| D05 | v0.1 pokazuje parent i dependencies, bez semantic flow. | Nie utożsamiamy kolejności wdrożenia z komunikacją. |
| D06 | Jeden profil minimalizacji, bez opcji ujawniania sekretów. | Mniej ścieżek do zabezpieczenia i jasny kontrakt outputu. |
| D07 | Brak terminów kalendarzowych przed prototypem. | Raport zawiera estymację, nie uzgodniony harmonogram. |

## Pytania blokujące odpowiedni etap

| ID | Do ustalenia | Kiedy | Proponowany punkt wyjścia |
|---|---|---|---|
| Q01 | Jakie wersje eksportu i Pulumi CLI testujemy? | Przed zamknięciem parsera. | Jawna lista wersji oparta na fixture’ach, błąd dla innych wersji. |
| Q02 | Jakie nazwy i ścieżki evidence mogą trafić do HTML? | Przed zamknięciem minimalizacji danych. | Zachować nazwy dla użyteczności, opisać poufność; określić reakcję na wykryte dane wrażliwe bez obiecywania pełnej detekcji. |
| Q03 | Czy wybrane wersje React Flow/ELK dają kompletny pojedynczy HTML? | Etap 0. | Krótki prototyp z rzeczywistym buildem, nie sam dev server. |
| Q04 | Jaka licencja kodu projektu? | Przed publiczną dystrybucją. | Apache-2.0 to rekomendacja raportu, wymaga decyzji właściciela i sprawdzenia notices. |
| Q05 | Jakie systemy wspieramy w pierwszej dystrybucji? | Przed pakowaniem wydania. | Najpierw odtwarzalny build lokalny; nie obiecywać macOS/Windows bez weryfikacji. |

## Co trzeba sprawdzić w źródłach przed implementacją

- Wersjonowanie i minimalny zestaw pól eksportu Pulumi, wrappery sekretów oraz zachowanie przy brakujących referencjach.
- Licencje i wymagania dystrybucyjne dokładnie tych wersji bibliotek, które wybierzemy.
- Działanie layoutu dla cykli i relacji rodziców oraz bundlowanie bez zewnętrznych workerów.
- Przed etapem preview: rzeczywisty format JSON/JSONL, operacje replace i źródła old/new state.
- Przed etapem GitHub: aktualny model uprawnień, pochodzenie artefaktów i ograniczenia workflow dla forków.

Raport zawiera znaczniki cytowań z poprzedniego narzędzia badawczego, nie zwykłe linki do źródeł. Ten podział dokumentacji nie jest ponowną weryfikacją rynku, API ani licencji. Twierdzeń o konkurencji nie przenosimy do kontraktu produktu.

## Rozbieżności uporządkowane względem raportu

- Raport obejmuje v0.1–v0.4 i miejscami nazywa całość MVP. Tutaj MVP oznacza wyłącznie v0.1; reszta jest roadmapą.
- Zestaw flag z raportu jest katalogiem możliwości. Bieżący kontrakt zawiera tylko niezbędne komendy i ścieżki plików.
- Zamiast jednego `Evidence` zachowujemy listę dowodów, żeby deduplikacja nie gubiła propertyDependencies.
- Rozpoznanie relacji odbywa się przed odrzuceniem danych roboczych; na zewnątrz wychodzi wyłącznie model minimalny.
- Relacja parent nie jest automatycznie topologią sieci, a reguła dopasowania właściwości musi jawnie określić kierunek relacji.
- Brak drugiego silnika layoutu, Homebrew, Action i wielkich struktur katalogów przed potrzebą wynikającą z konkretnego etapu.

Nową decyzję dopisujemy z datą, statusem, uzasadnieniem i wpływem na `PRODUCT.md`/`PLAN.md`. Nie zmieniamy wstecz raportu źródłowego.
