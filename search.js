/* ══════════════════════════════════════════════════
   search.js — Buscador Global EcoLinces
   Busca usuarios (perfiles) primero, luego posts.
   Requiere: sb (supabase client) global o pasado.
══════════════════════════════════════════════════ */

(function () {
  /* ── Inyectar HTML del buscador en el nav ── */
  function injectSearchUI() {
    /* Botón lupa que va ANTES del grupo nav-auth */
    const navRightGroup = document.querySelector('.nav-right-group');
    if (!navRightGroup) return;

    const searchBtn = document.createElement('button');
    searchBtn.className = 'nav-search-btn';
    searchBtn.id        = 'navSearchBtn';
    searchBtn.setAttribute('aria-label', 'Buscar');
    searchBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
    /* Insertar DESPUÉS del nav-auth (al final del grupo derecho) */
    navRightGroup.appendChild(searchBtn);

    /* Panel de búsqueda (fullwidth overlay bajo el nav) */
    const panel = document.createElement('div');
    panel.id        = 'searchPanel';
    panel.className = 'search-panel';
    panel.innerHTML = `
      <div class="search-panel-inner">
        <div class="search-input-row">
          <svg class="search-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            id="searchInput"
            class="search-input"
            type="text"
            placeholder="Buscar usuarios o artículos…"
            autocomplete="off"
            spellcheck="false"
          />
          <button class="search-clear-btn" id="searchClear" aria-label="Limpiar">✕</button>
        </div>
        <div class="search-results" id="searchResults">
          <div class="search-hint">Escribe para buscar usuarios y artículos del EcoBlog.</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    /* Overlay para cerrar al click fuera */
    const overlay = document.createElement('div');
    overlay.id        = 'searchOverlay';
    overlay.className = 'search-overlay';
    document.body.appendChild(overlay);

    bindSearchEvents();
  }

  /* ── Lógica de eventos ── */
  function bindSearchEvents() {
    const btn     = document.getElementById('navSearchBtn');
    const panel   = document.getElementById('searchPanel');
    const overlay = document.getElementById('searchOverlay');
    const input   = document.getElementById('searchInput');
    const clear   = document.getElementById('searchClear');

    function openSearch() {
      panel.classList.add('open');
      overlay.classList.add('visible');
      document.body.style.overflow = 'hidden';
      setTimeout(() => input?.focus(), 80);
    }

    function closeSearch() {
      panel.classList.remove('open');
      overlay.classList.remove('visible');
      document.body.style.overflow = '';
    }

    btn?.addEventListener('click', () => {
      panel.classList.contains('open') ? closeSearch() : openSearch();
    });

    overlay.addEventListener('click', closeSearch);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSearch();
      /* Atajo: "/" para abrir búsqueda */
      if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        openSearch();
      }
    });

    clear?.addEventListener('click', () => {
      input.value = '';
      input.focus();
      renderHint();
    });

    /* Debounce de búsqueda */
    let timer;
    input?.addEventListener('input', () => {
      const q = input.value.trim();
      clear.style.display = q ? '' : 'none';
      clearTimeout(timer);
      if (!q) { renderHint(); return; }
      if (q.length < 2) return;
      renderLoading();
      timer = setTimeout(() => runSearch(q), 280);
    });
  }

  /* ── Búsqueda principal ── */
  async function runSearch(q) {
    const results = document.getElementById('searchResults');
    try {
      /* Buscar usuarios (profiles) */
      const { data: users } = await sb
        .from('profiles')
        .select('id, username, avatar_url, bio')
        .ilike('username', `%${q}%`)
        .limit(5);

      /* Buscar posts */
      const { data: posts } = await sb
        .from('posts')
        .select('id, title, slug, excerpt, cover_url, categories(name, color)')
        .eq('published', true)
        .or(`title.ilike.%${q}%,excerpt.ilike.%${q}%`)
        .limit(6);

      renderResults(q, users || [], posts || []);
    } catch (err) {
      results.innerHTML = `<div class="search-error">Error al buscar. Intenta de nuevo.</div>`;
    }
  }

  /* ── Renderizar resultados ── */
  function renderResults(q, users, posts) {
    const results = document.getElementById('searchResults');
    let html = '';

    /* ── Sección de usuarios (primero) ── */
    if (users.length > 0) {
      html += `<div class="search-section-label">Usuarios</div>`;
      html += users.map(u => {
        const avatar = u.avatar_url ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username)}&background=a8d5a2&color=1a1a1a&size=64`;
        const bio = u.bio ? `<span class="sr-user-bio">${escapeQ(u.bio, 48)}</span>` : '';
        return `
          <a class="sr-user" href="perfil.html?user=${u.username}">
            <img class="sr-user-avatar" src="${avatar}" alt="${u.username}" />
            <div class="sr-user-info">
              <span class="sr-user-name">${highlight(u.username, q)}</span>
              ${bio}
            </div>
            <span class="sr-user-arrow">→</span>
          </a>
        `;
      }).join('');
    }

    /* ── Sección de posts (segundo) ── */
    if (posts.length > 0) {
      html += `<div class="search-section-label">Artículos del EcoBlog</div>`;
      html += posts.map(p => {
        const cat = p.categories;
        const badge = cat
          ? `<span class="sr-post-badge" style="background:${cat.color}">${cat.name}</span>`
          : '';
        const cover = p.cover_url
          ? `<img class="sr-post-cover" src="${p.cover_url}" alt="" />`
          : '';
        return `
          <a class="sr-post" href="post.html?slug=${p.slug}">
            ${cover}
            <div class="sr-post-body">
              ${badge}
              <span class="sr-post-title">${highlight(p.title, q)}</span>
              ${p.excerpt ? `<span class="sr-post-excerpt">${escapeQ(p.excerpt, 80)}</span>` : ''}
            </div>
          </a>
        `;
      }).join('');
    }

    if (!html) {
      html = `<div class="search-empty">Sin resultados para "<strong>${escQ(q)}</strong>".</div>`;
    }

    results.innerHTML = html;

    /* Cerrar al hacer click en un resultado */
    results.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        document.getElementById('searchPanel').classList.remove('open');
        document.getElementById('searchOverlay').classList.remove('visible');
        document.body.style.overflow = '';
      });
    });
  }

  function renderHint() {
    const results = document.getElementById('searchResults');
    results.innerHTML = `<div class="search-hint">Escribe para buscar usuarios y artículos del EcoBlog.</div>`;
  }

  function renderLoading() {
    const results = document.getElementById('searchResults');
    results.innerHTML = `
      <div class="search-loading">
        <span class="search-spinner"></span> Buscando…
      </div>
    `;
  }

  /* ── Utils ── */
  function highlight(text, q) {
    const safe = escQ(text);
    const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(`(${safeQ})`, 'gi'), '<mark>$1</mark>');
  }

  function escQ(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function escapeQ(str, max) {
    const s = escQ(str);
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  /* ── Init cuando el DOM esté listo ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSearchUI);
  } else {
    injectSearchUI();
  }
})();
