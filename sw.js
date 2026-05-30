/* sw.js — EcoLinces Service Worker */

const CACHE_SHELL  = 'ecolinces-shell-v9';
const CACHE_IMAGES = 'ecolinces-images-v9';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/blog.html',
  '/post.html',
  '/guardados.html',
  '/guardados.js',
  '/perfil.html',
  '/quienes.html',
  '/styles.css',
  '/styles_bento.css',
  '/blog.css',
  '/post.css',
  '/perfil.css',
  '/quienes.css',
  '/search.css',
  '/chat.css',
  '/friends.css',
  '/auth.js',
  '/blog.js',
  '/post.js',
  '/perfil.js',
  '/quienes.js',
  '/search.js',
  '/chat.js',
  '/friends.js',
  '/script_bento.js',
  '/darkmode.js',
  '/sb.js',
  '/logo.svg',
  '/logo.png',
  '/ClashDisplay-Semibold.otf',
  '/Helvetica.ttf',
  '/Satoshi-Medium.otf',
  '/Satoshi-Regular.otf',
  '/manifest.json',
];

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then(cache => {
      return Promise.allSettled(
        SHELL_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    })
    .then(() => self.skipWaiting())  // Activa inmediatamente sin esperar
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_SHELL && k !== CACHE_IMAGES)
          .map(k => caches.delete(k))
      )
    )
    .then(() => self.clients.claim())  // Toma control de todas las pestañas abiertas
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* 1. APIs externas → red siempre */
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.com') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('ui-avatars.com') ||
    url.hostname === 'api.brevo.com' ||
    url.hostname.endsWith('.workers.dev')   // Cloudflare Worker del newsletter
  ) {
    return;
  }

  /* 2. config.js → Network First */
  if (url.pathname === '/config.js') {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok && !res.bodyUsed) {
            const clone = res.clone();
            caches.open(CACHE_SHELL).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  /* 3. Imágenes remotas → Stale While Revalidate */
  if (
    url.hostname.includes('unsplash.com') ||
    url.hostname.includes('images.unsplash.com') ||
    (url.origin === self.location.origin && /\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname))
  ) {
    event.respondWith(
      caches.open(CACHE_IMAGES).then(async cache => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then(res => {
          if (res.ok && !res.bodyUsed) cache.put(request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  /* 4. Shell → Network First para HTML, Cache First para el resto */
  if (request.method === 'GET') {
    const isHTML = request.mode === 'navigate' || url.pathname.endsWith('.html');

    if (isHTML) {
      // HTML siempre desde la red para evitar servir páginas obsoletas
      event.respondWith(
        fetch(request).then(res => {
          if (res.ok && !res.bodyUsed) {
            const clone = res.clone();
            caches.open(CACHE_SHELL).then(c => c.put(request, clone));
          }
          return res;
        }).catch(() => caches.match(request) || caches.match('/index.html'))
      );
    } else {
      // CSS, JS, fuentes → Cache First
      event.respondWith(
        caches.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(res => {
            if (res.ok && res.status !== 304 && !res.bodyUsed) {
              const clone = res.clone();
              caches.open(CACHE_SHELL).then(c => c.put(request, clone));
            }
            return res;
          }).catch(() => null);
        })
      );
    }
  }
});
