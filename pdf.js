/* pdf.js — Rodzina 0.3 (23.11.2026)
 * 1) pdfZJpeg: PDF z JPEG-ów (każda strona A4, obraz wpasowany) — ta sama funkcja co w Serwis myjni (wydatki.js).
 * 2) Kartka: rysuje dokument tekstowy (oświadczenie o kolizji, blankiet) na płótnie A4 i oddaje strony JPEG → PDF.
 *    Tekst rysowany na płótnie, więc polskie i rosyjskie litery są zawsze poprawne, bez osadzania czcionek.
 * 3) Schowek: IndexedDB w telefonie — kopie dokumentów do SOS (działają bez internetu), szkic oświadczenia, tło.
 */
(function () {
  function pdfZJpeg(strony) {
    const enc = new TextEncoder(), czesci = [], offs = [];
    let len = 0;
    const add = x => { const b = typeof x === 'string' ? enc.encode(x) : x; czesci.push(b); len += b.length; };
    const bajty = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
    const obj = (id, body) => { offs[id] = len; add(id + ' 0 obj\n' + body + '\nendobj\n'); };
    const n = strony.length, W = 595.28, H = 841.89, M = 20;
    add('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Count ' + n + ' /Kids [' + strony.map((_, i) => (3 + 3 * i) + ' 0 R').join(' ') + '] >>');
    strony.forEach((p, i) => {
      const id = 3 + 3 * i, m = p.bezMarg ? 0 : M, sk = Math.min((W - 2 * m) / p.w, (H - 2 * m) / p.h), dw = p.w * sk, dh = p.h * sk;
      const x = ((W - dw) / 2).toFixed(2), y = (H - m - dh).toFixed(2);
      obj(id, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im0 ' + (id + 2) + ' 0 R >> >> /Contents ' + (id + 1) + ' 0 R >>');
      const c = 'q ' + dw.toFixed(2) + ' 0 0 ' + dh.toFixed(2) + ' ' + x + ' ' + y + ' cm /Im0 Do Q';
      obj(id + 1, '<< /Length ' + c.length + ' >>\nstream\n' + c + '\nendstream');
      const jpg = bajty(p.b64);
      offs[id + 2] = len;
      add((id + 2) + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
      add(jpg); add('\nendstream\nendobj\n');
    });
    const xref = len, ile = 3 + 3 * n;
    let t = 'xref\n0 ' + ile + '\n0000000000 65535 f \n';
    for (let i = 1; i < ile; i++) t += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    add(t + 'trailer\n<< /Size ' + ile + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    const wsz = new Uint8Array(len); let o = 0; czesci.forEach(b => { wsz.set(b, o); o += b.length; });
    let bin = ''; for (let i = 0; i < wsz.length; i += 32768) bin += String.fromCharCode.apply(null, wsz.subarray(i, i + 32768));
    return btoa(bin);
  }

  /* ---------- Kartka: dokument tekstowy A4 (150 dpi) ---------- */
  const W = 1240, H = 1754, M = 86, F = 'Roboto, "Helvetica Neue", Arial, sans-serif';
  function Kartka(stopka) {
    this.stopka = stopka || ''; this.strony = []; this.nowa();
  }
  Kartka.prototype.nowa = function () {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.textBaseline = 'top';
    this.c = c; this.x = x; this.y = M; this.strony.push(c);
    if (this.stopka) { x.font = '20px ' + F; x.fillStyle = '#888'; x.fillText(this.stopka + ' · str. ' + this.strony.length, M, H - M + 30); }
  };
  Kartka.prototype.miejsce = function (h) { if (this.y + h > H - M) this.nowa(); };
  Kartka.prototype.linie = function (tekst, roz, szer) {
    const x = this.x, out = [];
    String(tekst == null ? '' : tekst).split('\n').forEach(akapit => {
      const slowa = akapit.split(' '); let l = '';
      slowa.forEach(s => { const pr = l ? l + ' ' + s : s; if (x.measureText(pr).width > szer && l) { out.push(l); l = s; } else l = pr; });
      out.push(l);
    });
    return out;
  };
  // tekst z zawijaniem; o: { roz, gruby, kolor, wciecie, odstep, srodek }
  Kartka.prototype.tekst = function (t, o) {
    o = o || {}; const roz = o.roz || 25, lh = Math.round(roz * 1.38), x0 = M + (o.wciecie || 0), szer = W - M - x0;
    this.x.font = (o.gruby ? '700 ' : '400 ') + roz + 'px ' + F;
    this.linie(t, roz, szer).forEach(l => {
      this.miejsce(lh);
      this.x.font = (o.gruby ? '700 ' : '400 ') + roz + 'px ' + F; this.x.fillStyle = o.kolor || '#111';
      if (o.srodek) this.x.fillText(l, (W - this.x.measureText(l).width) / 2, this.y); else this.x.fillText(l, x0, this.y);
      this.y += lh;
    });
    this.y += o.odstep == null ? 6 : o.odstep;
  };
  Kartka.prototype.naglowek = function (t) {
    this.miejsce(90); this.y += 14;
    this.x.fillStyle = '#f0f0f3'; this.x.fillRect(M - 10, this.y - 6, W - 2 * M + 20, 44);
    this.tekst(t, { roz: 26, gruby: true, odstep: 12 });
  };
  // pole: etykieta i wartość; pusta wartość = miejsce do wpisania długopisem (kropki)
  Kartka.prototype.pole = function (etykieta, wartosc, wierszy) {
    const pusta = wartosc == null || String(wartosc).trim() === '';
    if (pusta) {
      const n = wierszy || 1, lh = 52;
      this.miejsce(lh * n + 34);
      this.x.font = '400 21px ' + F; this.x.fillStyle = '#666'; this.x.fillText(etykieta, M, this.y); this.y += 30;
      for (let i = 0; i < n; i++) {
        this.y += lh - 14; this.x.strokeStyle = '#999'; this.x.setLineDash([3, 6]); this.x.lineWidth = 2;
        this.x.beginPath(); this.x.moveTo(M, this.y); this.x.lineTo(W - M, this.y); this.x.stroke(); this.x.setLineDash([]); this.y += 14;
      }
      this.y += 8; return;
    }
    this.miejsce(70);
    this.x.font = '400 21px ' + F; this.x.fillStyle = '#666'; this.x.fillText(etykieta, M, this.y); this.y += 28;
    this.tekst(wartosc, { roz: 26, odstep: 10 });
  };
  // dwie kolumny pól (krótkie dane obok siebie)
  Kartka.prototype.para = function (a, b) {
    const sz = (W - 2 * M - 40) / 2, wys = 86;
    this.miejsce(wys);
    [a, b].forEach((p, i) => {
      if (!p) return; const x0 = M + i * (sz + 40);
      this.x.font = '400 21px ' + F; this.x.fillStyle = '#666'; this.x.fillText(p[0], x0, this.y);
      const v = String(p[1] == null ? '' : p[1]).trim();
      if (v) { this.x.font = '400 26px ' + F; this.x.fillStyle = '#111'; let t = v; while (this.x.measureText(t).width > sz && t.length > 3) t = t.slice(0, -2); this.x.fillText(t === v ? v : t + '…', x0, this.y + 30); }
      else { this.x.strokeStyle = '#999'; this.x.setLineDash([3, 6]); this.x.lineWidth = 2; this.x.beginPath(); this.x.moveTo(x0, this.y + 68); this.x.lineTo(x0 + sz, this.y + 68); this.x.stroke(); this.x.setLineDash([]); }
    });
    this.y += wys;
  };
  Kartka.prototype.kratki = function (lista, wybrane) {   // lista kratek ☐/☒ w trzech kolumnach
    const kol = 3, sz = (W - 2 * M) / kol, lh = 42;
    for (let i = 0; i < lista.length; i += kol) {
      this.miejsce(lh);
      for (let j = 0; j < kol && i + j < lista.length; j++) {
        const [k, nazwa] = lista[i + j], x0 = M + j * sz, on = wybrane.indexOf(k) >= 0;
        this.x.strokeStyle = '#333'; this.x.lineWidth = 2; this.x.strokeRect(x0, this.y + 4, 24, 24);
        if (on) { this.x.beginPath(); this.x.moveTo(x0 + 4, this.y + 16); this.x.lineTo(x0 + 10, this.y + 24); this.x.lineTo(x0 + 21, this.y + 7); this.x.lineWidth = 3.5; this.x.stroke(); }
        this.x.font = (on ? '700 ' : '400 ') + '21px ' + F; this.x.fillStyle = '#111'; this.x.fillText(nazwa, x0 + 34, this.y + 4);
      }
      this.y += lh;
    }
    this.y += 6;
  };
  // podpisy: [[etykieta, płótno|null], …] obok siebie
  Kartka.prototype.podpisy = function (lista) {
    const sz = (W - 2 * M - 40) / 2, wys = 230;
    this.miejsce(wys + 20); this.y += 10;
    lista.forEach((p, i) => {
      const x0 = M + i * (sz + 40);
      if (p[1]) { const s = Math.min(sz / p[1].width, 170 / p[1].height); this.x.drawImage(p[1], x0, this.y, p[1].width * s, p[1].height * s); }
      this.x.strokeStyle = '#333'; this.x.lineWidth = 2; this.x.beginPath(); this.x.moveTo(x0, this.y + 180); this.x.lineTo(x0 + sz, this.y + 180); this.x.stroke();
      this.x.font = '400 21px ' + F; this.x.fillStyle = '#444'; this.x.fillText(p[0], x0, this.y + 190);
    });
    this.y += wys;
  };
  Kartka.prototype.strony_ = function () {
    return this.strony.map(c => ({ b64: c.toDataURL('image/jpeg', .88).split(',')[1], w: c.width, h: c.height, bezMarg: true }));
  };

  /* ---------- Schowek (IndexedDB) ---------- */
  let dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise((ok, no) => {
      if (!window.indexedDB) return no(new Error('нет IndexedDB'));
      const r = indexedDB.open('rodzina', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('pliki'); };
      r.onsuccess = () => ok(r.result); r.onerror = () => { dbP = null; no(r.error); };
    });
    return dbP;
  }
  const tx = (tryb, fn) => db().then(d => new Promise((ok, no) => { const t = d.transaction('pliki', tryb), s = t.objectStore('pliki'), r = fn(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); }));
  const Schowek = {
    get: k => tx('readonly', s => s.get(k)).catch(() => null),
    put: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => null),
    del: k => tx('readwrite', s => s.delete(k)).catch(() => null),
    klucze: () => tx('readonly', s => s.getAllKeys()).catch(() => [])
  };

  /* ---------- pliki: otwórz / udostępnij / pobierz ---------- */
  function blobZ(b64, mime) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Blob([u], { type: mime }); }
  function pobierz(b64, mime, nazwa) {
    const u = URL.createObjectURL(blobZ(b64, mime)), a = document.createElement('a');
    a.href = u; a.download = nazwa || 'dokument'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
  }
  async function udostepnij(b64, mime, nazwa, tytul) {
    try {
      const f = new File([blobZ(b64, mime)], nazwa || 'dokument', { type: mime });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: tytul || nazwa }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return true; }
    pobierz(b64, mime, nazwa); return false;
  }

  // zdjęcie → JPEG base64 zmniejszony (max px)
  function zdjecieB64(f, max) {
    return new Promise((ok, no) => {
      const fr = new FileReader();
      fr.onerror = () => no(new Error('не могу прочитать файл'));
      fr.onload = () => { const im = new Image(); im.onerror = () => no(new Error('это не фотография'));
        im.onload = () => { const s = Math.min(1, (max || 1800) / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
          const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
          ok({ b64: c.toDataURL('image/jpeg', .85).split(',')[1], w: c.width, h: c.height }); };
        im.src = fr.result; };
      fr.readAsDataURL(f);
    });
  }
  function plikB64(f) { return new Promise((ok, no) => { const fr = new FileReader(); fr.onerror = () => no(new Error('не могу прочитать файл')); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.readAsDataURL(f); }); }
  function wymiary(b64) { return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok([im.naturalWidth, im.naturalHeight]); im.onerror = () => no(new Error('это не фотография')); im.src = 'data:image/jpeg;base64,' + b64; }); }
  function zmniejsz(b64, max) {   // JPEG → mniejszy JPEG (podgląd do rozpoznania)
    return new Promise(ok => { const im = new Image(); im.onload = () => { const s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', .8).split(',')[1]); };
      im.onerror = () => ok(b64); im.src = 'data:image/jpeg;base64,' + b64; });
  }

  Object.assign(window, { pdfZJpeg, Kartka, Schowek, pobierzPlik: pobierz, udostepnijPlik: udostepnij, blobZ, zdjecieB64, plikB64, wymiaryJpeg: wymiary, zmniejszJpeg: zmniejsz });
})();
