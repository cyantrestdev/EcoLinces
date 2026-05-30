// Las constantes SUPABASE_URL, SUPABASE_ANON, sb y BREVO_KEY
// se declaran en sb.js y script_bento.js para evitar duplicados.
// script.js las reutiliza desde el scope global (window.sb, window.BREVO_KEY).
const _sb       = window.sb       || supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON);
// URL del Cloudflare Worker que maneja la suscripción al newsletter
const NEWSLETTER_WORKER_URL = 'https://newsletter-worker.ian-montanom.workers.dev';

document.addEventListener('DOMContentLoaded', async () => {

  // ── HERO LOGO SHRINK ON SCROLL ──
  const heroLogo     = document.getElementById('heroLogo');
  const heroSection  = document.getElementById('heroSection');
  const navLogo      = document.querySelector('nav .logo');

  window.addEventListener('scroll', () => {
    const heroH    = heroSection?.offsetHeight || window.innerHeight;
    const scrolled = window.scrollY;
    const progress = Math.min(scrolled / (heroH * 0.6), 1);

    // Nav scroll blur
    navbar.classList.toggle('scrolled', scrolled > 10);

    // Fade out hero logo as user scrolls
    if (heroLogo) {
      heroLogo.style.opacity  = (0.08 * (1 - progress)).toString();
      heroLogo.style.transform = `translateY(${-scrolled * 0.3}px) scale(${1 - progress * 0.15})`;
    }
  });

  // Las frases rotativas las maneja script_bento.js con los IDs del bento grid.

  // ── MENÚ DRAWER LATERAL ──
  const hamburger       = document.getElementById('hamburger');
  const fullMenu        = document.getElementById('fullMenu');
  const fullMenuClose   = document.getElementById('fullMenuClose');
  const fullMenuOverlay = document.getElementById('fullMenuOverlay');
  const menuLinks       = fullMenu.querySelectorAll('.fullmenu-left a');

  // Hover de color en los links del drawer
  menuLinks.forEach(link => {
    link.addEventListener('mouseenter', () => {
      if (link.dataset.color) link.style.color = link.dataset.color;
    });
    link.addEventListener('mouseleave', () => { link.style.color = ''; });
  });

  // Botón cerrar sesión del drawer

  // Botón iniciar sesión del drawer → abre modal de auth y cierra el drawer
  document.getElementById('drawerLogin')?.addEventListener('click', () => {
    fullMenu.classList.remove('open');
    fullMenuOverlay.classList.remove('visible');
    document.body.style.overflow = '';
    window.openModal?.();
  });

  document.getElementById('drawerSignout')?.addEventListener('click', async () => {
    // Cerrar sesión en Backrooms también (best-effort con iframe)
    if (typeof cerrarSesionEnAmbos === 'function') {
      await cerrarSesionEnAmbos();
    } else {
      await (window.sb || _sb)?.auth.signOut();
    }
    window.location.reload();
  });

  hamburger.addEventListener('click', () => {
    fullMenu.classList.add('open');
    fullMenuOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  });

  [fullMenuClose, fullMenuOverlay].forEach(el => el?.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  function closeMenu() {
    fullMenu.classList.remove('open');
    fullMenuOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  // ── AUTH: estado de sesión ──
  // initAuthModal ya fue llamado por script_bento.js — no llamarlo de nuevo
  // para evitar duplicar listeners en btnLogout/btnUserMenu.
  const { data: { session } } = await _sb.auth.getSession();
  if (session) setNavLoggedIn(session.user);
  else setNavLoggedOut();

  // Escuchar cambios de sesión (login/logout desde esta página)
  _sb.auth.onAuthStateChange((_event, sess) => {
    if (sess) setNavLoggedIn(sess.user);
    else setNavLoggedOut();
  });

  // ── CARRUSEL: cargar posts desde Supabase ──
  await loadCarouselPosts();

  // ── NEWSLETTER ──
  const newsletter = document.getElementById('newsletter');
  if (newsletter) {
    new IntersectionObserver((entries) => {
      entries.forEach(e => newsletter.classList.toggle('in-view', e.isIntersecting));
    }, { threshold: 0.3 }).observe(newsletter);
  }

  document.getElementById('nlSubmit')?.addEventListener('click', submitNewsletter);
  document.getElementById('nlEmail')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitNewsletter();
  });

  // ── FADE IN SCROLL ──
  const fadeObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); fadeObs.unobserve(e.target); }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.fade-in').forEach(el => fadeObs.observe(el));


});

// ── CARGAR POSTS PARA CARRUSEL ──
async function loadCarouselPosts() {
  // Intentar los 3 posts con más upvotes
  const { data: voted } = await _sb
    .from('posts')
    .select('id, title, slug, excerpt, cover_url, categories(name, color), post_votes(value)')
    .eq('published', true);

  let posts = [];

  if (voted && voted.length > 0) {
    // Calcular score por post
    const scored = voted.map(p => ({
      ...p,
      score: (p.post_votes || []).reduce((s, v) => s + v.value, 0)
    }));

    // Ordenar por score desc, luego por recientes como desempate
    scored.sort((a, b) => b.score - a.score);

    // Si los top 3 tienen score > 0, usarlos; si no, mezclar con recientes
    const topVoted   = scored.filter(p => p.score > 0).slice(0, 3);
    const topRecent  = scored.slice(0, 3);
    posts = topVoted.length >= 3 ? topVoted : topRecent;
  }

  // Fallback: los 3 más recientes
  if (posts.length === 0) {
    const { data: recent } = await _sb
      .from('posts')
      .select('id, title, slug, excerpt, cover_url, categories(name, color)')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(3);
    posts = recent || [];
  }

  if (posts.length === 0) return;

  const track    = document.getElementById('carouselTrack');
  if (!track) return; // Esta página no tiene carrusel

  const barItems = document.querySelectorAll('.bar-item');
  const barFills = document.querySelectorAll('.bar-fill');

  // Ajustar barras al número de posts
  barItems.forEach((b, i) => { b.style.display = i < posts.length ? '' : 'none'; });

  track.innerHTML = posts.map((post, i) => {
    const cat = post.categories;
    return `
      <a class="slide${i === 0 ? ' active' : ''}"
         href="post.html?slug=${post.slug}"
         style="background-image: url('${post.cover_url || ''}')">
        <div class="slide-overlay"></div>
        <div class="slide-content">
          ${cat ? `<span class="slide-category-badge" style="background:${cat.color}">${cat.name}</span>` : ''}
          <h2>${post.title}</h2>
          <p>${post.excerpt || ''}</p>
        </div>
      </a>
    `;
  }).join('');

  initCarousel(posts.length);
}

// ── INICIALIZAR CARRUSEL ──
function initCarousel(total) {
  const track = document.getElementById('carouselTrack');
  if (!track) return; // Nada que inicializar

  const slides   = Array.from(track.querySelectorAll('.slide'));
  const prevBtn  = document.getElementById('prevBtn');
  const nextBtn  = document.getElementById('nextBtn');
  const barFills = Array.from(document.querySelectorAll('.bar-fill')).slice(0, total);

  const DURATION = 5000;
  const TICK     = 50;
  let current    = 0;
  let elapsed    = 0;
  let ticker     = null;

  function updateCarousel() {
    const wrap    = track.parentElement;
    const padLeft = wrap.offsetWidth * 0.12;
    const slideW  = slides[0]?.offsetWidth || 0;
    const gap     = 20;
    const offset  = current * (slideW + gap);
    track.style.transform = `translateX(calc(-${offset}px + ${padLeft}px))`;
    slides.forEach((s, i) => s.classList.toggle('active', i === current));
    document.querySelectorAll('.bar-item').forEach((b, i) => b.classList.toggle('active', i === current));
    barFills.forEach((f, i) => {
      f.style.transition = 'none';
      f.style.width = i < current ? '100%' : '0%';
    });
  }

  function startTicker() {
    clearInterval(ticker);
    elapsed = 0;
    if (barFills[current]) {
      barFills[current].style.transition = 'none';
      barFills[current].style.width = '0%';
    }
    ticker = setInterval(() => {
      elapsed += TICK;
      const pct = Math.min((elapsed / DURATION) * 100, 100);
      if (barFills[current]) {
        barFills[current].style.transition = `width ${TICK}ms linear`;
        barFills[current].style.width = pct + '%';
      }
      if (elapsed >= DURATION) goTo(current + 1);
    }, TICK);
  }

  function goTo(index) {
    current = (index + total) % total;
    updateCarousel();
    startTicker();
  }

  prevBtn?.addEventListener('click', () => goTo(current - 1));
  nextBtn?.addEventListener('click', () => goTo(current + 1));

  let touchStartX = 0;
  track.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; });
  track.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? goTo(current + 1) : goTo(current - 1);
  });

  updateCarousel();
  startTicker();
}

// ── NEWSLETTER con Brevo ──
async function submitNewsletter() {
  const nameVal  = document.getElementById('nlName')?.value.trim();
  const emailVal = document.getElementById('nlEmail')?.value.trim();
  const msg      = document.getElementById('nlMsg');

  if (!emailVal) { showNlMsg('Por favor ingresa tu correo.', false); return; }

  const btn = document.getElementById('nlSubmit');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const res = await fetch(NEWSLETTER_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailVal, name: nameVal || '' })
    });

    const data = await res.json().catch(() => ({}));

    if (data.ok) {
      const msg = data.duplicate
        ? '¡Ya estás suscrito! Gracias por ser parte de EcoLinces.'
        : `¡Bienvenido${nameVal ? ', ' + nameVal : ''}! Te has suscrito al EcoBoletince.`;
      showNlMsg(msg, true);
      document.getElementById('nlName').value  = '';
      document.getElementById('nlEmail').value = '';
    } else {
      showNlMsg('Ocurrió un error. Intenta de nuevo.', false);
    }
  } catch {
    showNlMsg('Error de conexión. Intenta más tarde.', false);
  }

  btn.disabled    = false;
  btn.textContent = 'Unirse';
}

function showNlMsg(text, ok) {
  const msg = document.getElementById('nlMsg');
  msg.textContent = text;
  msg.style.color = ok ? 'rgba(255,255,255,0.95)' : '#ffcdd2';
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 6000);
}
