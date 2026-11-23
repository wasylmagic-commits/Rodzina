/* Семья — траты: чеки (фото → Claude читает), ручной ввод, аналитика по месяцам, категориям, магазинам и ценам. Видят только родители. */
(function () {
  const WYD = { mies: null, dane: null, ladowanie: false, blad: '' };
  let WF = null;   // форма новой траты
  const MIES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const miesNazwa = m => MIES[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4);
  const przesun = (m, d) => { let y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)) + d; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return y + '-' + ('0' + mo).slice(-2); };
  const katNazwa = k => { const x = (D.katWyd || []).find(a => a[0] === k); return x ? x[1] : k; };
  const dm = d => d.slice(8, 10) + '.' + d.slice(5, 7);

  window.wydOtworz = function () { WYD.dane = null; WYD.blad = ''; WYD.mies = D.dzis.slice(0, 7); podstrona('wyd'); };

  function laduj() {
    WYD.ladowanie = true;
    const m = WYD.mies;
    api('wydatki', { mies: m }).then(w => { WYD.dane = w; WYD.blad = ''; })
      .catch(e => { WYD.blad = e.message === 'Failed to fetch' ? 'Нет связи с сервером' : /Неизвестное действие/.test(e.message) ? 'Сервер ещё не обновлён: Ещё → Система → Обновление системы' : e.message; })
      .finally(() => { WYD.ladowanie = false; if (TAB === 'wiecej' && PODSTR === 'wyd') render(); });
  }
  window.wydMies = function (d) { const n = przesun(WYD.mies, d); if (n > D.dzis.slice(0, 7)) return; WYD.mies = n; WYD.dane = null; WYD.blad = ''; render(); };
  window.wydOdswiez = function () { WYD.dane = null; WYD.blad = ''; render(); };

  window.wWydatki = function () {
    if (!WYD.mies) WYD.mies = D.dzis.slice(0, 7);
    if (!WYD.dane && !WYD.ladowanie && !WYD.blad) laduj();
    let h = naglowek('Траты', miesNazwa(WYD.mies));
    h += '<div class="seg" style="justify-content:space-between"><button style="flex:0 0 56px" onclick="wydMies(-1)" aria-label="Раньше">' + I('back', 1) + '</button><button class="on" style="flex:1 1 auto;white-space:nowrap">' + esc(miesNazwa(WYD.mies)) + '</button>' +
      '<button style="flex:0 0 56px" onclick="wydMies(1)" aria-label="Позже"' + (WYD.mies >= D.dzis.slice(0, 7) ? ' disabled style="opacity:.3"' : '') + '><span style="display:inline-block;transform:scaleX(-1)">' + I('back', 1) + '</span></button></div>';
    h += '<div class="szybko" style="gap:10px"><label class="btn" style="flex:1"><input type="file" accept="image/*" capture="environment" hidden onchange="wydFoto(this)">' + I('camera', 1) + ' Фото чека</label>' +
      '<button class="btn2" style="min-height:46px" onclick="wydForma()">' + I('plus', 1) + ' Вручную</button></div>';
    if (D.ja.admin) h += '<button class="btn2 szer" style="margin:10px 0 0" onclick="paragonyTeraz()">' + I('note', 1) + 'Загрузить чеки из папки Paragony</button>';
    if (WYD.blad) return h + '<div class="card"><h3>' + I('alert', 1) + 'Не получилось</h3><div class="mute">' + esc(WYD.blad) + '</div><button class="btn2 szer" style="margin-top:10px" onclick="wydOdswiez()">Повторить</button></div>';
    const d = WYD.dane;
    if (!d) return h + '<div class="card"><div class="empty mala">Загружаю…</div></div>';
    const roznica = d.razem - d.poprz;
    h += '<div class="card"><div class="mute">Потрачено</div><div class="wsuma">' + zl(d.razem) + '</div>' +
      '<div class="mute" style="margin-top:4px">' + d.n + ' ' + (d.n === 1 ? 'запись' : 'записей') + (d.poprz ? ' · ' + MIES[Number(d.poprzMies.slice(5, 7)) - 1] + ': ' + zl(d.poprz) +
      (roznica ? ' (' + (roznica > 0 ? '+' : '−') + zl(Math.abs(roznica)) + ')' : '') : '') + '</div></div>';
    if (!d.n) return h + '<div class="card"><div class="empty mala">В этом месяце записей нет. Сфотографируй чек, остальное сделаю я.</div></div>';
    if (d.poKat.length) {
      const mx = Math.max.apply(null, d.poKat.map(x => x[1])) || 1;
      h += '<div class="card"><h3>' + I('grid', 1) + 'По категориям</h3>' + d.poKat.map(([k, sum, n]) => {
        const bylo = d.poKatPoprz && d.poKatPoprz[k];
        return '<div style="margin:9px 0"><div style="display:flex;justify-content:space-between;gap:8px"><span>' + esc(katNazwa(k)) + '</span><b>' + zl(sum) + '</b></div>' +
          '<div class="wbar"><i style="width:' + Math.max(3, sum / mx * 100) + '%"></i></div>' + (bylo ? '<div class="mute" style="font-size:12px;margin-top:2px">в прошлом месяце ' + zl(bylo) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    }
    if (d.poSklepie.length) h += '<div class="card"><h3>' + I('cart', 1) + 'По магазинам</h3>' + d.poSklepie.map(([s, sum, n]) =>
      '<div class="row"><div class="g">' + esc(s === '—' ? 'Без названия' : s) + ' <span class="mute">· ' + n + '</span></div><b>' + zl(sum) + '</b></div>').join('') + '</div>';
    const a = d.analiza || {};
    if (a.najczestsze && a.najczestsze.length) h += '<div class="card"><h3>' + I('spark', 1) + 'На что уходит из чеков</h3>' + a.najczestsze.map(([p, sum, n]) =>
      '<div class="row"><div class="g">' + esc(p) + ' <span class="mute">· ' + n + '×</span></div><b>' + zl(sum) + '</b></div>').join('') + '</div>';
    if (a.roznice && a.roznice.length) h += '<div class="card"><h3>' + I('tag', 1) + 'Где дешевле (по твоим чекам, 90 дней)</h3>' + a.roznice.map(([p, l, r]) =>
      '<div class="row"><div class="g"><b>' + esc(p) + '</b><div class="mute">' + l.map(x => esc(x[0]) + ' ' + zl(x[1])).join(' · ') + '</div></div><span class="kr" style="color:#34c759;font-weight:600">−' + zl(r) + '</span></div>').join('') + '</div>';
    else if (a.pozycji !== undefined && a.pozycji < 1) h += '<div class="card"><div class="mute">Аналитика по ценам появится, когда накопятся чеки: Claude разбирает их по позициям.</div></div>';
    h += '<div class="card"><h3>' + I('note', 1) + 'Записи</h3>' + d.lista.map(o => '<div class="row w" onclick="wydSzczegoly(\'' + jsq(o.id) + '\')"><div class="g"><div class="t">' + esc(o.sklep || o.opis || katNazwa(o.kategoria)) +
      '</div><div class="mute"><b style="color:var(--acc)">' + esc(o.ktoImie) + '</b> · ' + dm(o.data) + ' · ' + esc(katNazwa(o.kategoria)) + (o.zrodlo === 'paragon' ? ' · чек' : '') + '</div></div><b>' + zl(o.kwota) + '</b></div>').join('') + '</div>';
    return h;
  };

  // ---- чек: фото → Claude → окно проверки
  window.wydFoto = async function (inp) {
    const f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
    ark('<h4>Читаю чек…</h4><div class="empty mala">' + I('spark') + '<br>Claude разбирает позиции и цены</div>');
    try {
      const im = await zdjecieB64(f, 2000);
      const p = await apiPost('paragonAnaliza', { b64: im.b64 });
      WF = { kto: D.ja.id, sklep: p.sklep || '', data: p.data, kwota: String(p.suma || '').replace('.', ','), kategoria: p.kategoria || 'jedzenie', opis: '', zrodlo: 'paragon', pozycje: p.pozycje || [] };
      wydOkno();
    } catch (e) {
      arkZamknij(); toast(e.message || 'Не получилось прочитать чек');
    }
  };
  window.wydForma = function () { WF = { kto: D.ja.id, sklep: '', data: D.dzis, kwota: '', kategoria: 'jedzenie', opis: '', zrodlo: 'reczne', pozycje: [] }; wydOkno(); };
  function wydOkno() {
    const sk = (D.sklepy || []).map(x => x[1]);
    ark('<h4>' + (WF.zrodlo === 'paragon' ? 'Проверь чек' : 'Новая трата') + '</h4>' +
      '<div class="dwa"><div><label>Сумма, zł</label><input id="wdK" class="as-in" style="width:100%" inputmode="decimal" placeholder="0,00" value="' + esc(WF.kwota) + '"></div>' +
      '<div><label>Дата</label><input id="wdD" type="date" class="as-in" style="width:100%" value="' + esc(WF.data) + '"></div></div>' +
      '<label>Магазин</label><input id="wdS" class="as-in" style="width:100%" list="wdSL" placeholder="Biedronka, Lidl, Zara…" value="' + esc(WF.sklep) + '"><datalist id="wdSL">' + sk.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
      '<label>Кто купил</label>' + chipsy('wdW', (D.ludzie || []).filter(x => x.rola === 'rodzic').map(x => [x.id, x.id === D.ja.id ? x.imie + ' (я)' : x.imie]), [WF.kto || D.ja.id], true) +
      '<label>Категория</label>' + chipsy('wdC', (D.katWyd || []).map(x => [x[0], x[1]]), [WF.kategoria], true) +
      '<label>Заметка <span class="mute">(необязательно)</span></label><input id="wdO" class="as-in" style="width:100%" value="' + esc(WF.opis) + '">' +
      (WF.pozycje.length ? '<div class="mute" style="margin-top:10px">' + I('spark', 1) + ' Нашёл позиций: <b>' + WF.pozycje.length + '</b> — цены попадут в историю (' + esc(WF.pozycje.slice(0, 4).map(x => x.produkt).join(', ')) + (WF.pozycje.length > 4 ? '…' : '') + ')</div>' : '') +
      '<div class="ab"><button class="btn" id="wdZ" onclick="wydZapisz()">' + I('check', 1) + ' Записать</button><button class="btn2" onclick="arkZamknij()">Отмена</button></div>');
  }
  window.wydZapisz = function () {
    const kwota = (document.getElementById('wdK').value || '').trim(), data = document.getElementById('wdD').value, sklep = document.getElementById('wdS').value.trim(), opis = document.getElementById('wdO').value.trim();
    const kto = (document.querySelector('#wdW .chip.on') || { dataset: { v: D.ja.id } }).dataset.v;
    const kat = (document.querySelector('#wdC .chip.on') || { dataset: { v: 'inne' } }).dataset.v;
    if (!(parseFloat(kwota.replace(',', '.')) > 0)) return toast('Нужна сумма');
    const b = document.getElementById('wdZ'); b.disabled = true; b.textContent = 'Записываю…';
    apiPost('wydatekDodaj', { kto: kto, kwota: kwota, data: data || D.dzis, kategoria: kat, sklep: sklep, opis: opis, zrodlo: WF.zrodlo, pozycje: JSON.stringify(WF.pozycje || []) })
      .then(w => { WYD.dane = w; WYD.mies = w.mies; WYD.blad = ''; WF = null; arkZamknij(); toast('Записано'); load(); })
      .catch(e => { b.disabled = false; b.innerHTML = I('check', 1) + ' Записать'; toast(e.message); });
  };

  // ---- запись: детали и удаление
  window.wydSzczegoly = function (id) {
    const o = WYD.dane && WYD.dane.lista.find(x => x.id === id); if (!o) return;
    ark('<h4>' + esc(o.sklep || o.opis || katNazwa(o.kategoria)) + '</h4><div class="wsuma" style="font-size:28px">' + zl(o.kwota) + '</div>' +
      '<div class="mute" style="margin:6px 0 12px">' + dm(o.data) + ' · ' + esc(katNazwa(o.kategoria)) + ' · ' + esc(o.ktoImie) + (o.zrodlo === 'paragon' ? ' · из чека' : '') + (o.opis && o.sklep ? '<br>' + esc(o.opis) : '') + '</div>' +
      '<div class="ab"><button class="btn czerw" onclick="wydUsun(\'' + jsq(id) + '\')">' + I('trash', 1) + ' Удалить</button><button class="btn2" onclick="arkZamknij()">Закрыть</button></div>');
  };
  window.wydUsun = function (id) {
    api('wydatekUsun', { id: id, mies: WYD.mies }).then(w => { WYD.dane = w; arkZamknij(); toast('Удалено'); }).catch(e => toast(e.message));
  };
})();
window.paragonyTeraz = async function () {
  toast('Читаю чеки из папки Paragony…');
  try {
    const r = await api('paragonyTeraz');
    toast(r.ile ? 'Загружено чеков: ' + r.ile + (r.zostalo ? ' (ещё ' + r.zostalo + ' — нажми снова)' : '') + (r.bledy ? ', не прочитано: ' + r.bledy : '') : (r.bledy ? 'Не получилось прочитать файлов: ' + r.bledy : 'Новых чеков в папке нет'));
    if (window.wydOdswiez) wydOdswiez();
  } catch (e) { toast('Не вышло: ' + e.message); }
};
