/* sw.js — EcoLinces Service Worker
   Estrategia:
   - Shell estático (HTML, CSS, JS, fuentes, logo) → Cache First
   - Supabase / APIs externas → Network Only (datos siempre frescos)
   - Imágenes de Unsplash / covers → Stale While Revalidate
   - config.js → Network First (contiene credenciales que pueden cambiar)
*/

const CACHE_NAME   = 'ecolinces-v1';
const CACHE_SHELL  = 'ecolinces-shell-v1';
const CACHE_IMAGES = 'ecolinces-images-v1';

/* Archivos del shell que se pre-cachean al instalar */
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/blog.html',
  '/post.html',
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
  '/script.js',
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

/* ── SKIP_WAITING: permite activar inmediatamente cuando el usuario acepta la actualización ── */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ── INSTALL: pre-cachear el shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then(cache => {
      /* addAll falla si algún recurso no responde — usamos add individual
         para no bloquear la instalación por un fallo puntual */
      return Promise.allSettled(
        SHELL_ASSETS.map(url => cache.add(url).catch(() => { /* ignorar fallos */ }))
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: borrar caches viejas ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_SHELL && k !== CACHE_IMAGES)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: estrategia por tipo de recurso ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* 1. Supabase y otras APIs externas → siempre red (sin cache) */
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.com') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('ui-avatars.com') ||
    url.hostname === 'api.brevo.com'
  ) {
    return; /* deja que el browser lo maneje normalmente */
  }

  /* 2. config.js → Network First (credenciales pueden cambiar) */
  if (url.pathname === '/config.js') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_SHELL).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  /* 3. Imágenes remotas (Unsplash, covers de posts) → Stale While Revalidate */
  if (
    url.hostname.includes('unsplash.com') ||
    url.hostname.includes('images.unsplash.com') ||
    (url.origin === self.location.origin && /\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname))
  ) {
    event.respondWith(
      caches.open(CACHE_IMAGES).then(async cache => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then(res => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  /* 4. Shell (HTML, CSS, JS, fuentes) → Cache First */
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok) {
            caches.open(CACHE_SHELL).then(c => c.put(request, res.clone()));
          }
          return res;
        }).catch(() => {
          /* Offline fallback: devolver index.html para rutas de navegación */
          if (request.mode === 'navigate') return caches.match('/index.html');
        });
      })
    );
  }
});
