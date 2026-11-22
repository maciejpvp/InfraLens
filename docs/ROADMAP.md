# Roadmapa po v0.1

Status: **kandydaci do kolejnych dostaw**, bez zatwierdzonych terminów. Nie są częścią bieżącego [planu MVP](PLAN.md). Numeracja zachowuje orientacyjny podział z raportu; zakres wybieramy po odbiorze poprzedniej wersji.

| Etap | Wynik dla użytkownika | Warunek rozpoczęcia / odbioru |
|---|---|---|
| v0.2 — semantyka AWS | Wybrane, wyjaśnione połączenia i wyzwalacze; grupy VPC/subnet. | Stabilne v0.1; jawna lista reguł z kierunkami i pozytywnymi/negatywnymi fixture’ami. Każda relacja ma evidence; brak zgadywania ruchu z dependencies. |
| v0.3 — skala i dystrybucja | Użyteczny graf 500+ zasobów, lepsze filtry, gotowe binarki i snapshot artifact w CI. | Zmierzone wąskie gardła; ustalony sprzęt/budżet wydajności; testy deklarowanych platform. Action przyjmuje gotowy JSON bez uruchamiania Pulumi. |
| v0.4 — review zmian | Pulumi preview pokazane jako create/update/replace/delete na wspólnym grafie starego i nowego stanu. | Zweryfikowany format preview, fixture’y operacji i jednoznaczne zachowanie usuniętych zasobów. JSONL obsłużony albo jawnie odrzucony. |
| Po v0.4 — nowe źródła | Terraform plan JSON, potem osobno testowany OpenTofu plan JSON. | Adapter nie zmienia podstawowej semantyki grafu ani granicy bezpieczeństwa; sensitive plaintext objęty testami minimalizacji. |

Pierwszy podzbiór reguł AWS i widok flow z v0.2 zrealizowano wcześniej na bezpośrednią prośbę użytkownika. Nie oznacza to pełnego pokrycia AWS ani ukończenia grupowania VPC/subnet.

## Osobne rozszerzenia wymagające decyzji

- Integracja PR: summary i link do artefaktu przed automatycznymi komentarzami. Żaden workflow nie wykonuje kodu z obcego PR z uprzywilejowanym tokenem; pobrane artefakty traktujemy jako niezaufane dane.
- Homebrew i kolejne kanały instalacji dopiero po działających wydaniach binarnych.
- SVG/PNG, większe pakiety reguł AWS, Azure/GCP, blast radius, cost/security overlays.
- CloudFormation/Kubernetes i API reguł społeczności dopiero po konkretnych potrzebach użytkowników.

## Jak wybieramy następną dostawę

Po v0.1 zbieramy problemy na rzeczywistych, bezpiecznie udostępnionych eksportach: błędne relacje, nieczytelny układ, czas generowania i brakujące informacje. Na tej podstawie wybieramy jeden kolejny cel i dopisujemy osobny plan z kryteriami odbioru.

Cel stały: lokalne dane wejściowe → jeden samodzielny HTML. Rozbudowa nie wymaga konta, backendu ani telemetrii.
