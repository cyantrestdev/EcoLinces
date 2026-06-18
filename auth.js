// ── AUTH MODAL + DROPDOWN ──
const LOGIN_HEADINGS = [
  '¡Bienvenido de vuelta!',
  'Qué bueno verte de nuevo.',
  'Tu planeta te necesita.',
  'Nos alegra que estés aquí.',
  'Sigue haciendo la diferencia.'
];

const REGISTER_HEADINGS = [
  '¿Primera vez por aquí?',
  'Únete al movimiento.',
  'Empieza a hacer la diferencia.',
  'El planeta da la bienvenida.',
  'Un EcoLince más. ¡Bienvenido!'
];

function getRotatingHeading(arr, key) {
  let i = parseInt(sessionStorage.getItem(key) ?? Math.floor(Math.random() * arr.length));
  i = i % arr.length;
  sessionStorage.setItem(key, (i + 1) % arr.length);
  return arr[i];
}

function initAuthModal(sb, onLogin, onLogout) {
  const backdrop    = document.getElementById('modalBackdrop');
  const modalClose  = document.getElementById('modalClose');
  const heading     = document.getElementById('modalHeading');
  const tabs        = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  window.openModal  = () => {
    const activeTab = document.querySelector('.tab.active')?.dataset.tab || 'login';
    setTab(activeTab);
    backdrop.classList.add('open');
  };
  window.closeModal = () => backdrop?.classList.remove('open');

  modalClose?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });

  function setTab(tabName) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    tabContents.forEach(c => c.classList.toggle('active', c.id === 'tab' + capitalize(tabName)));
    if (heading) {
      heading.textContent = tabName === 'login'
        ? getRotatingHeading(LOGIN_HEADINGS, 'eco_login_h')
        : getRotatingHeading(REGISTER_HEADINGS, 'eco_register_h');
    }
  }

  tabs.forEach(tab => tab.addEventListener('click', () => setTab(tab.dataset.tab)));

  // ── LOGIN ──
  async function doLogin() {
    const err = document.getElementById('loginError');
    err.textContent = '';
    const { error } = await sb.auth.signInWithPassword({
      email:    document.getElementById('loginEmail').value.trim(),
      password: document.getElementById('loginPassword').value
    });
    if (error) {
      err.textContent = traducirError(error.message);
    } else {
      closeModal();
      propagarSesionA('https://backrooms-pape.pages.dev');
    }
  }

  /* ── SSO: cierra sesión en ambos sitios ── */
  async function cerrarSesionEnAmbos() {
    // Primero avisamos al otro sitio con un iframe (tiene ~2s para recibir el mensaje)
    try {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;';
      iframe.src = 'https://backrooms-pape.pages.dev/auth-bridge.html?signout=1';
      document.body.appendChild(iframe);
      await new Promise(r => setTimeout(r, 1200));
      iframe.remove();
    } catch (_) {}
    // Luego cerramos nuestra propia sesión
    await sb.auth.signOut();
  }

  // Exponer como globales para que blog.js, quienes.js, post.js, perfil.js puedan usarlas
  window.cerrarSesionEnAmbos = cerrarSesionEnAmbos;
  window.propagarSesionA     = propagarSesionA;

  /* ── SSO: propaga la sesión activa al otro sitio con un iframe invisible ── */
  async function propagarSesionA(otroOrigen) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const params = new URLSearchParams({
        access_token:  session.access_token,
        refresh_token: session.refresh_token,
        return_to:     otroOrigen + '/index.html'
      });
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;';
      iframe.src = otroOrigen + '/auth-bridge.html?' + params;
      document.body.appendChild(iframe);
      setTimeout(() => iframe.remove(), 4000);
    } catch (_) { /* SSO es best-effort, fallo silencioso */ }
  }

  document.getElementById('btnDoLogin')?.addEventListener('click', doLogin);

  // Enter en los campos de login dispara el botón Entrar
  ['loginEmail', 'loginPassword'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });

  // ── REGISTRO ──
  async function doRegister() {
    const username = document.getElementById('regUsername').value.trim();
    const email    = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const err      = document.getElementById('registerError');
    err.style.color = '#c62828';
    err.textContent = '';

    if (!username) { err.textContent = 'El nombre de usuario es obligatorio.'; return; }
    if (password.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }

    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { username } }
    });

    if (error) { err.textContent = traducirError(error.message); return; }

    // Crear perfil desde frontend
    if (data?.user) {
      await sb.from('profiles').upsert({
        id: data.user.id,
        username,
        avatar_url: null
      }, { onConflict: 'id' });
    }

    err.style.color = '#2e7d32';
    err.textContent = '¡Cuenta creada! Ya puedes iniciar sesión.';
  }

  document.getElementById('btnDoRegister')?.addEventListener('click', doRegister);

  // Enter en los campos de registro dispara el botón Registrarse
  ['regUsername', 'regEmail', 'regPassword'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doRegister();
    });
  });

  // ── MEDIDOR DE CONTRASEÑA ──
  const passInput     = document.getElementById('regPassword');
  const strengthFill  = document.getElementById('strengthFill');
  const strengthLabel = document.getElementById('strengthLabel');
  const levels = [
    { label: 'Muy débil',  color: '#e53935', pct: 15 },
    { label: 'Débil',      color: '#fb8c00', pct: 35 },
    { label: 'Regular',    color: '#fdd835', pct: 55 },
    { label: 'Buena',      color: '#7cb342', pct: 75 },
    { label: 'Muy fuerte', color: '#2e7d32', pct: 100 }
  ];

  function measureStrength(pw) {
    let score = 0;
    if (pw.length >= 6)  score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(score, levels.length - 1);
  }

  passInput?.addEventListener('input', () => {
    const pw = passInput.value;
    if (!pw) {
      if (strengthFill)  strengthFill.style.width = '0%';
      if (strengthLabel) strengthLabel.textContent = '';
      return;
    }
    const lvl = levels[measureStrength(pw)];
    if (strengthFill)  { strengthFill.style.width = lvl.pct + '%'; strengthFill.style.background = lvl.color; }
    if (strengthLabel) { strengthLabel.style.color = lvl.color; strengthLabel.textContent = lvl.label; }
  });

  // ── AUTH STATE ──
  sb.auth.onAuthStateChange((_e, session) => {
    if (session) onLogin(session.user);
    else onLogout();
  });

  // ── DROPDOWN ──
  const btnUserMenu  = document.getElementById('btnUserMenu');
  const userDropdown = document.getElementById('userDropdown');
  const btnLogout    = document.getElementById('btnLogout');

  btnUserMenu?.addEventListener('click', e => {
    e.stopPropagation();
    userDropdown?.classList.toggle('open');
  });

  btnLogout?.addEventListener('click', async () => {
    await cerrarSesionEnAmbos();
  });

  document.addEventListener('click', e => {
    if (userDropdown && !userDropdown.contains(e.target) && !btnUserMenu?.contains(e.target)) {
      userDropdown.classList.remove('open');
    }
  });

  // ── BOTÓN "Iniciar sesión" del nav (desktop) ──
  // Se registra aquí para que funcione en TODAS las páginas que carguen auth.js,
  // sin depender de script_bento.js ni de ningún script de página individual.
  document.getElementById('btnLogin')?.addEventListener('click', () => {
    window.openModal?.();
  });
}

// ── LLAMADO DESDE blog.js / post.js ──
async function setNavLoggedIn(user) {
  const btnLogin      = document.getElementById('btnLogin');
  const userMenuWrap  = document.getElementById('userMenuWrap');
  const userAvatar    = document.getElementById('userAvatar');
  const userDisplay   = document.getElementById('userDisplayName');
  const dropdownName  = document.getElementById('dropdownName');
  const dropdownEmail = document.getElementById('dropdownEmail');
  const hamAvatar     = document.getElementById('hamAvatar');
  const hamLines      = document.querySelectorAll('.ham-line');

  const username    = user.user_metadata?.username || user.email.split('@')[0];
  const emailPrefix = user.email.split('@')[0];

  if (btnLogin)     btnLogin.style.display    = 'none';
  if (userMenuWrap) userMenuWrap.style.display = 'flex';
  if (userDisplay)  userDisplay.textContent   = username;
  if (dropdownName) dropdownName.textContent  = username;
  if (dropdownEmail)dropdownEmail.textContent = emailPrefix;

  // Rellenar perfil del drawer
  fillDrawerProfile({ username, emailPrefix, avatarUrl: null });

  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=a8d5a2&color=1a1a1a&size=64`;
  if (userAvatar) userAvatar.src = fallback;

  // Activar avatar en el botón hamburger
  if (hamAvatar) {
    hamAvatar.src = fallback;
    hamAvatar.style.display = 'block';
    hamLines.forEach(l => l.style.display = 'none');
  }

  try {
    const _sb = typeof sb !== 'undefined' ? sb : supabase.createClient(
      CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON
    );
    const { data: profile } = await _sb.from('profiles').select('avatar_url').eq('id', user.id).single();
    const avatarUrl = profile?.avatar_url || fallback;
    if (profile?.avatar_url && userAvatar) userAvatar.src = avatarUrl;
    // Actualizar avatar del hamburger y del drawer con la foto real
    if (hamAvatar && profile?.avatar_url) hamAvatar.src = avatarUrl;
    fillDrawerProfile({ username, emailPrefix, avatarUrl });
  } catch (_) {
    fillDrawerProfile({ username, emailPrefix, avatarUrl: fallback });
  }
}

function setNavLoggedOut() {
  const btnLogin     = document.getElementById('btnLogin');
  const userMenuWrap = document.getElementById('userMenuWrap');
  const hamAvatar    = document.getElementById('hamAvatar');
  const hamLines     = document.querySelectorAll('.ham-line');

  if (btnLogin)     btnLogin.style.display    = 'inline-block';
  if (userMenuWrap) userMenuWrap.style.display = 'none';

  // Restaurar hamburger a 3 líneas
  if (hamAvatar) hamAvatar.style.display = 'none';
  hamLines.forEach(l => l.style.display = 'block');

  // Ocultar perfil del drawer
  fillDrawerProfile(null);
}

/** Rellena (o vacía) la sección de perfil dentro del drawer lateral */
function fillDrawerProfile(data) {
  const drawerAvatar       = document.getElementById('drawerAvatar');
  const drawerUsername     = document.getElementById('drawerUsername');
  const drawerEmail        = document.getElementById('drawerEmail');
  const drawerProfile      = document.getElementById('drawerProfile');
  const drawerSignout      = document.getElementById('drawerSignout');
  const drawerLogin        = document.getElementById('drawerLogin');
  const drawerAccountLinks = document.getElementById('drawerAccountLinks');
  const drawerVisitIF      = document.getElementById('drawerVisitIF');
  const dividers           = document.querySelectorAll('.drawer-divider');

  if (!data) {
    // Sin sesión: mostrar botón de login, ocultar perfil y signout
    if (drawerProfile)      drawerProfile.style.display      = 'none';
    if (drawerAccountLinks) drawerAccountLinks.style.display = 'none';
    if (drawerSignout)      drawerSignout.style.display      = 'none';
    if (drawerVisitIF)      drawerVisitIF.style.display      = 'none';
    if (drawerLogin)        drawerLogin.style.display        = 'flex';
    if (dividers[0])        dividers[0].style.display        = '';
    return;
  }

  // Con sesión: mostrar perfil y signout, ocultar login
  if (drawerProfile)      drawerProfile.style.display      = 'flex';
  if (drawerAccountLinks) drawerAccountLinks.style.display = 'flex';
  if (drawerSignout)      drawerSignout.style.display      = 'flex';
  /* if (drawerVisitIF)      drawerVisitIF.style.display      = 'flex'; */ // IF desactivado temporalmente
  if (drawerLogin)        drawerLogin.style.display        = 'none';
  if (dividers[0])        dividers[0].style.display        = '';

  if (drawerUsername) drawerUsername.textContent = data.username;
  if (drawerEmail)    drawerEmail.textContent    = data.emailPrefix;
  if (drawerAvatar && data.avatarUrl) drawerAvatar.src = data.avatarUrl;
}

function traducirError(msg) {
  if (msg.includes('Invalid login'))       return 'Correo o contraseña incorrectos.';
  if (msg.includes('Email not confirmed')) return 'Confirma tu correo antes de entrar.';
  if (msg.includes('already registered')) return 'Este correo ya está registrado.';
  if (msg.includes('Password should'))    return 'La contraseña debe tener al menos 6 caracteres.';
  return msg;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
// ── Scroll to top (global) ──────────────────────────────────────────────────
(function initScrollTop() {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;

  // Mostrar cuando el usuario ha bajado más de 400px
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
