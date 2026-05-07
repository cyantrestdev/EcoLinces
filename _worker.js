// _worker.js — sirve config.js con variables de entorno de Cloudflare
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/config.js') {
      return new Response(
        `const CONFIG = {
  SUPABASE_URL:  '${env.SUPABASE_URL}',
  SUPABASE_ANON: '${env.SUPABASE_ANON}',
  BREVO_KEY:     '${env.BREVO_KEY}'
};`,
        { headers: { 'Content-Type': 'application/javascript' } }
      );
    }
    // Todo lo demás lo sirve Cloudflare Pages normalmente
    return env.ASSETS.fetch(request);
  }
};