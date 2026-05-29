/* ══════════════════════════════════════════════════
   sb.js — Instancia ÚNICA global de Supabase
   Cargar SIEMPRE después de config.js y antes de
   cualquier otro script del proyecto.
   UNA sola instancia para toda la app → menos
   conexiones Realtime, menos bandwidth, sin conflictos.
══════════════════════════════════════════════════ */

if (typeof window._sbInitialized === 'undefined') {
  window._sbInitialized = true;

  if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON) {
    console.error('sb.js: CONFIG no encontrado o incompleto. Revisa config.js.');
    window.sb = null;
  } else {
    try {
      window.sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON, {
        realtime: { params: { eventsPerSecond: 10 } },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage
        }
      });
      // Inicializar sesión para que el token esté disponible desde el inicio
      window.sb.auth.getSession();
    } catch (err) {
      console.error('sb.js: Error inicializando Supabase:', err);
      window.sb = null;
    }
  }

  // BREVO_KEY eliminada del cliente — ver newsletter-worker.js
} else {
  console.warn('sb.js: ya estaba inicializado, se omite.');
}
