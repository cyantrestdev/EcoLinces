/* ══════════════════════════════════════════════════
   friends.js — Sistema de Amigos EcoLinces
   Dependencias: supabase, sb (ya inicializado), currentUser

   TABLA SUPABASE REQUERIDA:
   ─────────────────────────────────────────────────
   friend_requests (
     id          uuid primary key default gen_random_uuid(),
     from_id     uuid references profiles(id) on delete cascade,
     to_id       uuid references profiles(id) on delete cascade,
     status      text default 'pending',   -- 'pending' | 'accepted' | 'rejected'
     created_at  timestamptz default now(),
     unique(from_id, to_id)
   )

   profiles debe tener:
     friend_code  text unique  (generado al registrarse, ej. "ECO-A1B2C3")

   RLS sugerida:
     SELECT: auth.uid() = from_id OR auth.uid() = to_id
     INSERT: auth.uid() = from_id
     UPDATE: auth.uid() = to_id  (para aceptar/rechazar)
     DELETE: auth.uid() = from_id OR auth.uid() = to_id
══════════════════════════════════════════════════ */

/* ── Generar código de amigo (determinista a partir de UUID) ── */
function generateFriendCode(uuid) {
  const hex = uuid.replace(/-/g, '');
  // Tomar 6 chars del medio del UUID para variedad
  const part = hex.slice(8, 14).toUpperCase();
  return `ECO-${part}`;
}

/* ── Asegurar que el perfil tenga friend_code ── */
async function ensureFriendCode(sb, userId) {
  const { data: profile } = await sb
    .from('profiles')
    .select('friend_code')
    .eq('id', userId)
    .single();

  if (!profile?.friend_code) {
    const code = generateFriendCode(userId);
    await sb.from('profiles').update({ friend_code: code }).eq('id', userId);
    return code;
  }
  return profile.friend_code;
}

/* ══════════════════════════════════════════════════
   RENDERIZAR SECCIÓN DE AMIGOS EN EL PASAPORTE
══════════════════════════════════════════════════ */
async function initFriendsSection(sb, currentUser, profileId, isOwner) {
  /* Asegurar código de amigo si es el dueño */
  let friendCode = null;
  if (isOwner) {
    friendCode = await ensureFriendCode(sb, currentUser.id);
    renderFriendCode(friendCode, true);
  } else {
    /* Perfil público: mostrar código SOLO si ya son amigos */
    const { data: friendship } = await sb
      .from('friend_requests')
      .select('id, status')
      .eq('status', 'accepted')
      .or(`and(from_id.eq.${currentUser.id},to_id.eq.${profileId}),and(from_id.eq.${profileId},to_id.eq.${currentUser.id})`)
      .maybeSingle();

    if (friendship) {
      const { data: p } = await sb
        .from('profiles')
        .select('friend_code')
        .eq('id', profileId)
        .single();
      renderFriendCode(p?.friend_code || null, false);
    } else {
      /* No son amigos: ocultar el bloque de código */
      const wrap = document.getElementById('friendCodeBlock');
      if (wrap) wrap.style.display = 'none';
    }
  }

  /* Panel de solicitudes (solo dueño) */
  if (isOwner) {
    const sendWrap = document.getElementById('friendsSendWrap');
    const reqWrap  = document.getElementById('friendsRequestsWrap');
    if (sendWrap) sendWrap.style.display = '';
    if (reqWrap)  reqWrap.style.display  = '';
    await loadFriendRequests(sb, currentUser.id);
    await loadFriendsList(sb, currentUser.id);
    bindSendRequest(sb, currentUser.id);
  } else {
    /* Botón "Agregar amigo" en perfil ajeno */
    bindAddFriendBtn(sb, currentUser, profileId);
  }
}

/* ── Renderizar la clave de amigo ── */
function renderFriendCode(code, isOwner) {
  const el = document.getElementById('friendCodeValue');
  const wrap = document.getElementById('friendCodeBlock');
  if (!el || !wrap) return;

  if (code) {
    el.textContent = code;
    wrap.style.display = '';

    /* Copiar al portapapeles */
    const copyBtn = document.getElementById('btnCopyFriendCode');
    copyBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText(code).then(() => {
        copyBtn.textContent = '✓';
        copyBtn.classList.add('copied');
        setTimeout(() => { copyBtn.textContent = '⧉'; copyBtn.classList.remove('copied'); }, 1800);
      });
    });
  } else {
    wrap.style.display = 'none';
  }
}

/* ── Botón Agregar amigo (perfil ajeno) ── */
function bindAddFriendBtn(sb, currentUser, targetId) {
  const btn = document.getElementById('btnAddFriend');
  if (!btn || !currentUser) return;

  btn.style.display = '';

  /* Verificar si ya hay solicitud o amistad */
  (async () => {
    const { data: existing } = await sb
      .from('friend_requests')
      .select('id, status')
      .or(`and(from_id.eq.${currentUser.id},to_id.eq.${targetId}),and(from_id.eq.${targetId},to_id.eq.${currentUser.id})`)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'accepted') {
        btn.textContent = '✓ Amigos';
        btn.disabled = true;
        btn.classList.add('friend-btn-accepted');
      } else if (existing.status === 'pending') {
        btn.textContent = '⏳ Solicitud enviada';
        btn.disabled = true;
        btn.classList.add('friend-btn-pending');
      }
      return;
    }

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '⏳ Enviando…';
      const { error } = await sb.from('friend_requests').insert({
        from_id: currentUser.id,
        to_id: targetId,
        status: 'pending'
      });
      if (error) {
        btn.textContent = '✕ Error';
        btn.disabled = false;
      } else {
        btn.textContent = '⏳ Solicitud enviada';
        btn.classList.add('friend-btn-pending');
      }
    });
  })();
}

/* ── Enviar solicitud por código (panel dueño) ── */
function bindSendRequest(sb, currentUserId) {
  const input = document.getElementById('friendCodeInput');
  const btn   = document.getElementById('btnSendFriendReq');
  const msg   = document.getElementById('friendReqMsg');
  if (!btn || !input) return;

  btn.addEventListener('click', async () => {
    const code = input.value.trim().toUpperCase();
    if (!code) return;
    msg.textContent = '';
    btn.disabled = true;

    /* Buscar perfil por código */
    const { data: target } = await sb
      .from('profiles')
      .select('id, username')
      .eq('friend_code', code)
      .maybeSingle();

    if (!target) {
      showFriendMsg(msg, '❌ Código no encontrado.', true);
      btn.disabled = false;
      return;
    }

    if (target.id === currentUserId) {
      showFriendMsg(msg, '😅 Ese es tu propio código.', true);
      btn.disabled = false;
      return;
    }

    /* Verificar duplicado */
    const { data: dup } = await sb
      .from('friend_requests')
      .select('id, status')
      .or(`and(from_id.eq.${currentUserId},to_id.eq.${target.id}),and(from_id.eq.${target.id},to_id.eq.${currentUserId})`)
      .maybeSingle();

    if (dup) {
      const msg2 = dup.status === 'accepted' ? '✓ Ya son amigos.' : '⏳ Solicitud ya enviada.';
      showFriendMsg(msg, msg2, false);
      btn.disabled = false;
      return;
    }

    const { error } = await sb.from('friend_requests').insert({
      from_id: currentUserId,
      to_id: target.id,
      status: 'pending'
    });

    if (error) {
      showFriendMsg(msg, '❌ Error al enviar. Intenta de nuevo.', true);
    } else {
      showFriendMsg(msg, `✓ Solicitud enviada a @${target.username}`, false);
      input.value = '';
      await loadFriendRequests(sb, currentUserId);
    }
    btn.disabled = false;
  });

  input.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
}

/* ── Cargar solicitudes pendientes recibidas ── */
async function loadFriendRequests(sb, currentUserId) {
  const container = document.getElementById('friendRequestsList');
  if (!container) return;

  const { data: requests } = await sb
    .from('friend_requests')
    .select('id, from_id, status, created_at, profiles!friend_requests_from_id_fkey(username, avatar_url)')
    .eq('to_id', currentUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const badge = document.getElementById('friendReqBadge');

  if (!requests || requests.length === 0) {
    container.innerHTML = '<p class="friends-empty">Sin solicitudes pendientes.</p>';
    if (badge) badge.style.display = 'none';
    return;
  }

  if (badge) { badge.textContent = requests.length; badge.style.display = ''; }

  container.innerHTML = requests.map(r => {
    const profile = r.profiles;
    const avatar  = profile?.avatar_url ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.username || '?')}&background=a8d5a2&color=1a1a1a&size=64`;
    return `
      <div class="friend-request-item" id="freq-${r.id}">
        <a href="perfil.html?user=${profile?.username}" class="friend-req-avatar-wrap">
          <img class="friend-req-avatar" src="${avatar}" alt="${profile?.username}" />
        </a>
        <div class="friend-req-info">
          <a class="friend-req-name" href="perfil.html?user=${profile?.username}">@${profile?.username || '?'}</a>
          <span class="friend-req-time">${timeAgoFriends(new Date(r.created_at))}</span>
        </div>
        <div class="friend-req-actions">
          <button class="btn-accept-req" data-id="${r.id}" data-from="${r.from_id}">✓</button>
          <button class="btn-reject-req" data-id="${r.id}">✕</button>
        </div>
      </div>
    `;
  }).join('');

  /* Eventos aceptar / rechazar */
  container.querySelectorAll('.btn-accept-req').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reqId  = btn.dataset.id;
      const fromId = btn.dataset.from;
      btn.disabled = true;
      await sb.from('friend_requests').update({ status: 'accepted' }).eq('id', reqId);
      document.getElementById(`freq-${reqId}`)?.remove();
      await loadFriendsList(sb, currentUserId);
      await loadFriendRequests(sb, currentUserId);
    });
  });

  container.querySelectorAll('.btn-reject-req').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reqId = btn.dataset.id;
      btn.disabled = true;
      await sb.from('friend_requests').delete().eq('id', reqId);
      document.getElementById(`freq-${reqId}`)?.remove();
      await loadFriendRequests(sb, currentUserId);
    });
  });
}

/* ── Cargar lista de amigos ── */
async function loadFriendsList(sb, currentUserId) {
  const container = document.getElementById('friendsList');
  if (!container) return;

  /* Amigos = solicitudes aceptadas donde soy from o to */
  const { data: accepted } = await sb
    .from('friend_requests')
    .select('id, from_id, to_id, profiles_from:profiles!friend_requests_from_id_fkey(id, username, avatar_url), profiles_to:profiles!friend_requests_to_id_fkey(id, username, avatar_url)')
    .eq('status', 'accepted')
    .or(`from_id.eq.${currentUserId},to_id.eq.${currentUserId}`);

  const friendCountEl = document.getElementById('friendCount');

  if (!accepted || accepted.length === 0) {
    container.innerHTML = '<p class="friends-empty">Aún no tienes amigos. ¡Agrega tu primer EcoLince!</p>';
    if (friendCountEl) friendCountEl.textContent = '0';
    return;
  }

  if (friendCountEl) friendCountEl.textContent = accepted.length;

  container.innerHTML = accepted.map(r => {
    /* El amigo es el otro lado de la solicitud */
    const friend = r.from_id === currentUserId ? r.profiles_to : r.profiles_from;
    const avatar = friend?.avatar_url ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(friend?.username || '?')}&background=a8d5a2&color=1a1a1a&size=64`;
    return `
      <a class="friend-chip" href="perfil.html?user=${friend?.username}">
        <img class="friend-chip-avatar" src="${avatar}" alt="${friend?.username}" />
        <span class="friend-chip-name">@${friend?.username || '?'}</span>
      </a>
    `;
  }).join('');
}

/* ── Helper: tiempo relativo ── */
function timeAgoFriends(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)     return 'hace un momento';
  if (diff < 3600)   return `hace ${Math.floor(diff/60)} min`;
  if (diff < 86400)  return `hace ${Math.floor(diff/3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff/86400)} días`;
  return date.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
}

function showFriendMsg(el, text, isError) {
  el.textContent = text;
  el.className   = 'friend-msg ' + (isError ? 'err' : 'ok');
  setTimeout(() => { el.textContent = ''; el.className = 'friend-msg'; }, 5000);
}
