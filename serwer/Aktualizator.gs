/**
 * Aktualizator.gs (Rodzina) — samoaktualizacja łatkami z Drive, sterowana z aplikacji. 23.11.2026
 * Ten sam format łatek co w Serwis myjni:
 *   { "id": "2026-11-23_cos", "opis": "co zmienia (aplikacja pokaże przed Tak/Nie)",
 *     "pliki":   [ { "nazwa": "Kod.gs", "zrodlo": "…cały plik…" } ],      // nowy plik albo zamiana całego
 *     "zamiany": [ { "plik": "Kod.gs", "stare": "…", "nowe": "…" } ],    // „stare” musi wystąpić DOKŁADNIE 1 raz
 *     "usun":    [ "Stary.gs" ] }
 * Łatki leżą w folderze Rodzina_Aktualizacje (obok arkusza), zastosowane idą do Zastosowane, kopie do Kopie.
 * Aplikacja (Ещё → Обновление системы): aktSprawdz → opis + Tak/Nie → aktWykonaj; „Откатить” → aktCofnij.
 * Pierwsze włączenie (raz, przez właściciela arkusza): link …/dev?ustaw=1 albo funkcja aktualizatorUstaw w edytorze.
 * Wymaga zakresów script.projects + script.deployments (appsscript.json).
 */

const AKT_API = 'https://script.googleapis.com/v1/projects/';
const AKT_FOLDER_NAZWA = 'Rodzina_Aktualizacje';
const AKT_KOPII_ILE = 10;
const AKT_WERSJI_LIMIT = 200;

const P_ = () => PropertiesService.getScriptProperties();

/* ===================== Apps Script API ===================== */

function aktApi_(metoda, sciezka, body) {
  const opt = { method: metoda, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  const r = UrlFetchApp.fetch(AKT_API + ScriptApp.getScriptId() + sciezka, opt);
  const c = r.getResponseCode();
  if (c < 200 || c >= 300) throw new Error('Apps Script API ' + metoda.toUpperCase() + ' ' + sciezka.split('?')[0] + ' → ' + c + ': ' + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText() || '{}');
}
function aktPliki_() { return (aktApi_('get', '/content').files || []).map(f => ({ name: f.name, type: f.type, source: f.source || '' })); }
function aktZapiszPliki_(pliki) { aktApi_('put', '/content', { files: pliki.map(f => ({ name: f.name, type: f.type, source: f.source })) }); }

function aktWszystkieWdrozenia_() {
  let lista = [], tok = '';
  do {
    const r = aktApi_('get', '/deployments?pageSize=50' + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''));
    lista = lista.concat(r.deployments || []); tok = r.nextPageToken;
  } while (tok);
  return lista;
}
const aktUrlWeb_ = d => ((d.entryPoints || []).filter(e => e.entryPointType === 'WEB_APP')[0] || { webApp: {} }).webApp.url || '';

// wdrożenie aplikacji webowej (to, którego …/exec mają ludzie). Zapamiętane w DEPLOYMENT_ID.
function aktWdrozenie_() {
  const lista = aktWszystkieWdrozenia_();
  const id = P_().getProperty('DEPLOYMENT_ID');
  let d = id && lista.filter(x => x.deploymentId === id)[0];
  if (!d) {
    const web = lista.filter(x => x.deploymentConfig && x.deploymentConfig.versionNumber && /\/exec$/.test(aktUrlWeb_(x)))
      .sort((a, b) => String(b.updateTime).localeCompare(String(a.updateTime)));
    if (!web.length) throw new Error('нет развёртывания веб-приложения (…/exec)');
    d = web[0];
    P_().setProperty('DEPLOYMENT_ID', d.deploymentId);
  }
  const url = aktUrlWeb_(d);
  if (url) P_().setProperty('WEBAPP_URL', url);
  return d;
}

// nowa wersja + przepięcie TEGO SAMEGO wdrożenia → linki rodziny bez zmian
function aktWdroz_(opis) {
  const d = aktWdrozenie_();
  const v = aktApi_('post', '/versions', { description: String(opis).slice(0, 200) }).versionNumber;
  aktApi_('put', '/deployments/' + d.deploymentId, { deploymentConfig: {
    scriptId: ScriptApp.getScriptId(), versionNumber: v, manifestFileName: 'appsscript', description: String(opis).slice(0, 100) } });
  return v;
}

function aktIleWersji_() {
  let n = 0, tok = '';
  do {
    const r = aktApi_('get', '/versions?pageSize=50' + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''));
    n += (r.versions || []).length; tok = r.nextPageToken;
  } while (tok);
  return n;
}

/* ===================== foldery ===================== */

function aktFolder_() {
  const id = P_().getProperty('AKT_FOLDER');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const plik = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  const it = plik.getParents(), rodzic = it.hasNext() ? it.next() : DriveApp.getRootFolder();
  const jest = rodzic.getFoldersByName(AKT_FOLDER_NAZWA);
  const f = jest.hasNext() ? jest.next() : rodzic.createFolder(AKT_FOLDER_NAZWA);
  P_().setProperty('AKT_FOLDER', f.getId());
  return f;
}
function aktPodfolder_(nazwa) { const f = aktFolder_(), it = f.getFoldersByName(nazwa); return it.hasNext() ? it.next() : f.createFolder(nazwa); }

/* ===================== łatka ===================== */

function aktTyp_(nazwa) { return /\.html$/i.test(nazwa) ? 'HTML' : /\.json$/i.test(nazwa) ? 'JSON' : 'SERVER_JS'; }
function aktIndeks_(pliki, nazwa) {
  nazwa = String(nazwa || '').trim();
  const i = pliki.findIndex(f => f.name === nazwa);
  if (i >= 0) return i;
  const bez = nazwa.replace(/\.(gs|js|html|json)$/i, '');
  return pliki.findIndex(f => f.name === bez && f.type === aktTyp_(nazwa));
}
function aktMoznaSprawdzic_() { try { new Function('return 1'); return true; } catch (e) { return false; } }

// stosuje łatkę na kopii plików; niczego nie zapisuje
function aktZastosuj_(patch, pliki) {
  const out = pliki.map(f => ({ name: f.name, type: f.type, source: f.source }));
  const bledy = [], zmiany = [];
  (patch.pliki || []).forEach(p => {
    const n = String(p.nazwa || '');
    if (!/\.(gs|html|json)$/i.test(n)) { bledy.push('файл «' + n + '»: нет расширения .gs / .html / .json'); return; }
    const i = aktIndeks_(out, n), src = String(p.zrodlo || '');
    if (!src.trim()) { bledy.push('файл «' + n + '»: пустой'); return; }
    if (i >= 0) { out[i].source = src; zmiany.push('♻️ ' + n + ' — весь файл'); }
    else { out.push({ name: n.replace(/\.(gs|html|json)$/i, ''), type: aktTyp_(n), source: src }); zmiany.push('🆕 ' + n + ' — новый файл'); }
  });
  (patch.zamiany || []).forEach((z, k) => {
    const nr = k + 1, i = aktIndeks_(out, z.plik);
    if (i < 0) { bledy.push('замена ' + nr + ': нет файла ' + z.plik); return; }
    const stare = String(z.stare || ''), ile = stare ? out[i].source.split(stare).length - 1 : 0;
    if (ile !== 1) { bledy.push('замена ' + nr + ' (' + z.plik + '): фрагмент найден ' + ile + ' раз — «' + stare.slice(0, 60) + '…»'); return; }
    out[i].source = out[i].source.replace(stare, () => String(z.nowe || ''));
    zmiany.push('✏️ ' + z.plik + ' — замена ' + nr);
  });
  (patch.usun || []).forEach(n => {
    const i = aktIndeks_(out, n);
    if (i < 0) { bledy.push('удалить: нет файла ' + n); return; }
    out.splice(i, 1); zmiany.push('🗑 ' + n);
  });
  if (!out.some(f => f.name === 'Aktualizator' && f.type === 'SERVER_JS')) bledy.push('обновление удаляет Aktualizator — нельзя');
  if (!out.some(f => f.name === 'appsscript' && f.type === 'JSON')) bledy.push('нет appsscript.json');
  const skladnia = aktMoznaSprawdzic_();
  out.forEach(f => {
    if (f.type === 'SERVER_JS' && skladnia) { try { new Function(f.source); } catch (e) { bledy.push('ошибка синтаксиса в ' + f.name + '.gs: ' + e.message); } }
    if (f.type === 'JSON') { try { JSON.parse(f.source); } catch (e) { bledy.push('плохой JSON в ' + f.name + '.json: ' + e.message); } }
  });
  return { pliki: out, bledy: bledy, zmiany: zmiany };
}

function aktCzytaj_(plik) {
  const t = plik.getBlob().getDataAsString('UTF-8');   // tylko pliki .json (bez Google Docs — mniej uprawnień)
  const p = JSON.parse(t.replace(/^\uFEFF/, ''));
  p.id = String(p.id || plik.getName().replace(/\.json$/i, ''));
  return p;
}
function aktIds_() { try { return JSON.parse(P_().getProperty('AKT_ZASTOSOWANE') || '[]'); } catch (e) { return []; } }
function aktKopieLista_() { try { return JSON.parse(P_().getProperty('AKT_KOPIE') || '[]'); } catch (e) { return []; } }

function aktPlikiLatek_() {
  const out = [], it = aktFolder_().getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.isTrashed()) continue;
    if (/\.json$/i.test(f.getName())) out.push(f);
  }
  return out.sort((a, b) => a.getName().localeCompare(b.getName()));
}
function aktOdloz_(plik) { try { plik.moveTo(aktPodfolder_('Zastosowane')); } catch (e) { console.error('aktOdloz_', e); } }

function aktNastepna_() {
  const ids = aktIds_(), lista = aktPlikiLatek_();
  for (let i = 0; i < lista.length; i++) {
    let p;
    try { p = aktCzytaj_(lista[i]); } catch (e) { throw new Error('не могу прочитать «' + lista[i].getName() + '»: ' + e.message); }
    if (ids.indexOf(p.id) >= 0) { aktOdloz_(lista[i]); continue; }
    return { plik: lista[i], patch: p, reszta: lista.length - i - 1 };
  }
  return null;
}

/* ===================== kopia / zapis / cofnięcie ===================== */

function aktKopia_(pliki, patchId) {
  const nazwa = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd_HHmm') + '_przed_' + String(patchId).replace(/[^\w.-]+/g, '-') + '.json';
  const f = aktPodfolder_('Kopie').createFile(nazwa, JSON.stringify({ patch: patchId, t: new Date().toISOString(), files: pliki }), 'application/json');
  const lista = aktKopieLista_();
  lista.push({ id: f.getId(), patch: patchId, t: Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm') });
  while (lista.length > AKT_KOPII_ILE) { const s = lista.shift(); try { DriveApp.getFileById(s.id).setTrashed(true); } catch (e) {} }
  P_().setProperty('AKT_KOPIE', JSON.stringify(lista));
}

function aktLog_(co, opis) { console.log('Aktualizator: ' + co + '\n' + String(opis || '').slice(0, 1500)); }

// dla aplikacji: co czeka w kolejce
function aktSprawdz_() {
  const n = aktNastepna_();
  if (!n) return { brak: true, wersja: WERSJA };
  const w = aktZastosuj_(n.patch, aktPliki_());
  let uwaga = '';
  try { const ile = aktIleWersji_(); if (ile >= AKT_WERSJI_LIMIT - 20) uwaga = 'Версий проекта уже ' + ile + ' из ' + AKT_WERSJI_LIMIT + '.'; } catch (e) {}
  return { plik: n.plik.getId(), id: n.patch.id, opis: n.patch.opis || '', zmiany: w.zmiany, bledy: w.bledy, reszta: n.reszta, uwaga: uwaga, wersja: WERSJA };
}

function aktWykonaj_(fileId) {
  if (!fileId) throw new Error('не указано обновление');
  const plik = DriveApp.getFileById(fileId), patch = aktCzytaj_(plik);
  if (aktIds_().indexOf(patch.id) >= 0) return 'ℹ️ Обновление ' + patch.id + ' уже установлено.';
  const teraz = aktPliki_(), w = aktZastosuj_(patch, teraz);
  if (w.bledy.length) throw new Error('обновление не подходит к коду, ничего не менял:\n• ' + w.bledy.join('\n• '));
  aktKopia_(teraz, patch.id);
  aktZapiszPliki_(w.pliki);
  let v;
  try { v = aktWdroz_('Łatka ' + patch.id); }
  catch (e) { aktZapiszPliki_(teraz); throw new Error('не удалось переключить приложение, вернул прежний код: ' + e.message); }
  const ids = aktIds_(); ids.push(patch.id);
  P_().setProperty('AKT_ZASTOSOWANE', JSON.stringify(ids.slice(-200)));
  aktOdloz_(plik);
  aktLog_('OK ' + patch.id + ' (wersja ' + v + ')', patch.opis + '\n' + w.zmiany.join('\n'));
  return '✅ Обновление ' + patch.id + ' установлено (версия ' + v + ').\n' + w.zmiany.join('\n');
}

function aktCofnijInfo_() {
  const k = aktKopieLista_().slice(-1)[0];
  return k ? { kopia: k.id, patch: k.patch, t: k.t } : { brak: true };
}

function aktCofnij_(kopiaId) {
  const lista = aktKopieLista_(), k = lista[lista.length - 1];
  if (!k) return 'Нечего откатывать';
  if (kopiaId && k.id !== kopiaId) return 'ℹ️ Этот откат уже сделан.';
  const dane = JSON.parse(DriveApp.getFileById(k.id).getBlob().getDataAsString('UTF-8'));
  aktZapiszPliki_(dane.files);
  const v = aktWdroz_('Cofnięcie ' + k.patch);
  lista.pop();
  P_().setProperty('AKT_KOPIE', JSON.stringify(lista));
  P_().setProperty('AKT_ZASTOSOWANE', JSON.stringify(aktIds_().filter(x => x !== k.patch)));
  aktLog_('COFNIĘTO ' + k.patch + ' (wersja ' + v + ')', 'kopia z ' + k.t);
  return '↩️ Откатил ' + k.patch + ' — код как ' + k.t + ' (версия ' + v + ').';
}

/* ===================== pierwsze włączenie ===================== */

// Uruchamia WŁAŚCICIEL arkusza: link …/dev?ustaw=1 (po „Zezwól”) albo z edytora.
function aktualizatorUstaw() { const t = aktualizatorUstaw_(); console.log(t); return t; }

function aktualizatorUstaw_() {
  const wlasciciel = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getOwner().getEmail();
  const ja = Session.getEffectiveUser().getEmail();
  if (ja && wlasciciel && ja.toLowerCase() !== wlasciciel.toLowerCase())
    throw new Error('Открой под аккаунтом ' + wlasciciel + ' (сейчас ' + ja + '). Иначе приложение начнёт работать от чужого имени.');
  const raport = [];
  schemat_(true);
  raport.push('Таблица: листы и настройки на месте (схема ' + SCHEMAT + ').');
  const f = aktFolder_(); aktPodfolder_('Zastosowane'); aktPodfolder_('Kopie');
  raport.push('Папка обновлений: ' + f.getName());
  const kto = ust_('akt_edytor');
  if (kto) { try { f.addEditor(kto); raport.push('Доступ к папке: ' + kto); } catch (e) { raport.push('⚠️ Не дал доступ ' + kto + ': ' + e.message); } }
  const d = aktWdrozenie_();
  const v = aktWdroz_('Rodzina ' + WERSJA + ' — Aktualizator');
  raport.push('Приложение переключено на новый код, версия ' + v + ' (ссылки семьи прежние).');
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'co15')) {
    ScriptApp.newTrigger('co15').timeBased().everyMinutes(15).create();
    raport.push('Таймер co15 создан.');
  }
  P_().setProperty('AKT_ZAINSTALOWANY', teraz_());
  aktLog_('INSTALACJA (wersja ' + v + ')', raport.join('\n'));
  return raport.join('\n');
}

function stronaUstaw_() {
  let tekst, ok = true;
  try { tekst = P_().getProperty('AKT_ZAINSTALOWANY') ? 'Уже включено ' + P_().getProperty('AKT_ZAINSTALOWANY') + '. Ничего делать не нужно.' : aktualizatorUstaw_(); }
  catch (e) { ok = false; tekst = String(e.message || e); }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return '<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font:17px/1.45 system-ui,sans-serif;padding:24px;max-width:520px">' +
    '<h2 style="margin:0 0 12px">' + (ok ? '✅ Обновления включены' : '⚠️ Не получилось') + '</h2><div style="white-space:pre-line">' + esc(tekst) + '</div>' +
    (ok ? '<p>Можно закрыть эту страницу. Дальше обновления ставятся в приложении: Ещё → Обновление системы.</p>' : '') + '</div>';
}
