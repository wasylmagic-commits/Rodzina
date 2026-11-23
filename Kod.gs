/* =====================================================================
 * СЕМЬЯ — сервер семейного приложения (Google Apps Script) — v0.1, 22.11.2026
 * Схема как у Serwis myjni: PWA на GitHub Pages + этот скрипт + таблица.
 *
 * Установка (один раз):
 *   1. Создать пустую Google-таблицу «Семья», Расширения → Apps Script.
 *   2. Вставить ВЕСЬ этот файл вместо пустого Code.gs, сохранить.
 *   3. Выбрать функцию «ustanovka» → Выполнить → разрешить доступ.
 *   4. Развернуть → Новое развертывание → Веб-приложение:
 *      «Выполнять от имени: меня», «Доступ: все» → скопировать ссылку /exec.
 *   5. Выбрать функцию «linki» → Выполнить: в журнале будут 3 личные ссылки.
 *
 * Ключи (Настройки проекта → Свойства скрипта), всё необязательно:
 *   CLAUDE_KEY   — ключ Anthropic API (быстрое добавление текстом)
 *   FCM_PROJECT, FCM_EMAIL, FCM_KEY — сервисный аккаунт Firebase (пуши)
 * ===================================================================== */

const TZ = 'Europe/Warsaw';
const VERSJA = '0.1';

const ARKUSZE = {
  Ludzie:        ['id', 'imie', 'rola', 'klucz', 'push', 'cisza_od', 'cisza_do'],
  Wydarzenia:    ['id', 'tytul', 'start', 'kto', 'miejsce', 'przyp', 'przyp_wyslane', 'autor', 'czas'],
  Zakupy:        ['id', 'nazwa', 'dodal', 'czas', 'kupione', 'kupil', 'czas_kupna'],
  Zadania:       ['id', 'tytul', 'dla', 'od', 'termin', 'typ', 'status', 'czas', 'czas_zrobione'],
  Powiadomienia: ['id', 'dla', 'tekst', 'czas', 'status', 'pilne', 'push'],
  Ustawienia:    ['klucz', 'wartosc', 'opis']
};

const USTAWIENIA_START = [
  ['kto_jedzie', 'irina', 'кто нажимает «Еду домой» (id через запятую)'],
  ['kuchnia_dla', 'nastya', 'кому приходит задание по кухне'],
  ['kuchnia_tekst', 'Подготовь кухню: помой посуду, протри стол, достань продукты для ужина', 'текст задания по кухне'],
  ['podpowiedz_dla', 'vasya', 'кто получает личные подсказки (не больше 1 в день)'],
  ['seria_tydzien', '7', 'дней без пропусков → выбор блюда на выходные'],
  ['seria_miesiac', '30', 'дней без пропусков → совместный шопинг'],
  ['poranek', '07:00', 'утренняя сводка'],
  ['wieczor', '20:00', 'вечерняя сводка (в воскресенье — план на неделю)'],
  ['model', 'claude-haiku-5-5', 'модель Claude для быстрого добавления']
];

// ---------------------------------------------------------------- установка
function ustanovka() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(ARKUSZE).forEach(n => {
    let sh = ss.getSheetByName(n);
    if (!sh) sh = ss.insertSheet(n);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, ARKUSZE[n].length).setValues([ARKUSZE[n]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    sh.getRange(1, 1, sh.getMaxRows(), ARKUSZE[n].length).setNumberFormat('@');   // всё как текст: даты не «переезжают» по часовому поясу
  });
  const lu = ss.getSheetByName('Ludzie');
  if (lu.getLastRow() < 2) {
    lu.getRange(2, 1, 3, 7).setValues([
      ['vasya', 'Вася', 'rodzic', klucz_(), '', '22:00', '07:00'],
      ['irina', 'Ирина', 'rodzic', klucz_(), '', '22:00', '07:00'],
      ['nastya', 'Настя', 'dziecko', klucz_(), '', '22:00', '07:00']
    ]);
  }
  const us = ss.getSheetByName('Ustawienia');
  const juz = us.getLastRow() > 1 ? us.getRange(2, 1, us.getLastRow() - 1, 1).getValues().map(r => r[0]) : [];
  USTAWIENIA_START.filter(r => juz.indexOf(r[0]) < 0).forEach(r => us.appendRow(r));
  const pusty = ss.getSheetByName('Лист1') || ss.getSheetByName('Sheet1') || ss.getSheetByName('Arkusz1');
  if (pusty && ss.getSheets().length > 1) ss.deleteSheet(pusty);
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'co15') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('co15').timeBased().everyMinutes(15).create();
  Logger.log('Готово. Теперь: Развернуть → Новое развертывание → Веб-приложение, потом запусти «linki».');
}

function linki() {
  const url = ScriptApp.getService().getUrl();
  const strona = PropertiesService.getScriptProperties().getProperty('STRONA') || 'https://wasylmagic-commits.github.io/rodzina/';
  if (!url) { Logger.log('Сначала разверни веб-приложение (шаг 4).'); return; }
  wiersze_('Ludzie').forEach(o => Logger.log(o.imie + ':  ' + strona + '#u=' + encodeURIComponent(url) + '&k=' + o.klucz));
}

function klucz_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 20); }

// ---------------------------------------------------------------- таблица
function ark_(n) { return SpreadsheetApp.getActive().getSheetByName(n); }
function wiersze_(n) {
  const sh = ark_(n), last = sh.getLastRow();
  if (last < 2) return [];
  const h = ARKUSZE[n], v = sh.getRange(2, 1, last - 1, h.length).getValues();
  return v.map((r, i) => { const o = { _w: i + 2 }; h.forEach((k, j) => o[k] = r[j]); return o; }).filter(o => o[h[0]] !== '');
}
function dodaj_(n, o) {
  const h = ARKUSZE[n];
  ark_(n).appendRow(h.map(k => o[k] === undefined ? '' : String(o[k])));
}
function zmien_(n, o, pola) {
  const h = ARKUSZE[n], sh = ark_(n);
  Object.keys(pola).forEach(k => { const j = h.indexOf(k); if (j >= 0) sh.getRange(o._w, j + 1).setValue(pola[k]); o[k] = pola[k]; });
}
function znajdz_(n, id) { return wiersze_(n).filter(o => String(o[ARKUSZE[n][0]]) === String(id))[0]; }
function ust_(k) { const o = wiersze_('Ustawienia').filter(x => x.klucz === k)[0]; return o ? String(o.wartosc) : ''; }
function id_() { return Utilities.getUuid().slice(0, 8); }
function teraz_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm"); }
function dzien_(d) { return Utilities.formatDate(d || new Date(), TZ, 'yyyy-MM-dd'); }
function godz_(d) { return Utilities.formatDate(d || new Date(), TZ, 'HH:mm'); }
function naDate_(s) { return Utilities.parseDate(String(s).slice(0, 16), TZ, "yyyy-MM-dd'T'HH:mm"); }
function tekstDaty_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm") : String(v || ''); }
function plusDni_(n) { return new Date(Date.now() + n * 864e5); }

// ---------------------------------------------------------------- веб-API
function doGet(e) {
  const p = e.parameter || {};
  let wynik;
  try {
    const ja = wiersze_('Ludzie').filter(o => o.klucz && o.klucz === p.k)[0];
    if (!ja) throw new Error('Неверный ключ');
    const f = API[p.api];
    if (!f) throw new Error('Неизвестное действие');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { wynik = { ok: true, wynik: f(ja, p) }; } finally { lock.releaseLock(); }
  } catch (err) {
    wynik = { ok: false, blad: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(wynik)).setMimeType(ContentService.MimeType.JSON);
}

const API = {
  start: (ja) => stan_(ja),

  wydarzenieDodaj: (ja, p) => {
    if (!p.tytul || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(p.start || '')) throw new Error('Нужно название, дата и время');
    dodaj_('Wydarzenia', { id: id_(), tytul: p.tytul, start: p.start, kto: p.kto || 'wszyscy', miejsce: p.miejsce || '',
      przyp: Number(p.przyp) || 0, przyp_wyslane: '', autor: ja.id, czas: teraz_() });
    const kto = listaKto_(p.kto).filter(x => x !== ja.id);
    if (kto.length) powiadom_(kto, '📅 ' + ja.imie + ' добавил(а): ' + p.tytul + ', ' + ladnaData_(p.start), false);
    return stan_(ja);
  },
  wydarzenieUsun: (ja, p) => {
    const o = znajdz_('Wydarzenia', p.id); if (!o) throw new Error('Не найдено');
    ark_('Wydarzenia').deleteRow(o._w);
    return stan_(ja);
  },

  zakupDodaj: (ja, p) => {
    String(p.nazwa || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean).forEach(n =>
      dodaj_('Zakupy', { id: id_(), nazwa: n, dodal: ja.id, czas: teraz_(), kupione: 0 }));
    return stan_(ja);
  },
  zakupKlik: (ja, p) => {
    const o = znajdz_('Zakupy', p.id); if (!o) throw new Error('Не найдено');
    zmien_('Zakupy', o, Number(o.kupione) ? { kupione: 0, kupil: '', czas_kupna: '' } : { kupione: 1, kupil: ja.id, czas_kupna: teraz_() });
    return stan_(ja);
  },
  zakupyWyczysc: (ja) => {
    const sh = ark_('Zakupy');
    wiersze_('Zakupy').filter(o => Number(o.kupione)).map(o => o._w).sort((a, b) => b - a).forEach(w => sh.deleteRow(w));
    return stan_(ja);
  },

  zadanieDodaj: (ja, p) => {
    if (!p.tytul) throw new Error('Нужно название');
    const dla = p.dla || ja.id;
    dodaj_('Zadania', { id: id_(), tytul: p.tytul, dla: dla, od: ja.id, termin: p.termin || '', typ: 'zwykle', status: 'nowe', czas: teraz_() });
    if (dla !== ja.id) powiadom_([dla], '✅ Задача от ' + ja.imie + ': ' + p.tytul + (p.termin ? ' (до ' + ladnaData_(p.termin) + ')' : ''), false);
    return stan_(ja);
  },
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
  zadanieUsun: (ja, p) => {
    const o = znajdz_('Zadania', p.id); if (!o) throw new Error('Не найдено');
    if (o.od !== ja.id && ja.rola !== 'rodzic') throw new Error('Удалить может тот, кто поставил');
    ark_('Zadania').deleteRow(o._w);
    return stan_(ja);
  },

  // «Еду домой»: задание по кухне ребёнку (срочно), подсказка Васе (раз в день, Ирина её не видит)
  jadeDomu: (ja, p) => {
    if (listaKto_(ust_('kto_jedzie')).indexOf(ja.id) < 0) throw new Error('Эта кнопка не для тебя');
    const min = Number(p.min) || 0, kiedy = min ? ' Будет дома примерно через ' + min + ' мин.' : '';
    const dla = ust_('kuchnia_dla') || 'nastya';
    const otwarte = wiersze_('Zadania').filter(o => o.typ === 'kuchnia' && o.status === 'nowe' && o.dla === dla)[0];
    if (!otwarte) dodaj_('Zadania', { id: id_(), tytul: ust_('kuchnia_tekst'), dla: dla, od: ja.id, termin: dzien_(), typ: 'kuchnia', status: 'nowe', czas: teraz_() });
    powiadom_([dla], '🚗 ' + ja.imie + ' едет домой.' + kiedy + ' ' + ust_('kuchnia_tekst'), true);
    const rodzice = wiersze_('Ludzie').filter(o => o.rola === 'rodzic' && o.id !== ja.id).map(o => o.id);
    if (rodzice.length) powiadom_(rodzice, '🚗 ' + ja.imie + ' едет домой.' + kiedy, true);
    podpowiedz_('💬 Хороший момент написать Ирине пару тёплых слов — она едет домой после смены.');
    return stan_(ja);
  },

  pwCzytaj: (ja, p) => {
    const ids = String(p.ids || '').split(',');
    wiersze_('Powiadomienia').filter(o => o.dla === ja.id && o.status === 'nowe' && (p.ids === 'wszystkie' || ids.indexOf(String(o.id)) >= 0))
      .forEach(o => zmien_('Powiadomienia', o, { status: 'przeczytane' }));
    return stan_(ja);
  },

  pushToken: (ja, p) => { zmien_('Ludzie', ja, { push: p.t || '' }); return { ok: 1 }; },

  // быстрое добавление текстом: Claude разбирает, ничего не сохраняет — приложение спрашивает «верно?»
  szybko: (ja, p) => rozbierz_(ja, String(p.tekst || '').slice(0, 500))
};

// ---------------------------------------------------------------- состояние для приложения
function stan_(ja) {
  const ludzie = wiersze_('Ludzie').map(o => ({ id: o.id, imie: o.imie, rola: o.rola }));
  const od = dzien_(), doD = dzien_(plusDni_(45));
  const wyd = wiersze_('Wydarzenia').map(o => ({ id: o.id, tytul: o.tytul, start: tekstDaty_(o.start), kto: String(o.kto || 'wszyscy'),
    miejsce: o.miejsce, przyp: o.przyp, autor: o.autor }))
    .filter(o => o.start.slice(0, 10) >= od && o.start.slice(0, 10) <= doD)
    .sort((a, b) => a.start < b.start ? -1 : 1);
  const wczoraj = Utilities.formatDate(plusDni_(-1), TZ, "yyyy-MM-dd'T'HH:mm");
  const zak = wiersze_('Zakupy').filter(o => !Number(o.kupione) || String(o.czas_kupna) >= wczoraj)
    .map(o => ({ id: o.id, nazwa: o.nazwa, dodal: o.dodal, kupione: Number(o.kupione) ? 1 : 0, kupil: o.kupil }));
  const zad = wiersze_('Zadania').filter(o => o.status === 'nowe' || (o.status === 'zrobione' && String(o.czas_zrobione) >= wczoraj))
    .filter(o => ja.rola === 'rodzic' || o.dla === ja.id || o.od === ja.id)
    .map(o => ({ id: o.id, tytul: o.tytul, dla: o.dla, od: o.od, termin: tekstDaty_(o.termin).slice(0, 10), typ: o.typ, status: o.status }));
  const pw = wiersze_('Powiadomienia').filter(o => o.dla === ja.id).slice(-40).reverse()
    .map(o => ({ id: o.id, tekst: o.tekst, czas: tekstDaty_(o.czas), status: o.status, pilne: Number(o.pilne) ? 1 : 0 }));
  return {
    wersja: VERSJA, ja: { id: ja.id, imie: ja.imie, rola: ja.rola, push: !!ja.push }, ludzie: ludzie,
    wydarzenia: wyd, zakupy: zak, zadania: zad, powiadomienia: pw,
    jade: listaKto_(ust_('kto_jedzie')).indexOf(ja.id) >= 0,
    seria: seria_(ust_('kuchnia_dla') || 'nastya'), serieCel: [Number(ust_('seria_tydzien')) || 7, Number(ust_('seria_miesiac')) || 30],
    szybko: !!PropertiesService.getScriptProperties().getProperty('CLAUDE_KEY'),
    dzis: dzien_()
  };
}

function listaKto_(s) {
  s = String(s || 'wszyscy');
  if (s === 'wszyscy') return wiersze_('Ludzie').map(o => o.id);
  return s.split(',').map(x => x.trim()).filter(Boolean);
}
const DNI = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function ladnaData_(s) {
  s = String(s); const d = naDate_(s.length === 10 ? s + 'T00:00' : s);
  return DNI[Number(Utilities.formatDate(d, TZ, 'u')) % 7] + ' ' + Utilities.formatDate(d, TZ, 'dd.MM') + (s.length > 10 ? ', ' + s.slice(11, 16) : '');
}

// серия Насти: дни подряд без пропущенной кухни (считаем от последнего пропуска)
function seria_(kto) {
  const zad = wiersze_('Zadania').filter(o => o.typ === 'kuchnia' && o.dla === kto);
  const przeg = zad.filter(o => o.status === 'przegapione').map(o => tekstDaty_(o.termin).slice(0, 10)).sort().pop();
  const zrob = zad.filter(o => o.status === 'zrobione');
  if (!zrob.length) return { dni: 0, zrobione: 0 };
  const pierwsza = zrob.map(o => tekstDaty_(o.czas).slice(0, 10)).sort()[0];
  const startS = przeg ? przeg : pierwsza;
  const dni = Math.max(0, Math.round((naDate_(dzien_() + 'T12:00') - naDate_(startS + 'T12:00')) / 864e5) + (przeg ? 0 : 1));
  return { dni: dni, zrobione: zrob.filter(o => !przeg || tekstDaty_(o.czas).slice(0, 10) > przeg).length };
}

// ---------------------------------------------------------------- уведомления
// pilne=true → пуш сразу; остальное ждёт сводки (видно в приложении сразу)
function powiadom_(komu, tekst, pilne) {
  const ludzie = wiersze_('Ludzie');
  komu.forEach(id => {
    const o = ludzie.filter(x => x.id === id)[0]; if (!o) return;
    let push = '';
    if (pilne) push = wyslijPush_(o, tekst) ? 'tak' : 'nie';
    dodaj_('Powiadomienia', { id: id_(), dla: id, tekst: tekst, czas: teraz_(), status: 'nowe', pilne: pilne ? 1 : 0, push: push });
  });
}

// личная подсказка (только тому, кто в podpowiedz_dla), не больше одной в день
function podpowiedz_(tekst) {
  const kto = ust_('podpowiedz_dla'); if (!kto) return;
  const pr = PropertiesService.getScriptProperties(), dz = dzien_();
  if (pr.getProperty('podpowiedz_' + kto) === dz) return;
  pr.setProperty('podpowiedz_' + kto, dz);
  powiadom_([kto], tekst, true);
}

function cisza_(o) {
  const g = godz_(), od = String(o.cisza_od || '22:00').slice(0, 5), doo = String(o.cisza_do || '07:00').slice(0, 5);
  return od > doo ? (g >= od || g < doo) : (g >= od && g < doo);
}

// ---------------------------------------------------------------- пуши (Firebase Cloud Messaging)
function wyslijPush_(o, tekst, tytul) {
  const pr = PropertiesService.getScriptProperties();
  if (!o.push || !pr.getProperty('FCM_PROJECT')) return false;
  try {
    const r = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + pr.getProperty('FCM_PROJECT') + '/messages:send', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + tokenFcm_() },
      payload: JSON.stringify({ message: { token: o.push,
        notification: { title: tytul || 'Семья', body: String(tekst).slice(0, 400) },
        webpush: { fcm_options: { link: pr.getProperty('STRONA') || 'https://wasylmagic-commits.github.io/rodzina/' } } } })
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

// ---------------------------------------------------------------- таймер каждые 15 минут
function co15() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    przypomnienia_();
    const pr = PropertiesService.getScriptProperties(), dz = dzien_(), g = godz_();
    if (g >= ust_('poranek') && g < '12:00' && pr.getProperty('poranek') !== dz) { pr.setProperty('poranek', dz); sowdka_('poranek'); }
    if (g >= ust_('wieczor') && g < '23:00' && pr.getProperty('wieczor') !== dz) { pr.setProperty('wieczor', dz); sowdka_('wieczor'); }
    if (g >= '23:30' && pr.getProperty('noc') !== dz) { pr.setProperty('noc', dz); noc_(); }
  } finally { lock.releaseLock(); }
}

// напоминания о событиях — привязаны ко времени, идут сразу (даже в тихие часы: время выбрали сами)
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

// сводка: одно сообщение на человека
function sowdka_(kiedy) {
  const dz = dzien_(), jutro = dzien_(plusDni_(1)), niedziela = Utilities.formatDate(new Date(), TZ, 'u') === '7';
  const wyd = wiersze_('Wydarzenia').map(o => Object.assign(o, { s: tekstDaty_(o.start) }));
  const zad = wiersze_('Zadania').filter(o => o.status === 'nowe');
  const zak = wiersze_('Zakupy').filter(o => !Number(o.kupione)).length;
  wiersze_('Ludzie').forEach(c => {
    const moje = w => listaKto_(w.kto).indexOf(c.id) >= 0;
    const linie = [];
    if (kiedy === 'poranek') {
      const d = wyd.filter(w => w.s.slice(0, 10) === dz && moje(w));
      if (d.length) linie.push('Сегодня: ' + d.map(w => w.s.slice(11, 16) + ' ' + w.tytul).join('; '));
      const z = zad.filter(o => o.dla === c.id);
      if (z.length) linie.push('Задачи: ' + z.map(o => o.tytul).slice(0, 5).join('; '));
      if (zak) linie.push('В списке покупок: ' + zak);
    } else {
      const zakres = niedziela ? 7 : 1;
      const d = wyd.filter(w => w.s.slice(0, 10) >= jutro && w.s.slice(0, 10) <= dzien_(plusDni_(zakres)) && moje(w));
      if (d.length) linie.push((niedziela ? 'План на неделю: ' : 'Завтра: ') + d.map(w => (niedziela ? ladnaData_(w.s) + ' ' : w.s.slice(11, 16) + ' ') + w.tytul).join('; '));
      const z = zad.filter(o => o.dla === c.id && tekstDaty_(o.termin).slice(0, 10) && tekstDaty_(o.termin).slice(0, 10) <= jutro);
      if (z.length) linie.push('Срок до завтра: ' + z.map(o => o.tytul).join('; '));
    }
    const nowe = wiersze_('Powiadomienia').filter(o => o.dla === c.id && o.status === 'nowe' && !Number(o.pilne)).length;
    if (nowe) linie.push('Новых сообщений в приложении: ' + nowe);
    if (!linie.length) return;
    const tekst = linie.join('\n');
    const push = wyslijPush_(c, tekst, kiedy === 'poranek' ? '☀️ Доброе утро, ' + c.imie : (niedziela ? '🗓 План на неделю' : '🌙 На завтра'));
    dodaj_('Powiadomienia', { id: id_(), dla: c.id, tekst: tekst, czas: teraz_(), status: 'nowe', pilne: 0, push: push ? 'tak' : 'nie' });
  });
}

// ночью: несделанная кухня за сегодня = пропуск (обнуляет серию)
function noc_() {
  const dz = dzien_();
  wiersze_('Zadania').filter(o => o.typ === 'kuchnia' && o.status === 'nowe' && tekstDaty_(o.termin).slice(0, 10) <= dz)
    .forEach(o => zmien_('Zadania', o, { status: 'przegapione' }));
}

// ---------------------------------------------------------------- быстрое добавление через Claude
function rozbierz_(ja, tekst) {
  const key = PropertiesService.getScriptProperties().getProperty('CLAUDE_KEY');
  if (!key) throw new Error('Быстрое добавление не настроено (нет CLAUDE_KEY)');
  if (!tekst.trim()) throw new Error('Пустой текст');
  const d = new Date(), ludzie = wiersze_('Ludzie').map(o => o.id + '=' + o.imie).join(', ');
  const sys = 'Ты разбираешь короткие сообщения семьи для семейного органайзера. Сегодня ' +
    Utilities.formatDate(d, TZ, 'yyyy-MM-dd') + ' (' + DNI[Number(Utilities.formatDate(d, TZ, 'u')) % 7] + '), время ' + godz_(d) + ', часовой пояс Варшава. ' +
    'Пишет: ' + ja.id + '. Люди: ' + ludzie + '. Ответь ТОЛЬКО JSON без пояснений, один из вариантов:\n' +
    '{"typ":"wydarzenie","tytul":"...","start":"YYYY-MM-DDTHH:mm","kto":"id,id или wszyscy","miejsce":"","przyp":60}\n' +
    '{"typ":"zakupy","pozycje":["..."]}\n' +
    '{"typ":"zadanie","tytul":"...","dla":"id","termin":"YYYY-MM-DD или пусто"}\n' +
    '{"typ":"niejasne","pytanie":"что уточнить"}\n' +
    'Правила: если время события не указано — niejasne. «Следующий четверг» = ближайший четверг после сегодняшнего дня. ' +
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
