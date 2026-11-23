/* droga.js — Rodzina 0.7 (23.11.2026)
 * „Дорога”: большие кнопки мест (дом, работа, магазин…) — одно нажатие открывает Google Maps уже с готовым маршрутом, без поиска и ввода адреса.
 * „Не знаю, куда идти”: отправляет родителям точку на карте (пуш) и сразу показывает кнопки маршрута и звонка.
 * Места хранятся на сервере (лист Miejsca): свои или общие; родители могут задавать места другим.
 */
(function () {
  const TRYBY = [['walk', 'Пешком'], ['transit', 'Транспорт'], ['drive', 'Машина']];
  const TRYB_MAPS = { walk: 'walking', transit: 'transit', drive: 'driving' };
  const TRYB_IKONA = { walk: 'user', transit: 'pin', drive: 'car' };
  let EDM = null;

  const moje = () => (D.miejsca || []).filter(m => m.dla === 'wszyscy' || m.dla === D.ja.id);
  const trybNazwa = t => (TRYBY.find(x => x[0] === t) || TRYBY[0])[1];
  const mapsLink = m => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(m.adres) + '&travelmode=' + (TRYB_MAPS[m.tryb] || 'walking') + (m.tryb === 'transit' ? '' : '&dir_action=navigate');
  const przyciskMiejsca = (m, duzy) => '<a class="btn' + (duzy ? ' jade' : ' btn-j') + '" style="' + (duzy ? '' : 'min-height:54px;font-size:17px;justify-content:flex-start;padding:0 18px;') + 'width:100%;box-sizing:border-box;margin-bottom:10px;text-decoration:none" href="' + esc(mapsLink(m)) + '" target="_blank" rel="noopener">' +
    I(TRYB_IKONA[m.tryb] || 'pin') + ' ' + esc(m.nazwa) + ' <span style="opacity:.75;font-weight:500;font-size:14px;margin-left:auto">' + esc(trybNazwa(m.tryb)) + '</span></a>';

  // карточка на «Сегодня»
  window.drogaKarta = function () {
    if (!D.miejsca) return '';   // сервер ещё старый
    const l = moje();
    let h = '<div class="card"><h3>' + I('pin', 1) + 'Дорога<button class="btn2 mal" onclick="go(\'wiecej\');podstrona(\'droga\')">' + I('gear', 1) + 'Места</button></h3>';
    if (l.length) h += l.slice(0, 4).map(m => przyciskMiejsca(m, false)).join('');
    else h += '<div class="mute" style="margin-bottom:10px">Добавь места, куда ходишь чаще всего (дом, работа, магазин) — тогда маршрут будет открываться одним нажатием.</div>';
    h += '<button class="btn2 szer" style="min-height:54px" onclick="drogaZgubiona()">' + I('alert', 1) + ' ' + drogaKomu() + '</button></div>';
    return h;
  };

  // «Отправить Васе, где я» (имя в дательном падеже; если родителей несколько или имя нетипичное — «родителям»)
  function drogaDat(im) {
    if (/я$/.test(im)) return im.slice(0, -1) + 'е';
    if (/а$/.test(im)) return im.slice(0, -1) + 'е';
    return null;
  }
  function drogaKomu() {
    const rodz = (D.ludzie || []).filter(p => p.rola === 'rodzic' && p.id !== D.ja.id).map(p => p.imie);
    const kogo = rodz.length === 1 ? drogaDat(rodz[0]) : null;
    return 'Отправить ' + (kogo || 'родителям') + ', где я';
  }
  window.drogaZgubiona = function () {
    const rodz = (D.ludzie || []).filter(p => p.rola === 'rodzic' && p.id !== D.ja.id).map(p => p.imie);
    const kogo = rodz.length === 1 ? drogaDat(rodz[0]) : null;
    ark('<h4>' + esc(drogaKomu()) + '</h4><div style="margin-bottom:14px">Отправлю твою точку на карте ' + esc(kogo || 'родителям') + '</div>' +
      '<div class="ab"><button class="btn" id="dgOk" onclick="drogaWyslij()">' + I('check', 1) + ' Отправить</button><button class="btn2" onclick="arkZamknij()">Отмена</button></div>');
  };
  window.drogaWyslij = function () {
    const b = document.getElementById('dgOk'); if (b) { b.disabled = true; b.textContent = 'Ищу, где ты…'; }
    const wyslij = par => api('zgubiona', par).then(r => {
      const tel = (D.telefony || []).filter(t => t.id !== D.ja.id);
      ark('<h4>Отправлено</h4><div class="mute" style="margin-bottom:12px">Получил: ' + esc((r.komu || []).join(', ')) + (par.lat === undefined ? '. Точку определить не удалось, лучше позвони.' : '') + '</div>' +
        moje().slice(0, 4).map(m => przyciskMiejsca(m, false)).join('') +
        tel.map(t => '<a class="btn btn-j" style="width:100%;box-sizing:border-box;margin-bottom:10px;text-decoration:none;min-height:54px" href="tel:' + esc(String(t.telefon).replace(/[^\d+]/g, '')) + '">' + I('phone', 1) + ' Позвонить: ' + esc(t.imie) + '</a>').join('') +
        '<button class="btn2 szer" onclick="arkZamknij()">Закрыть</button>');
    }).catch(e => { arkZamknij(); toast(/Неизвестное действие/.test(e.message) ? 'Сервер ещё не обновлён' : e.message === 'Failed to fetch' ? 'Нет связи с интернетом — позвони' : e.message); });
    if (!navigator.geolocation) return wyslij({});
    navigator.geolocation.getCurrentPosition(p => wyslij({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy || 0) }), () => wyslij({}), { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 });
  };

  // страница «Дорога» (управление местами)
  window.wDroga = function () {
    let h = naglowek('Дорога', 'места и маршруты');
    if (!D.miejsca) return h + '<div class="card">Сервер ещё не обновлён: Ещё → Система → Обновление системы.</div>';
    const rodzic = D.ja.rola === 'rodzic', wszystkie = rodzic ? D.miejsca : moje();
    h += '<button class="btn szer" onclick="drogaForma()">' + I('plus', 1) + ' Добавить место</button>';
    if (D.adresDomu && !wszystkie.some(m => /дом|dom|home/i.test(m.nazwa))) h += '<button class="btn2 szer" style="margin-top:10px" onclick="drogaDom()">' + I('home', 1) + ' Добавить «Дом» (адрес из настроек)</button>';
    if (!wszystkie.length) return h + '<div class="card" style="margin-top:12px"><div class="empty mala">Мест пока нет</div></div>';
    h += '<div class="card" style="margin-top:12px">' + wszystkie.map(m => '<div class="row w" onclick="drogaForma(\'' + jsq(m.id) + '\')"><div class="av dk">' + I(TRYB_IKONA[m.tryb] || 'pin', 1) + '</div><div class="g"><div class="t">' + esc(m.nazwa) + '</div><div class="mute">' +
      esc(m.adres) + ' · ' + esc(trybNazwa(m.tryb)) + (rodzic ? ' · ' + (m.dla === 'wszyscy' ? 'все' : esc(imie(m.dla))) : '') + '</div></div></div>').join('') + '</div>';
    return h;
  };
  window.drogaDom = function () {
    api('miejsceZapisz', { nazwa: 'Дом', adres: D.adresDomu, tryb: 'walk', dla: D.ja.id }).then(w => { przyjmij(w); toast('Добавлено'); }).catch(e => toast(e.message));
  };
  window.drogaForma = function (id) {
    const m = id ? (D.miejsca || []).find(x => x.id === id) : null;
    EDM = m ? Object.assign({}, m) : { id: '', nazwa: '', adres: '', tryb: 'walk', dla: D.ja.id };
    const rodzic = D.ja.rola === 'rodzic';
    ark('<h4>' + (m ? 'Место' : 'Новое место') + '</h4>' +
      '<label>Название</label><input id="dmN" class="as-in" style="width:100%" placeholder="Дом, Работа, Магазин…" value="' + esc(EDM.nazwa) + '">' +
      '<label>Адрес</label><input id="dmA" class="as-in" style="width:100%" placeholder="улица, номер, город" value="' + esc(EDM.adres) + '">' +
      '<label>Как добираться</label>' + chipsy('dmT', TRYBY, [EDM.tryb], true) +
      (rodzic ? '<label>Для кого</label>' + chipsy('dmD', (D.ludzie || []).map(p => [p.id, p.imie]).concat([['wszyscy', 'Все']]), [EDM.dla], true) : '') +
      '<div class="ab"><button class="btn" id="dmZ" onclick="drogaZapisz()">' + I('check', 1) + ' Сохранить</button><button class="btn2" onclick="arkZamknij()">Отмена</button></div>' +
      (m ? '<button class="btn2 szer" style="margin-top:10px" onclick="drogaUsunPytaj()">' + I('trash', 1) + ' Удалить место</button>' : ''));
  };
  window.drogaZapisz = function () {
    const nazwa = document.getElementById('dmN').value.trim(), adres = document.getElementById('dmA').value.trim();
    if (!nazwa || !adres) return toast('Нужны название и адрес');
    const t = (document.querySelector('#dmT .chip.on') || { dataset: { v: 'walk' } }).dataset.v;
    const d = document.getElementById('dmD') ? (document.querySelector('#dmD .chip.on') || { dataset: { v: D.ja.id } }).dataset.v : D.ja.id;
    const b = document.getElementById('dmZ'); b.disabled = true;
    api('miejsceZapisz', { id: EDM.id, nazwa: nazwa, adres: adres, tryb: t, dla: d }).then(w => { przyjmij(w); arkZamknij(); toast('Сохранено'); })
      .catch(e => { b.disabled = false; toast(e.message); });
  };
  window.drogaUsunPytaj = function () {
    ark('<h4>Удалить «' + esc(EDM.nazwa) + '»?</h4><div class="ab"><button class="btn czerw" onclick="drogaUsun()">' + I('trash', 1) + ' Удалить</button><button class="btn2" onclick="arkZamknij()">Отмена</button></div>');
  };
  window.drogaUsun = function () {
    api('miejsceUsun', { id: EDM.id }).then(w => { przyjmij(w); arkZamknij(); toast('Удалено'); }).catch(e => toast(e.message));
  };
})();
