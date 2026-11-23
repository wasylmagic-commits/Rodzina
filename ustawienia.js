/* ustawienia.js — Rodzina 0.3 (23.11.2026)
 * Wygląd (kolor akcentu, jasny/ciemny, własne zdjęcie w tle) — zapisywany w TYM telefonie, każdy ustawia sobie sam.
 * Ekran „Настройки”: wygląd, moje dane (do SOS i oświadczenia o kolizji), ustawienia rodziny (administrator), auta (rodzice).
 * Ładowany w <head>, żeby kolor był od razu (bez mignięcia fioletem).
 */
(function () {
  const LSk = (k, v) => { try { if (v === undefined) return localStorage.getItem('rodzina.' + k) || ''; localStorage.setItem('rodzina.' + k, v); } catch (e) { return ''; } };
  // [klucz, nazwa, akcent jasny, akcent ciemny, gradient]
  const KOLORY = [
    ['fiolet', 'Фиолетовый', '#6e4ff6', '#a08bff', '#7b61ff,#9b5cf6,#c94cf0'],
    ['niebieski', 'Синий', '#007aff', '#0a84ff', '#0a84ff,#3b82f6,#5e5ce6'],
    ['zielony', 'Зелёный', '#1f9d55', '#30d158', '#34c759,#1fae6b,#0f8f6e'],
    ['turkus', 'Бирюзовый', '#0e8f9c', '#40c8e0', '#30b0c7,#0e9aa7,#2b7fd9'],
    ['malina', 'Малиновый', '#d92f6a', '#ff6b9a', '#ff5e8e,#e0336e,#b02ad8'],
    ['pomarancz', 'Оранжевый', '#d9680a', '#ff9f0a', '#ffb340,#ff7a1a,#f04e3e'],
    ['grafit', 'Графит', '#4a5160', '#a7afbf', '#6b7280,#4a5160,#2f3542']
  ];
  const TRYBY = [['', 'Как в телефоне'], ['jasny', 'Светлая'], ['ciemny', 'Тёмная']];
  const PRZYCIEMNIENIE = [['lekko', 'Слабо', .3], ['srednio', 'Средне', .55], ['mocno', 'Сильно', .78]];
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; };
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;

  function zastosujWyglad() {
    const r = document.documentElement, tryb = LSk('tryb'), k = KOLORY.find(x => x[0] === LSk('kolor')) || KOLORY[0];
    if (tryb) r.setAttribute('data-t', tryb); else r.removeAttribute('data-t');
    const ciemny = tryb === 'ciemny' || (!tryb && mq && mq.matches), acc = ciemny ? k[3] : k[2], g = k[4].split(',');
    r.style.setProperty('--acc', acc);
    r.style.setProperty('--acc2', rgba(acc, ciemny ? .2 : .12));
    r.style.setProperty('--accg', 'linear-gradient(135deg,' + g[0] + ' 0%,' + g[1] + ' 55%,' + g[2] + ' 100%)');
    r.style.setProperty('--b1', rgba(g[0], ciemny ? .3 : .26));
    r.style.setProperty('--b2', rgba(g[2], ciemny ? .2 : .16));
    const m = document.querySelector('meta[name=theme-color]:not([media])') || (() => { const x = document.createElement('meta'); x.name = 'theme-color'; document.head.appendChild(x); return x; })();
    m.content = ciemny ? '#000000' : '#f2f2f7';
    const p = PRZYCIEMNIENIE.find(x => x[0] === LSk('tloPrz')) || PRZYCIEMNIENIE[1];
    r.style.setProperty('--tlo-prz', p[2]);
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', zastosujWyglad);
  zastosujWyglad();

  // tło: zdjęcie z galerii w IndexedDB (localStorage za mały na zdjęcie)
  async function zastosujTlo() {
    let el = document.getElementById('tloFoto');
    const t = window.Schowek ? await Schowek.get('tlo') : null;
    if (!t) { if (el) el.remove(); document.body.classList.remove('zfoto'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'tloFoto'; document.body.prepend(el); }
    el.style.backgroundImage = 'url(data:image/jpeg;base64,' + t + ')';
    document.body.classList.add('zfoto');
  }
  document.addEventListener('DOMContentLoaded', zastosujTlo);

  window.ustKolor = k => { LSk('kolor', k); zastosujWyglad(); render(); };
  window.ustTryb = t => { LSk('tryb', t); zastosujWyglad(); render(); };
  window.ustPrz = t => { LSk('tloPrz', t); zastosujWyglad(); render(); };
  window.ustTloPlik = async inp => {
    const f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
    try { const z = await zdjecieB64(f, 1600); await Schowek.put('tlo', z.b64); await zastosujTlo(); LSk('jestTlo', '1'); toast('Фон установлен'); render(); }
    catch (e) { toast(e.message); }
  };
  window.ustTloUsun = async () => { await Schowek.del('tlo'); LSk('jestTlo', ''); await zastosujTlo(); toast('Фон убран'); render(); };

  /* ---------- ekran „Настройки” ---------- */
  window.wUstawienia = function () {
    const kol = LSk('kolor') || 'fiolet', tryb = LSk('tryb'), prz = LSk('tloPrz') || 'srednio', jestTlo = !!LSk('jestTlo');
    let h = naglowek('Настройки', 'оформление — только на этом телефоне');
    h += '<div class="card"><h3>' + I('spark', 1) + 'Цвет</h3><div class="kolory">' + KOLORY.map(k =>
      '<button class="kol' + (k[0] === kol ? ' on' : '') + '" style="--k:' + k[2] + ';--kg:linear-gradient(135deg,' + k[4] + ')" onclick="ustKolor(\'' + k[0] + '\')" aria-label="' + k[1] + '"><i></i><span>' + k[1] + '</span></button>').join('') + '</div>' +
      '<label class="lb">Тема</label><div class="seg">' + TRYBY.map(t => '<button class="' + (t[0] === tryb ? 'on' : '') + '" onclick="ustTryb(\'' + t[0] + '\')">' + t[1] + '</button>').join('') + '</div>' +
      '<label class="lb">Фон — своя фотография</label><div class="chips">' +
      '<label class="btn2"><input type="file" accept="image/*" hidden onchange="ustTloPlik(this)">' + I('plus', 1) + (jestTlo ? 'Другое фото' : 'Выбрать фото') + '</label>' +
      (jestTlo ? '<button class="btn2" onclick="ustTloUsun()">' + I('x', 1) + 'Убрать</button>' : '') + '</div>' +
      (jestTlo ? '<label class="lb">Затемнение фото, чтобы текст читался</label><div class="seg">' + PRZYCIEMNIENIE.map(p => '<button class="' + (p[0] === prz ? 'on' : '') + '" onclick="ustPrz(\'' + p[0] + '\')">' + p[1] + '</button>').join('') + '</div>' : '') +
      '</div>';
    if (!D.moje) return h + '<div class="card"><div class="mute">Мои данные, машины и настройки семьи появятся после обновления сервера (Ещё → Обновление системы).</div></div>';
    const m = D.moje;
    h += '<div class="card"><h3>' + I('user', 1) + 'Мои данные</h3><div class="mute" style="margin-bottom:10px">Для SOS и бланка ДТП: подставятся сами, когда будет не до писанины. Телефон видит семья (кнопка «позвонить» в SOS).</div>' +
      '<label class="lb">Имя и фамилия (как в документах)</label><input id="mN" class="as-in" value="' + esc(m.nazwisko) + '" placeholder="например, Wasyl Tomczakowski">' +
      '<label class="lb">Телефон</label><input id="mT" class="as-in" type="tel" value="' + esc(m.telefon) + '" placeholder="+48 …">' +
      '<label class="lb">Адрес</label><input id="mA" class="as-in" value="' + esc(m.adres) + '" placeholder="ulica, nr, kod, miasto">' +
      '<label class="lb">Номер водительских прав (prawo jazdy)</label><input id="mP" class="as-in" value="' + esc(m.prawo_jazdy) + '" placeholder="номер и категория, необязательно">' +
      '<button class="btn szer" style="margin:14px 0 0" onclick="mojeZapisz()">' + I('check', 1) + ' Сохранить мои данные</button></div>';
    if (D.ustRodziny) {
      const u = D.ustRodziny, kj = String(u.kto_jedzie || '').split(','), lud = D.ludzie.map(o => [o.id, o.imie]);
      h += '<div class="card"><h3>' + I('home', 1) + 'Семья <span class="mute">меняет администратор</span></h3>' +
        '<label class="lb">Кто нажимает «Еду домой»</label>' + chipsy('uJ', lud, kj) +
        '<label class="lb">Кому приходит задание по кухне</label>' + chipsy('uK', [['', 'Никому']].concat(lud), [u.kuchnia_dla || ''], true) +
        '<label class="lb">Текст задания по кухне</label><textarea id="uT" class="as-in" rows="2">' + esc(u.kuchnia_tekst) + '</textarea>' +
        '<label class="lb">Адрес дома (покажу в SOS, чтобы продиктовать 112)</label><input id="uA" class="as-in" value="' + esc(u.adres_domu) + '" placeholder="ulica, nr, mieszkanie, miasto">' +
        '<button class="btn szer" style="margin:14px 0 0" onclick="rodzinaZapisz()">' + I('check', 1) + ' Сохранить</button></div>';
    }
    if (D.ja.rola === 'rodzic') {
      h += '<div class="card"><h3>' + I('car', 1) + 'Машины <span class="mute">полис и телефоны для SOS</span></h3>' +
        ((D.auta || []).length ? D.auta.map(a => '<div class="row w" onclick="formAuto(\'' + jsq(a.id) + '\')"><div class="av">' + I('car', 1) + '</div><div class="g"><b>' + esc(a.nazwa) + '</b><div class="mute">' +
          esc([a.nr_rej, a.ubezpieczyciel, a.polisa_do ? 'полис до ' + dataPl(a.polisa_do) : ''].filter(Boolean).join(' · ') || 'данные не заполнены') + '</div></div></div>').join('') : '<div class="empty mala">Машин пока нет</div>') +
        '<button class="btn2 szer" style="margin:10px 0 0" onclick="formAuto()">' + I('plus', 1) + 'Добавить машину</button></div>';
    }
    return h;
  };
  window.dataPl = s => s ? String(s).slice(8, 10) + '.' + String(s).slice(5, 7) + '.' + String(s).slice(0, 4) : '';
  window.mojeZapisz = () => {
    const v = id => document.getElementById(id).value.trim();
    const p = { nazwisko: v('mN'), telefon: v('mT'), adres: v('mA'), prawo_jazdy: v('mP') };
    zmiana('jaZmien', p, d => Object.assign(d.moje, p), 'Сохранено');
  };
  window.rodzinaZapisz = () => {
    const kj = chipsWartosc('uJ'), kk = (document.querySelector('#uK .chip.on') || {}).dataset;
    const p = { kto_jedzie: kj === 'wszyscy' ? '' : kj, kuchnia_dla: kk ? kk.v : '', kuchnia_tekst: document.getElementById('uT').value.trim(), adres_domu: document.getElementById('uA').value.trim() };
    zmiana('ustRodziny', p, d => { Object.assign(d.ustRodziny, p); d.adresDomu = p.adres_domu; d.jade = p.kto_jedzie.split(',').indexOf(d.ja.id) >= 0; }, 'Сохранено');
  };

  const POLA_AUTA = [['nazwa', 'Как называем', 'Fiesta, Мерседес…'], ['marka', 'Марка, модель, год, мотор', 'Ford Fiesta 1.3, 2004'], ['nr_rej', 'Номер (rejestracja)', 'PO 12345'],
    ['vin', 'VIN', 'необязательно'], ['ubezpieczyciel', 'Страховая (OC)', 'PZU, Warta, Link4…'], ['polisa', 'Номер полиса OC', ''], ['polisa_do', 'Полис действует до', '', 'date'],
    ['tel_szkody', 'Телефон страховой (заявить ущерб)', '', 'tel'], ['tel_assistance', 'Телефон assistance (эвакуатор, помощь)', '', 'tel'], ['ac', 'AC / доп. страховки', 'например: AC в PZU, полис 123…'],
    ['notatka', 'Заметка', 'масло, шины, что угодно']];
  window.formAuto = id => {
    const a = (D.auta || []).find(x => x.id === id) || {};
    ark('<h4>' + (a.id ? esc(a.nazwa) : 'Новая машина') + '</h4>' + POLA_AUTA.map(([k, t, ph, typ]) =>
      '<label>' + t + '</label><input id="au_' + k + '" class="as-in"' + (typ ? ' type="' + typ + '"' : '') + ' value="' + esc(a[k] || '') + '" placeholder="' + esc(ph) + '">').join('') +
      '<div class="ab"><button class="btn" onclick="autoZapisz(\'' + jsq(a.id || '') + '\')">' + I('check', 1) + ' Сохранить</button>' +
      (a.id ? '<button class="btn2" onclick="autoUsunPytaj(\'' + jsq(a.id) + '\')">' + I('trash', 1) + 'Удалить</button>' : '<button class="btn2" onclick="arkZamknij()">Отмена</button>') + '</div>');
  };
  window.autoZapisz = id => {
    const p = { id: id || nowyId() }; POLA_AUTA.forEach(([k]) => p[k] = document.getElementById('au_' + k).value.trim());
    if (!p.nazwa) return toast('Нужно название');
    arkZamknij();
    zmiana('autoZapisz', p, d => { d.auta = d.auta || []; const o = d.auta.find(x => x.id === p.id); if (o) Object.assign(o, p); else d.auta.push(p); }, 'Сохранено');
  };
  window.autoUsun = id => { arkZamknij(); zmiana('autoUsun', { id: id }, d => d.auta = d.auta.filter(x => x.id !== id), 'Удалено'); };
  window.autoUsunPytaj = id => {
    const a = (D.auta || []).find(x => x.id === id); if (!a) return;
    ark('<h4>Удалить «' + esc(a.nazwa) + '»?</h4><div class="mute" style="margin-bottom:14px">Документы машины останутся в «Документах».</div><div class="ab"><button class="btn czerw" onclick="autoUsun(\'' + jsq(id) + '\')">' + I('trash', 1) + ' Удалить</button><button class="btn2" onclick="formAuto(\'' + jsq(id) + '\')">Назад</button></div>');
  };
})();
