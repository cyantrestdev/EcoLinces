const SUPABASE_URL  = CONFIG.SUPABASE_URL;
const SUPABASE_ANON = CONFIG.SUPABASE_ANON;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let currentUser    = null;
let currentProfile = null;

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

  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 10);
  });

  // ── AUTH ──
  const { data: { session } } = await sb.auth.getSession();
  if (session) await onLogin(session.user);
  else onLogout();

  initAuthModal(sb, onLogin, onLogout);

  document.getElementById('btnLogin')?.addEventListener('click', () => openModal());

  // ── LEER SLUG DE URL (perfil público) ──
  const params      = new URLSearchParams(window.location.search);
  const targetUser  = params.get('user'); // perfil.html?user=username

  if (targetUser && targetUser !== currentProfile?.username) {
    await loadPublicProfile(targetUser);
  }

  // ── AVATAR UPLOAD ──
  document.getElementById('avatarInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;
    await uploadAvatar(file);
  });

  // ── BIO ──
  document.getElementById('btnSaveBio')?.addEventListener('click', async () => {
    const bio = document.getElementById('bioInput').value.trim();
    const msg = document.getElementById('bioMsg');
    const { error } = await sb.from('profiles').update({ bio }).eq('id', currentUser.id);
    showMsg(msg, error ? 'Error al guardar.' : '¡Bio guardada!', error);
    if (!error) {
      currentProfile.bio = bio;
      document.getElementById('perfilBioDisplay').textContent = bio || '—';
    }
  });

  // ── USERNAME con verificación en tiempo real ──
  let usernameTimer;
  const usernameInput  = document.getElementById('usernameInput');
  const usernameStatus = document.getElementById('usernameStatus');
  const btnSaveUser    = document.getElementById('btnSaveUsername');

  usernameInput?.addEventListener('input', () => {
    clearTimeout(usernameTimer);
    const val = usernameInput.value.trim();
    usernameStatus.textContent = '';
    btnSaveUser.disabled = true;

    if (val.length < 3) { usernameStatus.textContent = ''; return; }
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

  document.getElementById('btnSaveUsername')?.addEventListener('click', async () => {
    const newUsername = usernameInput.value.trim();
    const msg = document.getElementById('usernameMsg');
    if (!newUsername || newUsername.length < 3) return;

    const { error } = await sb.from('profiles').update({ username: newUsername }).eq('id', currentUser.id);
    if (error) { showMsg(msg, 'Error al cambiar nombre.', true); return; }

    // Actualizar metadata en auth también
    await sb.auth.updateUser({ data: { username: newUsername } });
    currentProfile.username = newUsername;
    document.getElementById('perfilUsername').textContent = newUsername;
    setNavLoggedIn({ ...currentUser, user_metadata: { ...currentUser.user_metadata, username: newUsername } });
    showMsg(msg, '¡Nombre actualizado!', false);
  });

  // ── CORREO ──
  document.getElementById('btnSaveEmail')?.addEventListener('click', async () => {
    const newEmail = document.getElementById('emailInput').value.trim();
    const msg      = document.getElementById('emailMsg');
    if (!newEmail) return;
    const { error } = await sb.auth.updateUser({ email: newEmail });
    showMsg(msg, error ? traducirError(error.message) : 'Revisa tu correo para confirmar el cambio.', error);
  });

  // ── CONTRASEÑA ──
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
    showMsg(msg, error ? traducirError(error.message) : '¡Contraseña actualizada!', error);
    if (!error) { document.getElementById('newPassword').value = ''; document.getElementById('confirmPassword').value = ''; }
  });

});

// ── CARGAR PERFIL PROPIO ──
async function onLogin(user) {
  currentUser = user;
  setNavLoggedIn(user);

  const { data: profile } = await sb.from('profiles')
    .select('*').eq('id', user.id).single();

  if (!profile) return;
  currentProfile = profile;
  renderSidebar(profile);

  // Mostrar secciones de edición
  document.getElementById('perfilOwnerSection').style.display = '';
  document.getElementById('perfilActivity').style.display = '';
  document.getElementById('perfilLoginPrompt').style.display = 'none';

  // Precargar campos
  document.getElementById('bioInput').value      = profile.bio || '';
  document.getElementById('usernameInput').value  = profile.username || '';
  document.getElementById('emailInput').value     = user.email || '';

  await loadComments(user.id);
  document.getElementById('avatarEditBtn').style.display = 'flex';
}

function onLogout() {
  currentUser    = null;
  currentProfile = null;
  setNavLoggedOut();
  document.getElementById('perfilOwnerSection').style.display = 'none';
  document.getElementById('perfilLoginPrompt').style.display  = '';
  document.getElementById('perfilActivity').style.display     = 'none';
  document.getElementById('avatarEditBtn').style.display      = 'none';
}

// ── CARGAR PERFIL PÚBLICO ──
async function loadPublicProfile(username) {
  const { data: profile } = await sb.from('profiles')
    .select('*').eq('username', username).single();
  if (!profile) return;
  renderSidebar(profile);
  document.getElementById('perfilActivity').style.display = '';
  await loadComments(profile.id);
}

// ── RENDERIZAR SIDEBAR ──
function renderSidebar(profile) {
  const avatarEl = document.getElementById('perfilAvatar');
  const avatarUrl = profile.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.username)}&background=a8d5a2&color=1a1a1a&size=200`;
  avatarEl.src = avatarUrl;
  document.getElementById('perfilUsername').textContent  = profile.username;
  document.getElementById('perfilBioDisplay').textContent = profile.bio || 'Sin bio aún.';
  const joined = new Date(profile.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' });
  document.getElementById('perfilJoined').textContent    = `EcoLince desde ${joined}`;
}

// ── CARGAR COMENTARIOS ──
async function loadComments(userId) {
  const { data: comments } = await sb
    .from('comments')
    .select('*, posts(title, slug)')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  const container = document.getElementById('perfilComments');
  if (!comments || comments.length === 0) {
    container.innerHTML = '<div class="perfil-empty">Sin comentarios aún.</div>';
    return;
  }

  container.innerHTML = comments.map(c => {
    const date  = timeAgo(new Date(c.created_at));
    const post  = c.posts;
    return `
      <div class="perfil-comment-item">
        ${post ? `<div class="perfil-comment-post">En <a href="post.html?slug=${post.slug}">${post.title}</a></div>` : ''}
        <div class="perfil-comment-text">${escapeHTML(c.content)}</div>
        <div class="perfil-comment-date">${date}</div>
      </div>
    `;
  }).join('');
}

// ── SUBIR AVATAR ──
async function uploadAvatar(file) {
  const avatarWrap = document.querySelector('.avatar-wrap');
  avatarWrap.classList.add('avatar-uploading');

  const ext      = file.name.split('.').pop();
  const filePath = `${currentUser.id}/avatar.${ext}`;

  const { error: uploadErr } = await sb.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true });

  if (uploadErr) {
    avatarWrap.classList.remove('avatar-uploading');
    alert('Error al subir la imagen: ' + uploadErr.message);
    return;
  }

  const { data: urlData } = sb.storage.from('avatars').getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl + '?t=' + Date.now();

  await sb.from('profiles').update({ avatar_url: publicUrl }).eq('id', currentUser.id);
  await sb.auth.updateUser({ data: { avatar_url: publicUrl } });

  document.getElementById('perfilAvatar').src = publicUrl;
  document.getElementById('userAvatar').src   = publicUrl;
  avatarWrap.classList.remove('avatar-uploading');
}

// ── HELPERS ──
function showMsg(el, text, isError) {
  el.textContent  = text;
  el.className    = 'save-msg ' + (isError ? 'err' : 'ok');
  setTimeout(() => { el.textContent = ''; el.className = 'save-msg'; }, 4000);
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
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function traducirError(msg) {
  if (msg.includes('Invalid login'))      return 'Correo o contraseña incorrectos.';
  if (msg.includes('Email not confirmed'))return 'Confirma tu correo antes de entrar.';
  if (msg.includes('already registered'))return 'Este correo ya está registrado.';
  if (msg.includes('Password should'))   return 'La contraseña debe tener al menos 6 caracteres.';
  return msg;
}
