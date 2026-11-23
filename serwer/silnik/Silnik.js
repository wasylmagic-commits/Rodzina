/* =====================================================================
 * RODZINA — SILNIK aplikacji rodzinnej — v0.3.1, 23.11.2026
 * 0.3.1: pushTest — próbne powiadomienie dla siebie (diagnostyka push).
 * 0.3.0: dokumenty (Drive, rozpoznanie przez Claude, termin ważności), auta, „moje dane” (SOS/kolizja), ustawienia rodziny w aplikacji,
 *        „Jadę do domu” dla obojga rodziców, wysyłka plików przez POST (Ładowarka ≥ 2).
 * PWA (GitHub Pages, wspólna dla wszystkich rodzin) + ten skrypt + arkusz rodziny.
 *
 * SKALOWANIE: kod jest JEDEN dla każdej rodziny. Wszystko, co dotyczy konkretnej rodziny
 * (ludzie, role, kto naciska „Jadę do domu”, listy, teksty, administrator), siedzi w arkuszu
 * (Ludzie, Ustawienia, Listy). W kodzie nie ma imion ani identyfikatorów osób.
 * Nowa rodzina = kopia arkusza + ten kod + jej własne linki.
 *
 * Ten plik NIE leży w projekcie Apps Script: ładuje go Ladowarka.gs z folderu Rodzina_Aktualizacje/Silniki.
 * Nowa wersja = łatka .json {id, opis, silnik} w Rodzina_Aktualizacje → aplikacja: Ещё → Обновление системы.
 * Wejścia dla Ładowarki: na końcu pliku (globalThis.RODZINA_SILNIK).
 * Klucze (właściwości skryptu, opcjonalne): CLAUDE_KEY, FCM_PROJECT, FCM_EMAIL, FCM_KEY.
 * ===================================================================== */

const TZ = 'Europe/Warsaw';
const WERSJA = '0.3.1';
const SCHEMAT = '3';

const ARKUSZE = {
  Ludzie:        ['id', 'imie', 'rola', 'klucz', 'push', 'cisza_od', 'cisza_do', 'nazwisko', 'telefon', 'adres', 'prawo_jazdy'],
  Wydarzenia:    ['id', 'tytul', 'start', 'kto', 'miejsce', 'przyp', 'przyp_wyslane', 'autor', 'czas'],
  Listy:         ['id', 'nazwa', 'ikona', 'widocznosc', 'kolejnosc', 'zakupy'],
  Pozycje:       ['id', 'lista', 'tytul', 'rodzic', 'dla', 'od', 'termin', 'przyp', 'przyp_wyslane', 'dzial', 'notatka', 'status', 'czas', 'czas_zrobione', 'kolejnosc'],
  Dzialy:        ['nazwa', 'dzial', 'czas'],
  Zadania:       ['id', 'tytul', 'dla', 'od', 'termin', 'typ', 'status', 'czas', 'czas_zrobione'],
  Zakupy:        ['id', 'nazwa', 'dodal', 'czas', 'kupione', 'kupil', 'czas_kupna'],   // stary arkusz v0.1 — tylko do migracji
  Powiadomienia: ['id', 'dla', 'tekst', 'czas', 'status', 'pilne', 'push'],
  Ustawienia:    ['klucz', 'wartosc', 'opis'],
  Dokumenty:     ['id', 'tytul', 'kategoria', 'wlasciciel', 'auto', 'widocznosc', 'plik', 'mime', 'nazwa_pliku', 'rozmiar', 'wazny_do', 'sos', 'notatka', 'od', 'czas'],
  Auta:          ['id', 'nazwa', 'marka', 'nr_rej', 'vin', 'rok', 'silnik', 'ubezpieczyciel', 'polisa', 'polisa_do', 'tel_szkody', 'tel_assistance', 'ac', 'notatka', 'czas']
};

// kategorie dokumentów: [klucz, nazwa w aplikacji, folder na Drive, kto widzi domyślnie]
const KATEGORIE = [
  ['auto', 'Авто', 'Auto', 'rodzice'],
  ['ubezp', 'Страховки', 'Ubezpieczenia', 'rodzice'],
  ['med', 'Медицина', 'Medycyna', 'ja'],
  ['rodzina', 'Личные документы', 'Dokumenty osobiste', 'rodzice'],
  ['dom', 'Дом и счета', 'Dom i rachunki', 'rodzice'],
  ['szkola', 'Учёба', 'Szkola', 'rodzice'],
  ['inne', 'Прочее', 'Inne', 'rodzice']
];
const DOK_FOLDER = 'Rodzina_Dokumenty';
const DOK_MAX = 20 * 1024 * 1024;

// ustawienia domyślne (opis po rosyjsku — arkusz czyta rodzina)
const USTAWIENIA_START = [
  ['nazwa_rodziny', 'Семья', 'название в приложении'],
  ['admin', '', 'кто ставит обновления системы (id через запятую; пусто = первый родитель)'],
  ['akt_edytor', 'vtomchakovsky@gmail.com', 'кто может класть файлы обновлений в папку Rodzina_Aktualizacje'],
  ['strona', 'https://wasylmagic-commits.github.io/Rodzina/', 'адрес приложения (для ссылок)'],
  ['kto_jedzie', '', 'кто нажимает «Еду домой» (id через запятую)'],
  ['kuchnia_dla', '', 'кому приходит задание по кухне'],
  ['kuchnia_tekst', 'Подготовь кухню: помой посуду, протри стол, достань продукты для ужина', 'текст задания по кухне'],
  ['podpowiedz_dla', '', 'кто получает личные подсказки (не больше 1 в день)'],
  ['seria_tydzien', '7', 'дней без пропусков → выбор блюда на выходные'],
  ['seria_miesiac', '30', 'дней без пропусков → совместный шопинг'],
  ['poranek', '07:00', 'утренняя сводка'],
  ['wieczor', '20:00', 'вечерняя сводка (в воскресенье — план на неделю)'],
  ['model', 'claude-haiku-5-5', 'модель Claude для быстрого добавления'],
  ['adres_domu', '', 'адрес дома (для звонка 112 из SOS)']
];

const LISTY_START = [
  ['zakupy', 'Покупки', 'cart', 'wszyscy', 1, 1],
  ['dom', 'Дом', 'home', 'wszyscy', 2, 0],
  ['auto', 'Авто', 'car', 'rodzice', 3, 0],
  ['rozne', 'Разное', 'box', 'rodzice', 4, 0]
];

// działy sklepu: [klucz, nazwa w aplikacji, początki słów (ru + pl)]
const DZIALY = [
  ['warzywa', 'Овощи и фрукты', 'овощ фрукт картош картоф морков лук чеснок помидор томат огур капуст перец банан яблок груш апельсин мандарин лимон виноград зелен укроп петруш салат кабач баклаж свекл ягод клубник авокадо гриб шампиньон ziemniak marchew cebul czosnek pomidor ogór kapust papryk banan jabł grusz pomarańcz cytryn winogron sałat pietruszk koper burak grzyb pieczark awokado'],
  ['nabial', 'Молочное и яйца', 'молок кефир сметан творог сыр йогурт ряжен масло сливоч сливк яйц яиц mleko mleka kefir śmietan twaróg twarog ser jogurt masło maslo jaj śmietank'],
  ['mieso', 'Мясо и рыба', 'мяс кур курин филе фарш свин говяд индей колбас сосис сардел ветчин бекон рыб лосос селед кревет mięs mies kurczak filet mielon wieprz wołow indyk kiełbas kielbas parówk szynk boczek ryb łosoś losos śledź krewet kotlet makrel'],
  ['pieczywo', 'Хлеб и выпечка', 'хлеб батон булк багет лаваш выпечк круасс chleb bułk bulk bagiet rogal tortill'],
  ['spozywcze', 'Бакалея', 'круп рис гречк макарон спагет мук сахар соль подсолн оливк уксус соус кетчуп майонез горчиц консерв фасол горох чай кофе специ перец молот хлопь овсян мёд мед варен kasz ryż ryz makaron mąk mak cukier sól sol olej oliw ocet sos ketchup majonez musztard fasol groch herbat kaw przypraw płatk platk owsian miód miod dżem dzem'],
  ['napoje', 'Напитки', 'вод сок газир пив вин лимонад кол напит woda wody sok piwo wino napój napoj cola'],
  ['mrozonki', 'Заморозка', 'морожен пельмен вареник заморож пицц lody mrożon mrozon pierog pizz'],
  ['slodycze', 'Сладкое и снеки', 'шокол конфет печень торт пирож чипс орех сухар вафл czekolad cukierk ciastk tort chips orzech wafl'],
  ['chemia', 'Бытовая химия', 'порош стирал мою моющ средств губк туалетн бумаг салфет пакет мусор фольг пергамент посудомо кондиционер proszek płyn plyn gąbk gabk papier toalet ręczni chusteczk worek work folia kapsułk kapsulk zmywark serwetk'],
  ['higiena', 'Гигиена и аптека', 'шампун мыло зубн паст щётк щетк дезодор крем бритв прокладк тампон пластыр аптек лекарств витамин таблет szampon mydło mydlo past szczoteczk dezodorant krem maszynk podpask plaster lek witamin apteka'],
  ['zwierzeta', 'Для животных', 'корм кошач кот кош наполнит лоток собач karma kot kota żwirek zwirek pies psa'],
  ['inne', 'Другое', '']
];

// ---------------------------------------------------------------- instalacja / migracja
// Nowa rodzina: pusty arkusz → Rozszerzenia → Apps Script → pliki z repozytorium (serwer/) → uruchom instalacja.
function instalacja_() {
  schemat_(true);
  const lu = ark_('Ludzie');
  if (lu.getLastRow() < 2) {
    // szablon: rodzina sama wpisuje imiona; id krótkie, łacińskie
    lu.getRange(2, 1, 1, 7).setValues([['rodzic1', 'Я', 'rodzic', klucz_(), '', '22:00', '07:00']]);
  }
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'co15') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('co15').timeBased().everyMinutes(15).create();
  Logger.log('Gotowe. Wdróż jako aplikację webową (Ladowarka.gs), potem uruchom linki.');
}

// arkusze, brakujące kolumny, ustawienia, listy; migracja v0.1 → v0.2. Lekkie, gdy już zrobione.
function schemat_(sila) {
  const pr = PropertiesService.getScriptProperties();
  if (!sila && pr.getProperty('SCHEMAT') === SCHEMAT) return;
  const ss = SpreadsheetApp.getActive();
  Object.keys(ARKUSZE).forEach(n => {
    let sh = ss.getSheetByName(n);
    if (!sh) sh = ss.insertSheet(n);
    const h = ARKUSZE[n];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
      sh.setFrozenRows(1);
    } else {
      const jest = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
      h.forEach((k, j) => { if (jest[j] !== k) sh.getRange(1, j + 1).setValue(k).setFontWeight('bold'); });
    }
    if (sh.getMaxColumns() < h.length) sh.insertColumnsAfter(sh.getMaxColumns(), h.length - sh.getMaxColumns());
    sh.getRange(1, 1, sh.getMaxRows(), h.length).setNumberFormat('@');   // wszystko jako tekst: daty nie „uciekają”
  });
  const us = ark_('Ustawienia');
  const juz = wiersze_('Ustawienia').map(o => o.klucz);
  USTAWIENIA_START.filter(r => juz.indexOf(r[0]) < 0).forEach(r => us.appendRow(r));
  if (!wiersze_('Listy').length) LISTY_START.forEach(r => ark_('Listy').appendRow(r.map(String)));
  ['Лист1', 'Sheet1', 'Arkusz1'].forEach(n => { const s = ss.getSheetByName(n); if (s && ss.getSheets().length > 1 && s.getLastRow() === 0) ss.deleteSheet(s); });

  // migracja v0.1: zakupy i zwykłe zadania → Pozycje (stare wiersze zostają, tylko oznaczone)
  if (pr.getProperty('MIGRACJA_02') !== 'tak') {
    wiersze_('Zakupy').filter(o => !Number(o.kupione)).forEach(o =>
      dodaj_('Pozycje', { id: o.id || id_(), lista: 'zakupy', tytul: o.nazwa, od: o.dodal, dzial: dzialDla_(o.nazwa), status: 'nowe', czas: o.czas || teraz_() }));
    wiersze_('Zadania').filter(o => o.typ !== 'kuchnia' && o.status === 'nowe').forEach(o => {
      dodaj_('Pozycje', { id: o.id || id_(), lista: 'moje', tytul: o.tytul, dla: o.dla, od: o.od, termin: tekstDaty_(o.termin).slice(0, 10), status: 'nowe', czas: o.czas || teraz_() });
      zmien_('Zadania', o, { status: 'przeniesione' });
    });
    pr.setProperty('MIGRACJA_02', 'tak');
  }
  // migracja 0.3: „Еду домой” mogą naciskać oboje rodzice (dalej zmienia to administrator w aplikacji)
  if (pr.getProperty('MIGRACJA_03') !== 'tak') {
    const o = wiersze_('Ustawienia').filter(x => x.klucz === 'kto_jedzie')[0];
    if (o) { const l = listaKto_(o.wartosc); rodzice_().forEach(id => { if (l.indexOf(id) < 0) l.push(id); }); zmien_('Ustawienia', o, { wartosc: l.join(',') }); }
    pr.setProperty('MIGRACJA_03', 'tak');
  }
  pr.setProperty('SCHEMAT', SCHEMAT);
}

// linki osobiste (adres /exec z właściwości WEBAPP_URL, nie /dev)
function linki_() {
  const url = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
  if (!/\/exec$/.test(url)) { Logger.log('Brak WEBAPP_URL (…/exec): otwórz raz aplikację, Ładowarka go zapamięta.'); return; }
  const strona = ust_('strona') || 'https://wasylmagic-commits.github.io/Rodzina/';
  wiersze_('Ludzie').forEach(o => Logger.log(o.imie + ':  ' + strona + '#u=' + encodeURIComponent(url) + '&k=' + o.klucz));
}

function klucz_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 20); }

// ---------------------------------------------------------------- arkusz
function ark_(n) { return SpreadsheetApp.getActive().getSheetByName(n); }
function wiersze_(n) {
  const sh = ark_(n); if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const h = ARKUSZE[n], v = sh.getRange(2, 1, last - 1, h.length).getValues();
  return v.map((r, i) => { const o = { _w: i + 2 }; h.forEach((k, j) => o[k] = r[j]); return o; }).filter(o => o[h[0]] !== '');
}
function dodaj_(n, o) {
  const h = ARKUSZE[n];
  ark_(n).appendRow(h.map(k => o[k] === undefined || o[k] === null ? '' : String(o[k])));
}
function zmien_(n, o, pola) {
  const h = ARKUSZE[n], sh = ark_(n);
  Object.keys(pola).forEach(k => { const j = h.indexOf(k); if (j >= 0) sh.getRange(o._w, j + 1).setValue(pola[k] === null ? '' : String(pola[k])); o[k] = pola[k]; });
}
function usunWiersze_(n, lista) { const sh = ark_(n); lista.map(o => o._w).sort((a, b) => b - a).forEach(w => sh.deleteRow(w)); }
function znajdz_(n, id) { return wiersze_(n).filter(o => String(o[ARKUSZE[n][0]]) === String(id))[0]; }
function ust_(k) { const o = wiersze_('Ustawienia').filter(x => x.klucz === k)[0]; return o ? String(o.wartosc) : ''; }
function id_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function teraz_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm"); }
function dzien_(d) { return Utilities.formatDate(d || new Date(), TZ, 'yyyy-MM-dd'); }
function godz_(d) { return Utilities.formatDate(d || new Date(), TZ, 'HH:mm'); }
function naDate_(s) { return Utilities.parseDate(String(s).slice(0, 16), TZ, "yyyy-MM-dd'T'HH:mm"); }
function tekstDaty_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm") : String(v || ''); }
function plusDni_(n) { return new Date(Date.now() + n * 864e5); }
function rodzice_() { return wiersze_('Ludzie').filter(o => o.rola === 'rodzic').map(o => o.id); }
function czyAdmin_(ja) {
  const a = listaKto_(ust_('admin') || '');
  return a.length && ust_('admin') ? a.indexOf(ja.id) >= 0 : rodzice_()[0] === ja.id;
}
function imieOsoby_(id) { const o = wiersze_('Ludzie').filter(x => x.id === id)[0]; return o ? o.imie : id; }

// ---------------------------------------------------------------- web API
function obsluzZapytanie_(e) {
  const p = e.parameter || {};
  let wynik;
  try {
    const ja = wiersze_('Ludzie').filter(o => o.klucz && o.klucz === p.k)[0];
    if (!ja) throw new Error('Неверный ключ');
    const f = API[p.api];
    if (!f) throw new Error('Неизвестное действие');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { schemat_(); wynik = { ok: true, wynik: f(ja, p) }; } finally { lock.releaseLock(); }
  } catch (err) {
    wynik = { ok: false, blad: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(wynik)).setMimeType(ContentService.MimeType.JSON);
}

const API = {
  start: (ja) => stan_(ja),

  // --- kalendarz
  wydarzenieDodaj: (ja, p) => {
    if (!p.tytul || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(p.start || '')) throw new Error('Нужно название, дата и время');
    dodaj_('Wydarzenia', { id: idKlienta_(p.id, 'Wydarzenia'), tytul: p.tytul, start: p.start, kto: p.kto || 'wszyscy', miejsce: p.miejsce || '',
      przyp: Number(p.przyp) || 0, przyp_wyslane: '', autor: ja.id, czas: teraz_() });
    const kto = listaKto_(p.kto).filter(x => x !== ja.id);
    if (kto.length) powiadom_(kto, '📅 ' + ja.imie + ' добавил(а): ' + p.tytul + ', ' + ladnaData_(p.start), false);
    return stan_(ja);
  },
  wydarzenieUsun: (ja, p) => {
    const o = znajdz_('Wydarzenia', p.id); if (o) ark_('Wydarzenia').deleteRow(o._w);
    return stan_(ja);
  },

  // --- listy (zakupy, dom, auto…): pozycje i podzadania
  pozDodaj: (ja, p) => {
    const lista = p.lista || 'moje';
    if (lista !== 'moje' && !wiersze_('Listy').some(l => l.id === lista)) throw new Error('Нет такого списка');
    const rodzic = p.rodzic ? znajdz_('Pozycje', p.rodzic) : null;
    if (p.rodzic && !rodzic) throw new Error('Задача не найдена');
    const zakupy = !rodzic && czyZakupy_(lista);
    // w zakupach „mleko, chleb, jajka” = trzy pozycje
    const tytuly = zakupy ? String(p.tytul || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : [String(p.tytul || '').trim()].filter(Boolean);
    if (!tytuly.length) throw new Error('Пусто');
    const dla = p.dla || (lista === 'moje' && !rodzic ? ja.id : '');
    tytuly.forEach((t, i) => dodaj_('Pozycje', {
      id: i === 0 ? idKlienta_(p.id, 'Pozycje') : id_(), lista: rodzic ? rodzic.lista : lista, tytul: t.slice(0, 300), rodzic: rodzic ? rodzic.id : '',
      dla: dla, od: ja.id, termin: p.termin || '', przyp: p.przyp || '', dzial: zakupy ? (p.dzial || dzialDla_(t)) : '',
      notatka: p.notatka || '', status: 'nowe', czas: teraz_(), kolejnosc: Date.now() + i }));
    if (dla && dla !== ja.id && !rodzic) powiadom_([dla], '✅ Задача от ' + ja.imie + ': ' + tytuly[0] + (p.termin ? ' (до ' + ladnaData_(p.termin) + ')' : ''), false);
    return stan_(ja);
  },
  pozZmien: (ja, p) => {
    const o = znajdz_('Pozycje', p.id); if (!o) throw new Error('Не найдено (возможно, уже удалено)');
    const pola = {};
    ['tytul', 'dla', 'termin', 'przyp', 'notatka', 'lista', 'dzial'].forEach(k => { if (p[k] !== undefined) pola[k] = String(p[k]).slice(0, 1000); });
    if (pola.przyp !== undefined && pola.przyp !== String(o.przyp || '')) pola.przyp_wyslane = '';
    if (pola.dzial && pola.dzial !== String(o.dzial)) zapamietajDzial_(o.tytul, pola.dzial);
    if (pola.lista && pola.lista !== o.lista) {
      pola.dzial = czyZakupy_(pola.lista) ? (pola.dzial || dzialDla_(o.tytul)) : '';
      wiersze_('Pozycje').filter(x => x.rodzic === o.id).forEach(x => zmien_('Pozycje', x, { lista: pola.lista }));
    }
    const nowyDla = pola.dla !== undefined && pola.dla && pola.dla !== String(o.dla) && pola.dla !== ja.id;
    zmien_('Pozycje', o, pola);
    if (nowyDla) powiadom_([pola.dla], '✅ ' + ja.imie + ' поручил(а) тебе: ' + o.tytul, false);
    return stan_(ja);
  },
  pozKlik: (ja, p) => {
    const o = znajdz_('Pozycje', p.id); if (!o) throw new Error('Не найдено (возможно, уже удалено)');
    const zrob = p.zrobione !== undefined ? p.zrobione === '1' : o.status !== 'zrobione';
    zmien_('Pozycje', o, zrob ? { status: 'zrobione', czas_zrobione: teraz_() } : { status: 'nowe', czas_zrobione: '' });
    if (zrob && !o.rodzic && o.od && o.od !== ja.id && !czyZakupy_(o.lista)) powiadom_([o.od], '✔️ ' + ja.imie + ' сделал(а): ' + o.tytul, false);
    return stan_(ja);
  },
  pozUsun: (ja, p) => {
    const o = znajdz_('Pozycje', p.id); if (!o) return stan_(ja);
    if (ja.rola !== 'rodzic' && o.od !== ja.id) throw new Error('Удалить может тот, кто добавил, или родитель');
    usunWiersze_('Pozycje', wiersze_('Pozycje').filter(x => x.id === o.id || x.rodzic === o.id));
    return stan_(ja);
  },
  pozWyczysc: (ja, p) => {   // „Убрать сделанное” w jednej liście
    const widac = widocznePozycje_(ja, true).map(x => x.id);
    const zrob = wiersze_('Pozycje').filter(x => x.lista === p.lista && !x.rodzic && x.status === 'zrobione' && widac.indexOf(x.id) >= 0).map(x => x.id);
    usunWiersze_('Pozycje', wiersze_('Pozycje').filter(x => zrob.indexOf(x.id) >= 0 || zrob.indexOf(x.rodzic) >= 0));
    return stan_(ja);
  },

  // --- kuchnia (seria dziecka)
  zadanieZrobione: (ja, p) => {
    const o = znajdz_('Zadania', p.id); if (!o) throw new Error('Не найдено');
    if (o.status !== 'nowe') return stan_(ja);
    zmien_('Zadania', o, { status: 'zrobione', czas_zrobione: teraz_() });
    if (o.od && o.od !== ja.id) {
      const pilne = o.typ === 'kuchnia';
      powiadom_([o.od], (pilne ? '🍳 Кухня готова — ' : '✔️ ') + ja.imie + ' сделал(а): ' + o.tytul, pilne);
    }
    return stan_(ja);
  },

  // „Jadę do domu”: zadanie kuchenne dla dziecka (pilne), info dla drugiego rodzica, podpowiedź (raz dziennie)
  jadeDomu: (ja, p) => {
    if (listaKto_(ust_('kto_jedzie')).indexOf(ja.id) < 0) throw new Error('Эта кнопка не для тебя');
    const min = Number(p.min) || 0, kiedy = min ? ' Будет дома примерно через ' + min + ' мин.' : '';
    const dla = ust_('kuchnia_dla');
    if (dla) {
      const otwarte = wiersze_('Zadania').filter(o => o.typ === 'kuchnia' && o.status === 'nowe' && o.dla === dla)[0];
      if (!otwarte) dodaj_('Zadania', { id: id_(), tytul: ust_('kuchnia_tekst'), dla: dla, od: ja.id, termin: dzien_(), typ: 'kuchnia', status: 'nowe', czas: teraz_() });
      powiadom_([dla], '🚗 ' + ja.imie + ' едет домой.' + kiedy + ' ' + ust_('kuchnia_tekst'), true);
    }
    const inni = rodzice_().filter(id => id !== ja.id);
    if (inni.length) powiadom_(inni, '🚗 ' + ja.imie + ' едет домой.' + kiedy, true);
    podpowiedz_('💬 ' + ja.imie + ' едет домой после смены — хороший момент написать пару тёплых слов.', ja.id);
    return stan_(ja);
  },

  pwCzytaj: (ja, p) => {
    const ids = String(p.ids || '').split(',');
    wiersze_('Powiadomienia').filter(o => o.dla === ja.id && o.status === 'nowe' && (p.ids === 'wszystkie' || ids.indexOf(String(o.id)) >= 0))
      .forEach(o => zmien_('Powiadomienia', o, { status: 'przeczytane' }));
    return stan_(ja);
  },

  pushToken: (ja, p) => { zmien_('Ludzie', ja, { push: p.t || '' }); return { ok: 1 }; },

  // próbne powiadomienie dla siebie; zwraca powód, jeśli nie doszło (bez kluczy w odpowiedzi)
  pushTest: (ja) => {
    const pr = PropertiesService.getScriptProperties();
    if (!ja.push) return { ok: false, powod: 'нет токена: нажми «Включить уведомления»' };
    if (!pr.getProperty('FCM_PROJECT') || !pr.getProperty('FCM_EMAIL') || !pr.getProperty('FCM_KEY')) return { ok: false, powod: 'в свойствах скрипта нет FCM_PROJECT / FCM_EMAIL / FCM_KEY' };
    try {
      const r = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + pr.getProperty('FCM_PROJECT') + '/messages:send', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + tokenFcm_() },
        payload: JSON.stringify({ message: { token: ja.push,
          notification: { title: '🔔 ' + (ust_('nazwa_rodziny') || 'Семья'), body: 'Проверка: уведомления работают, ' + ja.imie + '.' },
          webpush: { fcm_options: { link: ust_('strona') || 'https://wasylmagic-commits.github.io/Rodzina/' } } } })
      });
      const kod = r.getResponseCode();
      return { ok: kod === 200, kod: kod, powod: kod === 200 ? '' : String(r.getContentText()).slice(0, 200) };
    } catch (e) { return { ok: false, powod: String(e.message).slice(0, 200) }; }
  },

  // szybkie dodawanie tekstem: Claude rozbiera, nic nie zapisuje — aplikacja pyta „верно?”
  szybko: (ja, p) => rozbierz_(ja, String(p.tekst || '').slice(0, 500)),

  // --- moje dane (do SOS i oświadczenia o kolizji) — każdy zmienia tylko swoje
  jaZmien: (ja, p) => {
    const pola = {};
    ['nazwisko', 'telefon', 'adres', 'prawo_jazdy'].forEach(k => { if (p[k] !== undefined) pola[k] = String(p[k]).trim().slice(0, 200); });
    ['cisza_od', 'cisza_do'].forEach(k => { if (/^\d\d:\d\d$/.test(p[k] || '')) pola[k] = p[k]; });
    zmien_('Ludzie', ja, pola);
    return stan_(ja);
  },

  // --- ustawienia rodziny (tylko administrator)
  ustRodziny: (ja, p) => {
    if (!czyAdmin_(ja)) throw new Error('Настройки семьи меняет администратор');
    const ids = wiersze_('Ludzie').map(o => o.id), tylkoLudzie = v => String(v || '').split(',').map(x => x.trim()).filter(x => ids.indexOf(x) >= 0).join(',');
    const dozw = { kto_jedzie: tylkoLudzie, kuchnia_dla: tylkoLudzie, podpowiedz_dla: tylkoLudzie, kuchnia_tekst: v => String(v).slice(0, 300),
      adres_domu: v => String(v).slice(0, 200), nazwa_rodziny: v => String(v).slice(0, 60) || 'Семья' };
    Object.keys(dozw).forEach(k => {
      if (p[k] === undefined) return;
      const o = wiersze_('Ustawienia').filter(x => x.klucz === k)[0], v = dozw[k](p[k]);
      if (o) zmien_('Ustawienia', o, { wartosc: v }); else dodaj_('Ustawienia', { klucz: k, wartosc: v, opis: '' });
    });
    return stan_(ja);
  },

  // --- auta rodziny (rodzice)
  autoZapisz: (ja, p) => {
    if (ja.rola !== 'rodzic') throw new Error('Машины добавляют родители');
    if (!String(p.nazwa || '').trim()) throw new Error('Нужно название машины');
    const pola = {};
    ['nazwa', 'marka', 'nr_rej', 'vin', 'rok', 'silnik', 'ubezpieczyciel', 'polisa', 'polisa_do', 'tel_szkody', 'tel_assistance', 'ac', 'notatka']
      .forEach(k => { if (p[k] !== undefined) pola[k] = String(p[k]).trim().slice(0, 300); });
    if (pola.nr_rej) pola.nr_rej = pola.nr_rej.toUpperCase();
    const o = p.id ? znajdz_('Auta', p.id) : null;
    if (o) zmien_('Auta', o, Object.assign(pola, { czas: teraz_() }));
    else dodaj_('Auta', Object.assign(pola, { id: idKlienta_(p.id, 'Auta'), czas: teraz_() }));
    return stan_(ja);
  },
  autoUsun: (ja, p) => {
    if (ja.rola !== 'rodzic') throw new Error('Удаляют родители');
    const o = znajdz_('Auta', p.id); if (o) ark_('Auta').deleteRow(o._w);
    return stan_(ja);
  },

  // --- dokumenty
  // rozpoznanie (POST): zdjęcie pierwszej strony → propozycja kategorii, nazwy, właściciela, auta, terminu; nic nie zapisuje
  dokAnaliza: (ja, p) => analizaDok_(ja, p),
  // zapis (POST): cały plik w base64 + opis
  dokZapisz: (ja, p) => {
    const b64 = String(p.b64 || '');
    if (!b64) throw new Error('Нет файла (обнови приложение)');
    const mime = /^(application\/pdf|image\/(jpeg|png|webp|heic))$/.test(p.mime || '') ? p.mime : 'application/octet-stream';
    const bajty = Utilities.base64Decode(b64);
    if (bajty.length > DOK_MAX) throw new Error('Файл больше 20 МБ');
    const kat = kategoria_(p.kategoria), tytul = String(p.tytul || '').trim().slice(0, 150) || 'Документ';
    const rozsz = mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : '.jpg';
    const nazwa = dzien_() + ' ' + tytul.replace(/[\\/:*?"<>|]+/g, ' ') + rozsz;
    const id = idKlienta_(p.id, 'Dokumenty');
    if (znajdz_('Dokumenty', p.id)) return stan_(ja);   // ponowna wysyłka po zerwaniu sieci
    const plik = folderKat_(kat[0]).createFile(Utilities.newBlob(bajty, mime, nazwa));
    dodaj_('Dokumenty', { id: id, tytul: tytul, kategoria: kat[0], wlasciciel: wlasciciel_(p.wlasciciel, ja), auto: p.auto || '',
      widocznosc: widocznosc_(p.widocznosc, kat), plik: plik.getId(), mime: mime, nazwa_pliku: nazwa, rozmiar: bajty.length,
      wazny_do: /^\d{4}-\d\d-\d\d$/.test(p.wazny_do || '') ? p.wazny_do : '', sos: Number(p.sos) ? 1 : 0, notatka: String(p.notatka || '').slice(0, 500),
      od: ja.id, czas: teraz_() });
    return stan_(ja);
  },
  dokZmien: (ja, p) => {
    const o = znajdz_('Dokumenty', p.id); if (!o || !widziDok_(ja, o)) throw new Error('Документ не найден');
    const pola = {};
    if (p.tytul !== undefined) pola.tytul = String(p.tytul).trim().slice(0, 150) || o.tytul;
    if (p.kategoria !== undefined) pola.kategoria = kategoria_(p.kategoria)[0];
    if (p.wlasciciel !== undefined) pola.wlasciciel = wlasciciel_(p.wlasciciel, ja);
    if (p.auto !== undefined) pola.auto = String(p.auto);
    if (p.widocznosc !== undefined) pola.widocznosc = widocznosc_(p.widocznosc, kategoria_(pola.kategoria || o.kategoria));
    if (p.wazny_do !== undefined) pola.wazny_do = /^\d{4}-\d\d-\d\d$/.test(p.wazny_do) ? p.wazny_do : '';
    if (p.sos !== undefined) pola.sos = Number(p.sos) ? 1 : 0;
    if (p.notatka !== undefined) pola.notatka = String(p.notatka).slice(0, 500);
    if (pola.kategoria && pola.kategoria !== o.kategoria) { try { DriveApp.getFileById(o.plik).moveTo(folderKat_(pola.kategoria)); } catch (e) {} }
    zmien_('Dokumenty', o, pola);
    return stan_(ja);
  },
  dokUsun: (ja, p) => {
    const o = znajdz_('Dokumenty', p.id); if (!o) return stan_(ja);
    if (!widziDok_(ja, o) || (ja.rola !== 'rodzic' && o.od !== ja.id)) throw new Error('Удалить может тот, кто добавил, или родитель');
    try { DriveApp.getFileById(o.plik).setTrashed(true); } catch (e) {}   // kosz Drive: 30 dni na odzyskanie
    ark_('Dokumenty').deleteRow(o._w);
    return stan_(ja);
  },
  dokPobierz: (ja, p) => {
    const o = znajdz_('Dokumenty', p.id); if (!o || !widziDok_(ja, o)) throw new Error('Документ не найден');
    const b = DriveApp.getFileById(o.plik).getBlob();
    return { id: o.id, mime: o.mime || b.getContentType(), nazwa: o.nazwa_pliku || b.getName(), b64: Utilities.base64Encode(b.getBytes()) };
  }
};

// ---------------------------------------------------------------- dokumenty: pomocnicze
function kategoria_(k) { return KATEGORIE.filter(x => x[0] === k)[0] || KATEGORIE[KATEGORIE.length - 1]; }
function wlasciciel_(w, ja) { w = String(w || ''); return w === 'rodzina' || wiersze_('Ludzie').some(o => o.id === w) ? w : ja.id; }
function widocznosc_(w, kat) { return ['ja', 'rodzice', 'wszyscy'].indexOf(w) >= 0 ? w : kat[3]; }
// kto widzi: dodający i właściciel — zawsze; „wszyscy” — rodzina; „rodzice” — rodzice; „ja” — tylko właściciel (dokumenty dziecka widzą też rodzice)
function widziDok_(ja, d, role) {
  if (d.od === ja.id || d.wlasciciel === ja.id || d.widocznosc === 'wszyscy') return true;
  if (ja.rola !== 'rodzic') return false;
  if (d.widocznosc !== 'ja' || d.wlasciciel === 'rodzina') return true;
  if (!role) { role = {}; wiersze_('Ludzie').forEach(o => role[o.id] = o.rola); }
  return role[d.wlasciciel] === 'dziecko';
}
function folderDok_() {
  const pr = PropertiesService.getScriptProperties(), id = pr.getProperty('DOK_FOLDER');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const it = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents(), rodzic = it.hasNext() ? it.next() : DriveApp.getRootFolder();
  const jest = rodzic.getFoldersByName(DOK_FOLDER), f = jest.hasNext() ? jest.next() : rodzic.createFolder(DOK_FOLDER);
  pr.setProperty('DOK_FOLDER', f.getId());
  return f;
}
function folderKat_(k) { const f = folderDok_(), n = kategoria_(k)[2], it = f.getFoldersByName(n); return it.hasNext() ? it.next() : f.createFolder(n); }

// propozycja dla „куда положить”: Claude patrzy na pierwszą stronę; bez klucza — słowa z nazwy
function analizaDok_(ja, p) {
  const ludzie = wiersze_('Ludzie'), auta = wiersze_('Auta');
  const zNazwy = zgadnijKat_(String(p.nazwa || '') + ' ' + String(p.tytul || ''));
  const key = PropertiesService.getScriptProperties().getProperty('CLAUDE_KEY');
  if (!key || !p.b64) return { kategoria: zNazwy, zrodlo: 'nazwa' };
  const sys = 'Ты раскладываешь документы семьи по папкам. Сегодня ' + dzien_() + '. Люди: ' + ludzie.map(o => o.id + '=' + o.imie + (o.nazwisko ? ' (' + o.nazwisko + ')' : '')).join(', ') +
    '. Машины: ' + (auta.length ? auta.map(a => a.id + '=' + a.nazwa + ' ' + a.marka + ' ' + a.nr_rej).join(', ') : 'нет') +
    '. Категории: ' + KATEGORIE.map(k => k[0] + '=' + k[1]).join(', ') + ' (ubezp — любые полисы, OC/AC, страховка жилья, путешествий; auto — техпаспорт dowód rejestracyjny, przegląd, счета за ремонт; ' +
    'med — справки, направления skierowanie, результаты анализов, рецепты, выписки; rodzina — паспорта, карты побыту, PESEL, свидетельства, дипломы, договоры работы; dom — аренда, счета, коммуналка, банк; szkola — школа, техникум, оценки). ' +
    'Ответь ТОЛЬКО JSON: {"kategoria":"…","tytul":"короткое понятное название по-русски, до 6 слов, например «Полис OC Fiesta 2026»","wlasciciel":"id человека или rodzina",' +
    '"auto":"id машины или пусто","wazny_do":"YYYY-MM-DD — до какого числа документ действует (полис, техосмотр, карта, паспорт), иначе пусто","opis":"одна фраза, что это"}';
  try {
    const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ model: ust_('model') || 'claude-haiku-5-5', max_tokens: 300, system: sys, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: String(p.b64) } },
        { type: 'text', text: 'Пишет: ' + ja.id + '. Имя файла: ' + String(p.nazwa || '—') } ] }] })
    });
    if (r.getResponseCode() !== 200) return { kategoria: zNazwy, zrodlo: 'nazwa' };
    const t = (JSON.parse(r.getContentText()).content || []).map(c => c.text || '').join(''), m = t.match(/\{[\s\S]*\}/);
    const j = m ? JSON.parse(m[0]) : {};
    return { kategoria: kategoria_(j.kategoria)[0], tytul: String(j.tytul || '').slice(0, 80), wlasciciel: ludzie.some(o => o.id === j.wlasciciel) || j.wlasciciel === 'rodzina' ? j.wlasciciel : '',
      auto: auta.some(a => a.id === j.auto) ? j.auto : '', wazny_do: /^\d{4}-\d\d-\d\d$/.test(j.wazny_do || '') ? j.wazny_do : '', opis: String(j.opis || '').slice(0, 200), zrodlo: 'claude' };
  } catch (e) { return { kategoria: zNazwy, zrodlo: 'nazwa' }; }
}
function zgadnijKat_(t) {
  t = norm_(t);
  const reg = [['ubezp', /полис|страхов|polis|ubezpiecz|\boc\b|\bac\b|assistance/], ['auto', /авто|машин|техпасп|техосмотр|dowód rej|dowod rej|przegląd|przeglad|samoch|fiesta|mercedes/],
    ['med', /справк|направлен|анализ|рецепт|врач|больниц|skierowan|recept|wynik|lekarz|szpital|zaświadcz|zaswiadcz|badani/],
    ['szkola', /школ|техникум|оценк|szkoł|szkol|technikum|świadectw|swiadectw/], ['dom', /счет|счёт|аренд|квартир|rachun|faktur|najm|umowa najmu|prąd|prad|gaz|internet|bank/],
    ['rodzina', /паспорт|карта побыт|pesel|свидетел|диплом|paszport|karta pobytu|dowód osob|dowod osob|akt urodzenia|umowa o pracę/]];
  const z = reg.filter(r => r[1].test(t))[0];
  return z ? z[0] : 'inne';
}
function dokumentyDla_(ja) {
  const role = {}; wiersze_('Ludzie').forEach(o => role[o.id] = o.rola);
  return wiersze_('Dokumenty').filter(d => widziDok_(ja, d, role)).map(d => ({ id: String(d.id), tytul: d.tytul, kategoria: d.kategoria, wlasciciel: d.wlasciciel,
    auto: d.auto, widocznosc: d.widocznosc, mime: d.mime, nazwa_pliku: d.nazwa_pliku, rozmiar: Number(d.rozmiar) || 0, wazny_do: tekstDaty_(d.wazny_do).slice(0, 10),
    sos: Number(d.sos) ? 1 : 0, notatka: d.notatka, od: d.od, czas: tekstDaty_(d.czas) })).sort((a, b) => a.czas < b.czas ? 1 : -1);
}


// id z aplikacji (interfejs pokazuje zmianę od razu, serwer dogania) — jeśli poprawne i wolne
function idKlienta_(id, arkusz) {
  id = String(id || '');
  if (/^[a-z0-9]{6,16}$/.test(id) && !znajdz_(arkusz, id)) return id;
  return id_();
}

// ---------------------------------------------------------------- listy: widoczność i działy
function czyZakupy_(lista) { const l = wiersze_('Listy').filter(x => x.id === lista)[0]; return !!(l && Number(l.zakupy)); }

// co widzi osoba: listy „wszyscy” — każdy; „rodzice” — rodzice (+ dziecko swoje przypisane);
// „moje” (osobiste) — autor i wykonawca, a rodzice także osobiste dzieci
function widocznePozycje_(ja, zeZrobionymi) {
  const listy = {}; wiersze_('Listy').forEach(l => listy[l.id] = l);
  const role = {}; wiersze_('Ludzie').forEach(o => role[o.id] = o.rola);
  const wczoraj = Utilities.formatDate(plusDni_(-1), TZ, "yyyy-MM-dd'T'HH:mm");
  const wszystkie = wiersze_('Pozycje');
  const widziGlowna = o => {
    if (o.lista === 'moje') return o.od === ja.id || o.dla === ja.id || (ja.rola === 'rodzic' && (role[o.od] === 'dziecko' || role[o.dla] === 'dziecko'));
    const l = listy[o.lista]; if (!l) return false;
    if (l.widocznosc === 'rodzice') return ja.rola === 'rodzic' || o.dla === ja.id;
    return true;
  };
  const glowne = {};
  wszystkie.filter(o => !o.rodzic && widziGlowna(o)).forEach(o => glowne[o.id] = 1);
  return wszystkie.filter(o => glowne[o.id] || glowne[o.rodzic])
    .filter(o => zeZrobionymi || o.status !== 'zrobione' || String(o.czas_zrobione) >= wczoraj || o.rodzic);
}

const norm_ = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
function dzialDla_(nazwa) {
  const n = norm_(nazwa); if (!n) return 'inne';
  const nauczone = wiersze_('Dzialy').filter(o => o.nazwa === n)[0];
  if (nauczone) return String(nauczone.dzial);
  // wygrywa najdłuższy pasujący początek słowa („масло подсолнечное” → бакалея, „масло сливочное” → молочное)
  const slowa = n.split(/[^a-zа-яąćęłńóśźż0-9]+/i).filter(Boolean);
  let naj = 'inne', dl = 0;
  DZIALY.forEach(d => d[2].split(' ').filter(Boolean).forEach(r => {
    if (r.length > dl && slowa.some(s => s.indexOf(r) === 0)) { naj = d[0]; dl = r.length; }
  }));
  return naj;
}
function zapamietajDzial_(nazwa, dzial) {   // ręczna poprawka działu = nauka na przyszłość
  const n = norm_(nazwa); if (!n) return;
  const o = wiersze_('Dzialy').filter(x => x.nazwa === n)[0];
  if (o) zmien_('Dzialy', o, { dzial: dzial, czas: teraz_() }); else dodaj_('Dzialy', { nazwa: n, dzial: dzial, czas: teraz_() });
}

// ---------------------------------------------------------------- stan dla aplikacji
function stan_(ja) {
  const ludzie = wiersze_('Ludzie').map(o => ({ id: o.id, imie: o.imie, rola: o.rola }));
  const od = dzien_(), doD = dzien_(plusDni_(45));
  const wyd = wiersze_('Wydarzenia').map(o => ({ id: o.id, tytul: o.tytul, start: tekstDaty_(o.start), kto: String(o.kto || 'wszyscy'),
    miejsce: o.miejsce, przyp: o.przyp, autor: o.autor }))
    .filter(o => o.start.slice(0, 10) >= od && o.start.slice(0, 10) <= doD)
    .sort((a, b) => a.start < b.start ? -1 : 1);
  const wczoraj = Utilities.formatDate(plusDni_(-1), TZ, "yyyy-MM-dd'T'HH:mm");
  const zad = wiersze_('Zadania').filter(o => o.typ === 'kuchnia' && (o.status === 'nowe' || (o.status === 'zrobione' && String(o.czas_zrobione) >= wczoraj)))
    .filter(o => ja.rola === 'rodzic' || o.dla === ja.id || o.od === ja.id)
    .map(o => ({ id: o.id, tytul: o.tytul, dla: o.dla, od: o.od, termin: tekstDaty_(o.termin).slice(0, 10), typ: o.typ, status: o.status }));
  const poz = widocznePozycje_(ja, false).map(o => ({ id: String(o.id), lista: o.lista, tytul: o.tytul, rodzic: String(o.rodzic || ''), dla: o.dla, od: o.od,
    termin: tekstDaty_(o.termin).slice(0, 10), przyp: tekstDaty_(o.przyp), dzial: o.dzial, notatka: o.notatka, status: o.status,
    czas: tekstDaty_(o.czas), kolejnosc: Number(o.kolejnosc) || 0 }));
  const listy = wiersze_('Listy').filter(l => l.widocznosc !== 'rodzice' || ja.rola === 'rodzic' || poz.some(x => x.lista === l.id))
    .sort((a, b) => Number(a.kolejnosc) - Number(b.kolejnosc))
    .map(l => ({ id: l.id, nazwa: l.nazwa, ikona: l.ikona, zakupy: Number(l.zakupy) ? 1 : 0 }));
  const pw = wiersze_('Powiadomienia').filter(o => o.dla === ja.id).slice(-40).reverse()
    .map(o => ({ id: o.id, tekst: o.tekst, czas: tekstDaty_(o.czas), status: o.status, pilne: Number(o.pilne) ? 1 : 0 }));
  const seriaKto = ust_('kuchnia_dla');
  const ludzieAll = wiersze_('Ludzie');
  const auta = wiersze_('Auta').map(a => { const o = {}; ARKUSZE.Auta.forEach(k => o[k] = tekstDaty_(a[k])); o.polisa_do = o.polisa_do.slice(0, 10); return o; });
  return {
    wersja: WERSJA, rodzina: { nazwa: ust_('nazwa_rodziny') || 'Семья' },
    ja: { id: ja.id, imie: ja.imie, rola: ja.rola, push: !!ja.push, admin: czyAdmin_(ja) }, ludzie: ludzie,
    listy: listy, pozycje: poz, dzialy: DZIALY.map(d => [d[0], d[1]]),
    wydarzenia: wyd, zadania: zad, powiadomienia: pw,
    jade: listaKto_(ust_('kto_jedzie')).indexOf(ja.id) >= 0,
    seria: seriaKto ? seria_(seriaKto) : { dni: 0, zrobione: 0 }, seriaKto: seriaKto,
    serieCel: [Number(ust_('seria_tydzien')) || 7, Number(ust_('seria_miesiac')) || 30],
    szybko: !!PropertiesService.getScriptProperties().getProperty('CLAUDE_KEY'),
    moje: { nazwisko: String(ja.nazwisko || ''), telefon: String(ja.telefon || ''), adres: String(ja.adres || ''), prawo_jazdy: String(ja.prawo_jazdy || ''),
      cisza_od: String(ja.cisza_od || '22:00'), cisza_do: String(ja.cisza_do || '07:00') },
    telefony: ludzieAll.filter(o => o.telefon).map(o => ({ id: o.id, imie: o.imie, telefon: String(o.telefon) })),
    adresDomu: ust_('adres_domu'),
    dokumenty: dokumentyDla_(ja), kategorie: KATEGORIE.map(k => [k[0], k[1], k[3]]), auta: auta,
    ustRodziny: czyAdmin_(ja) ? { kto_jedzie: ust_('kto_jedzie'), kuchnia_dla: ust_('kuchnia_dla'), kuchnia_tekst: ust_('kuchnia_tekst'),
      podpowiedz_dla: ust_('podpowiedz_dla'), adres_domu: ust_('adres_domu'), nazwa_rodziny: ust_('nazwa_rodziny') } : null,
    dzis: dzien_(), teraz: teraz_()
  };
}

function listaKto_(s) {
  s = String(s || '').trim();
  if (!s) return [];
  if (s === 'wszyscy') return wiersze_('Ludzie').map(o => o.id);
  return s.split(',').map(x => x.trim()).filter(Boolean);
}
const DNI = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function ladnaData_(s) {
  s = String(s); const d = naDate_(s.length === 10 ? s + 'T00:00' : s);
  return DNI[Number(Utilities.formatDate(d, TZ, 'u')) % 7] + ' ' + Utilities.formatDate(d, TZ, 'dd.MM') + (s.length > 10 ? ', ' + s.slice(11, 16) : '');
}

// seria dziecka: dni z rzędu bez opuszczonej kuchni (od ostatniego opuszczenia)
function seria_(kto) {
  const zad = wiersze_('Zadania').filter(o => o.typ === 'kuchnia' && o.dla === kto);
  const przeg = zad.filter(o => o.status === 'przegapione').map(o => tekstDaty_(o.termin).slice(0, 10)).sort().pop();
  const zrob = zad.filter(o => o.status === 'zrobione');
  if (!zrob.length) return { dni: 0, zrobione: 0 };
  const start = przeg ? naDate_(przeg + 'T00:00') : naDate_(tekstDaty_(zrob.map(o => tekstDaty_(o.czas)).sort()[0]).slice(0, 10) + 'T00:00');
  const dni = Math.max(0, Math.floor((Date.now() - start.getTime()) / 864e5));
  return { dni: dni, zrobione: zrob.filter(o => !przeg || tekstDaty_(o.czas_zrobione).slice(0, 10) > przeg).length };
}

// ---------------------------------------------------------------- powiadomienia
// pilne=true → push od razu; reszta czeka na podsumowanie (w aplikacji widać od razu)
function powiadom_(komu, tekst, pilne) {
  const ludzie = wiersze_('Ludzie');
  komu.forEach(id => {
    const o = ludzie.filter(x => x.id === id)[0]; if (!o) return;
    let push = '';
    if (pilne) push = wyslijPush_(o, tekst) ? 'tak' : 'nie';
    dodaj_('Powiadomienia', { id: id_(), dla: id, tekst: tekst, czas: teraz_(), status: 'nowe', pilne: pilne ? 1 : 0, push: push });
  });
}

// osobista podpowiedź (tylko dla podpowiedz_dla), nie częściej niż raz dziennie; nigdy dla tego, kogo dotyczy
function podpowiedz_(tekst, oKim) {
  const kto = ust_('podpowiedz_dla'); if (!kto || kto === oKim) return;
  const pr = PropertiesService.getScriptProperties(), dz = dzien_();
  if (pr.getProperty('podpowiedz_' + kto) === dz) return;
  pr.setProperty('podpowiedz_' + kto, dz);
  powiadom_([kto], tekst, true);
}

function cisza_(o) {
  const g = godz_(), od = String(o.cisza_od || '22:00').slice(0, 5), doo = String(o.cisza_do || '07:00').slice(0, 5);
  return od > doo ? (g >= od || g < doo) : (g >= od && g < doo);
}

// ---------------------------------------------------------------- push (Firebase Cloud Messaging)
function wyslijPush_(o, tekst, tytul) {
  const pr = PropertiesService.getScriptProperties();
  if (!o.push || !pr.getProperty('FCM_PROJECT')) return false;
  try {
    const r = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + pr.getProperty('FCM_PROJECT') + '/messages:send', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + tokenFcm_() },
      payload: JSON.stringify({ message: { token: o.push,
        notification: { title: tytul || ust_('nazwa_rodziny') || 'Семья', body: String(tekst).slice(0, 400) },
        webpush: { fcm_options: { link: ust_('strona') || 'https://wasylmagic-commits.github.io/Rodzina/' } } } })
    });
    if (r.getResponseCode() === 404 || /UNREGISTERED/.test(r.getContentText())) { zmien_('Ludzie', o, { push: '' }); return false; }
    return r.getResponseCode() === 200;
  } catch (e) { return false; }
}

function tokenFcm_() {
  const c = CacheService.getScriptCache(), t = c.get('fcm_token');
  if (t) return t;
  const pr = PropertiesService.getScriptProperties();
  const b64 = x => Utilities.base64EncodeWebSafe(x).replace(/=+$/, '');
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64(JSON.stringify({ iss: pr.getProperty('FCM_EMAIL'), scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const key = String(pr.getProperty('FCM_KEY')).replace(/\\n/g, '\n');
  const sig = b64(Utilities.computeRsaSha256Signature(head + '.' + claim, key));
  const r = JSON.parse(UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig } }).getContentText());
  c.put('fcm_token', r.access_token, 3000);
  return r.access_token;
}

// ---------------------------------------------------------------- wyzwalacz co 15 minut
function co15_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    schemat_();
    przypomnienia_();
    przypomnieniaPozycji_();
    const pr = PropertiesService.getScriptProperties(), dz = dzien_(), g = godz_();
    if (g >= ust_('poranek') && g < '12:00' && pr.getProperty('poranek') !== dz) { pr.setProperty('poranek', dz); podsumowanie_('poranek'); }
    if (g >= ust_('wieczor') && g < '23:00' && pr.getProperty('wieczor') !== dz) { pr.setProperty('wieczor', dz); podsumowanie_('wieczor'); }
    if (g >= '23:30' && pr.getProperty('noc') !== dz) { pr.setProperty('noc', dz); noc_(); }
  } finally { lock.releaseLock(); }
}

// przypomnienia o wydarzeniach — przypięte do godziny, idą od razu (także w ciszy nocnej: godzinę wybrali sami)
function przypomnienia_() {
  const now = Date.now();
  wiersze_('Wydarzenia').forEach(o => {
    const min = Number(o.przyp); if (!min || o.przyp_wyslane) return;
    const t = naDate_(tekstDaty_(o.start)).getTime();
    if (now >= t - min * 6e4 && now < t + 30 * 6e4) {
      zmien_('Wydarzenia', o, { przyp_wyslane: teraz_() });
      powiadom_(listaKto_(o.kto), '⏰ ' + o.tytul + ' — ' + ladnaData_(tekstDaty_(o.start)) + (o.miejsce ? ', ' + o.miejsce : ''), true);
    }
  });
}

// przypomnienia o pozycjach z list (pole przyp = data i godzina)
function przypomnieniaPozycji_() {
  const now = Date.now();
  wiersze_('Pozycje').forEach(o => {
    const s = tekstDaty_(o.przyp);
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s) || o.przyp_wyslane || o.status === 'zrobione') return;
    const t = naDate_(s).getTime();
    if (now >= t && now < t + 6 * 36e5) {
      zmien_('Pozycje', o, { przyp_wyslane: teraz_() });
      const komu = o.dla ? [o.dla] : (o.lista === 'moje' ? [o.od] : rodzice_());
      powiadom_(komu, '⏰ ' + o.tytul, true);
    }
  });
}

// podsumowanie: jedna wiadomość na osobę
function podsumowanie_(kiedy) {
  const dz = dzien_(), jutro = dzien_(plusDni_(1)), niedziela = Utilities.formatDate(new Date(), TZ, 'u') === '7';
  const wyd = wiersze_('Wydarzenia').map(o => Object.assign(o, { s: tekstDaty_(o.start) }));
  const poz = wiersze_('Pozycje').filter(o => o.status !== 'zrobione' && !o.rodzic);
  const zakupyListy = wiersze_('Listy').filter(l => Number(l.zakupy)).map(l => l.id);
  const zak = poz.filter(o => zakupyListy.indexOf(o.lista) >= 0).length;
  wiersze_('Ludzie').forEach(c => {
    const moje = w => listaKto_(w.kto).indexOf(c.id) >= 0;
    const mojePoz = poz.filter(o => o.dla === c.id || (!o.dla && o.lista === 'moje' && o.od === c.id));
    const linie = [];
    if (kiedy === 'poranek') {
      const d = wyd.filter(w => w.s.slice(0, 10) === dz && moje(w));
      if (d.length) linie.push('Сегодня: ' + d.map(w => w.s.slice(11, 16) + ' ' + w.tytul).join('; '));
      const z = mojePoz.filter(o => tekstDaty_(o.termin).slice(0, 10) && tekstDaty_(o.termin).slice(0, 10) <= dz);
      if (z.length) linie.push('Дела на сегодня: ' + z.map(o => o.tytul).slice(0, 6).join('; '));
      if (zak) linie.push('В списке покупок: ' + zak);
      const kon = konczaceSie_(c);
      if (kon.length) linie.push('Документы: ' + kon.join('; '));
    } else {
      const zakres = niedziela ? 7 : 1;
      const d = wyd.filter(w => w.s.slice(0, 10) >= jutro && w.s.slice(0, 10) <= dzien_(plusDni_(zakres)) && moje(w));
      if (d.length) linie.push((niedziela ? 'План на неделю: ' : 'Завтра: ') + d.map(w => (niedziela ? ladnaData_(w.s) + ' ' : w.s.slice(11, 16) + ' ') + w.tytul).join('; '));
      const z = mojePoz.filter(o => tekstDaty_(o.termin).slice(0, 10) && tekstDaty_(o.termin).slice(0, 10) <= jutro);
      if (z.length) linie.push('Срок до завтра: ' + z.map(o => o.tytul).slice(0, 6).join('; '));
    }
    const nowe = wiersze_('Powiadomienia').filter(o => o.dla === c.id && o.status === 'nowe' && !Number(o.pilne)).length;
    if (nowe) linie.push('Новых сообщений в приложении: ' + nowe);
    if (!linie.length) return;
    const tekst = linie.join('\n');
    const push = wyslijPush_(c, tekst, kiedy === 'poranek' ? '☀️ Доброе утро, ' + c.imie : (niedziela ? '🗓 План на неделю' : '🌙 На завтра'));
    dodaj_('Powiadomienia', { id: id_(), dla: c.id, tekst: tekst, czas: teraz_(), status: 'nowe', pilne: 0, push: push ? 'tak' : 'nie' });
  });
}

// dokumenty i polisy aut, którym kończy się ważność: przypomnienie za 30, 14, 7, 3, 1 dzień i w dniu końca
function konczaceSie_(c) {
  const progi = [30, 14, 7, 3, 1, 0], dz = naDate_(dzien_() + 'T00:00').getTime(), out = [];
  const ile = s => Math.round((naDate_(s + 'T00:00').getTime() - dz) / 864e5);
  const tekst = (n, t) => t + (n === 0 ? ' — истекает сегодня' : ' — истекает через ' + n + ' дн.');
  wiersze_('Dokumenty').forEach(d => {
    const s = tekstDaty_(d.wazny_do).slice(0, 10); if (!/^\d{4}-\d\d-\d\d$/.test(s)) return;
    const n = ile(s); if (progi.indexOf(n) < 0) return;
    if (d.wlasciciel === c.id || (c.rola === 'rodzic' && widziDok_(c, d))) out.push(tekst(n, d.tytul));
  });
  if (c.rola === 'rodzic') wiersze_('Auta').forEach(a => {
    const s = tekstDaty_(a.polisa_do).slice(0, 10); if (!/^\d{4}-\d\d-\d\d$/.test(s)) return;
    const n = ile(s); if (progi.indexOf(n) >= 0) out.push(tekst(n, 'Полис ' + a.nazwa));
  });
  return out;
}

// w nocy: niezrobiona dzisiejsza kuchnia = opuszczenie (zeruje serię)
function noc_() {
  const dz = dzien_();
  wiersze_('Zadania').filter(o => o.typ === 'kuchnia' && o.status === 'nowe' && tekstDaty_(o.termin).slice(0, 10) <= dz)
    .forEach(o => zmien_('Zadania', o, { status: 'przegapione' }));
}

// ---------------------------------------------------------------- szybkie dodawanie przez Claude
function rozbierz_(ja, tekst) {
  const key = PropertiesService.getScriptProperties().getProperty('CLAUDE_KEY');
  if (!key) throw new Error('Быстрое добавление не настроено (нет CLAUDE_KEY)');
  if (!tekst.trim()) throw new Error('Пустой текст');
  const d = new Date(), ludzie = wiersze_('Ludzie').map(o => o.id + '=' + o.imie).join(', ');
  const listy = wiersze_('Listy').map(l => l.id + '=' + l.nazwa).concat(['moje=личные дела']).join(', ');
  const sys = 'Ты разбираешь короткие сообщения семьи для семейного органайзера. Сегодня ' +
    Utilities.formatDate(d, TZ, 'yyyy-MM-dd') + ' (' + DNI[Number(Utilities.formatDate(d, TZ, 'u')) % 7] + '), время ' + godz_(d) + ', часовой пояс Варшава. ' +
    'Пишет: ' + ja.id + '. Люди: ' + ludzie + '. Списки: ' + listy + '. Ответь ТОЛЬКО JSON без пояснений, один из вариантов:\n' +
    '{"typ":"wydarzenie","tytul":"...","start":"YYYY-MM-DDTHH:mm","kto":"id,id или wszyscy","miejsce":"","przyp":60}\n' +
    '{"typ":"pozycje","lista":"id списка","pozycje":["..."],"dla":"id или пусто","termin":"YYYY-MM-DD или пусто"}\n' +
    '{"typ":"niejasne","pytanie":"что уточнить"}\n' +
    'Правила: событие с конкретным временем (врач, экзамен, встреча) — wydarzenie; если время события не указано — niejasne. ' +
    'Что купить — pozycje в списке покупок, каждая вещь отдельно. Дело без времени — pozycje в подходящем списке (дом, авто, разное) или moje. ' +
    '«Следующий четверг» = ближайший четверг после сегодняшнего дня. ' +
    'kto — те, кого событие касается (если про ребёнка — ребёнок и пишущий). przyp: врач/важное 1440, обычное 60. ' +
    'Добавь поле "podsumowanie": короткая фраза по-русски для подтверждения, с днём недели и датой, например «Стоматолог Насти, чт 26.11, 16:00».';
  const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: ust_('model') || 'claude-haiku-5-5', max_tokens: 400, system: sys, messages: [{ role: 'user', content: tekst }] })
  });
  const j = JSON.parse(r.getContentText());
  if (r.getResponseCode() !== 200) throw new Error('Claude: ' + ((j.error && j.error.message) || r.getResponseCode()));
  const t = (j.content || []).map(c => c.text || '').join('');
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Не понял, попробуй иначе');
  return JSON.parse(m[0]);
}

// ---------------------------------------------------------------- wejścia dla Ładowarki (Ladowarka.gs)
globalThis.RODZINA_SILNIK = { obsluzZapytanie_: obsluzZapytanie_, co15_: co15_, instalacja_: instalacja_, linki_: linki_, WERSJA: WERSJA };
