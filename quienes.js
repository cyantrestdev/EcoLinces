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
  const fullMenuImg     = document.getElementById('fullMenuImg');
  const menuLeft        = fullMenu.querySelector('.fullmenu-left');

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

  fullMenu.querySelectorAll('.fullmenu-left a').forEach(link => {
    link.addEventListener('mouseenter', () => {
      fullMenuImg.style.opacity = '0';
      setTimeout(() => { fullMenuImg.src = link.dataset.img; fullMenuImg.style.opacity = '0.9'; }, 180);
      link.style.color = link.dataset.color;
      menuLeft.style.background = link.dataset.bg;
    });
    link.addEventListener('mouseleave', () => {
      link.style.color = '';
      menuLeft.style.background = '#0d0d0d';
    });
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