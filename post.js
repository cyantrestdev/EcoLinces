const SUPABASE_URL  = CONFIG.SUPABASE_URL;
const SUPABASE_ANON = CONFIG.SUPABASE_ANON;

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let currentUser  = null;
let currentPost  = null;
let commentVotes = {};
let postVote     = 0;
let sortMode     = 'new';

document.addEventListener('DOMContentLoaded', async () => {

  // ── MENÚ FULLSCREEN ──
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

  // ── NAV ──
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 10);
  });

  // ── AUTH ──
  const { data: { session } } = await sb.auth.getSession();
  if (session) setLoggedIn(session.user);

  initAuthModal(sb, setLoggedIn, setLoggedOut);

  document.getElementById('btnLogin')?.addEventListener('click', () => openModal());

  // ── LEER SLUG DE LA URL ──
  const params = new URLSearchParams(window.location.search);
  const slug   = params.get('slug');

  if (!slug) {
    document.getElementById('postArticle').innerHTML = '<p style="padding:80px 48px">Artículo no encontrado.</p>';
    return;
  }

  // ── CARGAR ARTÍCULO ──
  const { data: post, error: postErr } = await sb
    .from('posts')
    .select('*, categories(name, slug, color), profiles(username, avatar_url)')
    .eq('slug', slug)
    .eq('published', true)
    .single();

  if (postErr || !post) {
    document.getElementById('postArticle').innerHTML = '<p style="padding:80px 48px;text-align:center">Artículo no encontrado.</p>';
    return;
  }

  currentPost = post;
  renderPost(post);

  // Cargar votos del usuario en este post
  if (currentUser) {
    const { data: v } = await sb.from('post_votes').select('value')
      .eq('post_id', post.id).eq('user_id', currentUser.id).single();
    if (v) postVote = v.value;
  }

  // Score inicial
  const { data: allVotes } = await sb.from('post_votes').select('value').eq('post_id', post.id);
  const score = allVotes?.reduce((s, v) => s + v.value, 0) ?? 0;
  renderVoteBar(post.id, score);

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
    <div class="post-content" id="postContent">
      ${post.content ? post.content.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('') : '<p><em>Contenido próximamente...</em></p>'}
    </div>
  `;
}

// ── BARRA DE VOTOS ──
function renderVoteBar(postId, score) {
  const slot = document.getElementById('voteBarSlot');
  if (!slot) return;
  slot.innerHTML = `
    <div class="post-vote-bar">
      <button class="vote-btn up ${postVote === 1 ? 'voted' : ''}" id="vbUp">▲</button>
      <span class="vote-score" id="vbScore">${score}</span>
      <button class="vote-btn down ${postVote === -1 ? 'voted' : ''}" id="vbDown">▼</button>
      <a class="back-link" href="blog.html">← Volver al blog</a>
      <span class="realtime-badge"><span class="realtime-dot"></span> En vivo</span>
    </div>
  `;

  document.getElementById('vbUp').addEventListener('click',   () => handlePostVote(postId,  1));
  document.getElementById('vbDown').addEventListener('click', () => handlePostVote(postId, -1));
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

  roots.forEach(comment => {
    const score     = comment.comment_votes?.reduce((s, v) => s + v.value, 0) ?? 0;
    const myVote    = commentVotes[comment.id] ?? 0;
    const commentEl = buildCommentEl(comment, score, myVote, false);
    list.appendChild(commentEl);

    // Respuestas
    const children = replies.filter(r => r.parent_id === comment.id);
    children.forEach(reply => {
      const rs   = reply.comment_votes?.reduce((s, v) => s + v.value, 0) ?? 0;
      const rmv  = commentVotes[reply.id] ?? 0;
      const replyEl = buildCommentEl(reply, rs, rmv, true);
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

  el.innerHTML = `
    <img class="comment-avatar" src="${avatar}" alt="${author}" />
    <div class="comment-body">
      <div class="comment-header">
        <span class="comment-username">${author}</span>
        <span class="comment-date">${date}</span>
      </div>
      <p class="comment-text">${escapeHTML(comment.content)}</p>
      <div class="comment-actions">
        <div class="comment-vote-row">
          <button class="vote-btn up ${myVote === 1 ? 'voted' : ''}" data-cid="${comment.id}" data-val="1">▲</button>
          <span class="vote-score" id="cscore-${comment.id}">${score}</span>
          <button class="vote-btn down ${myVote === -1 ? 'voted' : ''}" data-cid="${comment.id}" data-val="-1">▼</button>
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

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)     return 'hace un momento';
  if (diff < 3600)   return `hace ${Math.floor(diff/60)} min`;
  if (diff < 86400)  return `hace ${Math.floor(diff/3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff/86400)} días`;
  return date.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
}