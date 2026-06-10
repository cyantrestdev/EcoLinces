/* Usar el cliente Supabase global (instanciado en sb.js) */
const sb = window.sb;

let currentUser  = null;
let currentPost  = null;

function showShareToast(msg) {
  let toast = document.getElementById('shareToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'shareToast';
    toast.className = 'share-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 2500);
}
let commentVotes = {};
let isPostSaved  = false;

async function loadPostSaveState(slug) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  const { data } = await sb
    .from('ecolinces_saved_posts')
    .select('post_slug')
    .eq('user_id', session.user.id)
    .eq('post_slug', slug)
    .maybeSingle();
  isPostSaved = !!data;
  updatePostSaveBtn();
}

function updatePostSaveBtn() {
  const btn = document.getElementById('postSaveBtn');
  if (!btn) return;
  btn.classList.toggle('saved', isPostSaved);
  btn.title = isPostSaved ? 'Quitar de guardados' : 'Guardar artículo';
  btn.innerHTML = isPostSaved
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><span class="btn-label"> Guardado</span>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><span class="btn-label"> Guardar</span>';
}
let postVote     = 0;
let sortMode     = 'new';

document.addEventListener('DOMContentLoaded', async () => {
  // ── Link activo en el nav ────────────────────────────────────────────────
  (function markActiveNav() {
    document.querySelectorAll('.nav-links a').forEach(a => {
      if (a.getAttribute('href') === 'blog.html') a.classList.add('active');
    });
  })();


  // ── MENÚ FULLSCREEN ──
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

  // Hover de color en los links del drawer
  fullMenu.querySelectorAll('.fullmenu-left a').forEach(link => {
    link.addEventListener('touchstart', () => {
      if (link.dataset.color) link.style.color = link.dataset.color;
    }, { passive: true });
    link.addEventListener('mouseenter', () => {
      if (link.dataset.color) link.style.color = link.dataset.color;
    });
    link.addEventListener('mouseleave', () => { link.style.color = ''; });
  });

  // ── NAV ──
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 10);
  });

  // ── AUTH ──
  const { data: { session } } = await sb.auth.getSession();
  if (session) setLoggedIn(session.user);

  initAuthModal(sb, setLoggedIn, setLoggedOut);

  // btnLogin removido del HTML — el login se maneja desde el drawer (#drawerLogin)

  // ── LEER SLUG DE LA URL ──
  const params = new URLSearchParams(window.location.search);
  const slug   = params.get('slug');

  if (!slug) {
    document.getElementById('postArticle').innerHTML = '<p style="padding:80px 48px;text-align:center">No se proporcionó un artículo (falta el parámetro <code>slug</code>).</p>';
    return;
  }

  if (!sb) {
    document.getElementById('postArticle').innerHTML = '<p style="padding:80px 48px;text-align:center;color:#c62828">Error: Supabase no está disponible. Verifica <code>config.js</code> y <code>sb.js</code>.</p>';
    return;
  }

  // ── CARGAR ARTÍCULO ──
  const { data: post, error: postErr } = await sb
    .from('posts')
    .select('*, categories(name, slug, color), profiles(username, avatar_url)')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();

  if (postErr) {
    document.getElementById('postArticle').innerHTML = `
      <p style="padding:80px 48px;text-align:center;color:#c62828">
        Error al cargar el artículo.<br>
        <small style="color:#999;font-size:0.8rem">Código: ${postErr.code} — ${postErr.message}</small>
      </p>`;
    return;
  }

  if (!post) {
    document.getElementById('postArticle').innerHTML = `
      <p style="padding:80px 48px;text-align:center;color:#999">
        Artículo no encontrado.<br>
        <small style="font-size:0.8rem">Slug buscado: <code>${slug}</code></small>
      </p>`;
    return;
  }

  currentPost = post;
  renderPost(post);

  loadRelatedPosts(post);

  // Cargar votos del usuario en este post
  if (currentUser) {
    const { data: v } = await sb.from('post_votes').select('value')
      .eq('post_id', post.id).eq('user_id', currentUser.id).maybeSingle();
    if (v) postVote = v.value;
  }

  // Score inicial
  const { data: allVotes } = await sb.from('post_votes').select('value').eq('post_id', post.id);
  const score = allVotes?.reduce((s, v) => s + v.value, 0) ?? 0;
  renderVoteBar(post.id, score);

  // Cargar estado guardado DESPUÉS de renderVoteBar (que crea el #postSaveBtn)
  loadPostSaveState(post.slug);

  // ── COMENTARIOS ──
  document.getElementById('commentsSection').style.display = '';
  await loadComments();

  // Tiempo real: escuchar nuevos comentarios
  sb.channel('comments-' + post.id)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'comments',
      filter: `post_id=eq.${post.id}`
    }, () => loadComments())
    .subscribe();

  // ── ORDENAR ──
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sortMode = btn.dataset.sort;
      loadComments();
    });
  });

  // ── ENVIAR COMENTARIO PRINCIPAL ──
  const commentInput  = document.getElementById('commentInput');
  const btnSubmit     = document.getElementById('btnSubmitComment');

  commentInput.addEventListener('input', () => {
    btnSubmit.disabled = !currentUser || commentInput.value.trim().length === 0;
  });

  btnSubmit.addEventListener('click', async () => {
    const content = commentInput.value.trim();
    if (!content || !currentUser) return;
    btnSubmit.disabled = true;
    const { error } = await sb.from('comments').insert({
      post_id: currentPost.id,
      author_id: currentUser.id,
      content
    });
    if (!error) { commentInput.value = ''; }
    btnSubmit.disabled = false;
  });

});

// ── RENDER ARTÍCULO ──
function renderPost(post) {
  const cat  = post.categories;
  const date = new Date(post.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const author = post.profiles?.username || 'EcoLinces';

  document.title = post.title + ' — EcoLinces';

  // ── Actualizar meta tags SEO / OG / Schema.org ──────────────────────────
  const postUrl     = `https://ecolinces.pages.dev/post.html?slug=${post.slug}`;
  const postImage   = post.cover_url || 'https://ecolinces.pages.dev/community.png';
  const postDesc    = post.excerpt   || 'EcoLinces — El blog ambiental de la comunidad.';
  const postAuthor  = post.profiles?.username || 'EcoLinces';
  const postDate    = post.created_at ? new Date(post.created_at).toISOString() : '';
  const postUpdated = post.updated_at ? new Date(post.updated_at).toISOString() : postDate;

  function setMeta(selector, attr, value) {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  }

  // Básicos
  setMeta('meta[name="description"]',        'content', postDesc);
  setMeta('link[rel="canonical"]',           'href',    postUrl);

  // Open Graph
  setMeta('meta[property="og:title"]',       'content', post.title + ' — EcoLinces');
  setMeta('meta[property="og:description"]', 'content', postDesc);
  setMeta('meta[property="og:image"]',       'content', postImage);
  setMeta('meta[property="og:url"]',         'content', postUrl);

  // Twitter
  setMeta('meta[name="twitter:title"]',       'content', post.title + ' — EcoLinces');
  setMeta('meta[name="twitter:description"]', 'content', postDesc);
  setMeta('meta[name="twitter:image"]',       'content', postImage);

  // Schema.org (JSON-LD) — para citas APA, Zotero, etc.
  const schema = document.getElementById('schemaArticle');
  if (schema) {
    schema.textContent = JSON.stringify({
      '@context':        'https://schema.org',
      '@type':           'Article',
      'headline':         post.title,
      'description':      postDesc,
      'image':            postImage,
      'datePublished':    postDate,
      'dateModified':     postUpdated,
      'url':              postUrl,
      'author': {
        '@type': 'Person',
        'name':   postAuthor
      },
      'publisher': {
        '@type': 'Organization',
        'name':  'EcoLinces',
        'logo': {
          '@type': 'ImageObject',
          'url':   'https://ecolinces.pages.dev/logo.svg'
        }
      },
      'mainEntityOfPage': {
        '@type': 'WebPage',
        '@id':    postUrl
      }
    }, null, 2);
  }

  document.getElementById('postArticle').innerHTML = `
    <div class="post-hero">
      <img class="post-hero-img" src="${post.cover_url || ''}" alt="${post.title}" />
      <div class="post-hero-overlay"></div>
      <div class="post-hero-content">
        ${cat ? `<span class="post-category-badge" style="background:${cat.color}">${cat.name}</span>` : ''}
        <h1 class="post-hero-title">${post.title}</h1>
        <div class="post-meta">
          <span class="post-meta-author">${author}</span>
          <span class="post-meta-sep">·</span>
          <span>${date}</span>
        </div>
      </div>
    </div>
    <div id="voteBarSlot"></div>
    <div class="post-layout">
      <div class="post-content" id="postContent">
        ${post.content ? post.content.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('') : '<p><em>Contenido próximamente...</em></p>'}
      </div>
      <aside class="post-sidebar" id="postSidebar">
        <div class="sidebar-related">
          <h3 class="sidebar-title">Entradas relacionadas</h3>
          <div id="relatedPosts"><div class="related-loading"></div></div>
        </div>
      </aside>
    </div>
  `;
}

// ── BARRA DE VOTOS ──
function renderVoteBar(postId, score) {
  const slot = document.getElementById('voteBarSlot');
  if (!slot) return;
  slot.innerHTML = `
    <div class="post-vote-bar">
      <a class="back-link" href="blog.html"><span class="back-arrow">←</span><span class="back-text"> Volver al blog</span></a>
      <div class="post-vote-bar-right">
        <div class="vote-group">
          <button class="vote-btn up ${postVote === 1 ? 'voted' : ''}" id="vbUp">▲</button>
          <span class="vote-score" id="vbScore">${score}</span>
          <button class="vote-btn down ${postVote === -1 ? 'voted' : ''}" id="vbDown">▼</button>
        </div>
        <button class="save-btn post-save-btn" id="postSaveBtn" title="Guardar artículo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          <span class="btn-label">Guardar</span>
        </button>
        <button class="save-btn post-share-btn" id="postShareBtn" title="Compartir artículo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span class="btn-label">Compartir</span>
        </button>
      </div>
    </div>
  `;

  document.getElementById('vbUp').addEventListener('click',   () => handlePostVote(postId,  1));
  document.getElementById('vbDown').addEventListener('click', () => handlePostVote(postId, -1));

  // ── Botón compartir ──────────────────────────────────────────────────────
  document.getElementById('postShareBtn')?.addEventListener('click', async () => {
    const url   = `https://ecolinces.pages.dev/post.html?slug=${currentPost?.slug || new URLSearchParams(location.search).get('slug')}`;
    const title = currentPost?.title || document.title;
    const text  = currentPost?.excerpt || '';

    if (navigator.share) {
      // Web Share API — abre el menú nativo en móvil
      try {
        await navigator.share({ title, text, url });
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('Share failed:', e);
      }
    } else {
      // Fallback desktop — copiar al portapapeles
      try {
        await navigator.clipboard.writeText(url);
        showShareToast('¡Link copiado al portapapeles!');
      } catch (_) {
        showShareToast('Copia este link: ' + url);
      }
    }
  });

  document.getElementById('postSaveBtn').addEventListener('click', async () => {
    // Obtener sesión en tiempo de click — evita problemas de scope/timing
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.openModal?.(); return; }

    const userId = session.user.id;
    const slug   = currentPost?.slug || new URLSearchParams(location.search).get('slug');

    // Verificar estado actual directo desde Supabase
    const { data: existing } = await sb
      .from('ecolinces_saved_posts')
      .select('post_slug')
      .eq('user_id', userId)
      .eq('post_slug', slug)
      .maybeSingle();

    const btn = document.getElementById('postSaveBtn');
    if (existing) {
      await sb.from('ecolinces_saved_posts').delete()
        .eq('user_id', userId).eq('post_slug', slug);
      isPostSaved = false;
    } else {
      await sb.from('ecolinces_saved_posts').insert({ user_id: userId, post_slug: slug });
      isPostSaved = true;
    }
    updatePostSaveBtn();
  });
}

async function handlePostVote(postId, value) {
  if (!currentUser) { openModal(); return; }
  if (postVote === value) {
    await sb.from('post_votes').delete().eq('post_id', postId).eq('user_id', currentUser.id);
    postVote = 0;
  } else {
    await sb.from('post_votes').upsert({ post_id: postId, user_id: currentUser.id, value }, { onConflict: 'post_id,user_id' });
    postVote = value;
  }
  const { data } = await sb.from('post_votes').select('value').eq('post_id', postId);
  const newScore = data?.reduce((s, v) => s + v.value, 0) ?? 0;
  document.getElementById('vbScore').textContent = newScore;
  document.getElementById('vbUp').classList.toggle('voted', postVote === 1);
  document.getElementById('vbDown').classList.toggle('voted', postVote === -1);
}

// ── CARGAR COMENTARIOS ──
async function loadComments() {
  const { data: allComments } = await sb
    .from('comments')
    .select('*, profiles(username, avatar_url), comment_votes(value)')
    .eq('post_id', currentPost.id)
    .order('created_at', { ascending: sortMode === 'new' ? false : true });

  if (!allComments) return;

  // Cargar votos propios en comentarios
  if (currentUser) {
    const { data: cv } = await sb.from('comment_votes').select('comment_id, value').eq('user_id', currentUser.id);
    if (cv) cv.forEach(v => { commentVotes[v.comment_id] = v.value; });
  }

  // Separar raíz de respuestas
  const roots   = allComments.filter(c => !c.parent_id);
  const replies = allComments.filter(c =>  c.parent_id);

  // Si ordenar por top
  if (sortMode === 'top') {
    roots.sort((a, b) => {
      const sa = a.comment_votes?.reduce((s, v) => s + v.value, 0) ?? 0;
      const sb2 = b.comment_votes?.reduce((s, v) => s + v.value, 0) ?? 0;
      return sb2 - sa;
    });
  }

  document.getElementById('commentCount').textContent = `(${allComments.length})`;

  const list = document.getElementById('commentsList');
  list.innerHTML = '';

  if (roots.length === 0) {
    list.innerHTML = '<p style="color:var(--text-light);font-size:0.95rem;padding:12px 0">Sé el primero en comentar.</p>';
    return;
  }

  roots.forEach((comment, i) => {
    const score     = comment.comment_votes?.reduce((s, v) => s + v.value, 0) ?? 0;
    const myVote    = commentVotes[comment.id] ?? 0;
    const commentEl = buildCommentEl(comment, score, myVote, false);
    // Animación de entrada escalonada
    commentEl.style.animationDelay = `${i * 0.06}s`;
    commentEl.classList.add('comment-enter');
    list.appendChild(commentEl);

    // Respuestas
    const children = replies.filter(r => r.parent_id === comment.id);
    children.forEach((reply, j) => {
      const rs   = reply.comment_votes?.reduce((s, v) => s + v.value, 0) ?? 0;
      const rmv  = commentVotes[reply.id] ?? 0;
      const replyEl = buildCommentEl(reply, rs, rmv, true);
      replyEl.style.animationDelay = `${(i * 0.06) + ((j + 1) * 0.04)}s`;
      replyEl.classList.add('comment-enter');
      list.appendChild(replyEl);
    });
  });
}

// ── CONSTRUIR ELEMENTO COMENTARIO ──
function buildCommentEl(comment, score, myVote, isReply) {
  const date    = timeAgo(new Date(comment.created_at));
  const author  = comment.profiles?.username || 'Anónimo';
  const avatar  = comment.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(author)}&background=a8d5a2&color=1a1a1a&size=64`;
  const isOwner = currentUser && currentUser.id === comment.author_id;

  const el = document.createElement('div');
  el.className = 'comment' + (isReply ? ' reply' : '');
  el.dataset.id = comment.id;

  // SVGs para los botones de voto — más ligeros visualmente que ▲▼
  const svgUp   = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l8 14H4z"/></svg>`;
  const svgDown = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l-8-14h16z"/></svg>`;

  el.innerHTML = `
    <img class="comment-avatar${isReply ? ' reply-avatar' : ''}" src="${avatar}" alt="${author}" />
    <div class="comment-body">
      <div class="comment-header">
        <a class="comment-username" href="perfil.html?user=${encodeURIComponent(author)}">${author}</a>
        <span class="comment-date">${date}</span>
      </div>
      <p class="comment-text">${escapeHTML(comment.content)}</p>
      <div class="comment-actions">
        <div class="comment-vote-pill">
          <button class="vote-btn up ${myVote === 1 ? 'voted' : ''}" data-cid="${comment.id}" data-val="1">${svgUp}</button>
          <span class="vote-score" id="cscore-${comment.id}">${score}</span>
          <button class="vote-btn down ${myVote === -1 ? 'voted' : ''}" data-cid="${comment.id}" data-val="-1">${svgDown}</button>
        </div>
        ${!isReply ? `<button class="btn-reply" data-cid="${comment.id}">Responder</button>` : ''}
        ${isOwner ? `<button class="btn-delete-comment" data-cid="${comment.id}">Eliminar</button>` : ''}
      </div>
      ${!isReply ? `<div class="reply-form-slot" id="rslot-${comment.id}"></div>` : ''}
    </div>
  `;

  // Votos en comentario
  el.querySelectorAll('.vote-btn[data-cid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!currentUser) { openModal(); return; }
      await handleCommentVote(+btn.dataset.cid, +btn.dataset.val, el);
    });
  });

  // Responder
  const btnReply = el.querySelector('.btn-reply');
  if (btnReply) btnReply.addEventListener('click', () => showReplyForm(comment.id));

  // Eliminar
  const btnDelete = el.querySelector('.btn-delete-comment');
  if (btnDelete) {
    btnDelete.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este comentario?')) return;
      const { error } = await sb.from('comments').delete().eq('id', comment.id).eq('author_id', currentUser.id);
      if (!error) {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.3s';
        setTimeout(() => el.remove(), 300);
        // Actualizar contador
        const countEl = document.getElementById('commentCount');
        if (countEl) {
          const match = countEl.textContent.match(/\d+/);
          if (match) countEl.textContent = `(${Math.max(0, parseInt(match[0]) - 1)})`;
        }
      }
    });
  }

  return el;
}

// ── FORMULARIO DE RESPUESTA INLINE ──
function showReplyForm(parentId) {
  const slot = document.getElementById(`rslot-${parentId}`);
  if (!slot) return;
  if (slot.querySelector('.reply-form')) { slot.innerHTML = ''; return; }

  slot.innerHTML = `
    <div class="reply-form">
      <textarea placeholder="Escribe tu respuesta..." rows="2"></textarea>
      <div class="reply-form-actions">
        <button class="btn-cancel-reply">Cancelar</button>
        <button class="btn-submit-reply">Responder</button>
      </div>
    </div>
  `;

  slot.querySelector('.btn-cancel-reply').addEventListener('click', () => { slot.innerHTML = ''; });
  slot.querySelector('.btn-submit-reply').addEventListener('click', async () => {
    if (!currentUser) { openModal(); return; }
    const content = slot.querySelector('textarea').value.trim();
    if (!content) return;
    await sb.from('comments').insert({
      post_id: currentPost.id,
      author_id: currentUser.id,
      parent_id: parentId,
      content
    });
    slot.innerHTML = '';
  });
}

// ── VOTOS EN COMENTARIOS ──
async function handleCommentVote(commentId, value, el) {
  const current = commentVotes[commentId] ?? 0;
  if (current === value) {
    await sb.from('comment_votes').delete().eq('comment_id', commentId).eq('user_id', currentUser.id);
    commentVotes[commentId] = 0;
  } else {
    await sb.from('comment_votes').upsert({ comment_id: commentId, user_id: currentUser.id, value }, { onConflict: 'comment_id,user_id' });
    commentVotes[commentId] = value;
  }
  const { data } = await sb.from('comment_votes').select('value').eq('comment_id', commentId);
  const newScore = data?.reduce((s, v) => s + v.value, 0) ?? 0;
  const scoreEl = document.getElementById(`cscore-${commentId}`);
  if (scoreEl) scoreEl.textContent = newScore;
  const mv = commentVotes[commentId] ?? 0;
  el.querySelector('.vote-btn.up')?.classList.toggle('voted', mv === 1);
  el.querySelector('.vote-btn.down')?.classList.toggle('voted', mv === -1);
}

// ── HELPERS ──
function setLoggedIn(user) {
  currentUser = user;
  setNavLoggedIn(user);
  const hint   = document.getElementById('commentHint');
  const submit = document.getElementById('btnSubmitComment');
  if (hint)   hint.textContent = `Comentando como ${user.user_metadata?.username || user.email.split('@')[0]}`;
  if (submit) submit.disabled  = false;
}

function setLoggedOut() {
  currentUser  = null;
  commentVotes = {};
  setNavLoggedOut();
  const hint   = document.getElementById('commentHint');
  const submit = document.getElementById('btnSubmitComment');
  if (hint)   hint.textContent = 'Inicia sesión para comentar';
  if (submit) submit.disabled  = true;
}

function openModal() { document.getElementById('modalBackdrop').classList.add('open'); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escapeHTML(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}


// ── ENTRADAS RELACIONADAS ──
async function loadRelatedPosts(post) {
  const container = document.getElementById('relatedPosts');
  if (!container) return;

  // Buscar posts de la misma categoría, excluyendo el actual
  let query = sb
    .from('posts')
    .select('id, title, slug, cover_url, created_at, categories(name, color)')
    .eq('published', true)
    .neq('id', post.id)
    .limit(4);

  if (post.category_id) {
    query = query.eq('category_id', post.category_id);
  }

  const { data: related } = await query.order('created_at', { ascending: false });

  // Si no hay suficientes de la misma categoría, completar con recientes
  let posts = related || [];
  if (posts.length < 3) {
    const { data: recent } = await sb
      .from('posts')
      .select('id, title, slug, cover_url, created_at, categories(name, color)')
      .eq('published', true)
      .neq('id', post.id)
      .not('id', 'in', `(${[post.id, ...posts.map(p => p.id)].join(',')})`)
      .order('created_at', { ascending: false })
      .limit(4 - posts.length);
    if (recent) posts = [...posts, ...recent];
  }

  if (!posts.length) {
    container.innerHTML = '<p class="related-empty">No hay más artículos por ahora.</p>';
    return;
  }

  container.innerHTML = posts.map(p => {
    const d = new Date(p.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', year: 'numeric' });
    const cat = p.categories;
    return `
      <a class="related-card" href="post.html?slug=${p.slug}">
        <div class="related-card-img-wrap">
          <img src="${p.cover_url || ''}" alt="${p.title}" loading="lazy" />
          ${cat ? `<span class="related-cat-dot" style="background:${cat.color}"></span>` : ''}
        </div>
        <div class="related-card-body">
          ${cat ? `<span class="related-cat-label" style="color:${cat.color}">${cat.name}</span>` : ''}
          <p class="related-card-title">${p.title}</p>
          <span class="related-card-date">${d}</span>
        </div>
      </a>
    `;
  }).join('');
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)     return 'hace un momento';
  if (diff < 3600)   return `hace ${Math.floor(diff/60)} min`;
  if (diff < 86400)  return `hace ${Math.floor(diff/3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff/86400)} días`;
  return date.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
}