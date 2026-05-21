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

    if (url.pathname === '/sw.js') {
      const res = await env.ASSETS.fetch(request);
      const newRes = new Response(res.body, res);
      newRes.headers.set('Content-Type', 'application/javascript');
      newRes.headers.set('Service-Worker-Allowed', '/');
      newRes.headers.set('Cache-Control', 'no-cache');
      return newRes;
    }

    // Si la ruta no tiene extensión y existe como .html, servirla directamente
    if (!url.pathname.includes('.') && url.pathname !== '/') {
      const htmlUrl = new URL(url.pathname + '.html', url.origin);
      const htmlReq = new Request(htmlUrl, request);
      const res = await env.ASSETS.fetch(htmlReq);
      if (res.status === 200) return res;
    }

    return env.ASSETS.fetch(request);
  }
};
