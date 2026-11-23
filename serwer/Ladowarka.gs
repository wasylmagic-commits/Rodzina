/**
 * Ladowarka.gs — stały „rozrusznik” aplikacji Rodzina. 23.11.2026
 *
 * To JEDYNY plik kodu w projekcie Apps Script rodziny i zmienia się bardzo rzadko.
 * Właściwy kod (SILNIK) leży jako plik .js w folderze Rodzina_Aktualizacje/Silniki na Drive właściciela.
 * Ładowarka przy każdym wywołaniu wczytuje przypięty silnik (z pamięci podręcznej) i przekazuje mu pracę.
 *
 * Aktualizacja bez Google Cloud i bez Apps Script API:
 *   łatka = plik .json w Rodzina_Aktualizacje: { "id": "2026-11-23_silnik_0.2.1", "opis": "…", "silnik": "…cały kod silnika…" }
 *   aplikacja (Ещё → Обновление системы): aktSprawdz → opis → „Установить” (aktWykonaj) → silnik przypięty;
 *   „Откатить” (aktCofnij) → wraca poprzedni silnik. Obsługuje to Ładowarka, więc nawet zepsuty silnik da się cofnąć.
 * Pierwszy start: gdy nic nie jest przypięte, Ładowarka sama instaluje pierwszą łatkę z kolejki.
 * Skalowanie: każda rodzina ma tę samą Ładowarkę; silnik dostaje łatką do swojego folderu.
 * Wersja 2 (23.11.2026): doPost — pliki (dokumenty, zdjęcia) przychodzą w treści zapytania jako JSON; dalej ta sama droga co doGet.
 */

const LAD_WERSJA = 2;

const LAD_FOLDER_NAZWA = 'Rodzina_Aktualizacje';
const LAD_HISTORIA_ILE = 10;
const LAD_KAWALEK = 90000;           // limit wpisu w CacheService to 100 KB
let LAD_GOTOWY = false;

const ladP_ = () => PropertiesService.getScriptProperties();
function ladJson_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ===================== wejścia ===================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try { const u = ScriptApp.getService().getUrl(); if (/\/exec$/.test(u) && ladP_().getProperty('WEBAPP_URL') !== u) ladP_().setProperty('WEBAPP_URL', u); } catch (x) {}
  if (p.api === 'ladWersja') return ladJson_({ ok: true, wynik: { ladowarka: LAD_WERSJA } });
  if (/^akt/.test(p.api || '')) return ladJson_(ladAktualizacje_(p));
  try { ladUruchom_(); }
  catch (err) { return ladJson_({ ok: false, blad: 'Сервер не смог загрузить код: ' + err.message + '. Администратор: Ещё → Обновление системы → Откатить.' }); }
  return RODZINA_SILNIK.obsluzZapytanie_(e);
}
// POST: { k, api, …, b64 } w treści (text/plain, bez preflight CORS) — parametry z adresu + z treści, potem jak doGet
function doPost(e) {
  let tresc = {};
  try { tresc = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {}; }
  catch (x) { return ladJson_({ ok: false, blad: 'Неверные данные в запросе' }); }
  const p = Object.assign({}, (e && e.parameter) || {}, tresc);
  return doGet({ parameter: p, postData: e && e.postData, metoda: 'post' });
}
function co15() { ladUruchom_(); RODZINA_SILNIK.co15_(); }
function instalacja() { ladUruchom_(); RODZINA_SILNIK.instalacja_(); }
function linki() { ladUruchom_(); RODZINA_SILNIK.linki_(); }

/* ===================== wczytanie silnika ===================== */

function ladUruchom_() {
  if (LAD_GOTOWY) return;
  let id = ladP_().getProperty('SILNIK_PLIK');
  if (!id) {                                   // pierwszy start: instaluj pierwszą łatkę z kolejki
    const n = ladNastepna_();
    if (!n) throw new Error('нет кода: в папке ' + LAD_FOLDER_NAZWA + ' нет ни одного обновления');
    ladZainstaluj_(n.plik, n.patch);
    id = ladP_().getProperty('SILNIK_PLIK');
  }
  const kod = ladKod_(id);
  (0, eval)(kod);                              // pośredni eval = zasięg globalny; silnik ustawia globalThis.RODZINA_SILNIK
  if (typeof RODZINA_SILNIK === 'undefined' || !RODZINA_SILNIK.obsluzZapytanie_) throw new Error('silnik nie ustawił RODZINA_SILNIK');
  LAD_GOTOWY = true;
}

function ladKod_(id) {
  const c = CacheService.getScriptCache(), k = 'sil_' + id;
  const ile = Number(c.get(k + '_n') || 0);
  if (ile) {
    const cz = c.getAll(Array.from({ length: ile }, (_, i) => k + '_' + i));
    const kod = Array.from({ length: ile }, (_, i) => cz[k + '_' + i]);
    if (kod.every(x => typeof x === 'string')) return kod.join('');
  }
  const kod = DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8');
  try {
    const wpisy = {}, n = Math.ceil(kod.length / LAD_KAWALEK);
    for (let i = 0; i < n; i++) wpisy[k + '_' + i] = kod.slice(i * LAD_KAWALEK, (i + 1) * LAD_KAWALEK);
    wpisy[k + '_n'] = String(n);
    c.putAll(wpisy, 21600);
  } catch (x) {}
  return kod;
}

/* ===================== foldery i łatki ===================== */

function ladFolder_() {
  const id = ladP_().getProperty('AKT_FOLDER');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (x) {} }
  const plik = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  const it = plik.getParents(), rodzic = it.hasNext() ? it.next() : DriveApp.getRootFolder();
  const jest = rodzic.getFoldersByName(LAD_FOLDER_NAZWA);
  const f = jest.hasNext() ? jest.next() : rodzic.createFolder(LAD_FOLDER_NAZWA);
  ladP_().setProperty('AKT_FOLDER', f.getId());
  return f;
}
function ladPodfolder_(nazwa) { const f = ladFolder_(), it = f.getFoldersByName(nazwa); return it.hasNext() ? it.next() : f.createFolder(nazwa); }
function ladLista_(k) { try { return JSON.parse(ladP_().getProperty(k) || '[]'); } catch (x) { return []; } }

function ladCzytaj_(plik) {
  const p = JSON.parse(plik.getBlob().getDataAsString('UTF-8').replace(/^\uFEFF/, ''));
  p.id = String(p.id || plik.getName().replace(/\.json$/i, ''));
  return p;
}
function ladNastepna_() {
  const ids = ladLista_('AKT_ZASTOSOWANE'), out = [], it = ladFolder_().getFiles();
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed() && /\.json$/i.test(f.getName())) out.push(f); }
  out.sort((a, b) => a.getName().localeCompare(b.getName()));
  for (let i = 0; i < out.length; i++) {
    let p;
    try { p = ladCzytaj_(out[i]); } catch (e) { throw new Error('не могу прочитать «' + out[i].getName() + '»: ' + e.message); }
    if (ids.indexOf(p.id) >= 0) { try { out[i].moveTo(ladPodfolder_('Zastosowane')); } catch (x) {} continue; }
    return { plik: out[i], patch: p, reszta: out.length - i - 1 };
  }
  return null;
}

// sprawdzenie łatki bez zapisu
function ladSprawdzLatke_(p) {
  const bledy = [];
  const kod = String(p.silnik || '');
  if (!kod.trim()) bledy.push('в обновлении нет кода (поле silnik)');
  else {
    try { new Function(kod); } catch (e) { bledy.push('ошибка синтаксиса: ' + e.message); }
    if (kod.indexOf('RODZINA_SILNIK') < 0) bledy.push('код не объявляет RODZINA_SILNIK');
  }
  return bledy;
}

function ladZainstaluj_(plik, p) {
  const bledy = ladSprawdzLatke_(p);
  if (bledy.length) throw new Error('обновление ' + p.id + ' не подходит:\n• ' + bledy.join('\n• '));
  const t = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'dd.MM.yyyy HH:mm');
  const nowy = ladPodfolder_('Silniki').createFile(p.id.replace(/[^\w.-]+/g, '-') + '.js', p.silnik, 'application/javascript');
  const hist = ladLista_('SILNIK_HISTORIA');
  hist.push({ plik: nowy.getId(), id: p.id, t: t });
  while (hist.length > LAD_HISTORIA_ILE) hist.shift();
  ladP_().setProperty('SILNIK_HISTORIA', JSON.stringify(hist));
  ladP_().setProperty('SILNIK_PLIK', nowy.getId());
  ladP_().setProperty('SILNIK_ID', p.id);
  const ids = ladLista_('AKT_ZASTOSOWANE'); ids.push(p.id);
  ladP_().setProperty('AKT_ZASTOSOWANE', JSON.stringify(ids.slice(-200)));
  try { plik.moveTo(ladPodfolder_('Zastosowane')); } catch (x) {}
  LAD_GOTOWY = false;
  return '✅ Обновление ' + p.id + ' установлено (' + Math.round(p.silnik.length / 1024) + ' КБ кода). Приложение уже работает на нём.';
}

/* ===================== API aktualizacji (tylko administrator rodziny) ===================== */

function ladWiersze_(nazwa) {
  const sh = SpreadsheetApp.getActive().getSheetByName(nazwa);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), h = v[0].map(String);
  return v.slice(1).map(r => { const o = {}; h.forEach((k, j) => o[k] = String(r[j])); return o; });
}
function ladAdmin_(klucz) {
  const ludzie = ladWiersze_('Ludzie'), ja = ludzie.filter(o => o.klucz && o.klucz === klucz)[0];
  if (!ja) throw new Error('Неверный ключ');
  const adm = (ladWiersze_('Ustawienia').filter(o => o.klucz === 'admin')[0] || {}).wartosc || '';
  const lista = adm ? adm.split(',').map(x => x.trim()) : [(ludzie.filter(o => o.rola === 'rodzic')[0] || {}).id];
  if (lista.indexOf(ja.id) < 0) throw new Error('Обновления ставит только администратор семьи');
  return ja;
}

function ladAktualizacje_(p) {
  const lock = LockService.getScriptLock();
  try {
    ladAdmin_(p.k);
    lock.waitLock(20000);
    const wersja = ladP_().getProperty('SILNIK_ID') || '—';
    if (p.api === 'aktSprawdz') {
      const n = ladNastepna_();
      if (!n) return { ok: true, wynik: { brak: true, wersja: wersja } };
      return { ok: true, wynik: { plik: n.plik.getId(), id: n.patch.id, opis: n.patch.opis || '', zmiany: ['♻️ код сервера целиком (' + Math.round(String(n.patch.silnik || '').length / 1024) + ' КБ)'],
        bledy: ladSprawdzLatke_(n.patch), reszta: n.reszta, wersja: wersja } };
    }
    if (p.api === 'aktWykonaj') {
      const plik = DriveApp.getFileById(p.plik), patch = ladCzytaj_(plik);
      if (ladLista_('AKT_ZASTOSOWANE').indexOf(patch.id) >= 0) return { ok: true, wynik: { tekst: 'ℹ️ Обновление ' + patch.id + ' уже установлено.' } };
      return { ok: true, wynik: { tekst: ladZainstaluj_(plik, patch) } };
    }
    if (p.api === 'aktCofnijInfo') {
      const h = ladLista_('SILNIK_HISTORIA');
      if (h.length < 2) return { ok: true, wynik: { brak: true } };
      return { ok: true, wynik: { kopia: h[h.length - 2].plik, patch: h[h.length - 1].id, t: h[h.length - 2].t } };
    }
    if (p.api === 'aktCofnij') {
      const h = ladLista_('SILNIK_HISTORIA');
      if (h.length < 2) return { ok: true, wynik: { tekst: 'Нечего откатывать' } };
      if (p.kopia && h[h.length - 2].plik !== p.kopia) return { ok: true, wynik: { tekst: 'ℹ️ Этот откат уже сделан.' } };
      const zdjety = h.pop(), teraz = h[h.length - 1];
      ladP_().setProperty('SILNIK_HISTORIA', JSON.stringify(h));
      ladP_().setProperty('SILNIK_PLIK', teraz.plik);
      ladP_().setProperty('SILNIK_ID', teraz.id);
      ladP_().setProperty('AKT_ZASTOSOWANE', JSON.stringify(ladLista_('AKT_ZASTOSOWANE').filter(x => x !== zdjety.id)));
      return { ok: true, wynik: { tekst: '↩️ Откатил ' + zdjety.id + ' — работает ' + teraz.id + ' (от ' + teraz.t + ').' } };
    }
    throw new Error('Неизвестное действие');
  } catch (err) {
    return { ok: false, blad: String(err.message || err) };
  } finally { try { lock.releaseLock(); } catch (x) {} }
}
