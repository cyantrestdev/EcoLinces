// _worker.js — sirve config.js con variables de entorno de Cloudflare
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/config.js') {
      return new Response(
        `const CONFIG = {\n  SUPABASE_URL:  '${env.SUPABASE_URL}',\n  SUPABASE_ANON: '${env.SUPABASE_ANON}',\n  BREVO_KEY:     '${env.BREVO_KEY}'\n};`,
        { headers: { 'Content-Type': 'application/javascript' } }
      );
    }

    // El Service Worker necesita Service-Worker-Allowed para controlar el scope raíz
    if (url.pathname === '/sw.js') {
      const res = await env.ASSETS.fetch(request);
      const newRes = new Response(res.body, res);
      newRes.headers.set('Content-Type', 'application/javascript');
      newRes.headers.set('Service-Worker-Allowed', '/');
      newRes.headers.set('Cache-Control', 'no-cache');
      return newRes;
    }

    // Todo lo demás lo sirve Cloudflare Pages normalmente
    return env.ASSETS.fetch(request);
  }
};
