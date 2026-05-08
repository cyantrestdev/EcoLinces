/* ══════════════════════════════════════════════════
   chat.js — Sistema de Chats EcoLinces
   Funciones: 1-a-1, grupos, imágenes, tiempo real,
              badge de no leídos en el nav.
══════════════════════════════════════════════════ */

(function () {

  /* ── Usar el cliente Supabase global (instanciado en sb.js) ── */
  if (typeof window.sb === 'undefined' || window.sb === null) {
    console.error('chat.js: sb no está disponible. Asegúrate de cargar sb.js antes.');
    return;
  }
  const sb = window.sb;

  /* ── Estado global del chat ── */
  const Chat = {
    user:           null,   // usuario actual
    profile:        null,   // perfil actual
    convs:          [],     // lista de conversaciones
    activeConvId:   null,   // conversación abierta
    realtimeSub:    null,   // suscripción Realtime activa
    friendsCache:   [],     // amigos del usuario
    pendingImage:   null,   // File a enviar
    newChatMode:    '1on1', // '1on1' | 'group'
    selectedFriends: [],    // amigos seleccionados en modal nuevo chat
    globalMsgSub:    null,   // suscripción global de mensajes
  };

  window.__ChatDebug = Chat; // alias para depuración en consola

  /* ═══════════════════════════════════
     INIT
  ═══════════════════════════════════ */
  async function init() {
    injectHTML();
    bindStaticEvents();

    /* Escuchar cambio de sesión */
    sb.auth.onAuthStateChange((_event, session) => {
      if (session) {
        Chat.user = session.user;
        // No bloquear: cargar perfil y conversaciones en background
        sb.from('profiles').select('*').eq('id', session.user.id).single()
          .then(({ data: p }) => { Chat.profile = p; });
        showChatBtn();
        loadConversations();
        subscribeToNewMessages();
      } else {
        Chat.user    = null;
        Chat.profile = null;
        hideChatBtn();
        closePanel();
      }
    });

    /* Sesión existente */
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      Chat.user = session.user;
      sb.from('profiles').select('*').eq('id', session.user.id).single()
        .then(({ data: p }) => { Chat.profile = p; });
      showChatBtn();
      loadConversations();
      subscribeToNewMessages();
    }
  }

  /* ═══════════════════════════════════
     INYECTAR HTML
  ═══════════════════════════════════ */
  function injectHTML() {
    /* Botón en el nav */
    const navRightGroup = document.querySelector('.nav-right-group');
    if (navRightGroup && !document.getElementById('navChatBtn')) {
      const btn = document.createElement('button');
      btn.className = 'nav-chat-btn';
      btn.id        = 'navChatBtn';
      btn.title     = 'Mensajes';
      btn.style.display = 'none';
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="nav-chat-badge" id="chatBadge"></span>
      `;
      /* Insertar ANTES del search btn si existe, si no antes del nav-auth */
      const searchBtn = navRightGroup.querySelector('.nav-search-btn');
      const navAuth   = navRightGroup.querySelector('.nav-auth');
      const ref = searchBtn || navAuth;
      if (ref) navRightGroup.insertBefore(btn, ref);
      else navRightGroup.appendChild(btn);
    }

    /* Panel flotante */
    if (!document.getElementById('chatPanel')) {
      document.body.insertAdjacentHTML('beforeend', `
        <!-- PANEL PRINCIPAL -->
        <div class="chat-panel" id="chatPanel">

          <!-- VISTA: LISTA DE CONVERSACIONES -->
          <div class="chat-view active" id="chatViewList">
            <div class="chat-list-header">
              <span class="chat-list-title">Mensajes</span>
              <div class="chat-header-actions">
                <button class="chat-icon-btn" id="chatNewBtn" title="Nuevo mensaje">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                </button>
                <button class="chat-icon-btn" id="chatCloseBtn" title="Cerrar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div class="chat-search-wrap">
              <input class="chat-search-input" id="chatSearchInput" type="text" placeholder="Buscar conversación…" />
            </div>
            <div class="chat-conv-list" id="chatConvList">
              <div class="chat-empty-state">
                <div class="chat-empty-icon">💬</div>
                <span>Sin conversaciones aún.<br>¡Empieza a chatear!</span>
              </div>
            </div>
          </div>

          <!-- VISTA: MENSAJES DE UNA CONVERSACIÓN -->
          <div class="chat-view" id="chatViewConv">
            <div class="chat-conv-header" id="chatConvHeader">
              <button class="chat-back-btn" id="chatBackBtn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <img class="chat-conv-header-avatar" id="chatConvAvatar" src="" alt="" />
              <div class="chat-conv-header-info">
                <div class="chat-conv-header-name" id="chatConvName">—</div>
                <div class="chat-conv-header-sub" id="chatConvSub"></div>
              </div>
            </div>
            <div class="chat-img-preview-wrap" id="chatImgPreviewWrap">
              <div class="chat-img-preview">
                <img id="chatImgPreviewImg" src="" alt="Preview" />
                <button class="chat-img-preview-remove" id="chatImgPreviewRemove">✕</button>
              </div>
            </div>
            <div class="chat-messages" id="chatMessages">
              <!-- mensajes se renderizan aquí -->
            </div>
            <div class="chat-input-wrap">
              <label class="chat-attach-btn" title="Adjuntar imagen">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <input type="file" id="chatImageInput" accept="image/*" style="display:none" />
              </label>
              <textarea class="chat-input" id="chatInput" placeholder="Escribe un mensaje…" rows="1"></textarea>
              <button class="chat-send-btn" id="chatSendBtn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>

          <!-- MODAL: NUEVO CHAT -->
          <div class="chat-new-modal" id="chatNewModal">
            <div class="chat-new-header">
              <button class="chat-icon-btn" id="chatNewModalClose">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <span class="chat-new-title">Nuevo mensaje</span>
            </div>
            <div class="chat-type-tabs">
              <button class="chat-type-tab active" data-type="1on1">1 a 1</button>
              <button class="chat-type-tab"        data-type="group">Grupo</button>
            </div>
            <input class="chat-new-group-name" id="chatGroupName" placeholder="Nombre del grupo…" />
            <input class="chat-new-search" id="chatNewSearch" placeholder="Buscar amigos…" type="text" />
            <div class="chat-friend-list" id="chatFriendList"></div>
            <button class="chat-new-create-btn" id="chatCreateBtn" disabled>Iniciar chat</button>
          </div>
        </div>

        <!-- LIGHTBOX -->
        <div class="chat-lightbox" id="chatLightbox">
          <button class="chat-lightbox-close" id="chatLightboxClose">✕</button>
          <img id="chatLightboxImg" src="" alt="" />
        </div>
      `);
    }
  }

  /* ═══════════════════════════════════
     EVENTOS ESTÁTICOS
  ═══════════════════════════════════ */
  function bindStaticEvents() {
    document.addEventListener('click', e => {
      /* Abrir/cerrar panel */
      if (e.target.closest('#navChatBtn')) togglePanel();
      if (e.target.closest('#chatCloseBtn')) closePanel();
      if (e.target.closest('#chatBackBtn')) showListView();

      /* Nuevo chat */
      if (e.target.closest('#chatNewBtn'))       openNewModal();
      if (e.target.closest('#chatNewModalClose')) closeNewModal();

      /* Tabs tipo chat */
      if (e.target.closest('.chat-type-tab')) {
        const tab  = e.target.closest('.chat-type-tab');
        Chat.newChatMode = tab.dataset.type;
        Chat.selectedFriends = [];
        document.querySelectorAll('.chat-type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const groupName = document.getElementById('chatGroupName');
        groupName.classList.toggle('visible', Chat.newChatMode === 'group');
        renderFriendList();
        updateCreateBtn();
      }

      /* Crear conversación */
      if (e.target.closest('#chatCreateBtn')) createConversation();

      /* Enviar mensaje */
      if (e.target.closest('#chatSendBtn')) sendMessage();

      /* Quitar imagen */
      if (e.target.closest('#chatImgPreviewRemove')) clearImagePreview();

      /* Lightbox */
      if (e.target.closest('#chatLightboxClose') || e.target.id === 'chatLightbox') closeLightbox();

      /* Selección de amigos */
      const friendItem = e.target.closest('.chat-friend-item');
      if (friendItem) {
        const uid = friendItem.dataset.uid;
        if (!uid) return;
        if (Chat.newChatMode === '1on1') {
          Chat.selectedFriends = [uid];
          document.querySelectorAll('.chat-friend-item').forEach(i => {
            i.classList.toggle('selected', i.dataset.uid === uid);
            i.querySelector('.chat-friend-check').textContent = i.dataset.uid === uid ? '✓' : '';
          });
        } else {
          const idx = Chat.selectedFriends.indexOf(uid);
          if (idx >= 0) Chat.selectedFriends.splice(idx, 1);
          else Chat.selectedFriends.push(uid);
          friendItem.classList.toggle('selected', Chat.selectedFriends.includes(uid));
          friendItem.querySelector('.chat-friend-check').textContent = Chat.selectedFriends.includes(uid) ? '✓' : '';
        }
        updateCreateBtn();
      }
    });

    /* Conversación click */
    document.addEventListener('click', e => {
      if (e.target.closest('.chat-context-menu')) return;
      closeContextMenu();
      const item = e.target.closest('.chat-conv-item');
      if (item && item.dataset.convId) openConversation(item.dataset.convId);
    });

    /* Long press en conversación → menú contextual */
    let longPressTimer = null;
    document.addEventListener('pointerdown', e => {
      const item = e.target.closest('.chat-conv-item');
      if (!item) return;
      longPressTimer = setTimeout(() => {
        e.preventDefault();
        showContextMenu(item, item.dataset.convId);
      }, 500);
    });
    document.addEventListener('pointerup',    () => clearTimeout(longPressTimer));
    document.addEventListener('pointermove',  () => clearTimeout(longPressTimer));
    document.addEventListener('pointercancel',() => clearTimeout(longPressTimer));

    /* Cerrar menú contextual al hacer click fuera */
    document.addEventListener('click', e => {
      if (!e.target.closest('.chat-context-menu')) closeContextMenu();
    });

    /* Acción del menú contextual */
    document.addEventListener('click', e => {
      const btn = e.target.closest('.chat-ctx-leave');
      if (!btn) return;
      const convId = btn.dataset.convId;
      closeContextMenu();
      leaveConversation(convId);
    });

    /* Input de mensaje: auto-resize + Enter */
    document.addEventListener('input', e => {
      if (e.target.id === 'chatInput') {
        const ta = e.target;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 110) + 'px';
      }
      if (e.target.id === 'chatNewSearch') filterFriendList(e.target.value);
      if (e.target.id === 'chatSearchInput') filterConvList(e.target.value);
    });

    document.addEventListener('keydown', e => {
      if (e.target.id === 'chatInput' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    /* Adjuntar imagen */
    document.addEventListener('change', e => {
      if (e.target.id === 'chatImageInput') {
        const file = e.target.files[0];
        if (file) setImagePreview(file);
        e.target.value = '';
      }
    });

    /* Lightbox en imágenes de mensajes */
    document.addEventListener('click', e => {
      const img = e.target.closest('.chat-msg-image');
      if (img) openLightbox(img.src);
    });
  }

  /* ═══════════════════════════════════
     PANEL
  ═══════════════════════════════════ */
  function togglePanel() {
    const panel = document.getElementById('chatPanel');
    if (panel.classList.contains('open')) closePanel();
    else openPanel();
  }

  function openPanel() {
    if (!Chat.user) return;
    document.getElementById('chatPanel').classList.add('open');
    loadConversations();
  }

  function closePanel() {
    document.getElementById('chatPanel')?.classList.remove('open');
  }

  function showChatBtn() {
    const btn = document.getElementById('navChatBtn');
    if (btn) btn.style.display = '';
  }

  function hideChatBtn() {
    const btn = document.getElementById('navChatBtn');
    if (btn) btn.style.display = 'none';
  }

  /* ═══════════════════════════════════
     CARGAR CONVERSACIONES
  ═══════════════════════════════════ */
  async function loadConversations() {
    if (!Chat.user) return;

    /* IDs de conversaciones donde soy miembro */
    const { data: memberships } = await sb
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', Chat.user.id);

    if (!memberships || memberships.length === 0) {
      renderConvList([]);
      return;
    }

    const convIds    = memberships.map(m => m.conversation_id);
    const readMap    = Object.fromEntries(memberships.map(m => [m.conversation_id, m.last_read_at]));

    /* Datos de cada conversación */
    const { data: convs } = await sb
      .from('conversations')
      .select('*')
      .in('id', convIds)
      .order('updated_at', { ascending: false });

    if (!convs) return;

    /* Último mensaje de cada conv */
    const enriched = await Promise.all(convs.map(async conv => {
      const { data: lastMsgs } = await sb
        .from('messages')
        .select('content, image_url, created_at, sender_id, profiles!messages_sender_id_fkey(username)')
        .eq('conversation_id', conv.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1);

      const lastMsg = lastMsgs?.[0] || null;

      /* Para 1on1: obtener datos del otro miembro */
      let displayName = conv.name;
      let displayAvatar = conv.avatar_url;

      if (conv.type === '1on1') {
        const { data: members } = await sb
          .from('conversation_members')
          .select('user_id, profiles(username, avatar_url)')
          .eq('conversation_id', conv.id)
          .neq('user_id', Chat.user.id)
          .limit(1);

        const other = members?.[0]?.profiles;
        displayName   = other?.username   || '?';
        displayAvatar = other?.avatar_url ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=a8d5a2&color=1a1a1a&size=64`;
      }

      /* Hay mensajes no leídos? */
      const lastRead  = readMap[conv.id];
      const hasUnread = lastMsg && lastRead
        ? new Date(lastMsg.created_at) > new Date(lastRead) && lastMsg.sender_id !== Chat.user.id
        : !!lastMsg && lastMsg.sender_id !== Chat.user.id;

      return { ...conv, displayName, displayAvatar, lastMsg, hasUnread };
    }));

    Chat.convs = enriched;
    renderConvList(enriched);
    updateBadge(enriched.filter(c => c.hasUnread).length);
  }

  /* ── Renderizar lista ── */
  function renderConvList(convs) {
    const list = document.getElementById('chatConvList');
    if (!list) return;

    if (!convs || convs.length === 0) {
      list.innerHTML = `
        <div class="chat-empty-state">
          <div class="chat-empty-icon">💬</div>
          <span>Sin conversaciones aún.<br>¡Empieza a chatear!</span>
        </div>`;
      return;
    }

    list.innerHTML = convs.map(conv => {
      const isGroup   = conv.type === 'group';
      const lastText  = conv.lastMsg
        ? (conv.lastMsg.image_url ? '📷 Imagen' : (conv.lastMsg.content || ''))
        : 'Sin mensajes aún';
      const lastTime  = conv.lastMsg
        ? chatTimeAgo(new Date(conv.lastMsg.created_at))
        : '';
      const avatarEl  = isGroup
        ? `<div class="chat-conv-avatar group">🌿</div>`
        : `<img class="chat-conv-avatar" src="${conv.displayAvatar}" alt="${conv.displayName}" />`;

      return `
        <div class="chat-conv-item ${conv.hasUnread ? 'unread' : ''}" data-conv-id="${conv.id}">
          ${avatarEl}
          <div class="chat-conv-info">
            <div class="chat-conv-name">${escH(conv.displayName)}</div>
            <div class="chat-conv-preview">${escH(lastText.slice(0, 55))}</div>
          </div>
          <div class="chat-conv-meta">
            <span class="chat-conv-time">${lastTime}</span>
            <div class="chat-unread-dot"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  function filterConvList(q) {
    const filtered = !q.trim()
      ? Chat.convs
      : Chat.convs.filter(c => c.displayName.toLowerCase().includes(q.toLowerCase()));
    renderConvList(filtered);
  }

  /* ═══════════════════════════════════
     ABRIR CONVERSACIÓN
  ═══════════════════════════════════ */
  async function openConversation(convId) {
    Chat.activeConvId = convId;
    const conv = Chat.convs.find(c => c.id === convId);

    /* Cambiar vista */
    document.getElementById('chatViewList').classList.remove('active');
    document.getElementById('chatViewConv').classList.add('active');

    /* Header */
    const avatar = document.getElementById('chatConvAvatar');
    let displayName   = conv?.displayName;
    let displayAvatar = conv?.displayAvatar;

    /* Si es conv nueva (1on1) y no tiene displayName, cargarlo directamente */
    if (!displayName && conv?.type !== 'group') {
      const { data: members } = await sb
        .from('conversation_members')
        .select('user_id, profiles(username, avatar_url)')
        .eq('conversation_id', convId)
        .neq('user_id', Chat.user.id)
        .limit(1);
      const other = members?.[0]?.profiles;
      displayName   = other?.username ? '@' + other.username : '?';
      displayAvatar = other?.avatar_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=a8d5a2&color=1a1a1a&size=64`;
      if (conv) { conv.displayName = displayName; conv.displayAvatar = displayAvatar; }
    }

    avatar.src = displayAvatar || '';
    avatar.className = 'chat-conv-header-avatar' + (conv?.type === 'group' ? ' group' : '');
    document.getElementById('chatConvName').textContent = displayName || '—';

    if (conv?.type === 'group') {
      /* Contar miembros */
      const { count } = await sb
        .from('conversation_members')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', convId);
      document.getElementById('chatConvSub').textContent = `${count} miembros`;
    } else {
      document.getElementById('chatConvSub').textContent = '';
    }

    /* Cargar mensajes */
    await loadMessages(convId);

    /* Marcar como leído */
    await sb.from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .eq('user_id', Chat.user.id);

    /* Actualizar badge */
    if (conv) conv.hasUnread = false;
    updateBadge(Chat.convs.filter(c => c.hasUnread).length);

    /* Suscribirse a mensajes en tiempo real */
    subscribeToConversation(convId);

    /* Focus al input */
    setTimeout(() => document.getElementById('chatInput')?.focus(), 100);
  }

  /* ═══════════════════════════════════
     CARGAR MENSAJES
  ═══════════════════════════════════ */
  async function loadMessages(convId) {
    const { data: msgs } = await sb
      .from('messages')
      .select('*, profiles!messages_sender_id_fkey(username, avatar_url)')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(80);

    renderMessages(msgs || []);
  }

  function renderMessages(msgs) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    if (msgs.length === 0) {
      container.innerHTML = `<div style="text-align:center;color:#ccc;font-size:.82rem;margin-top:24px;">Sé el primero en escribir 🌿</div>`;
      return;
    }

    let lastDate = null;
    const isGroup = Chat.convs.find(c => c.id === Chat.activeConvId)?.type === 'group';

    container.innerHTML = msgs.map(msg => {
      const mine    = msg.sender_id === Chat.user?.id;
      const date    = new Date(msg.created_at);
      const dateStr = date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
      const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const sender  = msg.profiles;

      let dateSep = '';
      if (dateStr !== lastDate) {
        lastDate = dateStr;
        dateSep = `<div class="chat-date-sep">${dateStr}</div>`;
      }

      const avatar = sender?.avatar_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(sender?.username || '?')}&background=a8d5a2&color=1a1a1a&size=64`;

      const senderName = (!mine && isGroup && sender?.username)
        ? `<div class="chat-msg-sender">@${escH(sender.username)}</div>`
        : '';

      let bubbleContent = '';
      if (msg.deleted_at) {
        bubbleContent = `<span class="chat-msg-deleted">Mensaje eliminado</span>`;
      } else if (msg.image_url) {
        bubbleContent = `<img class="chat-msg-image" src="${msg.image_url}" alt="imagen" loading="lazy" />`;
        if (msg.content) bubbleContent += `<div>${escH(msg.content)}</div>`;
      } else {
        bubbleContent = escH(msg.content || '');
      }

      const deleteAction = mine && !msg.deleted_at
        ? `<button class="chat-msg-action-btn danger" data-msg-id="${msg.id}">Eliminar</button>`
        : '';

      return `
        ${dateSep}
        <div class="chat-msg ${mine ? 'mine' : 'theirs'}" data-msg-id="${msg.id}">
          ${!mine ? `<img class="chat-msg-avatar" src="${avatar}" alt="${sender?.username}" />` : ''}
          <div>
            ${senderName}
            <div class="chat-msg-bubble" style="position:relative">
              ${bubbleContent}
              ${deleteAction ? `<div class="chat-msg-actions">${deleteAction}</div>` : ''}
            </div>
            <div class="chat-msg-time">${timeStr}</div>
          </div>
        </div>
      `;
    }).join('');

    /* Scroll al final */
    container.scrollTop = container.scrollHeight;

    /* Bind eliminar */
    container.querySelectorAll('.chat-msg-action-btn.danger').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        deleteMessage(btn.dataset.msgId);
      });
    });
  }

  /* ═══════════════════════════════════
     ENVIAR MENSAJE
  ═══════════════════════════════════ */
  async function sendMessage() {
    if (!Chat.user || !Chat.activeConvId) return;

    const input   = document.getElementById('chatInput');
    const content = input.value.trim();
    const hasImg  = !!Chat.pendingImage;

    if (!content && !hasImg) return;

    const sendBtn = document.getElementById('chatSendBtn');
    sendBtn.disabled = true;

    let imageUrl = null;

    /* Subir imagen si hay */
    if (hasImg) {
      const file     = Chat.pendingImage;
      const ext      = file.name.split('.').pop();
      const path     = `${Chat.user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from('chat-images').upload(path, file, { upsert: false });

      if (!upErr) {
        const { data: urlData } = sb.storage.from('chat-images').getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }
      clearImagePreview();
    }

    const { error } = await sb.from('messages').insert({
      conversation_id: Chat.activeConvId,
      sender_id:       Chat.user.id,
      content:         content || null,
      image_url:       imageUrl
    });

    if (!error) {
      input.value = '';
      input.style.height = 'auto';
    }

    sendBtn.disabled = false;
    input.focus();
  }

  /* ═══════════════════════════════════
     ELIMINAR MENSAJE (soft delete)
  ═══════════════════════════════════ */
  async function deleteMessage(msgId) {
    await sb.from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', msgId)
      .eq('sender_id', Chat.user.id);
  }

  /* ═══════════════════════════════════
     TIEMPO REAL — MENSAJES
  ═══════════════════════════════════ */
  function subscribeToConversation(convId) {
    /* Cancelar suscripción anterior */
    if (Chat.realtimeSub) {
      sb.removeChannel(Chat.realtimeSub);
      Chat.realtimeSub = null;
    }

    Chat.realtimeSub = sb
      .channel(`conv-${convId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'messages',
        filter: `conversation_id=eq.${convId}`
      }, async payload => {
        /* Recargar mensajes de la conversación activa */
        if (Chat.activeConvId === convId) {
          await loadMessages(convId);
          /* Marcar como leído */
          await sb.from('conversation_members')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', convId)
            .eq('user_id', Chat.user.id);
        }
      })
      .subscribe();
  }

  /* Suscripción global para badge de no leídos */
  function subscribeToNewMessages() {
    if (Chat.globalMsgSub) return; // evitar doble suscripción
    Chat.globalMsgSub = sb.channel('all-messages')
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'messages'
      }, async payload => {
        const msg = payload.new;
        /* Solo si soy miembro de esa conv y no soy el sender */
        if (msg.sender_id === Chat.user?.id) return;
        const isMember = Chat.convs.some(c => c.id === msg.conversation_id);
        if (!isMember) {
          await loadConversations();
          return;
        }
        /* Si no está abierta esa conv, marcar unread */
        if (Chat.activeConvId !== msg.conversation_id) {
          const conv = Chat.convs.find(c => c.id === msg.conversation_id);
          if (conv) conv.hasUnread = true;
          updateBadge(Chat.convs.filter(c => c.hasUnread).length);
        }
        /* Actualizar preview de la lista */
        await loadConversations();
      })
      .subscribe();
  }

  /* ═══════════════════════════════════
     BADGE DEL NAV
  ═══════════════════════════════════ */
  function updateBadge(count) {
    const badge = document.getElementById('chatBadge');
    if (!badge) return;
    badge.textContent = count > 9 ? '9+' : count;
    badge.classList.toggle('visible', count > 0);
  }

  /* ═══════════════════════════════════
     MODAL NUEVO CHAT
  ═══════════════════════════════════ */
  async function openNewModal() {
    Chat.selectedFriends = [];
    Chat.newChatMode     = '1on1';

    /* Reset UI */
    document.querySelectorAll('.chat-type-tab').forEach((t, i) => {
      t.classList.toggle('active', i === 0);
    });
    document.getElementById('chatGroupName').classList.remove('visible');
    document.getElementById('chatGroupName').value = '';
    document.getElementById('chatNewSearch').value = '';
    document.getElementById('chatCreateBtn').disabled = true;

    await loadFriendsForNewChat();
    document.getElementById('chatNewModal').classList.add('open');
  }

  function closeNewModal() {
    document.getElementById('chatNewModal').classList.remove('open');
  }

  async function loadFriendsForNewChat() {
    if (!Chat.user) return;

    /* Cargar amigos aceptados */
    const { data: accepted } = await sb
      .from('friend_requests')
      .select(`
        from_id, to_id,
        profiles_from:profiles!friend_requests_from_id_fkey(id, username, avatar_url),
        profiles_to:profiles!friend_requests_to_id_fkey(id, username, avatar_url)
      `)
      .eq('status', 'accepted')
      .or(`from_id.eq.${Chat.user.id},to_id.eq.${Chat.user.id}`);

    Chat.friendsCache = (accepted || []).map(r => {
      const friend = r.from_id === Chat.user.id ? r.profiles_to : r.profiles_from;
      return {
        id:         friend.id,
        username:   friend.username,
        avatar_url: friend.avatar_url ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.username)}&background=a8d5a2&color=1a1a1a&size=64`
      };
    });

    renderFriendList();
  }

  function renderFriendList(filter = '') {
    const list = document.getElementById('chatFriendList');
    if (!list) return;

    const friends = filter
      ? Chat.friendsCache.filter(f => f.username.toLowerCase().includes(filter.toLowerCase()))
      : Chat.friendsCache;

    if (friends.length === 0) {
      list.innerHTML = `<div style="text-align:center;color:#ccc;padding:24px;font-size:.85rem;">
        ${Chat.friendsCache.length === 0 ? 'Agrega amigos primero para chatear.' : 'Sin resultados.'}
      </div>`;
      return;
    }

    list.innerHTML = friends.map(f => {
      const selected = Chat.selectedFriends.includes(f.id);
      return `
        <div class="chat-friend-item ${selected ? 'selected' : ''}" data-uid="${f.id}">
          <img class="chat-friend-avatar" src="${f.avatar_url}" alt="${f.username}" />
          <span class="chat-friend-name">@${escH(f.username)}</span>
          <div class="chat-friend-check">${selected ? '✓' : ''}</div>
        </div>
      `;
    }).join('');
  }

  function filterFriendList(q) { renderFriendList(q); }

  function updateCreateBtn() {
    const btn = document.getElementById('chatCreateBtn');
    if (!btn) return;
    const hasSelection = Chat.selectedFriends.length > 0;
    btn.disabled = !hasSelection;
    if (Chat.newChatMode === 'group' && Chat.selectedFriends.length > 0) {
      btn.textContent = `Crear grupo (${Chat.selectedFriends.length})`;
    } else {
      btn.textContent = 'Iniciar chat';
    }
  }

  async function createConversation() {
    if (!Chat.user || Chat.selectedFriends.length === 0) return;

    const btn = document.getElementById('chatCreateBtn');
    btn.disabled = true;

    /* Para 1on1: verificar si ya existe una conversación con ese usuario */
    if (Chat.newChatMode === '1on1') {
      const friendId = Chat.selectedFriends[0];
      const existing = await findExisting1on1(friendId);
      if (existing) {
        closeNewModal();
        /* Abrir la existente */
        if (!Chat.convs.find(c => c.id === existing)) await loadConversations();
        openConversation(existing);
        btn.disabled = false;
        return;
      }
    }

    const groupName = document.getElementById('chatGroupName').value.trim();
    const convType  = Chat.newChatMode;

    const { data: convId, error: convError } = await sb.rpc('create_conversation', {
      conv_type: convType,
      conv_name: convType === 'group' ? (groupName || 'Grupo') : null,
      member_ids: Chat.selectedFriends
    });

    if (convError || !convId) {
      console.error('createConversation error:', convError);
      btn.disabled = false;
      return;
    }

    closeNewModal();
    await loadConversations();
    // Esperar a que loadConversations termine de enriquecer Chat.convs
    await openConversation(convId);
    btn.disabled = false;
  }

  async function findExisting1on1(friendId) {
    /* Buscar convs donde yo y el amigo somos los únicos miembros */
    const { data: myConvs } = await sb
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', Chat.user.id);

    if (!myConvs) return null;
    const myIds = myConvs.map(m => m.conversation_id);

    const { data: friendConvs } = await sb
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', friendId)
      .in('conversation_id', myIds);

    if (!friendConvs) return null;
    const sharedIds = friendConvs.map(m => m.conversation_id);

    /* Filtrar solo las de tipo 1on1 */
    const { data: conv1on1 } = await sb
      .from('conversations')
      .select('id')
      .in('id', sharedIds)
      .eq('type', '1on1')
      .limit(1);

    return conv1on1?.[0]?.id || null;
  }

  /* ═══════════════════════════════════
     VISTA: LISTA
  ═══════════════════════════════════ */
  function showListView() {
    Chat.activeConvId = null;
    document.getElementById('chatViewConv').classList.remove('active');
    document.getElementById('chatViewList').classList.add('active');

    /* Cancelar suscripción de conversación */
    if (Chat.realtimeSub) {
      sb.removeChannel(Chat.realtimeSub);
      Chat.realtimeSub = null;
    }

    loadConversations();
  }

  /* ═══════════════════════════════════
     PREVIEW DE IMAGEN
  ═══════════════════════════════════ */
  function setImagePreview(file) {
    Chat.pendingImage = file;
    const wrap = document.getElementById('chatImgPreviewWrap');
    const img  = document.getElementById('chatImgPreviewImg');
    img.src = URL.createObjectURL(file);
    wrap.classList.add('visible');
  }

  function clearImagePreview() {
    Chat.pendingImage = null;
    const wrap = document.getElementById('chatImgPreviewWrap');
    const img  = document.getElementById('chatImgPreviewImg');
    wrap.classList.remove('visible');
    img.src = '';
    const input = document.getElementById('chatImageInput');
    if (input) input.value = '';
  }

  /* ═══════════════════════════════════
     LIGHTBOX
  ═══════════════════════════════════ */
  function openLightbox(src) {
    document.getElementById('chatLightboxImg').src = src;
    document.getElementById('chatLightbox').classList.add('open');
  }

  function closeLightbox() {
    document.getElementById('chatLightbox').classList.remove('open');
  }

  /* ═══════════════════════════════════
     MENÚ CONTEXTUAL
  ═══════════════════════════════════ */
  function showContextMenu(item, convId) {
    closeContextMenu();
    const rect = item.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'chat-context-menu';
    menu.innerHTML = `
      <button class="chat-ctx-leave" data-conv-id="${convId}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Salir de la conversación
      </button>
    `;
    document.body.appendChild(menu);

    /* Posicionar cerca del item */
    const menuH = 48;
    let top = rect.bottom + window.scrollY;
    if (top + menuH > window.innerHeight) top = rect.top + window.scrollY - menuH;
    menu.style.top  = top + 'px';
    menu.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';

    /* Animar entrada */
    requestAnimationFrame(() => menu.classList.add('visible'));
  }

  function closeContextMenu() {
    document.querySelectorAll('.chat-context-menu').forEach(m => m.remove());
  }

  async function leaveConversation(convId) {
    if (!Chat.user) return;
    const { error } = await sb.rpc('leave_conversation', { conv_id: convId });
    if (error) { console.error('leaveConversation error:', error); return; }

    /* Si era la conv activa, volver a la lista */
    if (Chat.activeConvId === convId) showListView();

    /* Quitar de la lista local */
    Chat.convs = Chat.convs.filter(c => c.id !== convId);
    renderConvList(Chat.convs);
    updateBadge(Chat.convs.filter(c => c.hasUnread).length);
  }

  /* ═══════════════════════════════════
     HELPERS
  ═══════════════════════════════════ */
  function chatTimeAgo(date) {
    const diff = Math.floor((Date.now() - date) / 1000);
    if (diff < 60)     return 'ahora';
    if (diff < 3600)   return `${Math.floor(diff/60)}m`;
    if (diff < 86400)  return `${Math.floor(diff/3600)}h`;
    if (diff < 604800) return `${Math.floor(diff/86400)}d`;
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  }

  function escH(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ═══════════════════════════════════
     EXPORT: abrir chat desde perfil
     Usar: ChatSystem.openWith(userId)
  ═══════════════════════════════════ */
  window.ChatSystem = {
    openWith: async function (targetUserId) {
      if (!Chat.user) return;
      await openPanel();
      /* Buscar conv existente o crear nueva */
      const existingId = await findExisting1on1(targetUserId);
      if (existingId) {
        if (!Chat.convs.find(c => c.id === existingId)) await loadConversations();
        openConversation(existingId);
      } else {
        Chat.selectedFriends = [targetUserId];
        await createConversation();
      }
    }
  };

  /* ── Arrancar cuando el DOM esté listo ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
