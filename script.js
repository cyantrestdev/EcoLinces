const SUPABASE_URL  = CONFIG.SUPABASE_URL;
const SUPABASE_ANON = CONFIG.SUPABASE_ANON;
const BREVO_KEY     = CONFIG.BREVO_KEY;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

document.addEventListener('DOMContentLoaded', async () => {

  // ── SPLASH ──
  const splash   = document.getElementById('splash');
  const navbar   = document.getElementById('navbar');
  const SPLASH_KEY = 'ecolinces_splash_shown';

  function runSplash() {
    setTimeout(() => splash.classList.add('animate-logo'), 100);
    setTimeout(() => {
      splash.classList.remove('animate-logo');
      splash.classList.add('animate-slide');
    }, 1400);
    setTimeout(() => {
      splash.classList.add('done');
      navbar.classList.add('visible');
      setTimeout(() => { splash.style.display = 'none'; }, 350);
    }, 2000);
    sessionStorage.setItem(SPLASH_KEY, '1');
  }

  if (sessionStorage.getItem(SPLASH_KEY)) {
    splash.style.display = 'none';
    navbar.classList.add('visible');
  } else {
    runSplash();
  }

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

  // ── FRASES ROTATIVAS ──
  const quotes = [
    {
      text: '"Sé el cambio que quieres ver en el mundo."',
      name: 'Mahatma Gandhi', title: 'Pacifista indio',
      avatar: 'https://fundaciontorresyprada.org/wp-content/uploads/2024/05/gandhi_mahatma.jpg',
      wiki: 'https://es.wikipedia.org/wiki/Mahatma_Gandhi'
    },
    {
      text: '"La Tierra no es una herencia de nuestros padres, sino un préstamo de nuestros hijos."',
      name: 'Antoine de Saint-Exupéry', title: 'Escritor y aviador francés',
      avatar: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Antoine_de_Saint-Euxpery_%281920%29.jpg/960px-Antoine_de_Saint-Euxpery_%281920%29.jpg',
      wiki: 'https://es.wikipedia.org/wiki/Antoine_de_Saint-Exup%C3%A9ry'
    },
    {
      text: '"En cada paseo por la naturaleza, uno recibe mucho más de lo que busca."',
      name: 'John Muir', title: 'Naturalista y conservacionista',
      avatar: 'https://www.hermidaeditores.com/images/autores/b_-56-1591453209.webp',
      wiki: 'https://es.wikipedia.org/wiki/John_Muir'
    },
    {
      text: '"El medioambiente es donde todos nos encontramos, donde todos tenemos interés mutuo."',
      name: 'Lady Bird Johnson', title: 'Ex primera dama de EE. UU.',
      avatar: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Lady_Bird_Johnson%2C_bw_photo_ca1962.jpg/250px-Lady_Bird_Johnson%2C_bw_photo_ca1962.jpg',
      wiki: 'https://es.wikipedia.org/wiki/Lady_Bird_Johnson'
    },
    {
      text: '"La naturaleza siempre lleva los colores del espíritu."',
      name: 'Ralph Waldo Emerson', title: 'Filósofo y poeta estadounidense',
      avatar: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Ralph_Waldo_Emerson_by_Josiah_Johnson_Hawes_1857.jpg/960px-Ralph_Waldo_Emerson_by_Josiah_Johnson_Hawes_1857.jpg',
      wiki: 'https://es.wikipedia.org/wiki/Ralph_Waldo_Emerson'
    }
  ];

  let qi = sessionStorage.getItem('ecolinces_quote_index');
  qi = qi === null ? Math.floor(Math.random() * quotes.length) : parseInt(qi);
  const q = quotes[qi];
  document.getElementById('quoteText').textContent  = q.text;
  document.getElementById('quoteTitle').textContent = q.title;
  const av = document.getElementById('quoteAvatar');
  av.src = q.avatar; av.alt = q.name;
  sessionStorage.setItem('ecolinces_quote_index', (qi + 1) % quotes.length);
  const nameEl = document.getElementById('quoteName');
  nameEl.innerHTML = `<a href="${q.wiki}" target="_blank" rel="noopener" class="quote-wiki-link">${q.name}</a>`;

  // ── MENÚ FULLSCREEN ──
  const hamburger       = document.getElementById('hamburger');
  const fullMenu        = document.getElementById('fullMenu');
  const fullMenuClose   = document.getElementById('fullMenuClose');
  const fullMenuOverlay = document.getElementById('fullMenuOverlay');
  const fullMenuImg     = document.getElementById('fullMenuImg');
  const menuLeft        = fullMenu.querySelector('.fullmenu-left');
  const menuLinks       = fullMenu.querySelectorAll('.fullmenu-left a');

  hamburger.addEventListener('click', () => {
    fullMenu.classList.add('open');
    fullMenuOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  });

  fullMenuClose.addEventListener('click', closeMenu);
  fullMenuOverlay.addEventListener('click', closeMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  function closeMenu() {
    fullMenu.classList.remove('open');
    fullMenuOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  menuLinks.forEach(link => {
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
  const { data: voted } = await sb
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
    const { data: recent } = await sb
      .from('posts')
      .select('id, title, slug, excerpt, cover_url, categories(name, color)')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(3);
    posts = recent || [];
  }

  if (posts.length === 0) return;

  const track    = document.getElementById('carouselTrack');
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
  const track    = document.getElementById('carouselTrack');
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
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_KEY
      },
      body: JSON.stringify({
        email: emailVal,
        attributes: { FIRSTNAME: nameVal || '' },
        listIds: [2],
        updateEnabled: true
      })
    });

    if (res.ok || res.status === 204) {
      showNlMsg(`¡Bienvenido${nameVal ? ', ' + nameVal : ''}! Te has suscrito al EcoBoletince.`, true);
      document.getElementById('nlName').value  = '';
      document.getElementById('nlEmail').value = '';
    } else {
      const data = await res.json();
      if (data.code === 'duplicate_parameter') {
        showNlMsg('¡Ya estás suscrito! Gracias por ser parte de EcoLinces.', true);
      } else {
        showNlMsg('Ocurrió un error. Intenta de nuevo.', false);
      }
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