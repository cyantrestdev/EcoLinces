/* perfil.js — Pasaporte EcoLinces */

const SUPABASE_URL  = CONFIG.SUPABASE_URL;
const SUPABASE_ANON = CONFIG.SUPABASE_ANON;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let currentUser    = null;
let currentProfile = null;

document.addEventListener('DOMContentLoaded', async () => {

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

  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 10);
  });

  /* ── CÓDIGO DE BARRAS DECORATIVO ── */
  generateBarcode();

  /* ── AUTH ── */
  const { data: { session } } = await sb.auth.getSession();
  if (session) await onLogin(session.user);
  else onLogout();

  initAuthModal(sb, onLogin, onLogout);
  document.getElementById('btnLogin')?.addEventListener('click', () => openModal());

  /* ── PERFIL PÚBLICO VÍA ?user=username ── */
  const params     = new URLSearchParams(window.location.search);
  const targetUser = params.get('user');
  if (targetUser && targetUser !== currentProfile?.username) {
    await loadPublicProfile(targetUser);
  }

  /* ── NAVEGACIÓN POR PÁGINAS ── */
  document.querySelectorAll('.passport-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.passport-nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const pageId = 'page-' + btn.dataset.page;
      document.querySelectorAll('.passport-page').forEach(p => p.classList.remove('active'));
      document.getElementById(pageId)?.classList.add('active');
    });
  });

  /* ── BIO EDITABLE ── */
  const btnEditBio   = document.getElementById('btnEditBio');
  const bioEditWrap  = document.getElementById('bioEditWrap');
  const btnCancelBio = document.getElementById('btnCancelBio');
  const btnSaveBio   = document.getElementById('btnSaveBio');

  btnEditBio?.addEventListener('click', () => {
    document.getElementById('bioInput').value = currentProfile?.bio || '';
    bioEditWrap.classList.add('open');
    btnEditBio.style.display = 'none';
  });

  btnCancelBio?.addEventListener('click', () => {
    bioEditWrap.classList.remove('open');
    btnEditBio.style.display = 'inline-block';
  });

  btnSaveBio?.addEventListener('click', async () => {
    const bio = document.getElementById('bioInput').value.trim();
    const msg = document.getElementById('bioMsg');
    const { error } = await sb.from('profiles').update({ bio }).eq('id', currentUser.id);
    if (error) {
      showMsg(msg, 'Error al guardar.', true);
    } else {
      currentProfile.bio = bio;
      renderBio(bio);
      document.getElementById('perfilBioDisplay').textContent = bio || '—';
      bioEditWrap.classList.remove('open');
      btnEditBio.style.display = 'inline-block';
      showMsg(msg, '¡Bio guardada!', false);
    }
  });

  /* ── AVATAR UPLOAD ── */
  document.getElementById('avatarInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;
    await uploadAvatar(file);
  });

  /* ── USERNAME ── */
  let usernameTimer;
  const usernameInput  = document.getElementById('usernameInput');
  const usernameStatus = document.getElementById('usernameStatus');
  const btnSaveUser    = document.getElementById('btnSaveUsername');

  usernameInput?.addEventListener('input', () => {
    clearTimeout(usernameTimer);
    const val = usernameInput.value.trim();
    usernameStatus.textContent = '';
    btnSaveUser.disabled = true;

    if (val.length < 3) return;
    if (!/^[a-zA-Z0-9_]+$/.test(val)) {
      usernameStatus.textContent = '✗';
      usernameStatus.style.color = '#c62828';
      return;
    }
    if (val === currentProfile?.username) {
      usernameStatus.textContent = '✓';
      usernameStatus.style.color = '#2e7d32';
      btnSaveUser.disabled = false;
      return;
    }
    usernameStatus.textContent = '…';
    usernameStatus.style.color = '#999';
    usernameTimer = setTimeout(async () => {
      const { data } = await sb.from('profiles').select('id').eq('username', val).single();
      if (data) {
        usernameStatus.textContent = '✗ Ya en uso';
        usernameStatus.style.color = '#c62828';
        btnSaveUser.disabled = true;
      } else {
        usernameStatus.textContent = '✓ Disponible';
        usernameStatus.style.color = '#2e7d32';
        btnSaveUser.disabled = false;
      }
    }, 500);
  });

  btnSaveUser?.addEventListener('click', async () => {
    const newUsername = usernameInput.value.trim();
    const msg = document.getElementById('usernameMsg');
    if (!newUsername || newUsername.length < 3) return;
    const { error } = await sb.from('profiles').update({ username: newUsername }).eq('id', currentUser.id);
    if (error) { showMsg(msg, 'Error al cambiar nombre.', true); return; }
    await sb.auth.updateUser({ data: { username: newUsername } });
    currentProfile.username = newUsername;
    document.getElementById('perfilUsername').textContent = newUsername;
    setNavLoggedIn({ ...currentUser, user_metadata: { ...currentUser.user_metadata, username: newUsername } });
    showMsg(msg, '¡Nombre actualizado!', false);
  });

  /* ── CORREO ── */
  document.getElementById('btnSaveEmail')?.addEventListener('click', async () => {
    const newEmail = document.getElementById('emailInput').value.trim();
    const msg      = document.getElementById('emailMsg');
    if (!newEmail) return;
    const { error } = await sb.auth.updateUser({ email: newEmail });
    showMsg(msg, error ? traducirError(error.message) : 'Revisa tu correo para confirmar el cambio.', !!error);
  });

  /* ── CONTRASEÑA ── */
  const newPw   = document.getElementById('newPassword');
  const pwFill  = document.getElementById('pwFill');
  const pwLabel = document.getElementById('pwLabel');
  const levels  = [
    { label: 'Muy débil',  color: '#e53935', pct: 15 },
    { label: 'Débil',      color: '#fb8c00', pct: 35 },
    { label: 'Regular',    color: '#fdd835', pct: 55 },
    { label: 'Buena',      color: '#7cb342', pct: 75 },
    { label: 'Muy fuerte', color: '#2e7d32', pct: 100 }
  ];

  newPw?.addEventListener('input', () => {
    const pw = newPw.value;
    if (!pw) { pwFill.style.width = '0%'; pwLabel.textContent = ''; return; }
    let score = 0;
    if (pw.length >= 6)  score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const lvl = levels[Math.min(score, 4)];
    pwFill.style.width = lvl.pct + '%';
    pwFill.style.background = lvl.color;
    pwLabel.style.color = lvl.color;
    pwLabel.textContent = lvl.label;
  });

  document.getElementById('btnSavePassword')?.addEventListener('click', async () => {
    const pw      = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    const msg     = document.getElementById('passwordMsg');
    if (pw !== confirm) { showMsg(msg, 'Las contraseñas no coinciden.', true); return; }
    if (pw.length < 6)  { showMsg(msg, 'Mínimo 6 caracteres.', true); return; }
    const { error } = await sb.auth.updateUser({ password: pw });
    showMsg(msg, error ? traducirError(error.message) : '¡Contraseña actualizada!', !!error);
    if (!error) {
      document.getElementById('newPassword').value    = '';
      document.getElementById('confirmPassword').value = '';
      pwFill.style.width = '0%'; pwLabel.textContent = '';
    }
  });

  /* ── SELECTOR DE TEMA ── */
  initThemePicker();

});

/* ══════════════════════════════════════
   THEME SYSTEM
══════════════════════════════════════ */

function applyTheme(bg, accent) {
  /* Fondo de página */
  const bgEl = document.getElementById('perfilBg');
  if (bgEl) bgEl.setAttribute('data-theme', bg || 'aero-mint');

  /* Color de acento en el pasaporte */
  const card = document.getElementById('passportCard');
  if (card) {
    const col = accent || '#2e7d32';
    card.style.setProperty('--passport-accent', col);
    /* También actualizar la columna izquierda directamente para mayor compatibilidad */
    const left = document.getElementById('passportLeft');
    if (left) left.style.background = col;
  }
}

function syncThemeSwatches(bg, accent) {
  document.querySelectorAll('.theme-bg-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.bg === bg);
  });
  document.querySelectorAll('.theme-accent-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.accent === accent);
  });
}

function initThemePicker() {
  /* Fondos */
  document.getElementById('themeBgOptions')?.addEventListener('click', async (e) => {
    const swatch = e.target.closest('.theme-bg-swatch');
    if (!swatch || !currentUser) return;
    const bg = swatch.dataset.bg;
    const accent = currentProfile?.theme_accent || '#2e7d32';
    applyTheme(bg, accent);
    syncThemeSwatches(bg, accent);
    await saveTheme(bg, accent);
  });

  /* Colores de acento */
  document.getElementById('themeAccentOptions')?.addEventListener('click', async (e) => {
    const swatch = e.target.closest('.theme-accent-swatch');
    if (!swatch || !currentUser) return;
    const accent = swatch.dataset.accent;
    const bg = currentProfile?.theme_bg || 'aero-mint';
    applyTheme(bg, accent);
    syncThemeSwatches(bg, accent);
    await saveTheme(bg, accent);
  });
}

async function saveTheme(bg, accent) {
  if (!currentUser || !currentProfile) return;
  const msg = document.getElementById('themeMsg');
  const { error } = await sb.from('profiles')
    .update({ theme_bg: bg, theme_accent: accent })
    .eq('id', currentUser.id);
  if (!error) {
    currentProfile.theme_bg     = bg;
    currentProfile.theme_accent = accent;
    showMsg(msg, '¡Tema guardado!', false);
  } else {
    showMsg(msg, 'Error al guardar tema.', true);
  }
}

/* ══════════════════════════════════════
   AUTH CALLBACKS
══════════════════════════════════════ */

/* ── LOGIN ── */
async function onLogin(user) {
  currentUser = user;
  setNavLoggedIn(user);

  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (!profile) return;
  currentProfile = profile;

  renderPassport(profile, true);

  /* Precargar campos de ajustes */
  const ui = document.getElementById('usernameInput');
  const ei = document.getElementById('emailInput');
  if (ui) ui.value = profile.username || '';
  if (ei) ei.value = user.email || '';
}

/* ── LOGOUT ── */
function onLogout() {
  currentUser    = null;
  currentProfile = null;
  setNavLoggedOut();

  document.getElementById('perfilLoginPrompt').style.display = '';
  document.getElementById('passportNav').style.display       = 'none';
  document.getElementById('passportPages').style.display     = 'none';

  document.getElementById('perfilAvatar').src =
    'https://ui-avatars.com/api/?name=?&background=a8d5a2&color=1a1a1a&size=200';
  document.getElementById('perfilUsername').textContent    = '—';
  document.getElementById('perfilBioDisplay').textContent  = '—';

  /* Aplicar tema por defecto al cerrar sesión */
  applyTheme('aero-mint', '#2e7d32');
}

/* ── PERFIL PÚBLICO ── */
async function loadPublicProfile(username) {
  const { data: profile } = await sb.from('profiles').select('*').eq('username', username).single();
  if (!profile) return;
  renderPassport(profile, false);
}

/* ══════════════════════════════════════
   RENDERIZAR PASAPORTE
══════════════════════════════════════ */
async function renderPassport(profile, isOwner) {
  /* Avatar */
  const avatarUrl = profile.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.username)}&background=a8d5a2&color=1a1a1a&size=200`;
  document.getElementById('perfilAvatar').src = avatarUrl;

  /* Identidad */
  document.getElementById('perfilUsername').textContent   = profile.username;
  document.getElementById('perfilBioDisplay').textContent = profile.bio || '—';
  renderBio(profile.bio);

  /* Fecha de registro */
  const joined = new Date(profile.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' });
  document.getElementById('perfilJoined').textContent = `Desde ${joined.toUpperCase()}`;

  /* Número de miembro */
  const memberNum = hashToMemberNumber(profile.id);
  document.getElementById('memberNumber').textContent = `#${memberNum}`;

  /* ── APLICAR TEMA DEL USUARIO ── */
  const bg     = profile.theme_bg     || 'aero-mint';
  const accent = profile.theme_accent || '#2e7d32';
  applyTheme(bg, accent);

  /* Sincronizar swatches si es el dueño */
  if (isOwner) syncThemeSwatches(bg, accent);

  /* Mostrar/ocultar controles */
  document.getElementById('perfilLoginPrompt').style.display = 'none';
  document.getElementById('passportNav').style.display       = '';
  document.getElementById('passportPages').style.display     = '';

  if (isOwner) {
    document.getElementById('avatarEditBtn').style.display  = 'flex';
    document.getElementById('btnEditBio').style.display     = 'inline-block';
    document.getElementById('settingsTabBtn').style.display = '';
  } else {
    document.getElementById('avatarEditBtn').style.display  = 'none';
    document.getElementById('btnEditBio').style.display     = 'none';
    document.getElementById('settingsTabBtn').style.display = 'none';
  }

  /* Stats y actividad */
  await loadStats(profile.id);
  await loadComments(profile.id);
}

/* ── BIO DISPLAY ── */
function renderBio(bio) {
  const el = document.getElementById('bioDisplay');
  if (bio && bio.trim()) {
    el.innerHTML = `<span>${escapeHTML(bio)}</span>`;
  } else {
    el.innerHTML = `<span class="bio-empty">Sin bio aún.</span>`;
  }
  document.getElementById('perfilBioDisplay').textContent = bio || '—';
}

/* ── STATS ── */
async function loadStats(userId) {
  const { count: commentCount } = await sb
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', userId);

  const { count: voteCount } = await sb
    .from('post_votes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const { data: commentsData } = await sb
    .from('comments')
    .select('comment_votes(value)')
    .eq('author_id', userId);

  let receivedVotes = 0;
  if (commentsData) {
    commentsData.forEach(c => {
      (c.comment_votes || []).forEach(v => { receivedVotes += v.value; });
    });
  }

  document.getElementById('statComments').textContent = commentCount ?? 0;
  document.getElementById('statVotes').textContent    = voteCount ?? 0;
  document.getElementById('statReceived').textContent = receivedVotes;
}

/* ── COMENTARIOS ── */
async function loadComments(userId) {
  const { data: comments } = await sb
    .from('comments')
    .select('*, posts(title, slug)')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(8);

  const container = document.getElementById('perfilComments');
  if (!comments || comments.length === 0) {
    container.innerHTML = '<div class="activity-empty">Sin comentarios aún.</div>';
    return;
  }

  container.innerHTML = comments.map(c => {
    const date = timeAgo(new Date(c.created_at));
    const post = c.posts;
    return `
      <div class="activity-comment">
        ${post ? `<div class="activity-comment-post">En <a href="post.html?slug=${post.slug}">${escapeHTML(post.title)}</a></div>` : ''}
        <div class="activity-comment-text">${escapeHTML(c.content)}</div>
        <div class="activity-comment-date">${date}</div>
      </div>
    `;
  }).join('');
}

/* ── SUBIR AVATAR ── */
async function uploadAvatar(file) {
  const ext      = file.name.split('.').pop();
  const filePath = `${currentUser.id}/avatar.${ext}`;

  const { error: uploadErr } = await sb.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true });

  if (uploadErr) { alert('Error al subir la imagen: ' + uploadErr.message); return; }

  const { data: urlData } = sb.storage.from('avatars').getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl + '?t=' + Date.now();

  await sb.from('profiles').update({ avatar_url: publicUrl }).eq('id', currentUser.id);
  await sb.auth.updateUser({ data: { avatar_url: publicUrl } });

  document.getElementById('perfilAvatar').src = publicUrl;
  const navAvatar = document.getElementById('userAvatar');
  if (navAvatar) navAvatar.src = publicUrl;
}

/* ── CÓDIGO DE BARRAS DECORATIVO ── */
function generateBarcode() {
  const bc = document.getElementById('passportBarcode');
  if (!bc) return;
  const heights = [14,10,18,8,16,12,20,10,14,8,18,12,16,10,14,20,8,16,10,18,12,14];
  bc.innerHTML = heights.map(h =>
    `<span style="height:${h}px"></span>`
  ).join('');
}

/* ── NÚMERO DE MIEMBRO ── */
function hashToMemberNumber(uuid) {
  const hex = uuid.replace(/-/g, '').slice(0, 8);
  const num = parseInt(hex, 16) % 100000000;
  return String(num).padStart(8, '0');
}

/* ── HELPERS ── */
function showMsg(el, text, isError) {
  el.textContent = text;
  el.className   = 'settings-save-msg ' + (isError ? 'err' : 'ok');
  setTimeout(() => { el.textContent = ''; el.className = 'settings-save-msg'; }, 4000);
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)     return 'hace un momento';
  if (diff < 3600)   return `hace ${Math.floor(diff/60)} min`;
  if (diff < 86400)  return `hace ${Math.floor(diff/3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff/86400)} días`;
  return date.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
}

function escapeHTML(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function traducirError(msg) {
  if (msg.includes('Invalid login'))       return 'Correo o contraseña incorrectos.';
  if (msg.includes('Email not confirmed')) return 'Confirma tu correo antes de entrar.';
  if (msg.includes('already registered')) return 'Este correo ya está registrado.';
  if (msg.includes('Password should'))    return 'La contraseña debe tener al menos 6 caracteres.';
  return msg;
}
