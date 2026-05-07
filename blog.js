/* Usar el cliente Supabase global (instanciado en sb.js) */
const sb = window.sb;

let currentUser  = null;
let currentSlug  = '';
let userVotes    = {};

document.addEventListener('DOMContentLoaded', async () => {

  // ── MENÚ FULLSCREEN (igual que index) ──
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

  [fullMenuClose, fullMenuOverlay].forEach(el => el.addEventListener('click', () => {
    fullMenu.classList.remove('open');
    fullMenuOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }));

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

  // ── NAV SCROLL ──
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 10);
  });

  // ── AUTH ──
  const { data: { session } } = await sb.auth.getSession();
  if (session) setLoggedIn(session.user);

  initAuthModal(sb, setLoggedIn, setLoggedOut);

  document.getElementById('btnLogin').addEventListener('click', () => {
    if (currentUser) sb.auth.signOut();
    else if (typeof window.openModal === 'function') window.openModal();
  });

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