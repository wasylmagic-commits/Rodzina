# Rodzina — serwer (Google Apps Script)

Jeden kod dla każdej rodziny. Wszystko, co dotyczy konkretnej rodziny, siedzi w jej arkuszu (Ludzie, Ustawienia, Listy).

- `Ladowarka.gs` — JEDYNY plik w projekcie Apps Script rodziny. Wczytuje przypięty silnik z Drive i przekazuje mu pracę; obsługuje aktualizacje i cofanie (api akt*), tylko administrator rodziny.
- `silnik/Silnik.js` — właściwy kod (API aplikacji, listy z podzadaniami, działy zakupów, kalendarz, „Jadę do domu”, podsumowania). Nie leży w projekcie: trafia do rodziny łatką.
- `appsscript.json` — uprawnienia.

Aktualizacja (bez Google Cloud i bez Apps Script API): łatka `RRRR-MM-DD_silnik_X.Y.Z.json` = `{ "id", "opis", "silnik": "<cały Silnik.js>" }`
w folderze `Rodzina_Aktualizacje` rodziny → aplikacja: Ещё → Обновление системы → Установить / Откатить.

Nowa rodzina: arkusz → Apps Script → Ladowarka.gs + appsscript.json → łatka z silnikiem w Rodzina_Aktualizacje → `instalacja` → wdrożenie aplikacji webowej → otwórz raz aplikację → `linki`.
