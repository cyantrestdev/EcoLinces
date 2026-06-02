/* Usar el cliente Supabase global (instanciado en sb.js) */
const sb = window.sb;

let currentUser  = null;
let currentSlug  = '';
let userVotes    = {};
let savedSlugs   = new Set();

async function loadSavedSlugs() {
  if (!currentUser) return;
  const { data } = await sb
    .from('ecolinces_saved_posts')
    .select('post_slug')
    .eq('user_id', currentUser.id);
  savedSlugs = new Set((data || []).map(r => r.post_slug));
}

async function toggleSave(slug, btn) {
  if (!currentUser) { window.openModal?.(); return; }
  const isSaved = savedSlugs.has(slug);
  if (isSaved) {
    await sb.from('ecolinces_saved_posts').delete()
      .eq('user_id', currentUser.id).eq('post_slug', slug);
    savedSlugs.delete(slug);
  } else {
    await sb.from('ecolinces_saved_posts').insert({ user_id: currentUser.id, post_slug: slug });
    savedSlugs.add(slug);
  }
  updateSaveBtn(btn, !isSaved);
}

function updateSaveBtn(btn, isSaved) {
  btn.classList.toggle('saved', isSaved);
  btn.title = isSaved ? 'Quitar de guardados' : 'Guardar artículo';
  btn.innerHTML = isSaved
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  // ── Link activo en el nav ────────────────────────────────────────────────
  (function markActiveNav() {
    document.querySelectorAll('.nav-links a').forEach(a => {
      if (a.getAttribute('href') === 'blog.html') a.classList.add('active');
    });
  })();


  // ── MENÚ DRAWER LATERAL ──
  const hamburger       = document.getElementById('hamburger');
  const fullMenu        = document.getElementById('fullMenu');
  const fullMenuClose   = document.getElementById('fullMenuClose');
  const fullMenuOverlay = document.getElementById('fullMenuOverlay');
  const menuLinks       = fullMenu.querySelectorAll('.fullmenu-left a');

  // Hover de color en los links del drawer
  menuLinks.forEach(link => {
    link.addEventListener('touchstart', () => {
      if (link.dataset.color) link.style.color = link.dataset.color;
    }, { passive: true });
    link.addEventListener('mouseenter', () => {
      if (link.dataset.color) link.style.color = link.dataset.color;
    });
    link.addEventListener('mouseleave', () => { link.style.color = ''; });
  });

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

  // Botón cerrar sesión del drawer

  // Botón iniciar sesión del drawer → abre modal de auth y cierra el drawer
  document.getElementById('drawerLogin')?.addEventListener('click', () => {
    fullMenu.classList.remove('open');
    fullMenuOverlay.classList.remove('visible');
    document.body.style.overflow = '';
    window.openModal?.();
  });

  document.getElementById('drawerSignout')?.addEventListener('click', async () => {
    if (typeof window.cerrarSesionEnAmbos === 'function') {
      await window.cerrarSesionEnAmbos();
    } else {
      await (window.sb || sb)?.auth.signOut();
    }
    window.location.href = 'index.html';
  });

  // ── NAV SCROLL ──
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 10);
  });

  // ── AUTH ──
  const { data: { session } } = await sb.auth.getSession();
  if (session) setLoggedIn(session.user);

  initAuthModal(sb, setLoggedIn, setLoggedOut);

  // btnLogin removido del HTML — el login se maneja desde el drawer (#drawerLogin)

  // ── CARGAR CATEGORÍAS ──
  const { data: cats } = await sb.from('categories').select('*').order('name');
  const filtersEl = document.getElementById('blogFilters');
  if (cats) {
    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.dataset.slug = cat.slug;
      btn.textContent = cat.name;
      btn.style.setProperty('--cat-color', cat.color);
      filtersEl.appendChild(btn);
    });
  }

  filtersEl.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSlug = btn.dataset.slug;
    loadPosts(currentSlug);
  });

  // ── CARGAR VOTOS DEL USUARIO ──
  async function loadUserVotes() {
    if (!currentUser) { userVotes = {}; return; }
    const { data } = await sb.from('post_votes').select('post_id, value').eq('user_id', currentUser.id);
    if (data) data.forEach(v => { userVotes[v.post_id] = v.value; });
  }

  // ── CARGAR POSTS ──
  async function loadPosts(catSlug = '') {
    const grid = document.getElementById('blogGrid');
    grid.innerHTML = Array(6).fill('<div class="post-card skeleton"></div>').join('');

    await loadUserVotes();

    let query = sb
      .from('posts')
      .select(`*, categories(name, slug, color), profiles(username, avatar_url), post_votes(value)`)
      .eq('published', true)
      .order('created_at', { ascending: false });

    if (catSlug) {
      const cat = cats?.find(c => c.slug === catSlug);
      if (cat) query = query.eq('category_id', cat.id);
    }

    const { data: posts, error } = await query;

    grid.innerHTML = '';

    if (error || !posts || posts.length === 0) {
      grid.innerHTML = '<div class="blog-empty">No hay artículos en esta categoría aún.</div>';
      return;
    }

    posts.forEach(post => {
      const score = post.post_votes?.reduce((sum, v) => sum + v.value, 0) ?? 0;
      const myVote = userVotes[post.id] ?? 0;
      const cat = post.categories;
      const date = new Date(post.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });

      const card = document.createElement('div');
      card.className = 'post-card';
      card.innerHTML = `
        <img class="post-card-cover" src="${post.cover_url || ''}" alt="${post.title}" loading="lazy" />
        <div class="post-card-body">
          ${cat ? `<span class="post-card-category" style="background:${cat.color}">${cat.name}</span>` : ''}
          <h2 class="post-card-title">${post.title}</h2>
          <p class="post-card-excerpt">${post.excerpt || ''}</p>
          <div class="post-card-footer">
            <span class="post-card-date">${date}</span>
            <div class="vote-row">
              <button class="vote-btn up ${myVote === 1 ? 'voted' : ''}" data-id="${post.id}" data-val="1" title="Me gusta">▲</button>
              <span class="vote-score" id="score-${post.id}">${score}</span>
              <button class="vote-btn down ${myVote === -1 ? 'voted' : ''}" data-id="${post.id}" data-val="-1" title="No me gusta">▼</button>
              <button class="save-btn ${savedSlugs.has(post.slug) ? 'saved' : ''}" data-slug="${post.slug}" title="${savedSlugs.has(post.slug) ? 'Quitar de guardados' : 'Guardar artículo'}">
                ${savedSlugs.has(post.slug)
                  ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`
                  : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`
                }
              </button>
            </div>
          </div>
        </div>
      `;

      // Click en la tarjeta → abrir artículo
      card.addEventListener('click', e => {
        if (e.target.closest('.vote-btn')) return;
        window.location.href = `post.html?slug=${post.slug}`;
      });

      // Votos
      card.querySelectorAll('.vote-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          if (!currentUser) { if (typeof window.openModal === 'function') window.openModal(); return; }
          await handleVote(post.id, parseInt(btn.dataset.val), card);
        });
      });

      // Guardar
      card.querySelector('.save-btn')?.addEventListener('click', async e => {
        e.stopPropagation();
        await toggleSave(post.slug, e.currentTarget);
      });

      grid.appendChild(card);
    });
  }

  // ── MANEJAR VOTO ──
  async function handleVote(postId, value, card) {
    const current = userVotes[postId] ?? 0;

    if (current === value) {
      // Quitar voto
      await sb.from('post_votes').delete().eq('post_id', postId).eq('user_id', currentUser.id);
      userVotes[postId] = 0;
    } else {
      // Insertar o actualizar
      await sb.from('post_votes').upsert({ post_id: postId, user_id: currentUser.id, value }, { onConflict: 'post_id,user_id' });
      userVotes[postId] = value;
    }

    // Actualizar score en UI
    const { data } = await sb.from('post_votes').select('value').eq('post_id', postId);
    const newScore = data?.reduce((s, v) => s + v.value, 0) ?? 0;
    card.querySelector(`#score-${postId}`).textContent = newScore;

    const myVote = userVotes[postId] ?? 0;
    card.querySelector('.vote-btn.up').classList.toggle('voted', myVote === 1);
    card.querySelector('.vote-btn.down').classList.toggle('voted', myVote === -1);
  }

  // ── HELPERS ──
  function setLoggedIn(user) {
    currentUser = user;
    loadSavedSlugs();
    setNavLoggedIn(user);
  }

  function setLoggedOut() {
    currentUser = null;
    userVotes   = {};
    setNavLoggedOut();
  }

  // ── INICIO ──
  loadPosts();
});