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
        realtime: { params: { eventsPerSecond: 10 } }
      });
    } catch (err) {
      console.error('sb.js: Error inicializando Supabase:', err);
      window.sb = null;
    }
  }

  /* Exponer BREVO_KEY como global */
  window.BREVO_KEY = (typeof CONFIG !== 'undefined') ? CONFIG.BREVO_KEY : null;
} else {
  console.warn('sb.js: ya estaba inicializado, se omite.');
}
