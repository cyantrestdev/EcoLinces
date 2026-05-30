// guardados.js — EcoLinces
// Muestra los posts guardados por el usuario autenticado

document.addEventListener('DOMContentLoaded', async () => {

  const grid = document.getElementById('savedGrid');

  // ── Auth: redirigir si no hay sesión ────────────────────────────────────
  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    // Actualizar nav con los datos del usuario
    if (typeof setNavLoggedIn === 'function') setNavLoggedIn(session.user);
  }

  if (!session) {
    grid.innerHTML = `
      <div class="blog-empty" style="grid-column:1/-1;">
        <p>Inicia sesión para ver tus artículos guardados.</p>
        <button class="btn-auth" style="margin-top:16px" onclick="window.openModal?.()">
          Iniciar sesión
        </button>
      </div>`;
    return;
  }

  const userId = session.user.id;

  // ── Cargar slugs guardados ───────────────────────────────────────────────
  const { data: saved, error: savedError } = await sb
    .from('ecolinces_saved_posts')
    .select('post_slug, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (savedError || !saved || saved.length === 0) {
    grid.innerHTML = `
      <div class="blog-empty" style="grid-column:1/-1;">
        Aún no has guardado ningún artículo.
        <a href="blog.html" style="display:block;margin-top:12px;color:var(--green-btn)">
          Ir al EcoBlog →
        </a>
      </div>`;
    return;
  }

  const slugs = saved.map(s => s.post_slug);

  // ── Cargar datos de los posts ────────────────────────────────────────────
  const { data: posts, error: postsError } = await sb
    .from('posts')
    .select('id, title, slug, excerpt, cover_url, created_at, categories(name, color)')
    .in('slug', slugs)
    .eq('published', true);

  if (postsError || !posts || posts.length === 0) {
    grid.innerHTML = `<div class="blog-empty" style="grid-column:1/-1;">No se pudieron cargar los artículos.</div>`;
    return;
  }

  // Ordenar según el orden de guardado (Supabase .in() no garantiza orden)
  const ordered = slugs
    .map(slug => posts.find(p => p.slug === slug))
    .filter(Boolean);

  // ── Renderizar tarjetas ──────────────────────────────────────────────────
  grid.innerHTML = '';

  ordered.forEach(post => {
    const cat  = post.categories;
    const date = new Date(post.created_at).toLocaleDateString('es-MX', {
      year: 'numeric', month: 'short', day: 'numeric'
    });

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
          <button class="save-btn saved" data-slug="${post.slug}" title="Quitar de guardados">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    // Click en tarjeta → abrir post
    card.addEventListener('click', e => {
      if (e.target.closest('.save-btn')) return;
      window.location.href = `post.html?slug=${post.slug}`;
    });

    // Quitar de guardados
    card.querySelector('.save-btn').addEventListener('click', async e => {
      e.stopPropagation();
      const slug = e.currentTarget.dataset.slug;
      const { error } = await sb
        .from('ecolinces_saved_posts')
        .delete()
        .eq('user_id', userId)
        .eq('post_slug', slug);

      if (!error) {
        card.style.transition = 'opacity 0.3s, transform 0.3s';
        card.style.opacity    = '0';
        card.style.transform  = 'scale(0.95)';
        setTimeout(() => {
          card.remove();
          if (!grid.querySelector('.post-card')) {
            grid.innerHTML = `
              <div class="blog-empty" style="grid-column:1/-1;">
                Aún no has guardado ningún artículo.
                <a href="blog.html" style="display:block;margin-top:12px;color:var(--green-btn)">
                  Ir al EcoBlog →
                </a>
              </div>`;
          }
        }, 300);
      }
    });

    grid.appendChild(card);
  });

  // ── Auth listeners ───────────────────────────────────────────────────────
  function setLoggedIn(user)  { /* nav ya lo maneja auth.js */ }
  function setLoggedOut()     { window.location.href = 'index.html'; }

  initAuthModal(sb, setLoggedIn, setLoggedOut);

  document.getElementById('drawerLogin')?.addEventListener('click', () => {
    document.getElementById('fullMenu')?.classList.remove('open');
    window.openModal?.();
  });

  document.getElementById('drawerSignout')?.addEventListener('click', async () => {
    if (typeof window.cerrarSesionEnAmbos === 'function') {
      await window.cerrarSesionEnAmbos();
    } else {
      await sb.auth.signOut();
    }
    window.location.href = 'index.html';
  });

  sb.auth.onAuthStateChange((_event, sess) => {
    if (!sess) window.location.href = 'index.html';
  });

  window.addEventListener('scroll', () => {
    document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 10);
  });
});
