# Zakres produktu — v0.1

Status: **zakres rozszerzony kolejnymi wymaganiami użytkownika**. Początkowe MVP wydzielono z [raportu](../deep-research-report.md); wspólny graf wielu stosów, simulate i pierwszy zestaw reguł AWS dodano później. Aktualne działanie i ograniczenia opisuje README.

## Problem i odbiorca

Aktualizacja 2026-11-21: podstawowe użycie to globalna binarka `InfraLens generate` uruchamiana w katalogu projektu Pulumi. Wykonuje preview aktywnego stosu, zapisuje lokalny HTML i otwiera przeglądarkę. Starsze ograniczenia dotyczące niewykonywania Pulumi odnoszą się do `graph`/`render`.

Developer używający Pulumi chce zobaczyć zasoby stosu i ich zależności bez stawiania serwera ani łączenia się z dodatkową usługą. Ma już lokalny eksport stosu; InfraLens nie pobiera go z chmury.

Podstawowy scenariusz: użytkownik przekazuje `stack.json`, otrzymuje `result.html`, otwiera plik w przeglądarce, wyszukuje zasób i sprawdza jego relacje.

## Co budujemy

| Obszar | Zakres v0.1 |
|---|---|
| Wejście | Plik JSON z `pulumi stack export`; dokładnie obsługiwane wersje ustalamy na fixture’ach. |
| CLI | `generate` uruchamiający preview aktywnego stosu i otwierający lokalny HTML; `render` generujący HTML oraz `graph` generujący ten sam bezpieczny model w JSON do diagnostyki. |
| Graf | Szczegóły tras/zdarzeń i filtrów rozpoznanych integracji AWS, referencje DynamoDB i DynamoDB Streams → Lambda. Zasoby, `contains`, `depends_on`, rozpoznane regułami AWS `triggers`/`connects_to` i dowody z ID konfigurującego zasobu. |
| Widok | Automatyczny układ, zoom, przesuwanie, wyszukiwanie, wybór zasobu i panel szczegółów. |
| Czytelność | Rozróżnienie relacji rodzica i zależności; przełącznik widoczności zależności. |
| Zasoby techniczne | Stack i providery ukryte w widoku; brak strzałek do nieistniejących węzłów. |
| Dystrybucja wyniku | Jeden HTML zawierający dane, JS i CSS; działa przez `file://` bez internetu. |
| Dane | Minimalny model wyjściowy, bez surowych inputs/outputs ani wartości sekretów. |
| Błędy | Czytelny komunikat i niezerowy kod wyjścia dla błędnego lub nieobsługiwanego wejścia. |

`contains` w v0.1 oznacza wyłącznie rodzica zadeklarowanego przez Pulumi. Nie oznacza automatycznie przynależności do VPC/subnetu. `depends_on` oznacza zależność wdrożeniową lub danych; interfejs nie opisuje jej jako ruchu sieciowego.

## Czego nie budujemy w v0.1

- Pełnego pokrycia usług AWS, analizy ruchu, analizy kodu aplikacji i automatycznego odgadywania kierunku czytania/zapisu.
- Grup sieciowych VPC/subnet wywnioskowanych z właściwości zasobów.
- Pulumi preview, porównywania stanów ani visual diffa.
- Terraform, OpenTofu, HCL, CloudFormation i Kubernetes.
- GitHub Action, komentarzy PR ani automatycznego publikowania artefaktów.
- Kont, backendu, telemetrii, usług chmurowych ani pobierania aktualnego stanu.
- Eksportów PNG/SVG, cloud icon packów, pluginów ani alternatywnego silnika layoutu.
- Flagi ujawniającej sekrety, profili sanitacji ani wykonywania poleceń Pulumi przez InfraLens.

## Kiedy v0.1 jest gotowe

- [ ] Z obsługiwanej fixture powstaje HTML i JSON o zgodnej liczbie widocznych zasobów i relacji.
- [ ] Relacje rodzica, dependencies i propertyDependencies odpowiadają fixture’om; brak wiszących krawędzi.
- [ ] Każda relacja ma źródło dowodu, a panel pozwala je odczytać.
- [ ] W HTML otwartym przez `file://` działają wyszukiwanie, zoom/pan i wybór zasobu.
- [ ] Test przeglądarkowy nie wykrywa prób połączeń sieciowych ani brakujących lokalnych assetów.
- [ ] Canary secrets i niedozwolone pola nie trafiają do HTML, graph JSON ani logów; payload HTML nie wykonuje kodu.
- [ ] Pusty eksport ma czytelny pusty widok; uszkodzony JSON i nieobsługiwana wersja kończą się błędem.
- [ ] Powtarzalny input daje stabilne identyfikatory, kolejność grafu i układ w obrębie tej samej wersji narzędzia.
- [ ] Instrukcja lokalnego builda i przykład od wejścia do wyniku są odtwarzalne.

Pierwszy zestaw odbiorowy: pusty stos, kilka zasobów z zależnościami, komponent z dziećmi, zależności właściwości, brakujący cel relacji oraz fixture z sekretami i złośliwym tekstem. Obsługa 500+ zasobów i pełna macierz systemów to późniejszy etap, bez obietnicy wydajności w v0.1.

## Granica prywatności

HTML nadal ujawnia strukturę infrastruktury, typy i nazwy zasobów. Nazwy też mogą zawierać dane poufne. Minimalizacja danych nie czyni artefaktu automatycznie bezpiecznym do publikacji; zasady nazw i udostępniania wymagają rozstrzygnięcia przed wydaniem.
