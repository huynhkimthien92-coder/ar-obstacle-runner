// Service worker: app shell cache-first + cache file MediaPipe (wasm ~14MB, model ~5MB) để lần sau chơi offline.
// Đổi VERSION mỗi lần deploy để người dùng nhận bản mới.
const VERSION = 'aor-v1.2.0';
const SHELL = [
  './', './index.html', './display.html', './css/style.css', './manifest.webmanifest',
  './js/main.js', './js/config.js', './js/camera.js', './js/pose.js', './js/filters.js', './js/motion.js',
  './js/game.js', './js/levels.js', './js/render.js', './js/audio.js', './js/bench.js', './js/link.js', './js/display.js',
  './icons/icon-192.png', './icons/icon-512.png',
];
const RUNTIME = 'aor-runtime-v1'; // file CDN có version trong URL → bất biến, giữ qua các bản deploy
const CDN_HOSTS = ['cdn.jsdelivr.net', 'storage.googleapis.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  // stale-while-revalidate cho file của app
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') return (await c.match('./index.html')) || Response.error();
    return Response.error();
  }));
});
