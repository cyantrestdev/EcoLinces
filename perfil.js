/* perfil.js — Pasaporte EcoLinces */

/* Usar el cliente Supabase global (instanciado en sb.js) */
const sb = window.sb;

let currentUser    = null;
let currentProfile = null;

document.addEventListener('DOMContentLoaded', async () => {

  /* ── MENÚ FULLSCREEN ── */
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

  document.getElementById('drawerSignout')?.addEventListener('click', () => {
    (window.sb || sb)?.auth.signOut().then(() => { window.location.href = 'index.html'; });
  });

  // Hover de color en los links del drawer
  fullMenu.querySelectorAll('.fullmenu-left a').forEach(link => {
    link.addEventListener('mouseenter', () => {
      if (link.dataset.color) link.style.color = link.dataset.color;
    });
    link.addEventListener('mouseleave', () => { link.style.color = ''; });
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
  // btnLogin removido del HTML — drawer maneja el login
  if (false) (()=> {
    if (typeof window.openModal === 'function') window.openModal();
  });

  /* ── PERFIL PÚBLICO VÍA ?user=username ── */
  const params     = new URLSearchParams(window.location.search);
  const targetUser = params.get('user');
  if (targetUser && targetUser !== currentProfile?.username) {
    await loadPublicProfile(targetUser);
  }

  /* ── NAVEGACIÓN POR PÁGINAS ── */
  const sidebarInfo = document.getElementById('passportSidebarInfo');
  document.querySelectorAll('.passport-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.passport-nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const pageId = 'page-' + btn.dataset.page;
      document.querySelectorAll('.passport-page').forEach(p => p.classList.remove('active'));
      document.getElementById(pageId)?.classList.add('active');
      if (sidebarInfo) sidebarInfo.style.display = pageId === 'page-bio' ? '' : 'none';
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
      document.getElementById('newPassword').value     = '';
      document.getElementById('confirmPassword').value = '';
      pwFill.style.width = '0%'; pwLabel.textContent = '';
    }
  });

  /* ── SELECTOR DE TEMA ── */
  initThemePicker();

});

/* ══════════════════════════════════════
   SISTEMA DE TEMAS
══════════════════════════════════════ */

function applyTheme(bg, accent, customUrl) {
  const bgEl = document.getElementById('perfilBg');
  const left = document.getElementById('passportLeft');

  /* Fondo de página */
  if (bg === 'custom' && customUrl) {
    bgEl.setAttribute('data-theme', 'custom');
    bgEl.style.setProperty('--custom-bg-image', `url("${customUrl}")`);
  } else {
    bgEl.setAttribute('data-theme', bg || 'aero-mint');
    bgEl.style.removeProperty('--custom-bg-image');
  }

  /* Color de acento */
  const col = accent || '#2e7d32';
  document.documentElement.style.setProperty('--passport-accent', col);
  if (left) left.style.background = col;

  /* Aplicar acento al navbar solo en página de perfil */
  const navbar = document.getElementById('navbar');
  if (navbar) {
    navbar.style.background = col;
    navbar.style.setProperty('--nav-accent', col);
    // Ajustar color de texto según luminosidad del acento
    const r = parseInt(col.slice(1,3),16), g = parseInt(col.slice(3,5),16), b = parseInt(col.slice(5,7),16);
    const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
    const textCol = lum > 0.55 ? '#1a1a1a' : 'white';
    navbar.style.color = textCol;
    // Logo texto y links
    const logo = navbar.querySelector('.logo');
    if (logo) logo.style.color = textCol;
    navbar.querySelectorAll('.nav-links a').forEach(a => a.style.color = textCol);
    // Logo icono SVG: invertir si el fondo es oscuro
    const logoIcon = navbar.querySelector('.logo-icon');
    if (logoIcon) logoIcon.style.filter = lum > 0.55 ? 'none' : 'invert(1)';
    // Círculo auth
    const btnAuth = navbar.querySelector('.btn-auth');
    if (btnAuth) { btnAuth.style.borderColor = lum > 0.55 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.4)'; btnAuth.style.background = lum > 0.55 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)'; }
    // Botones inyectados por chat.js y search.js (pueden llegar tarde al DOM)
    function applyIconColors() {
      ['navChatBtn','navSearchBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.color = textCol;
      });
    }
    applyIconColors();
    // Reintento por si aún no estaban en el DOM
    setTimeout(applyIconColors, 300);
    setTimeout(applyIconColors, 800);
  }
}

function syncThemeSwatches(bg, accent) {
  document.querySelectorAll('.theme-bg-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.bg === bg);
  });
  document.querySelectorAll('.theme-accent-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.accent === accent);
  });

  /* Si el tema es 'custom', marcar el botón de subir */
  const uploadBtn = document.getElementById('customBgUploadBtn');
  if (uploadBtn) uploadBtn.classList.toggle('active', bg === 'custom');
}

function initThemePicker() {

  /* Fondos preset */
  document.getElementById('themeBgOptions')?.addEventListener('click', async (e) => {
    const swatch = e.target.closest('.theme-bg-swatch');
    if (!swatch || !currentUser) return;
    const bg     = swatch.dataset.bg;
    const accent = currentProfile?.theme_accent || '#2e7d32';
    applyTheme(bg, accent, null);
    syncThemeSwatches(bg, accent);
    if (currentProfile) currentProfile.theme_bg = bg;
    await saveTheme(bg, accent, currentProfile?.theme_custom_bg_url || null);
  });

  /* Colores de acento */
  document.getElementById('themeAccentOptions')?.addEventListener('click', async (e) => {
    const swatch = e.target.closest('.theme-accent-swatch');
    if (!swatch || !currentUser) return;
    const accent  = swatch.dataset.accent;
    const bg      = currentProfile?.theme_bg || 'aero-mint';
    const custUrl = currentProfile?.theme_custom_bg_url || null;
    applyTheme(bg, accent, custUrl);
    syncThemeSwatches(bg, accent);
    if (currentProfile) currentProfile.theme_accent = accent;
    await saveTheme(bg, accent, custUrl);
  });

  document.getElementById('customAccentInput')?.addEventListener('input', async (e) => {
    const accent = e.target.value;
    if (!accent || !currentUser) return;
    // Actualizar el preview visual del swatch
    const preview = document.getElementById('customAccentPreview');
    if (preview) preview.style.background = accent;
    const bg      = currentProfile?.theme_bg || 'aero-mint';
    const custUrl = currentProfile?.theme_custom_bg_url || null;
    applyTheme(bg, accent, custUrl);
    syncThemeSwatches(bg, accent);
    if (currentProfile) currentProfile.theme_accent = accent;
    await saveTheme(bg, accent, custUrl);
  });

  /* Subida de imagen de fondo personalizada */
  document.getElementById('customBgInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;
    await uploadCustomBg(file);
  });

  /* Clic en la miniatura del fondo personalizado → re-seleccionar */
  document.getElementById('customBgThumb')?.addEventListener('click', () => {
    if (!currentProfile?.theme_custom_bg_url) return;
    const accent = currentProfile?.theme_accent || '#2e7d32';
    applyTheme('custom', accent, currentProfile.theme_custom_bg_url);
    syncThemeSwatches('custom', accent);
    if (currentProfile) currentProfile.theme_bg = 'custom';
    saveTheme('custom', accent, currentProfile.theme_custom_bg_url);
  });
}

async function uploadCustomBg(file) {
  if (!currentUser) return;
  const msg = document.getElementById('themeMsg');
  showMsg(msg, 'Subiendo imagen…', false);

  const ext      = file.name.split('.').pop();
  const filePath = `${currentUser.id}/bg.${ext}`;

  const { error: uploadErr } = await sb.storage
    .from('avatars')           /* Reutiliza el bucket existente */
    .upload(filePath, file, { upsert: true });

  if (uploadErr) { showMsg(msg, 'Error al subir imagen.', true); return; }

  const { data: urlData } = sb.storage.from('avatars').getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl + '?t=' + Date.now();

  /* Mostrar miniatura */
  const thumb = document.getElementById('customBgThumb');
  if (thumb) {
    thumb.src = publicUrl;
    thumb.classList.add('visible');
  }

  const accent = currentProfile?.theme_accent || '#2e7d32';
  applyTheme('custom', accent, publicUrl);
  syncThemeSwatches('custom', accent);

  if (currentProfile) {
    currentProfile.theme_bg            = 'custom';
    currentProfile.theme_custom_bg_url = publicUrl;
    currentProfile.theme_accent        = accent;
  }

  await saveTheme('custom', accent, publicUrl);
  showMsg(msg, '¡Fondo guardado!', false);
}

async function saveTheme(bg, accent, customBgUrl) {
  if (!currentUser || !currentProfile) return;
  const msg = document.getElementById('themeMsg');
  const updates = { theme_bg: bg, theme_accent: accent };
  if (customBgUrl !== undefined) updates.theme_custom_bg_url = customBgUrl;

  const { error } = await sb.from('profiles').update(updates).eq('id', currentUser.id);
  if (error) showMsg(msg, 'Error al guardar tema.', true);
  else       showMsg(msg, '¡Tema guardado!', false);
}

/* ══════════════════════════════════════
   AUTH CALLBACKS
══════════════════════════════════════ */

async function onLogin(user) {
  currentUser = user;
  setNavLoggedIn(user);

  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (!profile) return;
  currentProfile = profile;

  /* Si no hay ?user= o es el propio perfil, mostrar como dueño */
  const params     = new URLSearchParams(window.location.search);
  const targetUser = params.get('user');
  if (!targetUser || targetUser === profile.username) {
    renderPassport(profile, true);
    /* Sistema de amigos — dueño: mostrar tab y cargar sección */
    const friendsTabOwner = document.getElementById('friendsTabBtn');
    if (friendsTabOwner) friendsTabOwner.style.display = '';
    if (typeof initFriendsSection === 'function') {
      await initFriendsSection(sb, user, profile.id, true);
    }
  }

  const ui = document.getElementById('usernameInput');
  const ei = document.getElementById('emailInput');
  if (ui) ui.value = profile.username || '';
  if (ei) ei.value = user.email || '';
}

function onLogout() {
  currentUser    = null;
  currentProfile = null;
  setNavLoggedOut();

  document.getElementById('perfilLoginPrompt').style.display = '';
  document.getElementById('passportNav').style.display       = 'none';
  document.getElementById('passportPages').style.display     = 'none';
  document.getElementById('passportSidebarInfo').style.display = 'none';

  document.getElementById('perfilAvatar').src =
    'https://ui-avatars.com/api/?name=?&background=a8d5a2&color=1a1a1a&size=200';
  document.getElementById('perfilUsername').textContent    = '—';
  document.getElementById('perfilBioDisplay').textContent  = '—';
  const footerBrand = document.getElementById('passportFooterBrand');
  if (footerBrand) footerBrand.textContent = 'Ecolince desde 2026';

  applyTheme('aero-mint', '#2e7d32', null);
}

async function loadPublicProfile(username) {
  const { data: profile } = await sb.from('profiles').select('*').eq('username', username).single();
  if (!profile) return;
  const isOwner = currentUser?.id === profile.id;
  renderPassport(profile, isOwner);

  /* Sistema de amigos */
  if (currentUser && typeof initFriendsSection === 'function') {
    const friendsTab = document.getElementById('friendsTabBtn');
    if (friendsTab) friendsTab.style.display = '';
    await initFriendsSection(sb, currentUser, profile.id, isOwner);
  }
}

/* ══════════════════════════════════════
   RENDERIZAR PASAPORTE
══════════════════════════════════════ */
async function renderPassport(profile, isOwner) {
  /* Avatar */
  const avatarUrl = profile.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.username)}&background=a8d5a2&color=1a1a1a&size=200`;
  setAvatarSrc(document.getElementById('perfilAvatar'), avatarUrl);

  /* Identidad */
  document.getElementById('perfilUsername').textContent   = profile.username;
  document.getElementById('perfilBioDisplay').textContent = profile.bio || '—';
  renderBio(profile.bio);

  const joinedDate = new Date(profile.created_at);
  const joinedFull = joinedDate.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const footerBrand = document.getElementById('passportFooterBrand');
  if (footerBrand) footerBrand.textContent = `Ecolince desde ${joinedFull}`;

  const joinedEl = document.getElementById('perfilJoined');
  if (joinedEl) joinedEl.style.display = 'none';

  const customAccentInput = document.getElementById('customAccentInput');
  if (customAccentInput) {
    customAccentInput.value = profile.theme_accent || '#2e7d32';
    const preview = document.getElementById('customAccentPreview');
    if (preview) preview.style.background = profile.theme_accent || '#2e7d32';
  }

  /* Nº de miembro — número real de Supabase */
  const memberEl = document.getElementById('memberNumber');
  if (memberEl) {
    memberEl.textContent = profile.member_number != null
      ? `#${String(profile.member_number).padStart(7, '0')}`
      : '#——————';
  }

  /* Tema */
  const bg     = profile.theme_bg     || 'aero-mint';
  const accent = profile.theme_accent || '#2e7d32';
  const custUrl = profile.theme_custom_bg_url || null;
  applyTheme(bg, accent, custUrl);

  const activePage = document.querySelector('.passport-nav-btn.active')?.dataset.page || 'bio';
  const sidebarInfo = document.getElementById('passportSidebarInfo');
  if (sidebarInfo) sidebarInfo.style.display = activePage === 'bio' ? '' : 'none';

  /* Miniatura del fondo personalizado */
  if (isOwner && custUrl) {
    const thumb = document.getElementById('customBgThumb');
    if (thumb) { thumb.src = custUrl; thumb.classList.add('visible'); }
  }

  if (isOwner) syncThemeSwatches(bg, accent);

  /* Controles */
  document.getElementById('perfilLoginPrompt').style.display = 'none';
  document.getElementById('passportNav').style.display       = '';
  document.getElementById('passportPages').style.display     = '';
  document.getElementById('passportSidebarInfo').style.display = '';

  document.getElementById('avatarEditBtn').style.display   = isOwner ? 'flex'         : 'none';
  document.getElementById('btnEditBio').style.display      = isOwner ? 'inline-block' : 'none';
  document.getElementById('settingsTabBtn').style.display  = isOwner ? ''             : 'none';

  await loadStats(profile.id);
  await loadComments(profile.id);
  initTagsAndBadges(profile, isOwner);
}

function renderBio(bio) {
  const el = document.getElementById('bioDisplay');
  el.innerHTML = (bio && bio.trim())
    ? `<span>${escapeHTML(bio)}</span>`
    : `<span class="bio-empty">Sin bio aún.</span>`;
  document.getElementById('perfilBioDisplay').textContent = bio || '—';
}

/* ── STATS ── */
async function loadStats(userId) {
  const { count: commentCount } = await sb
    .from('comments').select('id', { count: 'exact', head: true }).eq('author_id', userId);

  const { count: voteCount } = await sb
    .from('post_votes').select('id', { count: 'exact', head: true }).eq('user_id', userId);

  const { data: commentsData } = await sb
    .from('comments').select('comment_votes(value)').eq('author_id', userId);

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
    .from('avatars').upload(filePath, file, { upsert: true });

  if (uploadErr) { alert('Error al subir la imagen: ' + uploadErr.message); return; }

  const { data: urlData } = sb.storage.from('avatars').getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl + '?t=' + Date.now();

  await sb.from('profiles').update({ avatar_url: publicUrl }).eq('id', currentUser.id);
  await sb.auth.updateUser({ data: { avatar_url: publicUrl } });

  document.getElementById('perfilAvatar').src = publicUrl;
  // Actualizar también el avatar en el botón hamburger del nav
  const hamAvatar = document.getElementById('hamAvatar');
  if (hamAvatar) hamAvatar.src = publicUrl;
  // Mantener compatibilidad si el elemento antiguo aún existe
  const navAvatar = document.getElementById('userAvatar');
  if (navAvatar) navAvatar.src = publicUrl;
}

/* ── CÓDIGO DE BARRAS DECORATIVO ── */
function generateBarcode() {
  const bc = document.getElementById('passportBarcode');
  if (!bc) return;
  const heights = [14,10,18,8,16,12,20,10,14,8,18,12,16,10,14,20,8,16,10,18,12,14];
  bc.innerHTML = heights.map(h => `<span style="height:${h}px"></span>`).join('');
}

/* hashToMemberNumber eliminado — se usa profile.member_number */

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

/* ══════════════════════════════════════════════════
   SKELETON LOADER para avatares
══════════════════════════════════════════════════ */
function applyAvatarSkeleton(imgEl) {
  if (!imgEl) return;

  imgEl.classList.add('avatar-skeleton');
  imgEl.style.objectFit = 'none';

  /* El wrap DEBE ser position:relative y NO display:flex para que el
     spinner absoluto quede centrado correctamente */
  const wrap = imgEl.closest('.passport-avatar-wrap');
  if (wrap) {
    wrap.style.position = 'relative';
    /* Quitar el display:flex del wrap para que el absolute funcione */
    wrap.style.display  = 'block';
  }

  /* Quitar spinner anterior si hubiera */
  wrap?.querySelector('.avatar-spinner')?.remove();

  /* Añadir spinner centrado */
  if (wrap) {
    const spinner = document.createElement('div');
    spinner.className = 'avatar-spinner';
    wrap.appendChild(spinner);
  }

  const onLoad = () => {
    imgEl.classList.remove('avatar-skeleton');
    imgEl.style.objectFit = 'cover';
    imgEl.removeEventListener('load', onLoad);
    imgEl.removeEventListener('error', onLoad);
    wrap?.querySelector('.avatar-spinner')?.remove();
    /* Restaurar display del wrap */
    if (wrap) wrap.style.display = '';
  };
  imgEl.addEventListener('load', onLoad);
  imgEl.addEventListener('error', onLoad);
}

/**
 * Establece el src de una imagen de avatar sin causar flicker:
 * - Si el src ya es el mismo, no hace nada.
 * - Usa sessionStorage para devolver la URL cacheada al instante
 *   y evitar el parpadeo cuando renderPassport se llama más de una vez.
 */
function setAvatarSrc(imgEl, url) {
  if (!imgEl || !url) return;
  /* Si ya muestra exactamente esa URL, no hacer nada */
  if (imgEl.src === url) return;

  const cacheKey = 'avatarCache_' + url;
  const cached   = sessionStorage.getItem(cacheKey);

  if (cached === 'loaded') {
    /* Ya se cargó antes en esta sesión: asignar directo, sin skeleton */
    imgEl.style.objectFit = 'cover';
    imgEl.classList.remove('avatar-skeleton');
    imgEl.closest('.passport-avatar-wrap')?.querySelector('.avatar-spinner')?.remove();
    if (imgEl.src !== url) imgEl.src = url;
  } else {
    applyAvatarSkeleton(imgEl);
    const onDone = () => {
      sessionStorage.setItem(cacheKey, 'loaded');
      imgEl.removeEventListener('load',  onDone);
      imgEl.removeEventListener('error', onDone);
    };
    imgEl.addEventListener('load',  onDone);
    imgEl.addEventListener('error', onDone);
    imgEl.src = url;
  }
}

// Aplicar skeleton inicial a todos los avatares al cargar
document.querySelectorAll('img[id*="Avatar"], img[id*="avatar"], .passport-avatar, .btn-user-avatar').forEach(applyAvatarSkeleton);

/* ══════════════════════════════════════════════════
   CATÁLOGO DE ETIQUETAS
══════════════════════════════════════════════════ */
const ALL_TAGS = [
  'Reciclador nato',
  'Lector del EcoBlog',
  'Comentarista activo',
  'Defensor del planeta',
  'Consumo responsable',
  'Fan de la energía solar',
  'Amante de la naturaleza',
  'Activista digital',
  'Vegetariano / Vegano',
  'Cazador de tendencias verdes',
  'Zero waste',
  'Ciclista urbano',
  'Curioso científico',
  'Nuevo por aquí',
  'EcoLince veterano',
];

const MAX_TAGS = 3;

/* ══════════════════════════════════════════════════
   CATÁLOGO DE BADGES (placeholder emojis)
══════════════════════════════════════════════════ */
const ALL_BADGES = [
  { id: 'leaf',      emoji: '🌿', label: 'Hoja verde' },
  { id: 'recycle',   emoji: '♻️', label: 'Reciclador' },
  { id: 'earth',     emoji: '🌍', label: 'Guardián de la Tierra' },
  { id: 'sun',       emoji: '☀️', label: 'Energía solar' },
  { id: 'water',     emoji: '💧', label: 'Cuidador del agua' },
  { id: 'seedling',  emoji: '🌱', label: 'Nueva semilla' },
  { id: 'fire',      emoji: '🔥', label: 'Tendencia' },
  { id: 'star',      emoji: '⭐', label: 'Destacado' },
  { id: 'bicycle',   emoji: '🚲', label: 'Movilidad verde' },
  { id: 'book',      emoji: '📖', label: 'Lector activo' },
  { id: 'chat',      emoji: '💬', label: 'Comentarista' },
  { id: 'heart',     emoji: '💚', label: 'Corazón verde' },
];

const MAX_BADGES = 3;

/* ══════════════════════════════════════════════════
   INICIALIZAR TAGS + BADGES
══════════════════════════════════════════════════ */
function initTagsAndBadges(profile, isOwner) {
  const selectedTags   = profile.tags   || [];
  const selectedBadges = profile.badges || [];

  renderTagsDisplay(selectedTags);
  renderBadgesDisplay(selectedBadges);

  if (!isOwner) return;

  // Picker de tags
  const tagPicker = document.getElementById('tagPicker');
  if (tagPicker) {
    tagPicker.innerHTML = ALL_TAGS.map(tag => `
      <div class="tag-option ${selectedTags.includes(tag) ? 'selected' : ''}" data-tag="${tag}">${tag}</div>
    `).join('');

    tagPicker.addEventListener('click', e => {
      const opt = e.target.closest('.tag-option');
      if (!opt || opt.classList.contains('disabled')) return;
      const tag = opt.dataset.tag;
      const currentSelected = [...tagPicker.querySelectorAll('.tag-option.selected')];

      if (opt.classList.contains('selected')) {
        opt.classList.remove('selected');
      } else {
        if (currentSelected.length >= MAX_TAGS) return;
        opt.classList.add('selected');
      }

      const nowSelected = tagPicker.querySelectorAll('.tag-option.selected').length;
      tagPicker.querySelectorAll('.tag-option:not(.selected)').forEach(o => {
        o.classList.toggle('disabled', nowSelected >= MAX_TAGS);
      });
    });
  }

  // Picker de badges
  const badgePicker = document.getElementById('badgePicker');
  if (badgePicker) {
    badgePicker.innerHTML = ALL_BADGES.map(b => `
      <div class="badge-option ${selectedBadges.includes(b.id) ? 'selected' : ''}"
           data-badge="${b.id}" title="${b.label}">${b.emoji}</div>
    `).join('');

    badgePicker.addEventListener('click', e => {
      const opt = e.target.closest('.badge-option');
      if (!opt) return;
      const currentSelected = [...badgePicker.querySelectorAll('.badge-option.selected')];
      if (opt.classList.contains('selected')) {
        opt.classList.remove('selected');
      } else {
        if (currentSelected.length >= MAX_BADGES) return;
        opt.classList.add('selected');
      }
    });
  }

  // Guardar tags
  document.getElementById('btnSaveTags')?.addEventListener('click', async () => {
    const tags = [...document.querySelectorAll('.tag-option.selected')].map(o => o.dataset.tag);
    const msg  = document.getElementById('tagsMsg');
    const { error } = await sb.from('profiles').update({ tags }).eq('id', currentUser.id);
    if (!error) {
      renderTagsDisplay(tags);
      showSettingsMsg(msg, '¡Etiquetas guardadas!', false);
    } else {
      showSettingsMsg(msg, 'Error al guardar.', true);
    }
  });

  // Guardar badges
  document.getElementById('btnSaveBadges')?.addEventListener('click', async () => {
    const badges = [...document.querySelectorAll('.badge-option.selected')].map(o => o.dataset.badge);
    const msg    = document.getElementById('badgesMsg');
    const { error } = await sb.from('profiles').update({ badges }).eq('id', currentUser.id);
    if (!error) {
      renderBadgesDisplay(badges);
      showSettingsMsg(msg, '¡Calcomanías guardadas!', false);
    } else {
      showSettingsMsg(msg, 'Error al guardar.', true);
    }
  });
}

function renderTagsDisplay(tags) {
  const list   = document.getElementById('passportTagsList');
  const toggle = document.getElementById('passportTagsToggle');
  if (!list) return;
  if (!tags || tags.length === 0) {
    list.innerHTML = '<span class="passport-tag empty">Sin etiquetas</span>';
    if (toggle) toggle.style.display = 'none';
    return;
  }
  list.innerHTML = tags.map(t => `<span class="passport-tag">${t}</span>`).join('');
  if (toggle) toggle.style.display = 'none';
}

function renderBadgesDisplay(badgeIds) {
  const container = document.getElementById('passportBadges');
  const section   = document.getElementById('passportStickersSection');
  if (!container) return;
  if (!badgeIds || badgeIds.length === 0) {
    container.innerHTML = '';
    if (section) section.style.display = 'none';
    return;
  }
  if (section) section.style.display = '';
  container.innerHTML = badgeIds.map(id => {
    const b = ALL_BADGES.find(x => x.id === id);
    return b ? `<div class="passport-badge" title="${b.label}">${b.emoji}</div>` : '';
  }).join('');
}

function showSettingsMsg(el, text, isError) {
  if (!el) return;
  el.textContent = text;
  el.className = 'settings-save-msg ' + (isError ? 'err' : 'ok');
  setTimeout(() => { el.textContent = ''; el.className = 'settings-save-msg'; }, 3500);
}

/* ══════════════════════════════════════════
   CUSTOM COLOR PICKER
   Se inicializa cuando el DOM carga.
   Abre/cierra con el botón #customAccentBtn.
   Al elegir color llama a applyTheme() igual que antes.
   ══════════════════════════════════════════ */
(function initColorPicker() {
  const PRESETS = ['#2e7d32','#1565c0','#00796b','#6a1b9a',
                   '#c62828','#e65100','#37474f','#ad1457','#ff6f00','#00838f'];

  let hue = 175, sat = 61, val = 65;
  let draggingSV = false, draggingH = false;

  const btn      = document.getElementById('customAccentBtn');
  const popup    = document.getElementById('cpPopup');
  const cvsWrap  = document.getElementById('cpCanvasWrap');
  const cvs      = document.getElementById('cpCvs');
  const thumb    = document.getElementById('cpThumb');
  const hueTrack = document.getElementById('cpHueTrack');
  const hueThumb = document.getElementById('cpHueThumb');
  const swatchB  = document.getElementById('cpSwatchBig');
  const hexIn    = document.getElementById('cpHexInput');
  const copyBtn  = document.getElementById('cpCopyBtn');
  const presetsEl= document.getElementById('cpPresets');
  const preview  = document.getElementById('customAccentPreview');

  if (!btn || !popup || !cvs) return;

  /* Mover el popup al body para que position:fixed funcione sin interferencia */
  document.body.appendChild(popup);

  /* ── Utilidades de color ── */
  function hsvToRgb(h, s, v) {
    s /= 100; v /= 100;
    const i = Math.floor(h / 60) % 6, f = h / 60 - Math.floor(h / 60);
    const p = v*(1-s), q = v*(1-f*s), t = v*(1-(1-f)*s);
    return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i].map(x => Math.round(x*255));
  }
  function rgbToHex(r, g, b) {
    return ((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1).toUpperCase();
  }
  function hexToRgb(h) {
    const n = parseInt(h, 16);
    return [(n>>16)&255,(n>>8)&255,n&255];
  }
  function rgbToHsv(r, g, b) {
    r/=255; g/=255; b/=255;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
    let h=0, s=mx===0?0:d/mx, v=mx;
    if (d) {
      if (mx===r)      h=((g-b)/d)%6;
      else if (mx===g) h=(b-r)/d+2;
      else             h=(r-g)/d+4;
      h = Math.round(h*60); if (h<0) h+=360;
    }
    return [h, Math.round(s*100), Math.round(v*100)];
  }

  /* ── Canvas ── */
  function drawGradient() {
    const ctx = cvs.getContext('2d');
    const w = cvs.width, h = cvs.height;
    const [r,g,b] = hsvToRgb(hue, 100, 100);
    const gW = ctx.createLinearGradient(0,0,w,0);
    gW.addColorStop(0, '#fff');
    gW.addColorStop(1, `rgb(${r},${g},${b})`);
    ctx.fillStyle = gW; ctx.fillRect(0,0,w,h);
    const gB = ctx.createLinearGradient(0,0,0,h);
    gB.addColorStop(0,'rgba(0,0,0,0)');
    gB.addColorStop(1,'#000');
    ctx.fillStyle = gB; ctx.fillRect(0,0,w,h);
  }

  function updateUI() {
    drawGradient();
    const [r,g,b] = hsvToRgb(hue, sat, val);
    const hex = rgbToHex(r,g,b);
    const color = '#' + hex;
    thumb.style.left = (sat/100*100)+'%';
    thumb.style.top  = ((1-val/100)*100)+'%';
    hueThumb.style.left = (hue/360*100)+'%';
    swatchB.style.background = color;
    if (preview) preview.style.background = color;
    hexIn.value = hex;

    // Disparar applyTheme si está disponible
    if (typeof applyTheme === 'function' && currentProfile) {
      const bg = currentProfile.theme_bg || 'aero-mint';
      const custUrl = currentProfile.theme_custom_bg_url || null;
      applyTheme(bg, color, custUrl);
      syncThemeSwatches(bg, color);
      currentProfile.theme_accent = color;
      saveTheme(bg, color, custUrl);
    }
  }

  function initSize() {
    cvs.width  = cvsWrap.offsetWidth * 2;
    cvs.height = cvsWrap.offsetHeight * 2;
    updateUI();
  }

  /* ── Eventos del canvas (SV) ── */
  function pickSV(e) {
    const rect = cvsWrap.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    sat = Math.max(0, Math.min(100, (cx - rect.left) / rect.width * 100));
    val = Math.max(0, Math.min(100, (1 - (cy - rect.top) / rect.height) * 100));
    updateUI();
  }
  function pickHue(e) {
    const rect = hueTrack.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    hue = Math.max(0, Math.min(360, (cx - rect.left) / rect.width * 360));
    updateUI();
  }

  cvsWrap.addEventListener('mousedown',  e => { draggingSV=true; pickSV(e); });
  cvsWrap.addEventListener('touchstart', e => { draggingSV=true; pickSV(e); }, {passive:true});
  hueTrack.addEventListener('mousedown',  e => { draggingH=true; pickHue(e); });
  hueTrack.addEventListener('touchstart', e => { draggingH=true; pickHue(e); }, {passive:true});
  window.addEventListener('mousemove', e => { if(draggingSV)pickSV(e); if(draggingH)pickHue(e); });
  window.addEventListener('touchmove', e => { if(draggingSV)pickSV(e); if(draggingH)pickHue(e); }, {passive:true});
  window.addEventListener('mouseup',   () => { draggingSV=draggingH=false; });
  window.addEventListener('touchend',  () => { draggingSV=draggingH=false; });

  /* ── Input hex ── */
  hexIn.addEventListener('input', e => {
    const v = e.target.value.replace(/[^0-9a-fA-F]/g,'');
    hexIn.value = v;
    if (v.length === 6) {
      [hue,sat,val] = rgbToHsv(...hexToRgb(v));
      updateUI();
    }
  });

  /* ── Copiar ── */
  copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText('#' + hexIn.value);
    copyBtn.textContent = '✓';
    setTimeout(() => copyBtn.textContent = 'Copiar', 1500);
  });

  /* ── Presets ── */
  PRESETS.forEach(col => {
    const d = document.createElement('div');
    d.className = 'cp-preset-dot';
    d.style.background = col;
    d.title = col;
    d.addEventListener('click', () => {
      [hue,sat,val] = rgbToHsv(...hexToRgb(col.slice(1)));
      presetsEl.querySelectorAll('.cp-preset-dot').forEach(p => p.classList.remove('active'));
      d.classList.add('active');
      updateUI();
    });
    presetsEl.appendChild(d);
  });

  /* ── Toggle popup (posicionado con fixed relativo al botón) ── */
  function positionPopup() {
    const btnRect = btn.getBoundingClientRect();
    const popupW  = 272; /* ancho del popup (268px + bordes) */
    const popupH  = 340; /* alto aprox */
    const margin  = 8;

    let top  = btnRect.bottom + margin;
    let left = btnRect.left;

    /* Evitar que se salga por la derecha */
    if (left + popupW > window.innerWidth - margin) {
      left = window.innerWidth - popupW - margin;
    }
    /* Evitar que se salga por abajo → abrirlo hacia arriba */
    if (top + popupH > window.innerHeight - margin) {
      top = btnRect.top - popupH - margin;
    }

    popup.style.top  = top  + 'px';
    popup.style.left = left + 'px';
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !popup.hidden;
    popup.hidden = open;
    btn.setAttribute('aria-expanded', String(!open));
    if (!open) {
      positionPopup();
      initSize();
    }
  });

  /* ── Cerrar al click fuera ── */
  document.addEventListener('click', e => {
    if (!popup.hidden && !popup.contains(e.target) && !btn.contains(e.target)) {
      popup.hidden = true;
      btn.setAttribute('aria-expanded','false');
    }
  });
})();
