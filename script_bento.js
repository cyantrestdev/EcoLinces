/* script_bento.js — EcoLinces A.C. */

/* Usar el cliente Supabase global (instanciado en sb.js) */
const sb = window.sb || null;
// URL definida en script.js — reutilizamos la misma variable global
const _NL_WORKER_URL = (typeof NEWSLETTER_WORKER_URL !== 'undefined')
  ? NEWSLETTER_WORKER_URL
  : 'https://newsletter-worker.ian-montanom.workers.dev';

/* ── FALLBACK FUNCTIONS ── */
function loadHeroPostFallback() {
  const heroEl    = document.getElementById('bentoHero');
  const heroBg    = document.getElementById('bentoHeroBg');
  const eyebrow   = document.getElementById('bentoEyebrow');
  const titleEl   = document.getElementById('bentoTitle');
  const excerptEl = document.getElementById('bentoExcerpt');

  const fallback = {
    title: "Bienvenido a EcoLinces",
    excerpt: "Descubre artículos sobre medio ambiente, sostenibilidad y acciones para proteger nuestro planeta.",
    cover: "linear-gradient(135deg,#2e7d32 0%,#1b5e20 100%)"
  };

  if (heroBg) heroBg.style.backgroundImage = fallback.cover;
  if (titleEl) titleEl.textContent = fallback.title;
  if (excerptEl) excerptEl.textContent = fallback.excerpt;
  if (eyebrow) eyebrow.style.display = 'none';
}

function loadRecentPostsFallback() {
  const grid = document.getElementById('recentGrid');
  if (!grid) return;
  
  const posts = [
    {
      title: "Consejos para reciclar en casa",
      excerpt: "Aprende prácticas simples para reducir tu impacto ambiental desde tu hogar.",
      cover: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=800&q=80",
      cat: "Reciclaje",
      color: "#2e7d32"
    },
    {
      title: "Plantas que purifican el aire",
      excerpt: "Descubre especies vegetales que ayudan a mejorar la calidad del aire en interiores.",
      cover: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80",
      cat: "Plantas",
      color: "#1565c0"
    },
    {
      title: "Energía renovable para todos",
      excerpt: "Explora opciones accesibles de energía limpia para hogares y comunidades.",
      cover: "https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=800&q=80",
      cat: "Energía",
      color: "#e65100"
    }
  ];

  grid.innerHTML = posts.map(post => `
    <a class="recent-card" href="#" onclick="return false">
      <div class="recent-card-cover-wrap">
        <img class="recent-card-cover" src="${post.cover}" alt="${post.title}" loading="lazy" />
      </div>
      <div class="recent-card-body">
        <span class="recent-card-cat" style="background:${post.color}">${post.cat}</span>
        <h3 class="recent-card-title">${post.title}</h3>
        <p class="recent-card-excerpt">${post.excerpt}</p>
        <div class="recent-card-date">Artículo destacado</div>
      </div>
    </a>
  `).join('');
}

/* ── IMMEDIATE INITIALIZATION ── */
function loadFallbacks() {
  loadHeroPostFallback();
  loadRecentPostsFallback();
}

// Run immediately if DOM is ready, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadFallbacks);
} else {
  loadFallbacks();
}

document.addEventListener('DOMContentLoaded', async () => {
  // ── Link activo en el nav ────────────────────────────────────────────────
  (function markActiveNav() {
    document.querySelectorAll('.nav-links a').forEach(a => {
      if (a.getAttribute('href') === 'index.html') a.classList.add('active');
    });
  })();


  /* ── SPLASH ── */
  const splash     = document.getElementById('splash');
  const navbar     = document.getElementById('navbar');
  const SPLASH_KEY = 'ecolinces_splash_shown';

  if (sessionStorage.getItem(SPLASH_KEY)) {
    splash.style.display = 'none';
    navbar.classList.add('visible');
  } else {
    setTimeout(() => splash.classList.add('animate-logo'), 100);
    setTimeout(() => { splash.classList.remove('animate-logo'); splash.classList.add('animate-slide'); }, 1400);
    setTimeout(() => {
      splash.classList.add('done');
      navbar.classList.add('visible');
      setTimeout(() => { splash.style.display = 'none'; }, 350);
    }, 2000);
    sessionStorage.setItem(SPLASH_KEY, '1');
  }

  /* ── NAV SCROLL ── */
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 10);
  });

  /* ── MENÚ FULLSCREEN ── */
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
      // fullMenuImg puede no existir (panel derecho eliminado del HTML)
      if (fullMenuImg) {
        fullMenuImg.style.opacity = '0';
        setTimeout(() => { fullMenuImg.src = link.dataset.img || ''; fullMenuImg.style.opacity = '0.9'; }, 180);
      }
      link.style.color = link.dataset.color || '';
      if (menuLeft && link.dataset.bg) menuLeft.style.background = link.dataset.bg;
    });
    link.addEventListener('mouseleave', () => {
      link.style.color = '';
      if (menuLeft) menuLeft.style.background = '';
    });
  });

  /* ── AUTH ── */
  if (sb) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session) setLoggedIn(session.user);
      initAuthModal(sb, setLoggedIn, setLoggedOut);
    } catch (err) {
      console.error('Auth error:', err);
    }
  }

  document.getElementById('btnLogin')?.addEventListener('click', () => {
    if (typeof window.openModal === 'function') window.openModal();
  });

  function setLoggedIn(user) {
    setNavLoggedIn(user);
    // Recargar contenido del bento al iniciar sesión
    loadHeroPost().catch(() => loadHeroPostFallback());
    loadRecentPosts().catch(() => loadRecentPostsFallback());
  }
  function setLoggedOut() {
    setNavLoggedOut();
    loadHeroPost().catch(() => loadHeroPostFallback());
    loadRecentPosts().catch(() => loadRecentPostsFallback());
  }

  /* ── CITA DEL DÍA ── */
  let q; // Declaración global para este bloque
  const quotes = [
    { text: '"Sé el cambio que quieres ver en el mundo."', name: 'Mahatma Gandhi', title: 'Pacifista indio', avatar: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRxZcCqLuhQEVOSpL5bwXILVKRT4qZbn6z7oA&s', wiki: 'https://es.wikipedia.org/wiki/Mahatma_Gandhi' },
    { text: '"La Tierra no es una herencia de nuestros padres, sino un préstamo de nuestros hijos."', name: 'Antoine de Saint-Exupéry', title: 'Escritor y aviador francés', avatar: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Antoine_de_Saint-Euxpery_%281920%29.jpg/960px-Antoine_de_Saint-Euxpery_%281920%29.jpg', wiki: 'https://es.wikipedia.org/wiki/Antoine_de_Saint-Exup%C3%A9ry' },
    { text: '"En cada paseo por la naturaleza, uno recibe mucho más de lo que busca."', name: 'John Muir', title: 'Naturalista y conservacionista', avatar: 'https://www.hermidaeditores.com/images/autores/b_-56-1591453209.webp', wiki: 'https://es.wikipedia.org/wiki/John_Muir' },
    { text: '"El medioambiente es donde todos nos encontramos, donde todos tenemos interés mutuo."', name: 'Lady Bird Johnson', title: 'Ex primera dama de EE. UU.', avatar: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Lady_Bird_Johnson%2C_bw_photo_ca1962.jpg/250px-Lady_Bird_Johnson%2C_bw_photo_ca1962.jpg', wiki: 'https://es.wikipedia.org/wiki/Lady_Bird_Johnson' },
    { text: '"La naturaleza siempre lleva los colores del espíritu."', name: 'Ralph Waldo Emerson', title: 'Filósofo y poeta estadounidense', avatar: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Ralph_Waldo_Emerson_by_Josiah_Johnson_Hawes_1857.jpg/960px-Ralph_Waldo_Emerson_by_Josiah_Johnson_Hawes_1857.jpg', wiki: 'https://es.wikipedia.org/wiki/Ralph_Waldo_Emerson' }
  ];

  try {
    let savedIndex = sessionStorage.getItem('ecolinces_quote_index');
    let qi = parseInt(savedIndex);
    
    // El filtro anti-corrupción: si es NaN o está fuera de rango, genera uno nuevo
    if (isNaN(qi) || qi < 0 || qi >= quotes.length) {
      qi = Math.floor(Math.random() * quotes.length);
    }
    
    q = quotes[qi];
    sessionStorage.setItem('ecolinces_quote_index', (qi + 1) % quotes.length);
    
    document.getElementById('bentoQuoteText').textContent = q.text;
    document.getElementById('bentoQuoteRole').textContent = q.title;
    const av = document.getElementById('bentoQuoteAvatar');
    av.src = q.avatar; 
    av.alt = q.name;
    document.getElementById('bentoQuoteName').innerHTML = q.name;
  } catch (err) {
    console.error('Quote initialization error:', err);
    q = quotes[0]; // Respaldo seguro en caso de error extremo
  }

  /* ── FLIP CARD: cara trasera ── */
  const quoteCell     = document.getElementById('bentoQuoteCell');
  const quoteBtnFlip  = document.getElementById('quoteBtnFlip');
  const quoteBtnClose = document.getElementById('quoteBtnClose');
  const backAvatar    = document.getElementById('quoteBackAvatar');
  const backName      = document.getElementById('quoteBackName');
  const backRole      = document.getElementById('quoteBackRole');
  const backSummary   = document.getElementById('quoteBackSummary');
  const backWiki      = document.getElementById('quoteBackWiki');

  // Aseguramos que q exista antes de asignar sus valores
  if (q) {
    backAvatar.src = q.avatar;
    backName.textContent = q.name;
    backRole.textContent = q.title;
    backWiki.href = q.wiki;
  }
  
  let summaryLoaded = false;

  quoteBtnFlip?.addEventListener('click', async () => {
    quoteCell.classList.add('flipped');

    if (!summaryLoaded) {
      summaryLoaded = true;
      try {
        // Extraer el título de Wikipedia desde la URL
        const wikiTitle = decodeURIComponent(q.wiki.split('/wiki/')[1]);
        const apiUrl = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`;
        const res  = await fetch(apiUrl);
        const data = await res.json();
        if (data.extract) {
          // Limitar a ~300 chars para que quepa bien
          const text = data.extract.length > 320
            ? data.extract.slice(0, 320).replace(/\s\S+$/, '') + '…'
            : data.extract;
          backSummary.textContent = text;
        } else {
          backSummary.textContent = 'No se encontró información adicional.';
        }
      } catch {
        backSummary.textContent = 'No se pudo cargar la información.';
      }
    }
  });

  quoteBtnClose?.addEventListener('click', () => {
    quoteCell.classList.remove('flipped');
  });

  /* ── POST MÁS VOTADO → CELDA HERO ── */
  loadHeroPost().catch(err => {
    console.error('Hero post load error:', err);
  });

  /* ── POSTS RECIENTES ── */
  loadRecentPosts().catch(err => {
    console.error('Recent posts load error:', err);
  });

  /* ── NEWSLETTER 2 PASOS ── */
  let pendingEmail = '';
  const step1   = document.getElementById('nlStep1');
  const step2   = document.getElementById('nlStep2');
  const emailIn = document.getElementById('nlEmail');
  const nameIn  = document.getElementById('nlName');
  const btn1    = document.getElementById('nlSubmit');
  const btn2    = document.getElementById('nlSubmitName');
  const heading = document.getElementById('nlHeading');

  function goToStep2() {
    const val = emailIn?.value.trim();
    if (!val || !val.includes('@')) { showNlMsg('Por favor ingresa un correo válido.', false); return; }
    pendingEmail = val;
    step1.classList.add('nl-hidden');
    step2.classList.remove('nl-hidden');
    step2.classList.add('nl-step-enter');
    heading.textContent = '¿Cómo quieres que te llamemos?';
    setTimeout(() => { nameIn?.focus(); }, 50);
  }

  async function submitFinal() {
    const nameVal = nameIn?.value.trim();
    btn2.disabled = true; btn2.textContent = '…';
    try {
      const res = await fetch(_NL_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, name: nameVal || '' })
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        step2.classList.add('nl-hidden');
        heading.textContent = (data.duplicate)
          ? '¡Ya estás suscrito!'
          : (nameVal ? `¡Bienvenido, ${nameVal}!` : '¡Ya eres parte de EcoLinces!');
      } else {
        showNlMsg('Ocurrió un error. Intenta de nuevo.', false);
        btn2.disabled = false; btn2.textContent = '→';
      }
    } catch {
      showNlMsg('Error de conexión. Intenta más tarde.', false);
      btn2.disabled = false; btn2.textContent = '→';
    }
  }

  btn1?.addEventListener('click', goToStep2);
  emailIn?.addEventListener('keydown', e => { if (e.key === 'Enter') goToStep2(); });
  btn2?.addEventListener('click', submitFinal);
  nameIn?.addEventListener('keydown', e => { if (e.key === 'Enter') submitFinal(); });

  /* ── FADE-IN ── */
  const fadeObs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); fadeObs.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-in').forEach(el => fadeObs.observe(el));
});

async function loadHeroPost() {
  if (!sb) {
    loadHeroPostFallback();
    return;
  }

  try {
    // Usar siempre el post más reciente publicado (sin join a post_votes para evitar problemas de RLS)
    const { data: recent } = await sb
      .from('posts')
      .select('id, title, slug, excerpt, cover_url, categories(name, color)')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(1);

    let heroPost = recent?.[0] || null;

    // Fallback content if no posts
    if (!heroPost) {
      loadHeroPostFallback();
      return;
    }

    const heroEl    = document.getElementById('bentoHero');
    const heroBg    = document.getElementById('bentoHeroBg');
    const eyebrow   = document.getElementById('bentoEyebrow');
    const titleEl   = document.getElementById('bentoTitle');
    const excerptEl = document.getElementById('bentoExcerpt');

    heroBg.style.backgroundImage = heroPost.cover_url ? `url('${heroPost.cover_url}')` : 'linear-gradient(135deg,#2e7d32 0%,#1b5e20 100%)';
    heroEl.href = heroPost.slug !== "#" ? `post.html?slug=${heroPost.slug}` : "#";
    const cat = heroPost.categories;
    if (cat) { eyebrow.textContent = cat.name; eyebrow.style.background = cat.color; }
    else      { eyebrow.style.display = 'none'; }
    titleEl.textContent   = heroPost.title;
    excerptEl.textContent = heroPost.excerpt || '';
  } catch (err) {
    console.error('Hero post load error:', err);
    loadHeroPostFallback();
  }
}

async function loadRecentPosts() {
  const grid = document.getElementById('recentGrid');
  if (!grid) return;

  if (!sb) {
    loadRecentPostsFallback();
    return;
  }

  try {
    const { data: posts } = await sb
      .from('posts')
      .select('id, title, slug, excerpt, cover_url, created_at, categories(name, color)')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(3);

    if (!posts || posts.length === 0) {
      loadRecentPostsFallback();
      return;
    }

    grid.innerHTML = posts.map(post => {
      const cat  = post.categories;
      const date = new Date(post.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
      return `
        <a class="recent-card" href="post.html?slug=${post.slug}">
          <div class="recent-card-cover-wrap">
            <img class="recent-card-cover" src="${post.cover_url || 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600&q=70'}" alt="${post.title}" loading="lazy" />
          </div>
          <div class="recent-card-body">
            ${cat ? `<span class="recent-card-cat" style="background:${cat.color}">${cat.name}</span>` : ''}
            <h3 class="recent-card-title">${post.title}</h3>
            <p class="recent-card-excerpt">${post.excerpt || ''}</p>
            <div class="recent-card-date">${date}</div>
          </div>
        </a>`;
    }).join('');
  } catch (err) {
    console.error('Recent posts load error:', err);
    loadRecentPostsFallback();
  }
}

function showNlMsg(text, ok) {
  const msg = document.getElementById('nlMsg');
  if (!msg) return;
  msg.textContent = text;
  msg.style.color = ok ? 'rgba(255,255,255,0.95)' : '#ffcdd2';
  msg.classList.toggle('show', !!text);
  if (text) setTimeout(() => msg.classList.remove('show'), 6000);
}