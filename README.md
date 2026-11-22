# InfraLens

Lokalny CLI do zamiany eksportu infrastruktury Pulumi w jeden interaktywny plik HTML działający offline.

**Status: działający CLI i interaktywny diagram offline.** Adapter Pulumi buduje neutralny graf, a renderer generuje jeden HTML z węzłami, strzałkami, zoomem, wyszukiwaniem i inspektorem dowodów.

## Uruchomienie w projekcie Pulumi

Zbuduj binarkę w katalogu InfraLens i umieść ją w katalogu z `PATH` (jednorazowo, Linux):

```bash
go build -buildvcs=false -o bin/InfraLens ./cmd/infralens
mkdir -p "$HOME/.local/bin"
install -m 755 bin/InfraLens "$HOME/.local/bin/InfraLens"
```

Jeśli `~/.local/bin` nie jest w `PATH`, dodaj `export PATH="$HOME/.local/bin:$PATH"` do konfiguracji swojej powłoki.

Następnie w katalogu docelowego projektu zawierającym `Pulumi.yaml` lub `Pulumi.yml`:

```bash
cd /sciezka/do/projektu/infra
InfraLens generate
```

Komenda uruchamia `pulumi preview --json --show-sames --non-interactive` dla aktywnego stosu, zapisuje `infralens.html` w bieżącym katalogu i otwiera go w domyślnej przeglądarce. Używa tego samego renderera React co `InfraLens render`. Bez zmian zasoby pozostają szare, dodawane są zielone, usuwane czerwone, a aktualizowane lub zastępowane bursztynowe. To plan zmian względem zapisanego stanu stosu, bez wykonywania `pulumi up` ani odświeżania rzeczywistego stanu chmury.

Wymagane są Pulumi CLI, wybrany stos (`pulumi stack select`), dostęp do backendu i zależności/credentials potrzebne projektowi podczas preview. Preview wykonuje kod projektu i może odczytywać dane providerów. Obsługa dotyczy jednego projektu w bieżącym katalogu; przy repo z kilkoma projektami uruchom komendę w odpowiednim podkatalogu. Surowy JSON trafia tylko do prywatnego pliku tymczasowego usuwanego po zakończeniu. Istniejący HTML jest zastępowany dopiero po poprawnym wygenerowaniu nowego.

```bash
InfraLens generate --no-open                         # sam zapis, np. bez środowiska graficznego
InfraLens generate --output moj-diagram.html         # inna nazwa wyniku
InfraLens generate --help
```

Nieudane otwarcie przeglądarki daje komunikat z zachowaniem wygenerowanego pliku i kodu sukcesu. Błąd preview zachowuje poprzedni wynik; szczegóły diagnozuj przez `pulumi preview` w tym samym katalogu, ponieważ InfraLens nie wypisuje potencjalnie poufnych logów Pulumi.

Dotychczasowe komendy do gotowych plików nadal działają:

```bash
InfraLens graph --input stack.json --output graph.json
InfraLens render --input preview.json --output result.html
```

Adapter obsługuje eksport v3 i pojedynczy dokument preview z `steps` oraz operacjami `same`, `create`, `update`, `delete`, `replace`. Inne operacje, wersje eksportu i streaming JSON są jawnie odrzucane. Preview pokazuje wyłącznie zasoby obecne w `steps`; nie odtwarza pominiętych zasobów. Fixture’y są syntetyczne, kompatybilność z rzeczywistymi eksportami pozostaje do sprawdzenia.

HTML zawiera interaktywny diagram SVG, osadzony pakiet React, CSS, ikony i dane. Otwiera się z dysku bez serwera i połączeń sieciowych. Zmiany pochodzą z preview, nie z porównania dwóch plików. Zachowujemy relacje sprzed i po zmianie; nie eksportujemy inputs/outputs. Nazwy i ścieżki właściwości pozostają widoczne i mogą być poufne.

## Symulacja bez stosów i wdrożenia AWS

`simulate` uruchamia kod Go z istniejącymi mockami projektu i pokazuje zasoby jako `+ create` względem pustego stanu. Nie wywołuje Pulumi CLI, nie zakłada stosów i nie korzysta z backendu Pulumi. HTML ma widoczne oznaczenie `SIMULATION`.

Dla LyricsPipeline, z katalogu InfraLens:

```bash
go run ./cmd/infralens simulate \
  --project org/LyricsPipeline/dev=/home/maciek/Documents/GitHub/LyricsPipeline/infra/base \
  --project org/LyricsPipeline-Separation/dev=/home/maciek/Documents/GitHub/LyricsPipeline/infra/separation \
  --project org/LyricsPipeline-Transcription/dev=/home/maciek/Documents/GitHub/LyricsPipeline/infra/transcription \
  --output /tmp/lyrics-simulated.html

xdg-open /tmp/lyrics-simulated.html
```

Tutaj `org` jest dosłowną nazwą używaną przez mocki LyricsPipeline, nie nazwą Twojego konta. `dev` to tożsamość wyświetlana w symulowanym grafie; żaden stos `dev` nie musi istnieć.

Zweryfikowano na bieżącym kodzie LyricsPipeline: 76 węzłów (w tym trzy korzenie), dwa połączenia StackReference i zero pominiętych referencji. Wynik obejmuje rejestracje komponentów oraz zasobów, nie oznacza 76 fizycznych zasobów AWS.

### Kontrakt pierwszej wersji

- Obsługiwane są projekty Go z funkcją `deploy(*pulumi.Context) error`, typem mocków `infraMocks` i helperem `withStackConfig(t, nil)`. LyricsPipeline już je ma we wszystkich trzech projektach.
- Konfiguracja pochodzi z `withStackConfig`, a odpowiedzi providera z `infraMocks`, nie z aktywnego stosu ani `Pulumi.dev.yaml`. Podawaj projekty w kolejności zależności: najpierw base, potem konsumenci. Symulowane outputs ukończonego projektu są przekazywane następnym przez StackReference; brak wcześniej wygenerowanego celu kończy symulację błędem.
- Adapter przechwytuje bieżące rejestracje oraz odczyty zasobów, parent, dependencies i propertyDependencies. Nie czyta historycznych fixture’ów grafu i nie publikuje wartości inputs/outputs. Wybrane właściwości potrzebne do rozpoznania relacji są przechowywane tylko w prywatnym przechwyceniu i usuwane przed wygenerowaniem HTML.
- Każdy moduł jest kopiowany do prywatnego katalogu tymczasowego: pliki Go, `go.mod`, `go.sum`, `Pulumi.yaml`. W tej kopii powstaje test przechwytujący graf oraz ewentualne artefakty builda. Kopia jest usuwana po zakończeniu; źródłowy projekt nie jest modyfikowany przez runner.
- Wymagany jest Go i już pobrane zależności projektu. Pobieranie modułów i toolchainów jest wyłączone. Przy pierwszej konfiguracji zależności pobierz osobno zwykłym `go mod download` w zaufanym repo projektu.
- Nieobsługiwane są jeszcze inne języki, projekty bez tego helpera, zależności lokalne poza kopiowanym modułem oraz dodatkowe pliki wymagane przez `go:embed`/kod aplikacji.

Mocki zastępują operacje providera zgodnie z [mechanizmem testów Pulumi](https://www.pulumi.com/docs/iac/guides/testing/unit/). To symulacja konfiguracji testowej, nie prawdziwy preview, weryfikacja istnienia zasobów ani potwierdzenie możliwości wdrożenia. Runner uruchamia kod projektu i jego inicjalizatory, więc używaj go wyłącznie dla zaufanego kodu. Nie jest sandboxem blokującym dowolne operacje sieciowe lub plikowe tego kodu; zmienne `AWS_*`/`PULUMI_*` są usuwane, ale nie zastępuje to izolacji systemowej.

Format adaptera oparto na typach [eksportu Pulumi](https://github.com/pulumi/pulumi/blob/master/sdk/go/common/apitype/core.go) i [generatorze preview JSON](https://github.com/pulumi/pulumi/blob/master/pkg/backend/display/json.go).

## Wiele powiązanych stosów

`--input` można powtarzać. Zasoby są łączone przed rozwiązywaniem relacji; węzły pokazują projekt/stos. Przy wielu wejściach zachowujemy również korzenie stosów, do których mogą prowadzić `StackReference`.

```bash
go run ./cmd/infralens render \
  --input example/base/dev=testdata/pulumi/multi/base.json \
  --input example/separation/dev=testdata/pulumi/multi/separation.json \
  --input example/transcription/dev=testdata/pulumi/multi/transcription.json \
  --output /tmp/combined.html
```

Składnia `org/project/stack=FILE` nadaje wejściu pełną tożsamość stosu. Jest potrzebna, aby połączyć `StackReference.inputs.name` z korzeniem innego wejścia bez zgadywania organizacji, której nie ma w URN. Nazwy projektu/stosu są sprawdzane względem URN. Dla nienazwanych wejść nadal powstaje wspólny graf, ale nie zgadujemy celów StackReference. Nieznane lub ukryte cele są liczone jako pominięte referencje. Powtórzone URN-y i niezgodne etykiety kończą się błędem.

Połączenie oznacza zależność od stosu, nie ruch sieciowy ani dowód zależności od konkretnego zasobu wyeksportowanego w jego outputs. Inputs/outputs nie są publikowane; z `inputs.name` odczytujemy wyłącznie nazwę celu StackReference na potrzeby dopasowania.

Przykład dla LyricsPipeline, wykonywany w katalogu tego repo (eksportuje istniejący zapisany stan, bez preview/deploy):

```bash
pulumi -C infra/base stack export --stack dev --file /tmp/base.json
pulumi -C infra/separation stack export --stack dev --file /tmp/separation.json
pulumi -C infra/transcription stack export --stack dev --file /tmp/transcription.json
```

Następnie w InfraLens, po zastąpieniu `ORG` właściwą organizacją/backendową tożsamością używaną w StackReference:

```bash
go run ./cmd/infralens render \
  --input ORG/LyricsPipeline/dev=/tmp/base.json \
  --input ORG/LyricsPipeline-Separation/dev=/tmp/separation.json \
  --input ORG/LyricsPipeline-Transcription/dev=/tmp/transcription.json \
  --output /tmp/lyrics.html
```

Obsługa wielu wejść działa także dla wspieranego podzbioru preview, ale widoczne są tylko zasoby faktycznie obecne w jego `steps`. Wymagany jest korzeń każdego nazwanego wejścia. Oddzielne preview nie propagują niezastosowanych zmian outputs pomiędzy stosami — wspólny widok nie jest skoordynowanym planem wdrożenia.


## Diagram i znaczenie połączeń

- **Przepływ:** tylko rozpoznane regułami połączenia. Pełne turkusowe strzałki pokazują konfigurację zdarzeń/wywołań; fioletowe przerywane — referencje do zasobów w konfiguracji.
- **Infrastruktura:** grupy zasobów, opcjonalnie szare przerywane zależności Pulumi. `depends_on` wskazuje od zasobu zależnego do jego zależności, a nie kierunek danych.
- Interfejs i generowane opisy są po angielsku; nazwy zasobów i dane projektu zachowują oryginalną postać. Oficjalne ikony AWS z pakietu 31 lipca 2026 są osadzone jako SVG w HTML i działają offline ([źródło i warunki](internal/render/icons/NOTICE.md)). Pomocnicze liście mają osobne, domyślnie zwinięte grupy usług w obrębie swojego stosu lub komponentu, np. IAM, S3 i CloudWatch. Klasyfikacja korzysta z typu Pulumi; zasoby uczestniczące w flow pozostają na głównym diagramie.
- Ciemny canvas zajmuje całe okno. Stosy zawierają rzeczywiste komponenty Pulumi; gałęzie pomocnicze początkowo pozostają zwinięte. Przyciski +/− rozwijają grupy, a połączenia na ich granicach łączą się z zachowaniem wszystkich dowodów.
- Kliknięcie, dotknięcie, Enter lub Spacja otwiera modal szczegółów zasobu, grupy albo połączenia. Akordeony porządkują zasoby w grupie, typy połączeń i dowody. Kliknięcie wspólnego odcinka strzałek pokazuje wszystkie relacje pod wskaźnikiem, a klawiatura otwiera relację z fokusem. Escape, przycisk zamknięcia lub kliknięcie tła zamyka modal i przywraca fokus do grafu. Liczniki połączeń omijają karty i inne liczniki.
- Wyszukiwanie obejmuje wszystkie zasoby, także wewnątrz zwiniętych grup; rozwija przodków i wskazuje wynik. Zoom działa kółkiem lub przyciskami, przesuwanie przez przeciągnięcie tła. Rozwijanie, wybór i zmiana rozmiaru okna zachowują kamerę. „Dopasuj” pokazuje całość. Telefon rozpoczyna od czytelnego fragmentu zamiast miniatury całego grafu. Filtry i legenda są w przycisku obok widoku; preview pozwala przełączyć topologię przed/po zmianie.
- Bez rozpoznanych reguł domyślnie pokazujemy infrastrukturę; nie zamieniamy dependencies na fikcyjny przepływ.

Pierwszy zestaw reguł AWS obejmuje S3 notifications do SQS/Lambda/SNS, EventBridge targety (w tym DLQ), EventBridge patterns dla S3/Step Functions, statyczne wywołania Lambda w definicji Step Functions, SQS event source mapping, referencję ECS Service → TaskDefinition oraz wybrane zmienne środowiskowe Lambda/ECS (`MEDIA_BUCKET`, `BUCKET_NAME`, `S3_BUCKET`, `QUEUE_URL`, `QUEUE_ARN`). Dopasowanie identyfikatora musi być jednoznaczne; wartości nieznane/sekretne nie są zgadywane. Dla S3 → EventBridge sprawdzamy też włączenie EventBridge w BucketNotification.

Preview obsługuje również referencje `propertyDependencies` dla S3 BucketNotification → Lambda, integracji API Gateway v2 `AWS_PROXY` → Lambda i środowiska Lambda → EC2. Nieznane ARN-y/IP nie blokują tych połączeń: są pokazywane jako przerywane referencje konfiguracji z dowodem, bez przypisywania kierunku komunikacji. Pojedyncze cele muszą być jednoznaczne i mieć zgodny typ. Samo `dependsOn` ani IAM nie tworzą przepływu. Dla niezmienionych zasobów adapter zachowuje ID i outputs starego stanu, jeśli preview pomija je w nowej rejestracji.

Opisy przepływu pokazują metodę i ścieżkę API Gateway v2 (np. `GET /search`), zdarzenia oraz prefix/suffix reguł S3, filtry i parametry mappingów SQS/DynamoDB Streams, pattern/harmonogram EventBridge, DLQ i ścieżki zadań Step Functions. Lambda → DynamoDB oznacza jawną referencję tabeli w środowisku, bez wnioskowania o odczycie lub zapisie. Krótki opis jest na strzałce. Modal pokazuje wszystkie opisy z dowodami. Kilka endpointów/filtrów jest zachowywanych osobno, także przed/po zmianie. Sekrety, URL-e, ARN-y i IP są ukrywane w opisach; wartości środowiska i payloady nie trafiają do szczegółów. Jawne ścieżki i wartości filtrów mogą zawierać informacje projektowe.

Sam `MEDIA_BUCKET` nie dowodzi, że aplikacja zapisuje lub czyta z S3. Diagram pokazuje konfigurację, nie zaobserwowany ruch. Nie analizujemy jeszcze IAM jako dowodu użycia, kodu aplikacji, dynamicznych wywołań ani wszystkich integracji usługowych Step Functions. Layout warstwowy obsługuje cykle. Strzałki biegną pod kątem prostym przez wolne korytarze, z odstępem od kart, nagłówków i obcych grup. Trasy są przeliczane po rozwinięciu lub zwinięciu grupy; mogą krzyżować się z innymi strzałkami na pustym obszarze.

Sprawdzone na LyricsPipeline: 76 zasobów, 13 rozpoznanych połączeń konfiguracji, 10 zasobów uczestniczących w przepływie, wszystkie zasoby dostępne przez grupy i wyszukiwanie, zero pominiętych referencji. Reguły opierają się m.in. na kontraktach [BucketNotification](https://www.pulumi.com/registry/packages/aws/api-docs/s3/bucketnotification/) i [EventTarget](https://www.pulumi.com/registry/packages/aws/api-docs/cloudwatch/eventtarget/).

### Rozwój renderera i sprawdzenie HTML

Kod interfejsu jest w `internal/render/frontend/src`. Komponenty shadcn/ui są w `components/ui`, a interfejs używa klas Tailwinda. Algorytmy układu i trasowania SVG są w `internal/render`.

Po zmianie kodu renderera odśwież artefakty Vite w `internal/render/frontend/dist`. Go osadza je w binarce. Artefakty są częścią repozytorium, więc kompilacja Go z gotowego checkoutu i uruchomienie zainstalowanej komendy działają samodzielnie. Do odświeżenia frontendu użyj Node.js 22.12+ lub nowszej obsługiwanej wersji.

```bash
npm ci --prefix internal/render/frontend
npm run build --prefix internal/render/frontend
```

Jeśli używasz globalnej komendy `InfraLens`, po buildzie frontendu ponownie zbuduj i zainstaluj binarkę zgodnie z instrukcją na początku README. Wygeneruj też ponownie zapisane raporty HTML.

```bash
go test ./...
node --test internal/render/*.test.mjs
go run ./cmd/infralens render --input testdata/pulumi/flow-details.json --output /tmp/infralens.html
python3 scripts/check_html.py /tmp/infralens.html /sciezka/do/chrome-headless-shell
```

Test przeglądarkowy wymaga już zainstalowanego Chromium. Otwiera faktyczny plik przez `file://`, sprawdza rozwijanie grup, dostępność przycisków pod wskaźnikiem, akordeony, zamykanie modalu i przywracanie fokusu, wyszukanie każdego zasobu, zachowanie kamery, pan/zoom, układ desktop/mobile i brak zasobów HTTP/HTTPS. Osobne przypadki obejmują pusty graf, długie nazwy, ograniczenie ruchu i wspólne odcinki różnych typów relacji. Test sprawdza też rzeczywisty element pod wskaźnikiem oraz obszary etykiet. Zrzuty QA zapisuje w `/tmp/infralens-desktop.png` i `/tmp/infralens-mobile.png`.

## Gdzie czego szukać

| Dokument | Rola |
|---|---|
| [Raport źródłowy](deep-research-report.md) | Research, analiza rynku, warianty i uzasadnienia. Materiał referencyjny, nie backlog. |
| [Zakres produktu](docs/PRODUCT.md) | Co ma robić v0.1, dla kogo i czego świadomie nie budujemy. |
| [Plan realizacji](docs/PLAN.md) | Kolejność prac, zadania i warunki zakończenia etapów. |
| [Architektura](docs/ARCHITECTURE.md) | Proponowany przepływ danych, CLI, graf i granice bezpieczeństwa. |
| [Decyzje i pytania](docs/DECISIONS.md) | Przyjęte założenia robocze, otwarte wybory i rzeczy wymagające sprawdzenia. |
| [Roadmapa](docs/ROADMAP.md) | Możliwe rozszerzenia po v0.1, poza bieżącym zobowiązaniem. |

## Jak korzystamy z dokumentacji

1. Research dostarcza argumentów; sam nie dodaje funkcji do zakresu.
2. `PRODUCT.md` określa proponowany kontrakt pierwszej wersji.
3. `PLAN.md` rozbija ten kontrakt na pracę. Checkbox zaznaczamy dopiero po spełnieniu kryterium odbioru.
4. Zmiana zakresu wymaga aktualizacji produktu i planu; zmianę decyzji zapisujemy w `DECISIONS.md`.
5. Roadmapa nie jest listą zadań do wykonania przy okazji MVP.

Najbliższy krok: poszerzać kompatybilność na zanonimizowanych rzeczywistych eksportach oraz pokrycie reguł AWS. Dokumenty planu opisują również zakres wykraczający poza obecną implementację.
