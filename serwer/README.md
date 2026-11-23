# Rodzina — serwer (Google Apps Script)

Jeden kod dla każdej rodziny. Wszystko, co dotyczy konkretnej rodziny, siedzi w jej arkuszu (Ludzie, Ustawienia, Listy).

- `Kod.gs` — API aplikacji, listy z podzadaniami, działy zakupów, kalendarz, „Jadę do domu”, podsumowania, przypomnienia.
- `Aktualizator.gs` — aktualizacje łatkami `.json` z folderu `Rodzina_Aktualizacje` (instalacja z aplikacji: Ещё → Обновление системы).
- `appsscript.json` — uprawnienia (w tym script.projects / script.deployments dla Aktualizatora).

Nowa rodzina: arkusz → Apps Script → te trzy pliki → `instalacja` → wdrożenie aplikacji webowej → `aktualizatorUstaw` → `linki`.
Kod na produkcji zmienia się tylko łatkami (nie ręcznie).
