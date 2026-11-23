// Семья — service worker: страница всегда свежая из сети, копия на случай без интернета; пуши через Firebase (если есть ключи в config.js)
const CACHE = 'rodzina-v4';
importScripts('config.js');
if (self.FB) {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp(self.FB.config);
  firebase.messaging();   // уведомления с полем notification Firebase показывает сам
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // „Поделиться → Семья” (share_target): POST …/udostepnij → plik do cache „udostepnione”; aplikacja otwiera się z ?udost=1 i prowadzi go jak „Загрузить”
  if (e.request.method === 'POST' && u.origin === location.origin && /\/udostepnij\/?$/.test(u.pathname)) {
    e.respondWith((async () => {
      try {
        const f = await e.request.formData(), c = await caches.open('udostepnione');
        for (const p of f.getAll('plik')) {
          if (!p || !p.size) continue;
          const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          await c.put(new Request(new URL('./udost/' + id, self.registration.scope).href),
            new Response(p, { headers: { 'Content-Type': p.type || 'application/octet-stream', 'X-Nazwa': encodeURIComponent(p.name || '') } }));
        }
      } catch (err) { /* pusty formularz – po prostu otwieram aplikację */ }
      return Response.redirect(new URL('./?udost=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (/\/opencv\.js$/.test(u.pathname)) return;   // 13 MB – zostaje w zwykłym cache przeglądarki
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // данные Apps Script — без кэша
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request)));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(l => l.length ? l[0].focus() : clients.openWindow('./')));
});
