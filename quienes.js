/* quienes.js — EcoLinces */
/* Usar el cliente Supabase global (instanciado en sb.js) */
const sb = window.sb;

document.addEventListener('DOMContentLoaded', async () => {

  /* ── NAV SCROLL ── */
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 10);
  });

  /* ── MENÚ FULLSCREEN ── */
  const hamburger       = document.getElementById('hamburger');
  const fullMenu        = document.getElementById('fullMenu');
  const fullMenuClose   = document.getElementById('fullMenuClose');
  const fullMenuOverlay = document.getElementById('fullMenuOverlay');

  hamburger.addEventListener('click', () => {
    fullMenu.classList.add('open');
    fullMenuOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  });

  [fullMenuClose, fullMenuOverlay].forEach(el => el.addEventListener('click', () => {
    fullMenu.classList.remove('open');
    fullMenuOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }));

  // Números de orden en los links
  fullMenu.querySelectorAll('.fullmenu-left a').forEach((link, i) => {
    if (!link.querySelector('.menu-num')) {
      const num = document.createElement('span');
      num.className = 'menu-num';
      num.textContent = String(i + 1).padStart(2, '0');
      link.prepend(num);
    }
    link.addEventListener('mouseenter', () => {
      if (link.dataset.color) link.style.color = link.dataset.color;
    });
    link.addEventListener('mouseleave', () => { link.style.color = ''; });
  });

  /* ── AUTH ── */
  const { data: { session } } = await sb.auth.getSession();
  if (session) setNavLoggedIn(session.user);

  initAuthModal(sb, setNavLoggedIn, setNavLoggedOut);
  document.getElementById('btnLogin')?.addEventListener('click', () => {
    if (typeof window.openModal === 'function') window.openModal();
  });

  /* ── FADE-IN ── */
  const fadeObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); fadeObs.unobserve(e.target); }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-in, .quienes-equipo').forEach(el => fadeObs.observe(el));
});