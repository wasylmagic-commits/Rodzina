/* dokumenty.js — Rodzina 0.8 (23.11.2026)
 * 0.8: wizyty — status (ждёт записи / записан / был), к кому и куда, adres, telefon, data i godzina wizyty → wydarzenie z przypomnieniem (serwer ≥ 0.9.0); karty „Ближайшие визиты” i „Ждут записи”.
 * 0.3:
 * Zakładka „Документы”: lista po kategoriach, termin ważności, podgląd, udostępnianie.
 * Dodawanie: „Сфотографировать” (aparat) albo „Загрузить” (galeria / PDF).
 *   Zdjęcie → skaner jak w Serwis myjni (prostowanie, przycięcie, czytelność) → kilka stron → „PDF или фото?” →
 *   „Куда положить?”: Claude patrzy na 1. stronę i proponuje kategorię, nazwę, czyje, auto, termin (gdy jest klucz) → człowiek potwierdza.
 * Dokumenty z „SOS” mają kopię w telefonie (IndexedDB) — otwierają się bez internetu (wypadek, brak zasięgu).
 */
(function () {
  const IKONY_KAT = { auto: 'car', ubezp: 'shield', med: 'med', rodzina: 'id', dom: 'home', szkola: 'book', inne: 'box' };
  const WID = [['ja', 'Только владелец'], ['rodzice', 'Родители'], ['wszyscy', 'Вся семья']];
  let KAT = 'wszystkie', SZUKAJ = '', NOWY = null, SYNC = false;
  const WIZ_ST = [['', 'Нет'], ['czeka', 'Ждёт записи'], ['umowione', 'Записан'], ['zrobione', 'Был(а)']];
  const wizTekst = w => w ? dataPl(w.slice(0, 10)) + ', ' + w.slice(11, 16) : '';
  const maWizyte = d => !!(d.status || d.wizyta || d.do_kogo || d.adres || d.telefon);
  const terazT = () => dzis() + 'T' + new Date().toTimeString().slice(0, 5);
  const wzgl = w => { const n = dniDo(w); return n === 0 ? 'сегодня' : n === 1 ? 'завтра' : dataPl(w.slice(0, 10)); };
  const kategorie = () => D.kategorie || [];
  const nazwaKat = k => (kategorie().find(x => x[0] === k) || [k, k])[1];
  const czyje = w => w === 'rodzina' ? 'семья' : imie(w);
  const nazwaAuta = id => ((D.auta || []).find(a => a.id === id) || {}).nazwa || '';
  const dniDo = s => s ? Math.round((dt(s) - dt(dzis())) / 864e5) : null;
  window.ikonaKat = k => IKONY_KAT[k] || 'box';
  window.dokTermin = d => {
    const n = dniDo(d.wazny_do); if (n === null) return '';
    const kl = n < 0 ? 'r' : n <= 30 ? 'o' : '';
    return '<span class="pill ' + kl + '">' + (n < 0 ? 'истёк ' : 'до ') + esc(dataPl(d.wazny_do)) + '</span>';
  };

  window.wDok = function () {
    if (!D.kategorie) return '<div class="card"><h3>' + I('update', 1) + 'Нужно обновление сервера</h3>Документы заработают после установки обновления: Ещё → Обновление системы.</div>';
    const wsz = D.dokumenty || [];
    let h = '<div class="dwa" style="margin-bottom:14px">' +
      '<label class="btn"><input type="file" accept="image/*" capture="environment" hidden onchange="dokZdjecia(this,1)">' + I('camera', 1) + 'Сфотографировать</label>' +
      '<label class="btn btn-j"><input type="file" accept="image/*,application/pdf" multiple hidden onchange="dokZdjecia(this,0)">' + I('upload', 1) + 'Загрузить</label></div>' +
      '<button class="btn2 szer" style="margin:-4px 0 14px" onclick="skanerOkno()">' + I('note', 1) + 'Сканер — ровнее и чётче</button>' +
      (D.ja.admin ? '<button class="btn2 szer" style="margin:-4px 0 14px" onclick="wejscieTeraz()">' + I('id', 1) + 'Разобрать «Wejscie»</button>' : '');
    h += dokKarta();
    if (wsz.length > 6) h += '<input type="search" placeholder="Поиск по документам" value="' + esc(SZUKAJ) + '" oninput="dokSzukaj(this.value)">';
    const licz = k => wsz.filter(d => d.kategoria === k).length;
    h += '<div class="seg">' + [['wszystkie', 'Все']].concat(kategorie().filter(k => licz(k[0])).map(k => [k[0], k[1]])).map(([k, n]) =>
      '<button class="' + (KAT === k ? 'on' : '') + '" onclick="dokKat(\'' + k + '\')">' + (k === 'wszystkie' ? '' : I(ikonaKat(k), 1)) + esc(n) + (k === 'wszystkie' ? ' <em class="licz">' + wsz.length + '</em>' : '') + '</button>').join('') + '</div>';
    if (!wsz.length) return h + '<div class="card"><div class="empty">Документов пока нет.<br>Сфотографируй полис, техпаспорт или справку — я выровняю, сделаю PDF и подскажу, куда положить.</div></div>';
    const q = SZUKAJ.toLowerCase();
    const lista = wsz.filter(d => (KAT === 'wszystkie' || d.kategoria === KAT) && (!q || (d.tytul + ' ' + d.notatka + ' ' + czyje(d.wlasciciel) + ' ' + nazwaAuta(d.auto) + ' ' + (d.do_kogo || '') + ' ' + (d.adres || '')).toLowerCase().indexOf(q) >= 0));
    const konczy = lista.filter(d => { const n = dniDo(d.wazny_do); return n !== null && n <= 30; });
    if (konczy.length && !q && KAT === 'wszystkie') h += '<div class="card"><h3 class="r">' + I('alert', 1) + 'Скоро истекают</h3>' + konczy.map(wiersz).join('') + '</div>';
    if (KAT === 'wszystkie' && !q) kategorie().forEach(k => { const w = lista.filter(d => d.kategoria === k[0]); if (w.length) h += '<div class="card"><h3>' + I(ikonaKat(k[0]), 1) + esc(k[1]) + ' <span class="mute">' + w.length + '</span></h3>' + w.map(wiersz).join('') + '</div>'; });
    else h += '<div class="card">' + (lista.length ? lista.map(wiersz).join('') : '<div class="empty mala">Ничего не нашёл</div>') + '</div>';
    return h;
  };
  function wiersz(d) {
    const meta = [czyje(d.wlasciciel)];
    if (d.auto && nazwaAuta(d.auto)) meta.push(nazwaAuta(d.auto));
    if (d.status === 'czeka') meta.push(I('clock', 1) + 'ждёт записи');
    if (d.status === 'umowione' && d.wizyta) meta.push(I('cal', 1) + 'визит ' + esc(wizTekst(d.wizyta)));
    if (d.do_kogo) meta.push(esc(d.do_kogo));
    if (d.widocznosc === 'ja') meta.push(I('eye', 1) + 'личное');
    if (d.sos) meta.push(I('shield', 1) + 'SOS');
    return '<div class="row w" onclick="dokPokaz(\'' + jsq(d.id) + '\')"><div class="av dk">' + I(/pdf/.test(d.mime) ? 'note' : 'image', 1) + '</div><div class="g"><div class="t">' + esc(d.tytul) + '</div>' +
      '<div class="mute meta">' + meta.join('<i class="kropka"></i>') + '</div></div>' + dokTermin(d) + '</div>';
  }
  function wierszWiz(d, tryb) {
    const meta = [czyje(d.wlasciciel)]; if (d.do_kogo) meta.unshift(esc(d.do_kogo));
    const pill = tryb === 'wizyta' ? '<span class="pill' + (dniDo(d.wizyta) <= 1 ? ' o' : '') + '">' + esc(wzgl(d.wizyta)) + ', ' + esc(d.wizyta.slice(11, 16)) + '</span>' : dokTermin(d);
    return '<div class="row w" onclick="dokPokaz(\'' + jsq(d.id) + '\')"><div class="av dk">' + I(ikonaKat(d.kategoria), 1) + '</div><div class="g"><div class="t">' + esc(d.tytul) + '</div>' +
      '<div class="mute meta">' + meta.join('<i class="kropka"></i>') + '</div></div>' + pill + '</div>';
  }
  // karty „Ближайшие визиты” i „Ждут записи” (на «Сегодня» i w «Документы»)
  window.dokKarta = function () {
    const wsz = D.dokumenty || []; if (!D.kategorie || !wsz.length) return '';
    const t = terazT();
    const wiz = wsz.filter(d => d.status === 'umowione' && d.wizyta && d.wizyta >= t).sort((a, b) => a.wizyta < b.wizyta ? -1 : 1).slice(0, 3);
    const czek = wsz.filter(d => d.status === 'czeka').sort((a, b) => (a.wazny_do || '9') < (b.wazny_do || '9') ? -1 : 1);
    let h = '';
    if (wiz.length) h += '<div class="card"><h3>' + I('cal', 1) + 'Ближайшие визиты</h3>' + wiz.map(d => wierszWiz(d, 'wizyta')).join('') + '</div>';
    if (czek.length) h += '<div class="card"><h3>' + I('clock', 1) + 'Ждут записи <span class="mute">' + czek.length + '</span></h3>' + czek.map(d => wierszWiz(d, 'czeka')).join('') + '</div>';
    return h;
  };
  window.dokKat = k => { KAT = k; render(); };
  let ST = 0;
  window.dokSzukaj = v => { SZUKAJ = v; clearTimeout(ST); ST = setTimeout(() => { render(); const e = document.querySelector('main input[type=search]'); if (e) { e.focus(); e.setSelectionRange(v.length, v.length); } }, 250); };

  /* ---------- plik dokumentu: kopia w telefonie albo z serwera ---------- */
  window.dokPlik = async function (id, wymus) {
    const d = (D.dokumenty || []).find(x => x.id === id);
    let p = wymus ? null : await Schowek.get('dok_' + id);
    if (p) return p;
    p = await api('dokPobierz', { id: id });
    if (d && d.sos) Schowek.put('dok_' + id, p);
    return p;
  };
  // kopie SOS: dociąga brakujące, usuwa zbędne (raz na otwarcie aplikacji)
  window.dokSosSync = async function () {
    if (SYNC || !D || !D.dokumenty || !navigator.onLine) return; SYNC = true;
    try {
      const sos = D.dokumenty.filter(d => d.sos).map(d => 'dok_' + d.id), jest = (await Schowek.klucze()).filter(k => /^dok_/.test(k));
      for (const k of jest) if (sos.indexOf(k) < 0) await Schowek.del(k);
      for (const k of sos.filter(k => jest.indexOf(k) < 0).slice(0, 8)) { try { await Schowek.put(k, await api('dokPobierz', { id: k.slice(4) })); } catch (e) {} }
    } finally { SYNC = false; }
  };

  window.dokPokaz = function (id) {
    const d = (D.dokumenty || []).find(x => x.id === id); if (!d) return;
    const meta = [nazwaKat(d.kategoria), czyje(d.wlasciciel), nazwaAuta(d.auto), d.wazny_do ? 'действует до ' + dataPl(d.wazny_do) : '', d.rozmiar ? Math.max(1, Math.round(d.rozmiar / 1024)) + ' КБ' : ''].filter(Boolean);
    ark('<h4>' + esc(d.tytul) + '</h4><div class="mute" style="margin-bottom:10px">' + esc(meta.join(' · ')) + '</div>' + (d.notatka ? '<div style="margin-bottom:10px;white-space:pre-line">' + esc(d.notatka) + '</div>' : '') + blokWizyty(d) +
      '<div id="dokPodg" class="podg"><div class="empty mala">' + (/pdf/.test(d.mime) ? I('note') + '<br>PDF' : 'Загружаю…') + '</div></div>' +
      '<div class="dwa" style="margin-top:12px"><button class="btn" onclick="dokOtworz(\'' + jsq(id) + '\')">' + I('download', 1) + ' Открыть</button><button class="btn2" onclick="dokUdostepnij(\'' + jsq(id) + '\')">' + I('share', 1) + 'Поделиться</button></div>' +
      '<div class="dwa" style="margin-top:10px"><button class="btn2" onclick="dokEdytuj(\'' + jsq(id) + '\')">' + I('pen', 1) + 'Изменить</button><button class="btn2" onclick="dokUsunPytaj(\'' + jsq(id) + '\')">' + I('trash', 1) + 'Удалить</button></div>' +
      '<div class="ab"><button class="btn2" onclick="arkZamknij()">Закрыть</button></div>');
    if (/^image/.test(d.mime)) dokPlik(id).then(p => { const e = document.getElementById('dokPodg'); if (e) e.innerHTML = '<img src="data:' + p.mime + ';base64,' + p.b64 + '" alt="">'; })
      .catch(e => { const x = document.getElementById('dokPodg'); if (x) x.innerHTML = '<div class="empty mala">' + esc(e.message) + '</div>'; });
  };
  function blokWizyty(d) {
    if (!maWizyte(d)) return '';
    const st = (WIZ_ST.find(x => x[0] === (d.status || '')) || ['', ''])[1];
    const lin = [];
    if (st && d.status) lin.push('<div><b>' + I(d.status === 'czeka' ? 'clock' : d.status === 'zrobione' ? 'check' : 'cal', 1) + ' ' + esc(st) + (d.status === 'umowione' && d.wizyta ? ': ' + esc(wizTekst(d.wizyta)) : '') + '</b></div>');
    if (d.do_kogo) lin.push('<div>' + esc(d.do_kogo) + '</div>');
    if (d.adres) lin.push('<div class="mute">' + I('pin', 1) + ' ' + esc(d.adres) + '</div>');
    if (d.telefon) lin.push('<div class="mute">' + I('phone', 1) + ' ' + esc(d.telefon) + '</div>');
    const tel = String(d.telefon || '').replace(/[^\d+]/g, '');
    const przyc = (tel ? '<a class="btn2" href="tel:' + esc(tel) + '">' + I('phone', 1) + 'Позвонить</a>' : '') +
      (d.adres ? '<a class="btn2" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(d.adres) + '">' + I('pin', 1) + 'Маршрут</a>' : '') +
      (d.status === 'czeka' ? '<button class="btn2" onclick="dokEdytuj(\'' + jsq(d.id) + '\',1)">' + I('cal', 1) + 'Записался</button>' : '') +
      (d.status === 'umowione' ? '<button class="btn2" onclick="dokStatus(\'' + jsq(d.id) + '\',\'zrobione\')">' + I('check', 1) + 'Был(а)</button>' : '');
    return '<div class="wizblok" style="margin-bottom:10px;padding:10px 12px;border-radius:12px;background:var(--bg2,rgba(127,127,127,.12))">' + lin.join('') + (przyc ? '<div class="dwa" style="margin-top:8px;flex-wrap:wrap">' + przyc + '</div>' : '') + '</div>';
  }
  window.dokStatus = (id, st) => { arkZamknij(); zmiana('dokZmien', { id: id, status: st }, x => { const y = x.dokumenty.find(z => z.id === id); if (y) y.status = st; }, 'Отмечено'); };
  window.dokOtworz = async id => { toast('Открываю…'); try { const p = await dokPlik(id); pobierzPlik(p.b64, p.mime, p.nazwa); } catch (e) { toast(e.message); } };
  window.dokUdostepnij = async id => { const d = (D.dokumenty || []).find(x => x.id === id) || {}; try { const p = await dokPlik(id); await udostepnijPlik(p.b64, p.mime, p.nazwa, d.tytul); } catch (e) { toast(e.message); } };
  window.dokUsunPytaj = id => {
    const d = (D.dokumenty || []).find(x => x.id === id); if (!d) return;
    ark('<h4>Удалить «' + esc(d.tytul) + '»?</h4><div class="mute" style="margin-bottom:14px">Файл уйдёт в корзину Google Drive — 30 дней его ещё можно достать.</div>' +
      '<div class="ab"><button class="btn czerw" onclick="dokUsun(\'' + jsq(id) + '\')">' + I('trash', 1) + ' Удалить</button><button class="btn2" onclick="dokPokaz(\'' + jsq(id) + '\')">Назад</button></div>');
  };
  window.dokUsun = id => { arkZamknij(); Schowek.del('dok_' + id); zmiana('dokUsun', { id: id }, d => d.dokumenty = d.dokumenty.filter(x => x.id !== id), 'Удалено'); };

  /* ---------- formularz opisu (nowy i zmiana) ---------- */
  function formOpis(o, tytulArk, przycisk) {
    const kat = o.kategoria, auta = D.auta || [];
    return '<h4>' + tytulArk + '</h4>' + (o.opisAI ? '<div class="mute" style="margin-bottom:6px">' + I('spark', 1) + ' ' + esc(o.opisAI) + '</div>' : '') +
      '<label>Название</label><input id="doT" class="as-in" value="' + esc(o.tytul) + '" placeholder="Полис OC Fiesta, справка для школы…">' +
      '<label>Куда положить' + (o.propKat ? ' <b>· предлагаю «' + esc(nazwaKat(o.propKat)) + '»</b>' : '') + '</label><div class="chips">' + kategorie().map(k =>
        '<button type="button" class="chip' + (kat === k[0] ? ' on' : '') + '" onclick="dokUst(\'kategoria\',\'' + k[0] + '\')">' + I(ikonaKat(k[0]), 1) + ' ' + esc(k[1]) + '</button>').join('') + '</div>' +
      '<label>Чей документ</label><div class="chips">' + [['rodzina', 'Семья']].concat(D.ludzie.map(p => [p.id, p.imie])).map(([v, t]) =>
        '<button type="button" class="chip' + (o.wlasciciel === v ? ' on' : '') + '" onclick="dokUst(\'wlasciciel\',\'' + jsq(v) + '\')">' + esc(t) + '</button>').join('') + '</div>' +
      (auta.length && (kat === 'auto' || kat === 'ubezp' || o.auto) ? '<label>Машина</label><div class="chips">' + [['', 'Не про машину']].concat(auta.map(a => [a.id, a.nazwa])).map(([v, t]) =>
        '<button type="button" class="chip' + ((o.auto || '') === v ? ' on' : '') + '" onclick="dokUst(\'auto\',\'' + jsq(v) + '\')">' + esc(t) + '</button>').join('') + '</div>' : '') +
      '<label>Действует до <span class="mute">(напомню за месяц, неделю и накануне)</span></label><div class="chips"><label class="edd' + (o.wazny_do ? ' on' : '') + '">' + I('cal', 1) + '<span>' + (o.wazny_do ? esc(dataPl(o.wazny_do)) : 'выбрать дату') + '</span>' +
        '<input type="date" value="' + esc(o.wazny_do || '') + '" onchange="dokUst(\'wazny_do\',this.value)"></label>' + (o.wazny_do ? '<button type="button" class="chip" onclick="dokUst(\'wazny_do\',\'\')">без срока</button>' : '') + '</div>' +
      blokFormyWizyty(o, kat) +
      '<label>Кто видит</label><div class="seg">' + WID.map(([v, t]) => '<button type="button" class="' + (o.widocznosc === v ? 'on' : '') + '" onclick="dokUst(\'widocznosc\',\'' + v + '\')">' + t + '</button>').join('') + '</div>' +
      '<div class="row" style="border:0;padding-top:0"><div class="g"><b>Держать в телефоне для SOS</b><div class="mute">откроется без интернета — в аварии, где нет связи</div></div>' +
        '<button type="button" class="sw" role="switch" aria-checked="' + !!o.sos + '" onclick="dokUst(\'sos\',' + (o.sos ? 0 : 1) + ')"><i></i></button></div>' +
      '<label>Заметка</label><textarea id="doN" class="as-in" rows="2" placeholder="необязательно">' + esc(o.notatka || '') + '</textarea>' +
      '<div class="ab"><button class="btn" onclick="' + przycisk + '">' + I('check', 1) + ' Сохранить</button><button class="btn2" onclick="dokAnuluj()">Отмена</button></div>';
  }
  function blokFormyWizyty(o, kat) {
    if (!(kat === 'med' || o.wizOtwarte || o.status || o.wizD || o.do_kogo || o.adres || o.telefon))
      return '<button type="button" class="btn2 szer" style="margin:12px 0 0" onclick="dokUst(\'wizOtwarte\',1)">' + I('cal', 1) + 'Визит или запись (врач, сервис)</button>';
    return '<label>Визит</label><div class="seg">' + WIZ_ST.map(([v, t]) => '<button type="button" class="' + ((o.status || '') === v ? 'on' : '') + '" onclick="dokUst(\'status\',\'' + v + '\')">' + t + '</button>').join('') + '</div>' +
      '<label>Куда / к кому</label><input id="doK" class="as-in" value="' + esc(o.do_kogo || '') + '" placeholder="Ортопед, Medicover / автосервис…">' +
      '<div class="dwa"><div><label>Дата визита</label><input id="doWD" class="as-in" type="date" value="' + esc(o.wizD || '') + '"></div>' +
      '<div><label>Время</label><input id="doWG" class="as-in" type="time" value="' + esc(o.wizG || '') + '"></div></div>' +
      '<div class="mute" style="margin-top:4px">С датой и временем создам событие и напомню за 2 часа; накануне вечером оно будет в сводке.</div>' +
      '<label>Адрес</label><input id="doA" class="as-in" value="' + esc(o.adres || '') + '" placeholder="улица, город">' +
      '<label>Телефон</label><input id="doTel" class="as-in" type="tel" value="' + esc(o.telefon || '') + '" placeholder="для кнопки «Позвонить»">';
  }
  let OPIS = null, OPIS_TRYB = '';
  function rysujOpis(bezAnim) {
    const a = document.getElementById('ark'), ar = a.querySelector('.ar'), sc = ar ? ar.scrollTop : 0;
    ark(formOpis(OPIS, OPIS_TRYB === 'nowy' ? 'Куда положить?' : 'Изменить документ', OPIS_TRYB === 'nowy' ? 'dokZapisz()' : 'dokZapiszZmiane()'), bezAnim);
    const n = a.querySelector('.ar'); if (n && bezAnim) n.scrollTop = sc;
  }
  function czytajPola() {
    const t = document.getElementById('doT'), n = document.getElementById('doN'); if (t) OPIS.tytul = t.value; if (n) OPIS.notatka = n.value;
    [['doK', 'do_kogo'], ['doA', 'adres'], ['doTel', 'telefon'], ['doWD', 'wizD'], ['doWG', 'wizG']].forEach(([id, k]) => { const e = document.getElementById(id); if (e) OPIS[k] = e.value; });
  }
  // data + godzina → wizyta; status zgodny z serwerem (jest termin → записан; terminu nie ma, a był „записан” → ждёт записи)
  function zlozWizyte(o) {
    o.wizyta = o.wizD ? o.wizD + 'T' + (o.wizG || '') : '';
    if (o.wizD && !o.wizG) return 'Укажи время визита';
    if (o.wizyta && (!o.status || o.status === 'czeka')) o.status = 'umowione';
    if (!o.wizyta && o.status === 'umowione') o.status = 'czeka';
    return '';
  }
  window.dokUst = (k, v) => {
    czytajPola(); OPIS[k] = v; OPIS.dotkniete = OPIS.dotkniete || {}; OPIS.dotkniete[k] = 1;
    if (k === 'kategoria') {   // domyślne dla kategorii, jeśli człowiek ich nie zmieniał
      const kat = kategorie().find(x => x[0] === v);
      if (kat && !OPIS.dotkniete.widocznosc) OPIS.widocznosc = kat[2];
      if (!OPIS.dotkniete.sos) OPIS.sos = v === 'auto' || v === 'ubezp' ? 1 : 0;
    }
    rysujOpis(true);
  };
  window.dokAnuluj = () => { OPIS = null; NOWY = null; arkZamknij(); };
  window.dokEdytuj = (id, zapisany) => {
    const d = (D.dokumenty || []).find(x => x.id === id); if (!d) return;
    OPIS = Object.assign({}, d); OPIS_TRYB = 'zmiana';
    OPIS.wizD = (d.wizyta || '').slice(0, 10); OPIS.wizG = (d.wizyta || '').slice(11, 16);
    if (zapisany) { OPIS.status = 'umowione'; OPIS.wizOtwarte = 1; }
    rysujOpis();
  };
  window.dokZapiszZmiane = () => {
    czytajPola(); const o = OPIS, d = (D.dokumenty || []).find(x => x.id === o.id); if (!d) return dokAnuluj();
    const blad = zlozWizyte(o); if (blad) return toast(blad);
    const zm = {}; ['tytul', 'kategoria', 'wlasciciel', 'auto', 'widocznosc', 'wazny_do', 'sos', 'notatka', 'status', 'do_kogo', 'adres', 'telefon', 'wizyta'].forEach(k => { if (String(o[k] == null ? '' : o[k]) !== String(d[k] == null ? '' : d[k])) zm[k] = o[k]; });
    OPIS = null; arkZamknij();
    if (!Object.keys(zm).length) return;
    if (zm.sos === 0) Schowek.del('dok_' + d.id);
    zmiana('dokZmien', Object.assign({ id: d.id }, zm), x => { const y = x.dokumenty.find(z => z.id === d.id); if (y) Object.assign(y, zm); }, 'Сохранено');
    if (zm.sos) setTimeout(dokSosSync, 1500);
  };

  /* ---------- nowy dokument: zdjęcia/strony → format → opis → wysyłka ---------- */
  // okno „Сканер”: сканируем в Google Drive (ровнее и чётче нашего) или в CamScanner → «Поделиться» → Семья
  window.skanerOkno = () => ark('<h4>' + I('note', 1) + ' Сканер</h4>' +
    '<div class="mute" style="margin:2px 0 12px">Лист ровнее и чётче получается в готовых сканерах. Наш встроенный остаётся для быстрых снимков («Сфотографировать»).</div>' +
    '<div class="t" style="font-weight:600">Google Drive</div><div class="mute" style="margin:2px 0 8px">«+» → «Сканировать» → сохрани PDF в папку <b>Rodzina_Dokumenty / Wejscie</b>. Я сам разложу файл (раз в 15 минут или кнопкой «Разобрать Wejscie»).</div>' +
    '<a class="btn szer" href="intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;launchFlags=0x10000000;package=com.google.android.apps.docs;S.browser_fallback_url=https%3A%2F%2Fdrive.google.com%2Fdrive%2Fmy-drive;end">' + I('upload', 1) + ' Открыть Google Drive</a>' +
    '<div class="t" style="font-weight:600;margin-top:16px">CamScanner</div><div class="mute" style="margin:2px 0 8px">Готовый скан → «Поделиться» → <b>Семья</b>. Документ откроется здесь, дальше как обычно: название, чей, срок. Пункт «Семья» появляется после обновления приложения (иногда нужно пару дней или переустановить иконку).</div>' +
    '<a class="btn2 szer" href="intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;launchFlags=0x10000000;package=com.intsig.camscanner;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.intsig.camscanner;end">' + I('camera', 1) + 'Открыть CamScanner</a>' +
    '<div class="ab"><button class="btn2" onclick="arkZamknij()">Закрыть</button></div>');

  // „Поделиться → Семья” (share_target в manifest.json, sw.js кладёт файл в cache „udostepnione”) → тот же путь, что у «Загрузить»
  window.dokUdostWczytaj = async () => {
    if (!/[?&]udost=1/.test(location.search) || !('caches' in window)) return;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    const pliki = [];
    try {
      const c = await caches.open('udostepnione');
      for (const req of await c.keys()) {
        const res = await c.match(req); if (!res) continue;
        const blob = await res.blob(), nazwa = decodeURIComponent(res.headers.get('X-Nazwa') || '') || 'plik';
        pliki.push(new File([blob], nazwa, { type: blob.type || '' })); await c.delete(req);
      }
    } catch (e) {}
    if (!pliki.length) return;
    let proby = 0;
    const start = () => { if (D && D.kategorie) { go('dok'); dokZdjecia({ files: pliki, value: '' }, 0, true); } else if (++proby < 40) setTimeout(start, 400); };
    start();
  };
  window.addEventListener('load', () => setTimeout(window.dokUdostWczytaj, 500));

  window.dokZdjecia = async function (inp, zAparatu, bezSkanu) {
    const fs = Array.from(inp.files || []); inp.value = ''; if (!fs.length) return;
    const pdf = fs.find(f => /pdf/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (pdf) {
      try { NOWY = { pdf: await plikB64(pdf), nazwa: pdf.name, format: 'pdf' }; } catch (e) { return toast(e.message); }
      return dokOpisNowy();
    }
    NOWY = { strony: [], format: '' };
    await dodajStrony(fs, bezSkanu);
  };
  async function dodajStrony(fs, bezSkanu) {
    for (const f of fs) {
      try {
        const z = await zdjecieB64(f, 1800); const st = { b64: z.b64, orig: z.b64, w: z.w, h: z.h };
        if (window.skanDokument && !bezSkanu) {   // zdjęcia z zewnętrznego skanera są już równe – nie psujemy ich drugi raz
          toast('Выравниваю и чищу лист…');
          try { const sk = await window.skanDokument(z.b64); st.skan = sk.b64; st.b64 = sk.b64; st.popr = true; if (!sk.kadr) toast('Края листа не нашёл — улучшил только контраст'); }
          catch (e) { toast('Сканер не загрузился — оставляю фото как есть'); }
          const wh = await wymiaryJpeg(st.b64); st.w = wh[0]; st.h = wh[1];
        }
        NOWY.strony.push(st);
      } catch (e) { toast(e.message); }
    }
    if (NOWY.strony.length) rysujStrony(); else NOWY = null;
  }
  function rysujStrony() {
    const s = NOWY.strony;
    ark('<h4>' + I('note', 1) + ' Документ · ' + s.length + ' ' + (s.length === 1 ? 'страница' : s.length < 5 ? 'страницы' : 'страниц') + '</h4>' +
      '<div class="mute" style="margin:-2px 0 10px">Несколько страниц? Добавь — соберу в один PDF.</div>' +
      '<div class="wy-st">' + s.map((x, i) => '<div><img src="data:image/jpeg;base64,' + x.b64 + '" alt="страница ' + (i + 1) + '"><button class="ib" aria-label="Убрать страницу" onclick="dokStronaUsun(' + i + ')">' + I('trash', 1) + '</button><span>' + (i + 1) + '</span>' +
        (x.skan ? '<button class="wy-tg" onclick="dokPrzel(' + i + ')">' + (x.popr ? 'показать оригинал' : 'показать скан') + '</button>' : '') + '</div>').join('') +
      '<label class="wy-plus"><input type="file" accept="image/*" capture="environment" hidden onchange="dokStrona(this)">' + I('plus', 1) + '<span>Страница</span></label></div>' +
      '<label>Как сохранить?</label><div class="dwa"><button class="btn" onclick="dokFormat(\'pdf\')">' + I('note', 1) + ' PDF</button><button class="btn2" onclick="dokFormat(\'foto\')">' + I('image', 1) + 'Фото</button></div>' +
      '<div class="mute" style="margin-top:8px">PDF — ровный скан с обрезанными краями, как в системе мойки. Фото — картинка как есть' + (s.length > 1 ? ', каждая страница отдельно' : '') + '.</div>' +
      '<div class="ab"><button class="btn2" onclick="dokAnuluj()">Отмена</button></div>');
  }
  window.dokStrona = async inp => { const fs = Array.from(inp.files || []); inp.value = ''; if (fs.length) await dodajStrony(fs); };
  window.dokPrzel = async i => { const s = NOWY.strony[i]; if (!s || !s.skan) return; s.popr = !s.popr; s.b64 = s.popr ? s.skan : s.orig; const wh = await wymiaryJpeg(s.b64); s.w = wh[0]; s.h = wh[1]; rysujStrony(); };
  window.dokStronaUsun = i => { NOWY.strony.splice(i, 1); if (NOWY.strony.length) rysujStrony(); else dokAnuluj(); };
  window.dokFormat = f => { NOWY.format = f; dokOpisNowy(); };

  async function dokOpisNowy() {
    const kat0 = 'inne';
    OPIS = { tytul: '', kategoria: kat0, wlasciciel: D.ja.id, auto: '', wazny_do: '', widocznosc: 'rodzice', sos: 0, notatka: '', dotkniete: {} };
    OPIS_TRYB = 'nowy';
    const podgl = NOWY.strony && NOWY.strony[0] ? await zmniejszJpeg(NOWY.strony[0].b64, 1100) : '';
    if (podgl && D.szybko) { ark('<h4>Смотрю, что за документ…</h4><div class="empty mala">' + I('spark') + '<br>Claude читает первую страницу</div>'); }
    let p = null;
    try { p = await apiPost('dokAnaliza', { b64: D.szybko ? podgl : '', nazwa: NOWY.nazwa || '' }); } catch (e) { p = null; if (/POST|файл/.test(e.message)) toast(e.message); }
    if (!OPIS) return;   // anulowano w trakcie
    if (p) {
      OPIS.kategoria = p.kategoria || kat0; OPIS.propKat = p.kategoria;
      if (p.tytul) OPIS.tytul = p.tytul; if (p.wlasciciel) OPIS.wlasciciel = p.wlasciciel; if (p.auto) OPIS.auto = p.auto; if (p.wazny_do) OPIS.wazny_do = p.wazny_do;
      if (p.opis) OPIS.opisAI = p.opis;
      if (p.do_kogo) OPIS.do_kogo = p.do_kogo; if (p.adres) OPIS.adres = p.adres; if (p.telefon) OPIS.telefon = p.telefon; if (p.status) OPIS.status = p.status;
      if (p.wizyta) { OPIS.wizD = p.wizyta.slice(0, 10); OPIS.wizG = p.wizyta.slice(11, 16); }
    }
    if (!OPIS.tytul && NOWY.nazwa) OPIS.tytul = NOWY.nazwa.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');
    const kat = kategorie().find(x => x[0] === OPIS.kategoria); if (kat) OPIS.widocznosc = kat[2];
    OPIS.sos = OPIS.kategoria === 'auto' || OPIS.kategoria === 'ubezp' ? 1 : 0;
    rysujOpis();
  }

  window.dokZapisz = async function () {
    czytajPola();
    const o = OPIS, n = NOWY; if (!o || !n) return;
    if (!o.tytul.trim()) return toast('Дай документу название');
    const blad = zlozWizyte(o); if (blad) return toast(blad);
    const pliki = n.pliki || (n.pliki = []);
    if (pliki.length) { /* ponowienie: wysyłam tylko to, co nie doszło */ }
    else if (n.pdf) pliki.push({ b64: n.pdf, mime: 'application/pdf', tytul: o.tytul });
    else if (n.format === 'foto') n.strony.forEach((s, i) => pliki.push({ b64: s.b64, mime: 'image/jpeg', tytul: o.tytul + (n.strony.length > 1 ? ' (стр. ' + (i + 1) + ')' : '') }));
    else pliki.push({ b64: pdfZJpeg(n.strony), mime: 'application/pdf', tytul: o.tytul });
    ark('<h4>Сохраняю…</h4><div class="empty mala" id="dokPost">' + I('upload') + '<br>Отправляю ' + (pliki.length > 1 ? pliki.length + ' файла' : 'файл') + ' на Google Drive</div>');
    try {
      let w = null;
      for (const [i, f] of pliki.entries()) {
        if (f.ok) continue;
        f.id = f.id || nowyId();
        w = await apiPost('dokZapisz', { id: f.id, b64: f.b64, mime: f.mime, tytul: f.tytul, kategoria: o.kategoria, wlasciciel: o.wlasciciel, auto: o.auto || '',
          widocznosc: o.widocznosc, wazny_do: o.wazny_do || '', sos: o.sos ? 1 : 0, notatka: (o.notatka || '').trim(),
          status: o.status || '', do_kogo: (o.do_kogo || '').trim(), adres: (o.adres || '').trim(), telefon: (o.telefon || '').trim(), wizyta: o.wizyta || '' });
        if (o.sos) Schowek.put('dok_' + f.id, { id: f.id, b64: f.b64, mime: f.mime, nazwa: f.tytul + (/pdf/.test(f.mime) ? '.pdf' : '.jpg') });
        const e = document.getElementById('dokPost'); if (e && pliki.length > 1) e.innerHTML = I('upload') + '<br>Отправлено ' + (i + 1) + ' из ' + pliki.length;
        pliki[i].ok = 1;
      }
      OPIS = null; NOWY = null; arkZamknij();
      if (w && w.ja) przyjmij(w);
      KAT = o.kategoria; if (TAB !== 'dok') go('dok'); else render();
      toast('Сохранено в «' + nazwaKat(o.kategoria) + '»');
    } catch (e) {
      const zostalo = pliki.filter(f => !f.ok);
      NOWY.doPobrania = zostalo;
      ark('<h4>' + I('alert', 1) + ' Не отправилось</h4><div style="margin-bottom:12px">' + esc(e.message) + '</div><div class="mute" style="margin-bottom:12px">Файл не потерян: можно повторить или сохранить его в телефон.</div>' +
        '<div class="dwa"><button class="btn" onclick="rysujOpisPonow()">' + I('refresh', 1) + ' Повторить</button><button class="btn2" onclick="dokPobierzLokalnie()">' + I('download', 1) + 'В телефон</button></div>' +
        '<div class="ab"><button class="btn2" onclick="dokAnuluj()">Закрыть</button></div>');
    }
  };
  window.rysujOpisPonow = () => rysujOpis();
  window.dokPobierzLokalnie = () => { ((NOWY && NOWY.doPobrania) || []).forEach(f => pobierzPlik(f.b64, f.mime, f.tytul + (/pdf/.test(f.mime) ? '.pdf' : '.jpg'))); };
})();
