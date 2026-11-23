/* sos.js — Rodzina 0.3 (23.11.2026)
 * Ekran SOS (czerwony przycisk w nagłówku): 112, telefony rodziny, adres domu, scenariusze krok po kroku
 * (kolizja/wypadek, pożar, zdrowie, awaria w drodze), polisy aut i dokumenty SOS (kopie w telefonie — bez internetu).
 * Oświadczenie sprawcy kolizji: formularz z danymi naszymi i drugiej strony, uszkodzenia po częściach auta, zdjęcia,
 * podpisy palcem na ekranie → PDF (po polsku, dla ubezpieczyciela). Szkic zapisuje się sam (stres, zamknięta aplikacja).
 * Pusty blankiet do wydruku — ten sam układ, puste linie.
 */
(function () {
  let EKRAN = '', RANNI = '', SKAD = 'dzis';
  const LSo = { get: () => { try { return JSON.parse(localStorage.getItem('rodzina.osw') || 'null'); } catch (e) { return null; } }, set: o => { try { localStorage.setItem('rodzina.osw', JSON.stringify(o)); } catch (e) {} } };
  let OSW = null, MEDIA = null;

  window.sosOtworz = () => { if (TAB !== 'sos') SKAD = TAB; EKRAN = ''; RANNI = ''; go('sos'); };
  window.sosEkran = e => { EKRAN = e; RANNI = ''; ANIM = true; render(); window.scrollTo(0, 0); if (e === 'osw') oswStart(); };
  window.sosWstecz = () => { if (EKRAN === 'osw') { EKRAN = 'dtp'; RANNI = 'nie'; } else if (EKRAN) EKRAN = ''; else return go(SKAD || 'dzis'); ANIM = true; render(); window.scrollTo(0, 0); };
  window.sosRanni = v => { RANNI = v; render(); };

  const tel = (nr, tekst, kl) => '<a class="btn ' + (kl || '') + '" href="tel:' + esc(String(nr).replace(/[^\d+]/g, '')) + '">' + I('phone', 1) + ' ' + esc(tekst) + '</a>';
  const kroki = lista => '<ol class="kroki">' + lista.map(k => '<li>' + k + '</li>').join('') + '</ol>';
  const TROJKAT = 'Не можешь убрать машину — <b>аварийка</b> и <b>треугольник</b>: на автостраде и экспресс-дороге — 100 м сзади; вне населённого пункта — 30–50 м; в населённом пункте — сразу за машиной или на ней (не выше 1 м).';

  function kartyAut() {
    const auta = D.auta || [];
    if (!auta.length) return '<div class="card"><div class="mute">Полисы машин не заполнены. ' + (D.ja.rola === 'rodzic' ? 'Ещё → Настройки → Машины.' : '') + '</div></div>';
    return auta.map(a => '<div class="card"><h3>' + znaczekAuta(a) + esc(a.nazwa) + (a.nr_rej ? ' <span class="mute">' + esc(a.nr_rej) + '</span>' : '') + '</h3>' +
      '<div class="t">' + esc([a.ubezpieczyciel, a.polisa ? 'полис ' + a.polisa : ''].filter(Boolean).join(' · ') || 'страховая не указана') + '</div>' +
      (a.polisa_do ? '<div class="mute">действует до ' + esc(dataPl(a.polisa_do)) + '</div>' : '') + (a.ac ? '<div class="mute">' + esc(a.ac) + '</div>' : '') +
      ((a.tel_szkody || a.tel_assistance) ? '<div class="dwa" style="margin-top:10px">' + (a.tel_szkody ? tel(a.tel_szkody, 'Страховая') : '<span></span>') + (a.tel_assistance ? tel(a.tel_assistance, 'Assistance', 'btn-j') : '') + '</div>' : '') +
      '</div>').join('');
  }
  function dokSos(filtr, tytul) {
    const l = (D.dokumenty || []).filter(filtr);
    if (!l.length) return '';
    return '<div class="card"><h3>' + I('shield', 1) + esc(tytul) + '</h3>' + l.map(d => '<div class="row w" onclick="dokPokaz(\'' + jsq(d.id) + '\')"><div class="av dk">' + I(ikonaKat(d.kategoria), 1) + '</div><div class="g"><div class="t">' + esc(d.tytul) + '</div><div class="mute">' +
      esc(d.wlasciciel === 'rodzina' ? 'семья' : imie(d.wlasciciel)) + '</div></div>' + dokTermin(d) + '</div>').join('') + '</div>';
  }

  window.wSos = function () {
    let h = '<div class="phead"><button class="ib" onclick="sosWstecz()" aria-label="Назад">' + I('back') + '</button><div><b class="kr">' + ({ '': 'SOS', dtp: 'ДТП, авария', pozar: 'Пожар', zdrowie: 'Плохо со здоровьем', awaria: 'Поломка в дороге', osw: 'Бланк ДТП' })[EKRAN] + '</b><span>' +
      (EKRAN === 'osw' ? 'Oświadczenie sprawcy kolizji — сохраняется само' : 'спокойно, по шагам') + '</span></div></div>';
    if (EKRAN === 'osw') return h + wOsw();
    h += '<a class="btn czerw szer s112" href="tel:112">' + I('phone') + ' 112</a>';
    if (!EKRAN) {
      h += '<div class="mute" style="margin:-6px 4px 14px;text-align:center">Скорая, полиция, пожарные — один номер, по-английски тоже поймут</div>';
      if (D.adresDomu) h += '<div class="card"><h3>' + I('pin', 1) + 'Наш адрес</h3><div class="t" style="font-size:20px;font-weight:600">' + esc(D.adresDomu) + '</div></div>';
      const tl = (D.telefony || []).filter(t => t.id !== D.ja.id);
      if (tl.length) h += '<div class="card"><h3>' + I('user', 1) + 'Позвонить своим</h3><div class="chips">' + tl.map(t => tel(t.telefon, t.imie, 'btn-j')).join('') + '</div></div>';
      h += '<div class="more sos">' + [['dtp', 'car', 'ДТП, авария', 'что делать и бланк'], ['pozar', 'fire', 'Пожар', 'выйти и вызвать'], ['zdrowie', 'heart', 'Здоровье', 'плохо, травма'], ['awaria', 'tool', 'Поломка', 'встал в дороге']]
        .map(([e, ic, t, s]) => '<button onclick="sosEkran(\'' + e + '\')"><div class="ch">' + I(ic) + '</div><div><b>' + t + '</b><span>' + s + '</span></div></button>').join('') + '</div>';
      h += '<div class="dzien">Документы под рукой</div>' + kartyAut() + dokSos(d => d.sos, 'Документы SOS (есть в телефоне)');
      h += '<button class="btn2 szer" onclick="oswPusty()">' + I('note', 1) + 'Пустой бланк ДТП — распечатать и возить в машине</button>';
      setTimeout(dokSosSync, 400);
      return h;
    }
    if (EKRAN === 'dtp') {
      h += '<div class="card"><h3>' + I('alert', 1) + 'Есть пострадавшие?</h3><div class="dwa"><button class="btn' + (RANNI === 'tak' ? ' czerw' : '') + '" onclick="sosRanni(\'tak\')">Да</button><button class="btn' + (RANNI === 'nie' ? '' : ' btn-j') + '" onclick="sosRanni(\'nie\')">Нет</button></div></div>';
      if (RANNI === 'tak') h += '<div class="card">' + kroki([
        '<b>Звони 112.</b> Скажи: где (улица или трасса, километр, направление), сколько пострадавших, дышат ли, в сознании ли.',
        'Включи <b>аварийку</b>, надень жилет, поставь <b>треугольник</b> — только если это безопасно.',
        'Пострадавших <b>не двигай</b>, если нет угрозы огня или наезда. Не клади трубку — диспетчер скажет, что делать.',
        'Машины <b>не убирай</b> и не уезжай — ждите полицию и скорую.',
        'Когда всё под контролем: сфотографируй место, машины, номера; запиши свидетелей.']) + '</div>';
      if (RANNI === 'nie') h += '<div class="card">' + kroki([
        '<b>Аварийка</b>, жилет. Машины на ходу — <b>убери их с проезжей части</b>, когда нет пострадавших, это обязанность.',
        TROJKAT,
        '<b>Фото:</b> общий план, обе машины с номерами, все повреждения близко, как стоят машины, знаки и разметка.',
        'Проверь у второго водителя <b>права</b>, <b>dowód rejestracyjny</b> и <b>полис OC</b> — и сфотографируй (кнопка в бланке).',
        'Договорились, кто виноват — <b>заполните бланк</b> и подпишите оба. Без подписей обоих бланк ничего не стоит.',
        'Вызывай <b>полицию (112)</b>, если: спорите о вине, у виновника нет документов или OC, похоже на алкоголь или наркотики.',
        'Дальше: виноват другой — ущерб заявляешь в <b>его</b> страховую по его полису OC. Виноват ты — сообщи <b>своей</b> страховой.']) +
        '<button class="btn szer" style="margin:6px 0 0" onclick="sosEkran(\'osw\')">' + I('pen', 1) + ' Заполнить бланк ДТП</button></div>';
      return h + '<div class="dzien">Наши полисы</div>' + kartyAut() + dokSos(d => d.kategoria === 'auto' || d.kategoria === 'ubezp', 'Документы машин и страховки');
    }
    if (EKRAN === 'pozar') return h + '<div class="card">' + kroki([
      '<b>112:</b> что горит, точный адрес, есть ли люди внутри.',
      'Выводи всех. Вещи не собирай. <b>Пригнись</b> — дым и жар наверху.',
      'Закрывай за собой двери (не на ключ). <b>Лифтом не пользуйся.</b>',
      'Выход отрезан дымом — оставайся в комнате, закрой дверь, щели заткни мокрой тканью, подай знак из окна и скажи 112, где вы.',
      '<b>Не возвращайся</b> внутрь, даже за документами или котом — пожарные вынесут.',
      'Потом — страховка жилья и документы: они ниже и в «Документах».']) + '</div>' + dokSos(d => d.kategoria === 'dom' || (d.kategoria === 'ubezp' && !d.auto), 'Дом и страховки');
    if (EKRAN === 'zdrowie') return h + '<div class="card">' + kroki([
      '<b>Сразу 112</b>, если: не дышит или дышит странно, без сознания, боль в груди, перекосило лицо / слабость руки / странная речь, сильное кровотечение, тяжёлая травма.',
      'Скажи: адрес, что случилось, возраст, в сознании ли, дышит ли. <b>Не клади трубку</b> — диспетчер подскажет.',
      'Не дышит — диспетчер научит массажу сердца: сильно и быстро в центр груди, 100–120 нажатий в минуту, не останавливайся до приезда скорой.',
      'Открой дверь, встреть скорую, приготовь документы и список лекарств — медицинские документы ниже.',
      'Не срочно, но ночью или в выходные — дежурная помощь <b>nocna i świąteczna opieka</b>. Где ближайшая, подскажет круглосуточная линия NFZ.']) +
      '<div class="dwa" style="margin-top:6px">' + tel('800190590', 'NFZ 800 190 590', 'btn-j') + '<span></span></div></div>' +
      dokSos(d => d.kategoria === 'med', 'Медицинские документы');
    if (EKRAN === 'awaria') return h + '<div class="card">' + kroki([
      '<b>Аварийка</b>, съезжай как можно правее — на обочину или в карман.',
      'Жилет надень <b>до</b> выхода из машины. ' + TROJKAT,
      'На автостраде или экспресс-дороге все выходят на сторону от дороги и ждут <b>за отбойником</b>.',
      'Звони <b>assistance</b> со своего полиса — эвакуатор, колесо, подвоз топлива. Номер ниже.']) + '</div>' + kartyAut();
    return h;
  };

  /* ---------- Oświadczenie sprawcy kolizji ---------- */
  const CZESCI = [['zderzak_p', 'Передний бампер', 'Zderzak przedni'], ['zderzak_t', 'Задний бампер', 'Zderzak tylny'], ['maska', 'Капот', 'Maska'], ['klapa', 'Крышка багажника', 'Klapa bagażnika'],
    ['blotnik_pl', 'Крыло переднее левое', 'Błotnik przedni lewy'], ['blotnik_pp', 'Крыло переднее правое', 'Błotnik przedni prawy'], ['blotnik_tl', 'Крыло заднее левое', 'Błotnik tylny lewy'], ['blotnik_tp', 'Крыло заднее правое', 'Błotnik tylny prawy'],
    ['drzwi_pl', 'Дверь передняя левая', 'Drzwi przednie lewe'], ['drzwi_pp', 'Дверь передняя правая', 'Drzwi przednie prawe'], ['drzwi_tl', 'Дверь задняя левая', 'Drzwi tylne lewe'], ['drzwi_tp', 'Дверь задняя правая', 'Drzwi tylne prawe'],
    ['lusterko_l', 'Зеркало левое', 'Lusterko lewe'], ['lusterko_p', 'Зеркало правое', 'Lusterko prawe'], ['reflektor_l', 'Фара левая', 'Reflektor lewy'], ['reflektor_p', 'Фара правая', 'Reflektor prawy'],
    ['lampa_l', 'Задний фонарь левый', 'Lampa tylna lewa'], ['lampa_p', 'Задний фонарь правый', 'Lampa tylna prawa'], ['szyba_p', 'Лобовое стекло', 'Szyba przednia'], ['szyba_t', 'Заднее стекло', 'Szyba tylna'],
    ['szyba_b', 'Боковое стекло', 'Szyba boczna'], ['prog_l', 'Порог левый', 'Próg lewy'], ['prog_p', 'Порог правый', 'Próg prawy'], ['kolo', 'Колесо, диск, шина', 'Koło (felga, opona)'],
    ['dach', 'Крыша', 'Dach'], ['tablica', 'Номерной знак', 'Tablica rejestracyjna'], ['zawieszenie', 'Подвеска', 'Zawieszenie'], ['chlodnica', 'Радиатор', 'Chłodnica'], ['inne', 'Другое', 'Inne']];
  const POLA_STRONY = [['kierowca', 'Водитель: имя и фамилия', 'Imię i nazwisko kierującego'], ['adres', 'Адрес', 'Adres'], ['telefon', 'Телефон', 'Telefon', 'tel'],
    ['prawo_jazdy', 'Права: номер и категория', 'Nr i kategoria prawa jazdy'], ['marka', 'Машина: марка, модель', 'Marka i model pojazdu'], ['nr_rej', 'Номер машины', 'Nr rejestracyjny'],
    ['wlasciciel', 'Владелец машины, если не водитель', 'Właściciel pojazdu (jeśli inny)'], ['ubezpieczyciel', 'Страховая (OC)', 'Ubezpieczyciel OC'], ['polisa', 'Номер полиса OC', 'Nr polisy OC'],
    ['polisa_do', 'Полис действует до', 'Polisa ważna do', 'date']];
  const teraz = () => { const d = new Date(); return { data: isoD(d), godz: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }; };
  function nowyOsw() { const t = teraz(); return { data: t.data, godz: t.godz, miejsce: '', opis: '', swiadkowie: '', wina: 'oni', my: {}, oni: {}, usz_my: [], usz_oni: [], usz_my_opis: '', usz_oni_opis: '', auto: '' }; }
  async function oswStart() {
    OSW = LSo.get() || nowyOsw();
    if (!OSW.my.kierowca && D.moje) { OSW.my.kierowca = D.moje.nazwisko; OSW.my.adres = D.moje.adres; OSW.my.telefon = D.moje.telefon; OSW.my.prawo_jazdy = D.moje.prawo_jazdy; }
    if (!OSW.auto && (D.auta || []).length === 1) oswAuto(D.auta[0].id, true);
    MEDIA = (await Schowek.get('osw_media')) || { zdjecia: [], podpis_s: '', podpis_p: '' };
    LSo.set(OSW); render();
  }
  const zapiszMedia = () => Schowek.put('osw_media', MEDIA);
  window.oswPole = (k, v) => { if (!OSW) return; const s = k.split('.'); if (s.length === 2) OSW[s[0]][s[1]] = v; else OSW[k] = v; LSo.set(OSW); };
  window.oswWina = v => { OSW.wina = v; LSo.set(OSW); render(); };
  window.oswAuto = (id, cicho) => {
    const a = (D.auta || []).find(x => x.id === id); OSW.auto = id;
    if (a) Object.assign(OSW.my, { marka: a.marka || a.nazwa, nr_rej: a.nr_rej, ubezpieczyciel: a.ubezpieczyciel, polisa: a.polisa, polisa_do: a.polisa_do });
    LSo.set(OSW); if (!cicho) render();
  };
  window.oswCzesc = (strona, k) => { const l = OSW['usz_' + strona], i = l.indexOf(k); if (i >= 0) l.splice(i, 1); else l.push(k); LSo.set(OSW); render(); };
  window.oswGps = () => {
    if (!navigator.geolocation) return toast('Телефон не даёт местоположение');
    toast('Ищу, где я…');
    navigator.geolocation.getCurrentPosition(p => {
      const g = 'GPS ' + p.coords.latitude.toFixed(5) + ', ' + p.coords.longitude.toFixed(5);
      OSW.miejsce = (OSW.miejsce ? OSW.miejsce.replace(/\s*GPS [\d., -]+$/, '') + ', ' : '') + g; LSo.set(OSW); render();
    }, () => toast('Не получилось — впиши место словами'), { enableHighAccuracy: true, timeout: 15000 });
  };
  window.oswFoto = async (inp, jakDok) => {
    const fs = Array.from(inp.files || []); inp.value = '';
    for (const f of fs) {
      try {
        let z = await zdjecieB64(f, 1600);
        if (jakDok && window.skanDokument) { toast('Выравниваю документ…'); try { const s = await skanDokument(z.b64); const wh = await wymiaryJpeg(s.b64); z = { b64: s.b64, w: wh[0], h: wh[1] }; } catch (e) {} }
        MEDIA.zdjecia.push(Object.assign(z, { opis: jakDok ? 'dokument' : 'miejsce' }));
      } catch (e) { toast(e.message); }
    }
    await zapiszMedia(); render();
  };
  window.oswFotoUsun = async i => { MEDIA.zdjecia.splice(i, 1); await zapiszMedia(); render(); };

  function poleIn(k, etyk, pl, typ, wart) {
    return '<label class="lb">' + esc(etyk) + ' <span class="mute pl">' + esc(pl) + '</span></label><input class="as-in"' + (typ ? ' type="' + typ + '"' : '') + ' value="' + esc(wart || '') + '" oninput="oswPole(\'' + k + '\',this.value)">';
  }
  function czesci(strona) {
    const w = OSW['usz_' + strona];
    return '<div class="chips">' + CZESCI.map(([k, ru]) => '<button type="button" class="chip' + (w.indexOf(k) >= 0 ? ' on' : '') + '" onclick="oswCzesc(\'' + strona + '\',\'' + k + '\')">' + esc(ru) + '</button>').join('') + '</div>';
  }
  function wOsw() {
    if (!OSW || !MEDIA) return '<div class="empty">Открываю бланк…</div>';
    const o = OSW, my = o.wina === 'my';
    const strona = (s, tytul) => '<div class="card"><h3>' + I(s === 'my' ? 'user' : 'car', 1) + tytul + '</h3>' +
      (s === 'my' && (D.auta || []).length ? '<label class="lb">Наша машина</label><div class="chips">' + D.auta.map(a => '<button type="button" class="chip' + (o.auto === a.id ? ' on' : '') + '" onclick="oswAuto(\'' + jsq(a.id) + '\')">' + esc(a.nazwa) + '</button>').join('') + '</div>' : '') +
      (s === 'oni' ? '<label class="btn2 szer" style="margin:4px 0 6px"><input type="file" accept="image/*" capture="environment" hidden onchange="oswFoto(this,1)">' + I('camera', 1) + 'Сфотографировать его права, техпаспорт, полис</label>' : '') +
      POLA_STRONY.map(([k, ru, pl, typ]) => poleIn(s + '.' + k, ru, pl, typ, o[s][k])).join('') + '</div>';
    let h = '<div class="card"><h3>' + I('alert', 1) + 'Кто виноват</h3><div class="seg" style="margin:0"><button class="' + (!my ? 'on' : '') + '" onclick="oswWina(\'oni\')">Другой водитель</button><button class="' + (my ? 'on' : '') + '" onclick="oswWina(\'my\')">Мы (наш водитель)</button></div>' +
      '<div class="mute" style="margin-top:8px">Бланк подписывает виновник (sprawca). Если о вине спорите — звоните в полицию, бланк не нужен.</div></div>';
    h += '<div class="card"><h3>' + I('cal', 1) + 'Когда и где</h3><div class="dwa"><div>' + poleIn('data', 'Дата', 'Data', 'date', o.data) + '</div><div>' + poleIn('godz', 'Время', 'Godzina', 'time', o.godz) + '</div></div>' +
      poleIn('miejsce', 'Место: город, улица, перекрёсток', 'Miejsce zdarzenia', '', o.miejsce) + '<button class="btn2" style="margin-top:8px" onclick="oswGps()">' + I('pin', 1) + 'Добавить GPS</button>' +
      '<label class="lb">Как это случилось <span class="mute pl">Okoliczności — можно по-польски</span></label><textarea class="as-in" rows="3" oninput="oswPole(\'opis\',this.value)" placeholder="np. Sprawca cofając z miejsca parkingowego uderzył w lewe tylne drzwi…">' + esc(o.opis) + '</textarea>' +
      poleIn('swiadkowie', 'Свидетели: имя, телефон', 'Świadkowie', '', o.swiadkowie) + '</div>';
    h += strona('my', 'Мы ' + (my ? '— виновник' : '— пострадавшие')) + strona('oni', 'Второй водитель ' + (my ? '— пострадавший' : '— виновник'));
    h += '<div class="card"><h3>' + I('car', 1) + 'Повреждения нашей машины</h3>' + czesci('my') +
      '<textarea class="as-in" rows="2" style="margin-top:10px" oninput="oswPole(\'usz_my_opis\',this.value)" placeholder="подробно: вмятина, царапина, разбито…">' + esc(o.usz_my_opis) + '</textarea></div>';
    h += '<div class="card"><h3>' + I('car', 1) + 'Повреждения его машины</h3>' + czesci('oni') +
      '<textarea class="as-in" rows="2" style="margin-top:10px" oninput="oswPole(\'usz_oni_opis\',this.value)" placeholder="подробно">' + esc(o.usz_oni_opis) + '</textarea></div>';
    h += '<div class="card"><h3>' + I('camera', 1) + 'Фото <span class="mute">' + MEDIA.zdjecia.length + '</span></h3>' +
      (MEDIA.zdjecia.length ? '<div class="wy-st">' + MEDIA.zdjecia.map((z, i) => '<div><img src="data:image/jpeg;base64,' + z.b64 + '" alt=""><button class="ib" aria-label="Убрать" onclick="oswFotoUsun(' + i + ')">' + I('trash', 1) + '</button><span>' + (i + 1) + '</span></div>').join('') + '</div>' : '') +
      '<label class="btn2 szer" style="margin:8px 0 0"><input type="file" accept="image/*" capture="environment" multiple hidden onchange="oswFoto(this,0)">' + I('camera', 1) + 'Место, машины, повреждения</label></div>';
    const sp = my ? 'наш водитель' : 'второй водитель', po = my ? 'второй водитель' : 'наш водитель';
    h += '<div class="card"><h3>' + I('pen', 1) + 'Подписи</h3><div class="dwa">' +
      '<button class="podp" onclick="oswPodpis(\'s\')">' + (MEDIA.podpis_s ? '<img src="' + MEDIA.podpis_s + '" alt="">' : I('pen')) + '<span>Виновник<br><small>' + sp + '</small></span></button>' +
      '<button class="podp" onclick="oswPodpis(\'p\')">' + (MEDIA.podpis_p ? '<img src="' + MEDIA.podpis_p + '" alt="">' : I('pen')) + '<span>Пострадавший<br><small>' + po + '</small></span></button></div>' +
      '<div class="mute" style="margin-top:8px">Пальцем на экране — на случай, если нет ручки. Есть бумага — лучше распечатать или переписать и подписать ручкой.</div></div>';
    h += '<button class="btn szer" onclick="oswPdf()">' + I('note', 1) + ' Готово — сделать PDF</button>' +
      '<div class="dwa"><button class="btn2" onclick="oswPusty()">' + I('download', 1) + 'Пустой бланк</button><button class="btn2" onclick="oswNowyPytaj()">' + I('trash', 1) + 'Новый бланк</button></div>';
    return h;
  }
  window.oswNowyPytaj = () => ark('<h4>Начать новый бланк?</h4><div class="mute" style="margin-bottom:14px">Всё, что заполнено, фото и подписи сотрутся. Готовый PDF, если сохранял, останется в «Документах».</div>' +
    '<div class="ab"><button class="btn czerw" onclick="oswNowy()">' + I('trash', 1) + ' Очистить</button><button class="btn2" onclick="arkZamknij()">Отмена</button></div>');
  window.oswNowy = async () => { arkZamknij(); LSo.set(null); try { localStorage.removeItem('rodzina.osw'); } catch (e) {} await Schowek.del('osw_media'); OSW = null; MEDIA = null; oswStart(); };

  // podpis palcem: płótno w arkuszu (touch-action:none — rysowanie nie przewija strony)
  window.oswPodpis = kto => {
    ark('<h4>' + (kto === 's' ? 'Подпись виновника' : 'Подпись пострадавшего') + '</h4><div class="mute" style="margin-bottom:8px">Распишись пальцем в рамке</div>' +
      '<canvas id="podpC" class="podpC" width="900" height="360"></canvas>' +
      '<div class="ab"><button class="btn" onclick="oswPodpisOk(\'' + kto + '\')">' + I('check', 1) + ' Готово</button><button class="btn2" onclick="oswPodpisCzysc()">Стереть</button><button class="btn2" onclick="arkZamknij()">Отмена</button></div>');
    const c = document.getElementById('podpC'), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#0a1f7a';
    let rys = false; c.dataset.pusty = '1';
    const pt = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
    c.addEventListener('pointerdown', e => { rys = true; c.setPointerCapture(e.pointerId); const p = pt(e); x.beginPath(); x.moveTo(p[0], p[1]); e.preventDefault(); });
    c.addEventListener('pointermove', e => { if (!rys) return; const p = pt(e); x.lineTo(p[0], p[1]); x.stroke(); c.dataset.pusty = ''; e.preventDefault(); });
    ['pointerup', 'pointercancel'].forEach(t => c.addEventListener(t, () => { rys = false; }));
  };
  window.oswPodpisCzysc = () => { const c = document.getElementById('podpC'), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); c.dataset.pusty = '1'; };
  window.oswPodpisOk = async kto => {
    const c = document.getElementById('podpC'); if (!c) return;
    if (c.dataset.pusty) return toast('Подписи нет');
    MEDIA['podpis_' + kto] = c.toDataURL('image/png'); await zapiszMedia(); arkZamknij();
  };

  const obraz = src => new Promise(ok => { if (!src) return ok(null); const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); ok(c); }; im.onerror = () => ok(null); im.src = src; });
  // rysuje oświadczenie; pusty = blankiet bez danych
  async function rysuj(o, media, pusty) {
    const k = new Kartka('Oświadczenie sprawcy kolizji drogowej');
    const my = o.wina === 'my', S = my ? o.my : o.oni, P = my ? o.oni : o.my, uS = my ? o.usz_my : o.usz_oni, uP = my ? o.usz_oni : o.usz_my;
    const uSo = my ? o.usz_my_opis : o.usz_oni_opis, uPo = my ? o.usz_oni_opis : o.usz_my_opis, v = x => pusty ? '' : (x || '');
    k.y += 10; k.tekst('OŚWIADCZENIE SPRAWCY KOLIZJI DROGOWEJ', { roz: 36, gruby: true, srodek: true, odstep: 2 });
    k.tekst('sporządzone na miejscu zdarzenia', { roz: 22, kolor: '#555', srodek: true, odstep: 18 });
    k.naglowek('1. Zdarzenie');
    k.para(['Data zdarzenia', pusty ? '' : dataPl(o.data)], ['Godzina', v(o.godz)]);
    k.pole('Miejsce zdarzenia (miejscowość, ulica, skrzyżowanie)', v(o.miejsce));
    const strona = (tyt, X) => {
      k.naglowek(tyt);
      k.pole('Imię i nazwisko kierującego', v(X.kierowca));
      k.pole('Adres', v(X.adres));
      k.para(['Telefon', v(X.telefon)], ['Nr i kategoria prawa jazdy', v(X.prawo_jazdy)]);
      k.para(['Marka i model pojazdu', v(X.marka)], ['Nr rejestracyjny', v(X.nr_rej)]);
      k.pole('Właściciel pojazdu (jeśli inny niż kierujący)', pusty ? '' : (X.wlasciciel || (X.kierowca ? '— kierujący —' : '')));
      k.para(['Ubezpieczyciel OC', v(X.ubezpieczyciel)], ['Nr polisy OC', v(X.polisa)]);
      k.para(['Polisa OC ważna do', pusty ? '' : dataPl(X.polisa_do)], null);
    };
    strona('2. Sprawca kolizji', S);
    strona('3. Poszkodowany', P);
    k.naglowek('4. Okoliczności zdarzenia');
    k.pole('Opis przebiegu zdarzenia', v(o.opis), 4);
    k.naglowek('5. Uszkodzenia pojazdu poszkodowanego');
    k.kratki(CZESCI.map(c => [c[0], c[2]]), pusty ? [] : uP);
    k.pole('Opis uszkodzeń', v(uPo), 3);
    k.naglowek('6. Uszkodzenia pojazdu sprawcy');
    k.kratki(CZESCI.map(c => [c[0], c[2]]), pusty ? [] : uS);
    k.pole('Opis uszkodzeń', v(uSo), 2);
    k.naglowek('7. Świadkowie');
    k.pole('Imię, nazwisko, telefon', v(o.swiadkowie), 2);
    k.naglowek('8. Oświadczenie');
    k.tekst('Ja, niżej podpisany/a ' + (v(S.kierowca) || '……………………………………………………') + ', oświadczam, że jestem sprawcą opisanej wyżej kolizji drogowej i przyznaję się do winy. ' +
      'Oświadczam, że w chwili zdarzenia byłem/am trzeźwy/a i nie znajdowałem/am się pod wpływem środków odurzających. Dane podane w oświadczeniu są zgodne z prawdą.', { roz: 24, odstep: 16 });
    k.podpisy([['Czytelny podpis sprawcy', pusty ? null : await obraz(media.podpis_s)], ['Czytelny podpis poszkodowanego', pusty ? null : await obraz(media.podpis_p)]]);
    if (!pusty && media.zdjecia.length) k.tekst('Załączniki: zdjęcia z miejsca zdarzenia i dokumentów — ' + media.zdjecia.length + ' szt. (kolejne strony).', { roz: 21, kolor: '#555' });
    if (!pusty && media.podpis_s) k.tekst('Podpisy złożone na ekranie telefonu.', { roz: 19, kolor: '#888' });
    const strony = k.strony_();
    if (!pusty) media.zdjecia.forEach(z => strony.push({ b64: z.b64, w: z.w, h: z.h }));
    return strony;
  }
  window.oswPusty = async () => {
    toast('Готовлю бланк…');
    const s = await rysuj(nowyOsw(), { zdjecia: [] }, true);
    await udostepnijPlik(pdfZJpeg(s), 'application/pdf', 'Oswiadczenie_sprawcy_kolizji_blankiet.pdf', 'Бланк ДТП');
  };
  window.oswPdf = async () => {
    const o = OSW, S = o.wina === 'my' ? o.my : o.oni;
    const brak = [];
    if (!S.kierowca) brak.push('имя виновника'); if (!S.nr_rej) brak.push('номер машины виновника'); if (!S.polisa) brak.push('полис OC виновника');
    if (!MEDIA.podpis_s || !MEDIA.podpis_p) brak.push('подписи обоих');
    ark('<h4>Делаю PDF…</h4><div class="empty mala">' + I('note') + '</div>');
    const pdf = pdfZJpeg(await rysuj(o, MEDIA, false));
    const nr = (S.nr_rej || '').replace(/\s+/g, ''), nazwa = 'Oswiadczenie_kolizja_' + o.data + (nr ? '_' + nr : '') + '.pdf';
    OSW.pdf = { nazwa: nazwa, czas: Date.now() }; LSo.set(OSW);
    await Schowek.put('osw_pdf', { b64: pdf, nazwa: nazwa });
    ark('<h4>' + I('check', 1) + ' PDF готов</h4>' + (brak.length ? '<div class="kr" style="margin-bottom:10px">Не хватает: ' + esc(brak.join(', ')) + '. Можно вернуться и дописать.</div>' : '') +
      '<div class="mute" style="margin-bottom:12px">Отправь копию второму водителю прямо сейчас (WhatsApp, почта) — пусть у обоих будет одинаковый документ.</div>' +
      '<div class="dwa"><button class="btn" onclick="oswUdostepnij()">' + I('share', 1) + ' Поделиться</button><button class="btn2" onclick="oswPobierz()">' + I('download', 1) + 'В телефон</button></div>' +
      '<button class="btn2 szer" style="margin-top:10px" id="oswDok" onclick="oswDoDokumentow()">' + I('upload', 1) + 'Сохранить в «Документы»</button>' +
      '<div class="ab"><button class="btn2" onclick="arkZamknij()">Закрыть</button></div>');
  };
  window.oswUdostepnij = async () => { const p = await Schowek.get('osw_pdf'); if (p) udostepnijPlik(p.b64, 'application/pdf', p.nazwa, 'Oświadczenie o kolizji'); };
  window.oswPobierz = async () => { const p = await Schowek.get('osw_pdf'); if (p) pobierzPlik(p.b64, 'application/pdf', p.nazwa); };
  window.oswDoDokumentow = async () => {
    const p = await Schowek.get('osw_pdf'), b = document.getElementById('oswDok'); if (!p) return;
    if (b) { b.disabled = true; b.textContent = 'Отправляю…'; }
    try {
      const o = OSW, S = o.wina === 'my' ? o.my : o.oni, id = (o.pdf && o.pdf.id) || nowyId(); o.pdf.id = id; LSo.set(o);
      const w = await apiPost('dokZapisz', { id: id, b64: p.b64, mime: 'application/pdf', tytul: 'ДТП ' + dataPl(o.data) + (S.nr_rej ? ' · ' + S.nr_rej : ''), kategoria: 'auto',
        wlasciciel: D.ja.id, auto: o.auto || '', widocznosc: 'rodzice', sos: 0, wazny_do: '', notatka: o.wina === 'my' ? 'Виноваты мы' : 'Виноват другой водитель' });
      if (w && w.ja) przyjmij(w);
      if (b) b.textContent = 'Сохранено в «Документы» → Авто';
    } catch (e) { toast(e.message); if (b) { b.disabled = false; b.innerHTML = I('upload', 1) + 'Повторить сохранение'; } }
  };
})();
