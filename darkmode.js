/* ══════════════════════════════════════════
   darkmode.js — EcoLinces A.C.
   Se carga en TODAS las páginas.

   El tema se controla desde la sección "Ajustes" del perfil
   con un <select> de 3 opciones: Sistema / Activado / Desactivado.

   Valores en localStorage ('ecolinces_theme'):
     '' / null → seguir el sistema (prefers-color-scheme)
     'dark'    → siempre oscuro
     'light'   → siempre claro

   El script inline del <head> aplica data-theme ANTES de pintar
   (anti-flash). Este script solo sincroniza el <select> y el listener.
   ══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {
  const THEME_KEY = 'ecolinces_theme';
  const html      = document.documentElement;

  /* ── Calcula si debe ser oscuro según preferencia ── */
  function shouldBeDark() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark')  return true;
    if (saved === 'light') return false;
    // 'Sistema': seguir prefers-color-scheme
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /* ── Aplica el tema y sincroniza el select ── */
  function applyTheme(dark) {
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    syncSelect();
  }

  /* ── Sincroniza el <select> con el valor actual de localStorage ── */
  function syncSelect() {
    const sel = document.getElementById('themeSelect');
    if (!sel) return;
    const saved = localStorage.getItem(THEME_KEY);
    sel.value = saved || 'system';
  }

  /* ── Aplica el tema correcto al cargar ── */
  applyTheme(shouldBeDark());

  /* ── Listener del <select> en la página de perfil ── */
  const sel = document.getElementById('themeSelect');
  if (sel) {
    sel.addEventListener('change', function () {
      const val = sel.value;
      if (val === 'system') {
        localStorage.removeItem(THEME_KEY);
        applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
      } else {
        localStorage.setItem(THEME_KEY, val);
        applyTheme(val === 'dark');
      }
    });
  }

  /* ── Sigue cambios del sistema si la preferencia es "Sistema" ── */
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (!localStorage.getItem(THEME_KEY)) applyTheme(e.matches);
  });
});
