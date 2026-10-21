// Offline viewing: what was opened online keeps working offline. Nothing is uploaded or edited offline.
// - pages (navigations) and api GETs: network first, the last good copy when offline
// - hashed app files (/assets, fonts included) and photos (/media, not video streams): cache first, never change
// Videos (HLS), music and anything sent as a range stay online-only.
// ponytail: caches only grow (old app builds, every photo viewed); add pruning if phones run short of space.
const SHELL = 'lb-shell', API = 'lb-api', FILES = 'lb-files';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const put = (cache, req, res) => { if (res.ok && res.status === 200) caches.open(cache).then((c) => c.put(req, res)); };
// The app shell only ever stores an HTML page (never a file someone navigated to).
const putShell = (key, res) => { if ((res.headers.get('content-type') ?? '').includes('text/html')) put(SHELL, key, res); };

async function networkFirst(req, cache, key = req) {
  try {
    const res = await fetch(req);
    if (cache === SHELL) putShell(key, res.clone()); else put(cache, key, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(key, { cacheName: cache });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req, { cacheName: FILES });
  if (hit) return hit;
  let res;
  if (new URL(req.url).pathname.startsWith('/media/')) {
    // A file kept in a storage bucket arrives through a redirect to the bucket: ask for a CORS-readable response so
    // it can be cached for offline. A bucket without CORS still shows the photo (plain fetch), just not offline.
    try {
      res = await fetch(new Request(req.url, { mode: 'cors', credentials: 'same-origin' }));
    } catch {
      return fetch(req);
    }
  } else res = await fetch(req);
  put(FILES, req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range')) return;
  const p = url.pathname;
  if (p.startsWith('/api/manage/backup')) return; // a big download: straight from the network, never cached
  // A shared link's page names its own manifest: never keep it as the one app shell (fetched fresh, still works offline from it).
  if (req.mode === 'navigate' && /^\/[es]\//.test(p)) return e.respondWith(fetch(req).catch(() => caches.match('/', { cacheName: SHELL })));
  if (req.mode === 'navigate' && !p.startsWith('/api/') && !p.startsWith('/media/')) return e.respondWith(networkFirst(req, SHELL, '/')); // one app shell for every route
  if (p.startsWith('/api/uploads') || p.startsWith('/api/share/') && p.endsWith('/preview.jpg')) return;
  if (p.startsWith('/api/')) return e.respondWith(networkFirst(req, API));
  if (p.startsWith('/media/') && /\.(m3u8|ts|mp4|mov|webm|mp3|m4a|aac|ogg|wav)$/.test(p)) return;
  if (p.startsWith('/assets/') || p.startsWith('/media/') || p.startsWith('/brand/') || p.startsWith('/example/')) {
    e.respondWith(cacheFirst(req));
  }
});

// Logging out clears the copies (the page posts this after the server ends the session).
self.addEventListener('message', (e) => {
  if (e.data === 'clear') e.waitUntil(Promise.all([API, FILES].map((c) => caches.delete(c))));
});
