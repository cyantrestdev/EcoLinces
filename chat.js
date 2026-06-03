/* ══════════════════════════════════════════════════
   chat.js — Sistema de Chats EcoLinces
   Estilo: Instagram DMs
   Lógica: Supabase Realtime, amigos, grupos, imágenes
══════════════════════════════════════════════════ */

(function () {

  if (typeof window.sb === 'undefined' || window.sb === null) {
    console.error('chat.js: sb no está disponible. Carga sb.js antes.');
    return;
  }
  const sb = window.sb;

  /* ── Estado global ── */
  const Chat = {
    user:            null,
    profile:         null,
    convs:           [],
    activeConvId:    null,
    realtimeSub:     null,
    friendsCache:    [],
    pendingImage:    null,
    newChatMode:     '1on1',
    selectedFriends: [],
    isSending:       false,
    typingTimer:     null,   // debounce para dejar de "escribir"
    typingConvId:    null,   // conversación en la que se está escribiendo
    isRecording:     false,
    mediaRecorder:   null,
    audioChunks:     [],
    globalMsgSub:    null,
    activeFilter:    'all',   // 'all' | '1on1' | 'group'
    presenceSub:     null,    // canal de Supabase Presence
    onlineFriends:   new Set(), // IDs de amigos activos en este momento
    replyTo:         null,
  };

  window.__ChatDebug = Chat;

  /* ═══════════════════════════════════
     INIT
  ═══════════════════════════════════ */
  async function init() {
    injectHTML();
    bindStaticEvents();

    sb.auth.onAuthStateChange((_event, session) => {
      if (session) {
        Chat.user = session.user;
        sb.from('profiles').select('*').eq('id', session.user.id).single()
          .then(({ data: p }) => { Chat.profile = p; updateHeaderUsername(); });
        showChatBtn();
        loadConversations();
        subscribeToNewMessages();
        startPresence();
      } else {
        Chat.user = Chat.profile = null;
        hideChatBtn();
        closePanel();
        stopPresence();
      }
    });

    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      Chat.user = session.user;
      sb.from('profiles').select('*').eq('id', session.user.id).single()
        .then(({ data: p }) => { Chat.profile = p; updateHeaderUsername(); });
      showChatBtn();
      loadConversations();
      subscribeToNewMessages();
      startPresence();
    }
  }

  /* ── Actualizar username en el header de la lista ── */
  function updateHeaderUsername() {
    const el = document.getElementById('chatListUsername');
    if (el && Chat.profile?.username) el.textContent = Chat.profile.username;
  }

  /* ═══════════════════════════════════
     INYECTAR HTML
  ═══════════════════════════════════ */
  function injectHTML() {
    /* Botón en el nav (desktop) */
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
      const searchBtn = navRightGroup.querySelector('.nav-search-btn');
      const navAuth   = navRightGroup.querySelector('.nav-auth');
      const ref = searchBtn || navAuth;
      if (ref) navRightGroup.insertBefore(btn, ref);
      else navRightGroup.appendChild(btn);
    }

    /* Panel principal */
    if (!document.getElementById('chatPanel')) {
      document.body.insertAdjacentHTML('beforeend', `

        <!-- PANEL CHAT -->
        <div class="chat-panel" id="chatPanel">

          <!-- ══ VISTA: LISTA DE CONVERSACIONES ══ -->
          <div class="chat-view active" id="chatViewList">

            <!-- Nav estilo Instagram: ← username  [lápiz] -->
            <div class="chat-list-header">
              <div class="chat-list-header-left">
                <button class="chat-header-back" id="chatCloseBtn" aria-label="Cerrar mensajes">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>
              </div>
              <span class="chat-list-username" id="chatListUsername">Mensajes</span>
              <!-- Ícono lápiz: nuevo mensaje -->
              <button class="chat-header-compose" id="chatNewBtn" aria-label="Nuevo mensaje">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
              </button>
            </div>

            <!-- Fila de amigos activos -->
            <div class="chat-active-row" id="chatActiveRow">
              <span class="chat-active-empty">Sin amigos activos ahora</span>
            </div>

            <!-- Filtros: Primario / 1 a 1 / Grupos -->
            <div class="chat-filter-tabs">
              <button class="chat-filter-tab active" data-filter="all">Primario</button>
              <button class="chat-filter-tab" data-filter="1on1">1 a 1</button>
              <button class="chat-filter-tab" data-filter="group">Grupos</button>
            </div>

            <!-- Lista de conversaciones -->
            <div class="chat-conv-list" id="chatConvList">
              <div class="chat-empty-state">
                <div class="chat-empty-icon">💬</div>
                <span>Sin conversaciones aún.<br>¡Empieza a chatear!</span>
              </div>
            </div>
          </div>

          <!-- ══ VISTA: CONVERSACIÓN ══ -->
          <div class="chat-view" id="chatViewConv">
            <!-- Header: ← avatar nombre ... -->
            <div class="chat-conv-header" id="chatConvHeader">
              <button class="chat-back-btn" id="chatBackBtn" aria-label="Volver">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <img class="chat-conv-header-avatar" id="chatConvAvatar" src="" alt="" />
              <div class="chat-conv-header-info">
                <div class="chat-conv-header-name" id="chatConvName">—</div>
                <div class="chat-conv-header-sub"  id="chatConvSub"></div>
              </div>
              <button class="chat-conv-more-btn" id="chatConvMoreBtn" aria-label="Más opciones">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="5"  r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
                </svg>
              </button>
            </div>
            <div class="chat-img-preview-wrap" id="chatImgPreviewWrap">
              <div class="chat-img-preview">
                <img id="chatImgPreviewImg" src="" alt="Preview" />
                <button class="chat-img-preview-remove" id="chatImgPreviewRemove">✕</button>
              </div>
            </div>
            <div class="chat-messages" id="chatMessages"></div>
            <div class="chat-typing-wrap" id="chatTypingWrap">
              <div class="chat-typing" id="chatTypingIndicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
              </div>
              <span class="chat-typing-label" id="chatTypingLabel"></span>
            </div>
            <div class="chat-input-wrap">
              <label class="chat-attach-btn" title="Adjuntar imagen">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                <input type="file" id="chatImageInput" accept="image/*" style="display:none" />
              </label>
              <textarea class="chat-input" id="chatInput" placeholder="Mensaje…" rows="1"></textarea>
              <button class="chat-mic-btn" id="chatMicBtn" title="Mantén para grabar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="2" width="6" height="13" rx="3"/>
                  <path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
                </svg>
              </button>
              <button class="chat-send-btn" id="chatSendBtn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- ══ MODAL: NUEVO CHAT ══ -->
          <div class="chat-new-modal" id="chatNewModal">
            <div class="chat-new-header">
              <button class="chat-icon-btn" id="chatNewModalClose" aria-label="Cerrar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <span class="chat-new-title">Nuevo mensaje</span>
              <div style="width:28px"></div>
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

        </div><!-- /chat-panel -->

        <!-- LIGHTBOX -->
        <div class="chat-lightbox" id="chatLightbox">
          <button class="chat-lightbox-close" id="chatLightboxClose">✕</button>
          <img id="chatLightboxImg" src="" alt="" />
        </div>
      `);
    }

    /* FAB móvil — se inyecta si no existe (todas las páginas) */
    if (!document.getElementById('chatFab')) {
      const fab = document.createElement('button');
      fab.className  = 'chat-fab';
      fab.id         = 'chatFab';
      fab.classList.add('chat-fab--hidden');
      fab.setAttribute('aria-label', 'Mensajes');
      fab.innerHTML  = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="chat-fab-badge" id="chatFabBadge"></span>
      `;
      document.body.appendChild(fab);
    }
  }

  /* ═══════════════════════════════════
     EVENTOS ESTÁTICOS
  ═══════════════════════════════════ */
  function bindStaticEvents() {
    document.addEventListener('click', e => {
      /* Abrir/cerrar panel */
      if (e.target.closest('#navChatBtn') || e.target.closest('#chatFab')) togglePanel();
      if (e.target.closest('#chatCloseBtn')) closePanel();
      if (e.target.closest('#chatBackBtn'))  showListView();

      /* Filtros de lista */
      const filterTab = e.target.closest('.chat-filter-tab');
      if (filterTab && filterTab.closest('#chatViewList')) {
        document.querySelectorAll('.chat-filter-tab').forEach(t => t.classList.remove('active'));
        filterTab.classList.add('active');
        Chat.activeFilter = filterTab.dataset.filter;
        renderConvList(Chat.convs);
      }

      /* Amigo activo → abrir conversación directa */
      const activeItem = e.target.closest('.chat-active-item');
      if (activeItem?.dataset.uid) openOrCreateDM(activeItem.dataset.uid);

      /* Nuevo chat */
      if (e.target.closest('#chatNewBtn'))       openNewModal();
      if (e.target.closest('#chatNewModalClose')) closeNewModal();

      /* Tabs tipo chat en modal */
      const typeTab = e.target.closest('.chat-type-tab');
      if (typeTab && typeTab.closest('#chatNewModal')) {
        Chat.newChatMode     = typeTab.dataset.type;
        Chat.selectedFriends = [];
        document.querySelectorAll('#chatNewModal .chat-type-tab').forEach(t => t.classList.remove('active'));
        typeTab.classList.add('active');
        document.getElementById('chatGroupName').classList.toggle('visible', Chat.newChatMode === 'group');
        renderFriendList();
        updateCreateBtn();
      }

      /* Crear conversación */
      if (e.target.closest('#chatCreateBtn')) createConversation();

      /* Enviar mensaje */
      if (e.target.closest('#chatSendBtn') && !document.getElementById('chatSendBtn')?.disabled) sendMessage();

      /* Quitar imagen */
      if (e.target.closest('#chatImgPreviewRemove')) clearImagePreview();

      /* Lightbox */
      if (e.target.closest('#chatLightboxClose') || e.target.id === 'chatLightbox') closeLightbox();

      /* Menú "..." de conversación */
      if (e.target.closest('#chatConvMoreBtn')) {
        e.stopImmediatePropagation(); // detiene TODOS los listeners del documento, no sólo la burbuja
        const btn = document.getElementById('chatConvMoreBtn');
        const existing = document.querySelector('.chat-context-menu');
        if (existing) { closeContextMenu(); return; } // toggle: si ya está abierto, se cierra
        const item = { dataset: { convId: Chat.activeConvId }, getBoundingClientRect: () => btn.getBoundingClientRect() };
        showContextMenu(item, Chat.activeConvId);
        return;
      }

      /* Selección de amigos en modal */
      const friendItem = e.target.closest('.chat-friend-item');
      if (friendItem) {
        const uid = friendItem.dataset.uid;
        if (!uid) return;
        if (Chat.newChatMode === '1on1') {
          Chat.selectedFriends = [uid];
          document.querySelectorAll('.chat-friend-item').forEach(i => {
            const sel = i.dataset.uid === uid;
            i.classList.toggle('selected', sel);
            i.querySelector('.chat-friend-check').textContent = sel ? '✓' : '';
          });
        } else {
          const idx = Chat.selectedFriends.indexOf(uid);
          if (idx >= 0) Chat.selectedFriends.splice(idx, 1);
          else Chat.selectedFriends.push(uid);
          friendItem.classList.toggle('selected', Chat.selectedFriends.includes(uid));
          friendItem.querySelector('.chat-friend-check').textContent =
            Chat.selectedFriends.includes(uid) ? '✓' : '';
        }
        updateCreateBtn();
      }
    });

    /* Conversación click */
    document.addEventListener('click', e => {
      if (e.target.closest('.chat-conv-more-btn')) return;
      if (e.target.closest('#chatConvMoreBtn')) return; // botón "..." del header de conversación
      if (e.target.closest('.chat-context-menu')) return;
      closeContextMenu();
      const item = e.target.closest('.chat-conv-item');
      if (item?.dataset.convId) openConversation(item.dataset.convId);
    });

    /* Long press → menú contextual */
    let longPressTimer = null;
    document.addEventListener('pointerdown', e => {
      const item = e.target.closest('.chat-conv-item');
      if (!item) return;
      longPressTimer = setTimeout(() => {
        e.preventDefault();
        showContextMenu(item, item.dataset.convId);
      }, 500);
    });
    document.addEventListener('pointerup',    e => { if (!e.target.closest('#chatMicBtn')) clearTimeout(longPressTimer); });
    document.addEventListener('pointermove',  e => { if (!e.target.closest('#chatMicBtn')) clearTimeout(longPressTimer); });
    document.addEventListener('pointercancel',e => { if (!e.target.closest('#chatMicBtn')) clearTimeout(longPressTimer); });

    document.addEventListener('click', e => {
      const btn = e.target.closest('.chat-ctx-btn');
      if (btn) {
        closeContextMenu();
        const action = btn.dataset.action;
        const convId = btn.dataset.convId;
        if (action === 'leave')     leaveConversation(convId);
        if (action === 'mute')      muteConversation(convId);
        if (action === 'unfriend')  unfriendFromConv(convId);
        if (action === 'wallpaper') openWallpaperPicker();
        return;
      }
      if (!e.target.closest('.chat-context-menu')) closeContextMenu();
    });

    /* Input auto-resize + Enter */
    document.addEventListener('input', e => {
      if (e.target.id === 'chatInput') {
        const ta = e.target;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 110) + 'px';
        if (Chat.activeConvId) onInputTyping();
      }
      if (e.target.id === 'chatNewSearch')  filterFriendList(e.target.value);
      if (e.target.id === 'chatSearchInput') filterConvList(e.target.value);
    });

    document.addEventListener('keydown', e => {
      if (e.target.id === 'chatInput' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Micrófono — se enlaza al botón directamente cuando el panel está disponible
    // (el botón existe en el HTML estático así que está disponible inmediatamente)
    bindMicBtn();

    document.addEventListener('change', e => {
      if (e.target.id === 'chatImageInput') {
        const file = e.target.files[0];
        if (file) setImagePreview(file);
        e.target.value = '';
      }
    });

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
    const fab = document.getElementById('chatFab');
    if (fab) { fab.style.opacity = '0'; fab.style.pointerEvents = 'none'; fab.style.transform = 'scale(0.8)'; }
    loadConversations();
  }

  function closePanel() {
    document.getElementById('chatPanel')?.classList.remove('open');
    const fab = document.getElementById('chatFab');
    if (fab) { fab.style.opacity = ''; fab.style.pointerEvents = ''; fab.style.transform = ''; }
  }

  function showChatBtn() {
    document.getElementById('navChatBtn')?.style && (document.getElementById('navChatBtn').style.display = '');
    document.getElementById('chatFab')?.classList.remove('chat-fab--hidden');
  }

  function hideChatBtn() {
    document.getElementById('navChatBtn')?.style && (document.getElementById('navChatBtn').style.display = 'none');
    document.getElementById('chatFab')?.classList.add('chat-fab--hidden');
  }

  /* ═══════════════════════════════════
     CARGAR CONVERSACIONES
  ═══════════════════════════════════ */
  async function loadConversations() {
    if (!Chat.user) return;

    const { data: memberships } = await sb
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', Chat.user.id);

    if (!memberships?.length) {
      renderConvList([]);
      loadActiveFriends();
      return;
    }

    const convIds = memberships.map(m => m.conversation_id);
    const readMap = Object.fromEntries(memberships.map(m => [m.conversation_id, m.last_read_at]));

    const { data: convs } = await sb
      .from('conversations')
      .select('*')
      .in('id', convIds)
      .order('updated_at', { ascending: false });

    if (!convs) return;

    const enriched = await Promise.all(convs.map(async conv => {
      const { data: lastMsgs } = await sb
        .from('messages')
        .select('content, image_url, created_at, sender_id, profiles!messages_sender_id_fkey(username)')
        .eq('conversation_id', conv.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1);

      const lastMsg = lastMsgs?.[0] || null;

      let displayName   = conv.name;
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

      const lastRead  = readMap[conv.id];
      const hasUnread = lastMsg && lastRead
        ? new Date(lastMsg.created_at) > new Date(lastRead) && lastMsg.sender_id !== Chat.user.id
        : !!lastMsg && lastMsg.sender_id !== Chat.user.id;

      return { ...conv, displayName, displayAvatar, lastMsg, hasUnread };
    }));

    Chat.convs = enriched;
    renderConvList(enriched);
    updateBadge(enriched.filter(c => c.hasUnread).length);
    loadActiveFriends();
  }

  /* ── Renderizar lista con filtro activo ── */
  function renderConvList(convs) {
    const list = document.getElementById('chatConvList');
    if (!list) return;

    /* Aplicar filtro */
    let filtered = convs;
    if (Chat.activeFilter === '1on1')  filtered = convs.filter(c => c.type === '1on1');
    if (Chat.activeFilter === 'group') filtered = convs.filter(c => c.type === 'group');

    if (!filtered?.length) {
      const msg = Chat.activeFilter !== 'all'
        ? `Sin conversaciones ${Chat.activeFilter === '1on1' ? '1 a 1' : 'grupales'} aún.`
        : 'Sin conversaciones aún.<br>¡Empieza a chatear!';
      list.innerHTML = `
        <div class="chat-empty-state">
          <div class="chat-empty-icon">💬</div>
          <span>${msg}</span>
        </div>`;
      return;
    }

    list.innerHTML = filtered.map(conv => {
      const isGroup  = conv.type === 'group';
      const lastText = conv.lastMsg
        ? (conv.lastMsg.image_url ? '📷 Imagen' : (conv.lastMsg.content || ''))
        : 'Sin mensajes aún';
      const lastTime = conv.lastMsg ? chatTimeAgo(new Date(conv.lastMsg.created_at)) : '';
      const avatarEl = isGroup
        ? `<div class="chat-conv-avatar group">🌿</div>`
        : `<img class="chat-conv-avatar" src="${conv.displayAvatar}" alt="${escH(conv.displayName)}" loading="lazy" />`;

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
     FILA DE AMIGOS ACTIVOS
     Muestra los amigos con conversación 1on1 existente
     (no hay presencia real-time, se muestran todos los amigos)
  ═══════════════════════════════════ */
  async function loadActiveFriends() {
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

    const friends = (accepted || []).map(r => {
      const f = r.from_id === Chat.user.id ? r.profiles_to : r.profiles_from;
      return {
        id:         f.id,
        username:   f.username,
        avatar_url: f.avatar_url ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(f.username)}&background=a8d5a2&color=1a1a1a&size=64`
      };
    });

    /* Actualizar caché de amigos también */
    Chat.friendsCache = friends;

    renderActiveFriends(friends);
  }

  function renderActiveFriends(friends) {
    const row = document.getElementById('chatActiveRow');
    if (!row) return;

    if (!friends.length) {
      row.innerHTML = `<span class="chat-active-empty">Sin amigos aún</span>`;
      return;
    }

    // Puntos ocultos por defecto — refreshActiveDots() los activa según presencia real
    row.innerHTML = friends.map(f => `
      <div class="chat-active-item" data-uid="${f.id}" title="@${escH(f.username)}" style="opacity:0.55;order:1">
        <div class="chat-active-avatar-wrap">
          <img class="chat-active-avatar" src="${f.avatar_url}" alt="${escH(f.username)}" loading="lazy" />
          <div class="chat-active-dot" style="display:none"></div>
        </div>
        <span class="chat-active-name">@${escH(f.username)}</span>
      </div>
    `).join('');

    // Aplicar estado de presencia ya conocido
    refreshActiveDots();
  }

  /* Abrir o crear DM al tocar un amigo activo */
  async function openOrCreateDM(targetUserId) {
    if (!Chat.user) return;
    openPanel();
    const existingId = await findExisting1on1(targetUserId);
    if (existingId) {
      if (!Chat.convs.find(c => c.id === existingId)) await loadConversations();
      openConversation(existingId);
    } else {
      Chat.selectedFriends = [targetUserId];
      Chat.newChatMode     = '1on1';
      await createConversation();
    }
  }

  /* ═══════════════════════════════════
     ABRIR CONVERSACIÓN
  ═══════════════════════════════════ */
  async function openConversation(convId) {
    Chat.activeConvId = convId;
    const conv = Chat.convs.find(c => c.id === convId);

    document.getElementById('chatViewList').classList.remove('active');
    document.getElementById('chatViewConv').classList.add('active');

    const avatarEl = document.getElementById('chatConvAvatar');
    let displayName   = conv?.displayName;
    let displayAvatar = conv?.displayAvatar;

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

    avatarEl.src = displayAvatar || '';
    avatarEl.className = 'chat-conv-header-avatar' + (conv?.type === 'group' ? ' group' : '');
    document.getElementById('chatConvName').textContent = displayName || '—';

    if (conv?.type === 'group') {
      const { count } = await sb
        .from('conversation_members')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', convId);
      document.getElementById('chatConvSub').textContent = `${count} miembros`;
    } else {
      document.getElementById('chatConvSub').textContent = '';
    }

    await loadMessages(convId);
    applyWallpaper();
    markMessagesRead(convId);

    await sb.from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .eq('user_id', Chat.user.id);

    if (conv) conv.hasUnread = false;
    updateBadge(Chat.convs.filter(c => c.hasUnread).length);

    subscribeToConversation(convId);
    setTimeout(() => document.getElementById('chatInput')?.focus(), 100);
  }

  /* ═══════════════════════════════════
     CARGAR & RENDERIZAR MENSAJES
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

  async function renderMessages(msgs) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const isInitialLoad = true;
    // Cargar estado de lecturas para los mensajes propios
    const reads = Chat.activeConvId ? await loadReadStatus(Chat.activeConvId) : {};

    if (!msgs.length) {
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
        dateSep = `<div class="chat-date-sep"><span>${dateStr}</span></div>`;
      }

      const avatar = sender?.avatar_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(sender?.username || '?')}&background=a8d5a2&color=1a1a1a&size=64`;
      const senderName = (!mine && isGroup && sender?.username)
        ? `<div class="chat-msg-sender">@${escH(sender.username)}</div>` : '';

      let bubbleContent = '';
      let replyBlock = '';
      if (msg.deleted_at) {
        bubbleContent = `<span class="chat-msg-deleted">Mensaje eliminado</span>`;
      } else {
        // Reply preview
        if (msg.reply_to_content) {
          replyBlock = `<div class="chat-msg-reply-preview">
            <span class="chat-msg-reply-author">${escH(msg.reply_to_author || '…')}</span>
            <span class="chat-msg-reply-text">${escH((msg.reply_to_content || '').slice(0, 60))}</span>
          </div>`;
        }
        // Detectar URL para preview
        const URL_RE = /https?:\/\/[^\s]+/i;
        const urlMatch = (msg.content || '').match(URL_RE);
        const linkPreview = (urlMatch && !msg.audio_url && !msg.image_url)
          ? `<div class="chat-link-preview loading" data-url="${urlMatch[0]}" data-msg-id="${msg.id}">
               <div class="chat-lp-spinner"></div>
             </div>`
          : '';

        if (msg.audio_url) {
          const dur = msg.audio_duration ? formatAudioDuration(msg.audio_duration) : '';
          bubbleContent = `<div class="chat-msg-audio">
            <button class="chat-audio-play-btn" data-src="${msg.audio_url}" title="Reproducir">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
            <div class="chat-audio-progress">
              <div class="chat-audio-bar"><div class="chat-audio-fill"></div></div>
              <span class="chat-audio-time">${dur}</span>
            </div>
          </div>`;
        } else if (msg.image_url) {
          bubbleContent = `<img class="chat-msg-image" src="${msg.image_url}" alt="imagen" loading="lazy" />`;
          if (msg.content) bubbleContent += `<div>${escH(msg.content)}</div>`;
        } else {
          bubbleContent = escH(msg.content || '') + linkPreview;
        }
      }

      // Reactions — uids puede llegar como no-array desde Supabase; se normaliza
      const reactions = (msg.reactions && Object.keys(msg.reactions).length)
        ? `<div class="chat-msg-reactions">${
            Object.entries(msg.reactions).map(([emoji, uids]) => {
              const arr     = Array.isArray(uids) ? uids : [];
              const isMine  = arr.includes(Chat.user?.id);
              const count   = arr.length;
              if (!count) return ''; // no mostrar emojis sin usuarios
              return `<span class="chat-msg-reaction ${isMine ? 'mine' : ''}" data-msg-id="${msg.id}" data-emoji="${emoji}">${emoji}<span class="rxn-count">${count > 1 ? count : ''}</span></span>`;
            }).join('')
          }</div>` : '';

      // Toolbar inline junto a la burbuja
      const toolbar = msg.deleted_at ? '' : `
        <div class="chat-msg-toolbar">
          <button class="chat-msg-tool" data-action="react" data-msg-id="${msg.id}" title="Reaccionar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
          <button class="chat-msg-tool" data-action="reply" data-msg-id="${msg.id}" data-content="${escH((msg.content||'').slice(0,80))}" data-author="${escH(sender?.username || 'yo')}" title="Responder">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          </button>
          ${mine ? `<button class="chat-msg-tool danger" data-action="delete" data-msg-id="${msg.id}" title="Eliminar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>` : ''}
        </div>`;

      // La fila del mensaje: [avatar] [burbuja+reacciones+tiempo] [toolbar]
      // Para mine: orden inverso → [toolbar] [burbuja]
      // Para mensajes propios (mine): el contenedor usa flex-direction: row-reverse,
      // por lo que el primer elemento en el HTML queda visualmente a la DERECHA.
      // Ponemos la burbuja primero → aparece a la derecha; el toolbar segundo → aparece a la izquierda.
      const isRead    = mine && reads[msg.id]?.length > 0;
      const tick      = mine ? tickHTML(isRead ? 'read' : 'sent') : '';

      const msgRow = mine
        ? `<div class="chat-msg-bubble-col">
            <div class="chat-msg-bubble">${replyBlock}${bubbleContent}</div>
            ${reactions}
            <div class="chat-msg-time">${timeStr}${tick}</div>
          </div>${toolbar}`
        : `<img class="chat-msg-avatar" src="${avatar}" alt="${sender?.username}" />
           <div class="chat-msg-bubble-col">
            ${senderName}
            <div class="chat-msg-bubble">${replyBlock}${bubbleContent}</div>
            ${reactions}
            <div class="chat-msg-time">${timeStr}</div>
          </div>${toolbar}`;

      return `
        ${dateSep}
        <div class="chat-msg chat-msg-wrap ${mine ? 'mine' : 'theirs'} no-anim" data-msg-id="${msg.id}">
          ${msgRow}
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
    bindMessageToolbars(container);
    bindAudioPlayers(container);
    fetchLinkPreviews(container);
  }

  /* Picker de emojis para reaccionar */
  const REACTION_EMOJIS = ['👍','❤️','😂','😮','😢','🔥'];

  function bindMessageToolbars(container) {
    container.querySelectorAll('.chat-msg-tool').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const msgId  = btn.dataset.msgId;

        if (action === 'delete') {
          deleteMessage(msgId);
        } else if (action === 'reply') {
          setReplyContext(msgId, btn.dataset.author, btn.dataset.content);
        } else if (action === 'react') {
          showEmojiPicker(btn, msgId);
        }
      });
    });

    container.querySelectorAll('.chat-msg-reaction').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        toggleReaction(el.dataset.msgId, el.dataset.emoji);
      });
    });
  }

  /* ── Emoji picker inline ── */
  function showEmojiPicker(anchor, msgId) {
    document.querySelectorAll('.chat-emoji-picker').forEach(p => p.remove());
    const picker = document.createElement('div');
    picker.className = 'chat-emoji-picker';
    picker.innerHTML = REACTION_EMOJIS.map(e =>
      `<button class="chat-emoji-opt" data-emoji="${e}" data-msg-id="${msgId}">${e}</button>`
    ).join('');

    // El picker es position:fixed, así que las coordenadas son viewport puras — sin scrollY
    document.body.appendChild(picker);

    // Esperar un frame para que el navegador calcule las dimensiones reales del picker
    requestAnimationFrame(() => {
      const rect      = anchor.getBoundingClientRect();
      const pickerW   = picker.offsetWidth  || 240;
      const pickerH   = picker.offsetHeight || 48;
      const margin    = 8;

      // Intentar aparecer ENCIMA del botón; si no cabe, aparecer DEBAJO
      let top = rect.top - pickerH - margin;
      if (top < margin) top = rect.bottom + margin;

      // Centrar horizontalmente sobre el botón, sin salirse de la ventana
      let left = rect.left + rect.width / 2 - pickerW / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - pickerW - margin));

      picker.style.top  = top  + 'px';
      picker.style.left = left + 'px';
      picker.classList.add('visible');
    });

    picker.querySelectorAll('.chat-emoji-opt').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        toggleReaction(btn.dataset.msgId, btn.dataset.emoji);
        picker.remove();
      });
    });

    setTimeout(() => {
      document.addEventListener('click', () => picker.remove(), { once: true });
    }, 100);
  }

  /* ── Reaccionar / quitar reacción ── */
  async function toggleReaction(msgId, emoji) {
    if (!Chat.user) return;

    // 1. Leer estado actual
    const { data: msg, error: readErr } = await sb
      .from('messages').select('reactions').eq('id', msgId).single();
    if (readErr || !msg) {
      console.error('[reaction] Error leyendo mensaje:', readErr);
      return;
    }

    // 2. Calcular nuevo estado
    const reactions = msg.reactions || {};
    const uids = Array.isArray(reactions[emoji]) ? [...reactions[emoji]] : [];
    const idx  = uids.indexOf(Chat.user.id);
    if (idx >= 0) uids.splice(idx, 1); else uids.push(Chat.user.id);
    if (!uids.length) delete reactions[emoji]; else reactions[emoji] = uids;

    // 3. Intentar RPC primero (bypassa RLS — requiere toggle_reaction en Supabase)
    const { error: rpcErr } = await sb.rpc('toggle_reaction', {
      msg_id:  msgId,
      emoji:   emoji,
      user_id: Chat.user.id
    });

    if (rpcErr) {
      console.warn('[reaction] RPC falló, intentando UPDATE directo:', rpcErr.message);
      // Fallback: update directo (funciona si la política RLS lo permite)
      const { error: updErr } = await sb
        .from('messages')
        .update({ reactions })
        .eq('id', msgId);
      if (updErr) {
        console.error('[reaction] UPDATE también falló:', updErr.message);
        alert('No se pudo guardar la reacción. Revisa la consola (F12) para ver el error de Supabase.');
        return;
      }
    }

    loadMessages(Chat.activeConvId);
  }

  /* ── Responder mensaje ── */
  function setReplyContext(msgId, author, content) {
    Chat.replyTo = { id: msgId, author, content };
    let bar = document.getElementById('chatReplyBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'chatReplyBar';
      bar.className = 'chat-reply-bar';
      // El elemento correcto es .chat-input-wrap (no tiene ID en el HTML)
      const inputWrap = document.querySelector('#chatViewConv .chat-input-wrap');
      if (inputWrap) {
        inputWrap.parentNode.insertBefore(bar, inputWrap);
      } else {
        document.getElementById('chatViewConv')?.appendChild(bar);
      }
    }
    bar.innerHTML = `
      <div class="chat-reply-bar-inner">
        <div class="chat-reply-bar-accent"></div>
        <div class="chat-reply-bar-body">
          <span class="chat-reply-bar-author">${escH(author)}</span>
          <span class="chat-reply-bar-text">${escH(content.slice(0, 60))}${content.length > 60 ? '…' : ''}</span>
        </div>
        <button class="chat-reply-bar-close" id="chatReplyClose">✕</button>
      </div>
    `;
    bar.style.display = 'block';
    document.getElementById('chatReplyClose')?.addEventListener('click', clearReplyContext);
    document.getElementById('chatInput')?.focus();
  }

  function clearReplyContext() {
    Chat.replyTo = null;
    const bar = document.getElementById('chatReplyBar');
    if (bar) bar.style.display = 'none';
  }

  /* ═══════════════════════════════════
     AUDIO — utilidades
  ═══════════════════════════════════ */
  function formatAudioDuration(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /* ══════════════════════════════════════════════
     PREVIEW DE LINKS
  ══════════════════════════════════════════════ */
  const _lpCache = {};

  async function fetchLinkPreviews(container) {
    const cards = container.querySelectorAll('.chat-link-preview.loading');
    for (const card of cards) {
      const url = card.dataset.url;
      if (!url) continue;
      card.classList.remove('loading');

      try {
        let meta = _lpCache[url];
        if (!meta) {
          const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
          const res   = await fetch(proxy, { signal: AbortSignal.timeout(5000) });
          const json  = await res.json();
          const parser = new DOMParser();
          const doc    = parser.parseFromString(json.contents, 'text/html');

          const getMeta = (attr, val) =>
            doc.querySelector(`meta[${attr}="${val}"]`)?.getAttribute('content') || '';

          meta = {
            title:       getMeta('property','og:title') || getMeta('name','title') || doc.title || url,
            description: getMeta('property','og:description') || getMeta('name','description') || '',
            image:       getMeta('property','og:image') || '',
            site:        getMeta('property','og:site_name') || new URL(url).hostname.replace('www.',''),
          };
          _lpCache[url] = meta;
        }

        card.innerHTML = `
          ${meta.image ? `<img class="chat-lp-img" src="${meta.image}" alt="" loading="lazy" onerror="this.remove()"/>` : ''}
          <div class="chat-lp-body">
            <span class="chat-lp-site">${escH(meta.site)}</span>
            <span class="chat-lp-title">${escH(meta.title.slice(0,80))}</span>
            ${meta.description ? `<span class="chat-lp-desc">${escH(meta.description.slice(0,120))}</span>` : ''}
          </div>
        `;
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
      } catch {
        card.remove(); // si falla, no mostrar nada
      }
    }
  }

  /* Genera alturas pseudo-aleatorias pero deterministas para el waveform */
  function generateWaveform(src, barCount = 28) {
    let hash = 0;
    for (let i = 0; i < src.length; i++) hash = ((hash << 5) - hash + src.charCodeAt(i)) | 0;
    const bars = [];
    for (let i = 0; i < barCount; i++) {
      hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
      hash ^= hash >>> 11;
      const h = 20 + Math.abs(hash % 60); // entre 20% y 80%
      bars.push(h);
    }
    return bars;
  }

  function bindAudioPlayers(container) {
    container.querySelectorAll('.chat-audio-play-btn').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      const src    = btn.dataset.src;
      const wrap   = btn.closest('.chat-msg-audio');
      const barEl  = wrap?.querySelector('.chat-audio-bar');
      const timeEl = wrap?.querySelector('.chat-audio-time');
      let   audio  = null;
      let   playing = false;
      let   rafId   = null;

      const PLAY_SVG  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      const PAUSE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

      // Dibujar waveform estático
      if (barEl) {
        const heights = generateWaveform(src);
        barEl.innerHTML = heights.map(h =>
          `<div class="wv-bar" style="height:${h}%"></div>`
        ).join('');
      }

      function updateBars() {
        if (!audio?.duration || !barEl) return;
        const pct  = audio.currentTime / audio.duration;
        const bars = barEl.querySelectorAll('.wv-bar');
        const pivot = Math.floor(pct * bars.length);
        bars.forEach((b, i) => b.classList.toggle('played', i < pivot));
        if (timeEl) timeEl.textContent = formatAudioDuration(audio.currentTime);
        if (playing) rafId = requestAnimationFrame(updateBars);
      }

      btn.addEventListener('click', () => {
        if (!audio) {
          audio = new Audio(src);
          audio.addEventListener('ended', () => {
            playing = false;
            btn.innerHTML = PLAY_SVG;
            cancelAnimationFrame(rafId);
            // Resetear barras
            barEl?.querySelectorAll('.wv-bar').forEach(b => b.classList.remove('played'));
            if (timeEl) timeEl.textContent = formatAudioDuration(audio.duration || 0);
          });
        }
        if (playing) {
          audio.pause();
          btn.innerHTML = PLAY_SVG;
          cancelAnimationFrame(rafId);
        } else {
          // Pausar cualquier otro audio activo
          document.querySelectorAll('.chat-audio-play-btn[data-playing]').forEach(b => {
            if (b !== btn) b.click();
          });
          audio.play();
          btn.dataset.playing = '1';
          btn.innerHTML = PAUSE_SVG;
          rafId = requestAnimationFrame(updateBars);
        }
        playing = !playing;
        if (!playing) delete btn.dataset.playing;
      });

      // Click en las barras para buscar posición
      barEl?.addEventListener('click', e => {
        if (!audio?.duration) return;
        const rect = barEl.getBoundingClientRect();
        const pct  = (e.clientX - rect.left) / rect.width;
        audio.currentTime = pct * audio.duration;
        updateBars();
        if (!playing) {
          btn.click(); // iniciar si no estaba reproduciendo
        }
      });
    });
  }

  /* ═══════════════════════════════════
     GRABAR VOZ
  ═══════════════════════════════════ */
  function bindMicBtn() {
    const micBtn = document.getElementById('chatMicBtn');
    if (!micBtn) return;

    // Pointer events directamente en el botón — sin propagación al documento
    micBtn.addEventListener('pointerdown', e => {
      e.preventDefault(); // evitar que dispare click
      micBtn.setPointerCapture(e.pointerId); // capturar todos los eventos futuros
      startRecording();
    });

    micBtn.addEventListener('pointerup', e => {
      if (Chat.isRecording) stopRecording(true);
    });

    micBtn.addEventListener('pointercancel', e => {
      if (Chat.isRecording) stopRecording(false);
    });

    // Soporte teclado
    micBtn.addEventListener('keydown', e => {
      if (e.code === 'Space' && !Chat.isRecording) {
        e.preventDefault();
        startRecording();
      }
    });
    micBtn.addEventListener('keyup', e => {
      if (e.code === 'Space' && Chat.isRecording) stopRecording(true);
    });
  }

  async function startRecording() {
    if (Chat.isRecording) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('No se pudo acceder al micrófono. Verifica los permisos del navegador.');
      return;
    }

    Chat.isRecording  = true;
    Chat.audioChunks  = [];
    Chat.recordStart  = Date.now();

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';

    Chat.mediaRecorder = new MediaRecorder(stream, { mimeType });
    Chat.mediaRecorder.addEventListener('dataavailable', e => {
      if (e.data.size > 0) Chat.audioChunks.push(e.data);
    });
    Chat.mediaRecorder.start(100); // chunk cada 100ms

    // UI: mostrar indicador de grabación
    const micBtn = document.getElementById('chatMicBtn');
    if (micBtn) micBtn.classList.add('recording');

    // Ocultar input de texto durante grabación
    const input = document.getElementById('chatInput');
    if (input) { input.style.opacity = '0'; input.style.pointerEvents = 'none'; }

    // Mostrar duración en tiempo real
    Chat.recordTimer = setInterval(() => {
      const secs = Math.floor((Date.now() - Chat.recordStart) / 1000);
      const micBtn = document.getElementById('chatMicBtn');
      if (micBtn) micBtn.setAttribute('title', formatAudioDuration(secs));
    }, 500);
  }

  async function stopRecording(send = true) {
    if (!Chat.isRecording || !Chat.mediaRecorder) return;

    clearInterval(Chat.recordTimer);
    Chat.isRecording = false;

    const duration  = (Date.now() - Chat.recordStart) / 1000;
    const recorder  = Chat.mediaRecorder;   // guardar ref antes de nullear
    const mimeType  = recorder.mimeType;

    // 1. Pedir el chunk final explícitamente
    recorder.requestData();

    // 2. Detener el recorder y esperar el evento 'stop' (que garantiza dataavailable final)
    await new Promise(resolve => {
      recorder.addEventListener('stop', resolve, { once: true });
      recorder.stop();
    });

    // 3. Ahora sí detener los tracks del stream
    recorder.stream?.getTracks().forEach(t => t.stop());

    // Restaurar UI
    const micBtn = document.getElementById('chatMicBtn');
    if (micBtn) { micBtn.classList.remove('recording'); micBtn.setAttribute('title', 'Mantén para grabar'); }
    const input = document.getElementById('chatInput');
    if (input) { input.style.opacity = ''; input.style.pointerEvents = ''; input.focus(); }

    Chat.mediaRecorder = null;

    if (!send || Chat.audioChunks.length === 0 || duration < 0.5) {
      Chat.audioChunks = [];
      return;
    }

    // Subir a Supabase Storage
    const blob = new Blob(Chat.audioChunks, { type: mimeType });
    Chat.audioChunks = [];

    const ext  = mimeType.includes('ogg') ? 'ogg' : 'webm';
    const path = `${Chat.user.id}/${Date.now()}.${ext}`;

    const sendBtn = document.getElementById('chatSendBtn');
    if (sendBtn) sendBtn.disabled = true;

    const { error: upErr } = await sb.storage.from('chat-audio').upload(path, blob, { upsert: false });
    if (upErr) {
      console.error('[chat] Error subiendo audio:', upErr.message);
      if (sendBtn) sendBtn.disabled = false;
      return;
    }

    const { data: urlData } = sb.storage.from('chat-audio').getPublicUrl(path);

    const { error: insErr } = await sb.from('messages').insert({
      conversation_id: Chat.activeConvId,
      sender_id:       Chat.user.id,
      content:         null,
      audio_url:       urlData.publicUrl,
      audio_duration:  Math.round(duration),
    });

    if (insErr) console.error('[chat] Error insertando mensaje de audio:', insErr.message);
    if (sendBtn) sendBtn.disabled = false;
  }

  /* ═══════════════════════════════════
     ENVIAR MENSAJE
  ═══════════════════════════════════ */
  async function sendMessage() {
    if (!Chat.user || !Chat.activeConvId) return;
    if (Chat.isSending) return;

    const input   = document.getElementById('chatInput');
    const content = input.value.trim();
    const hasImg  = !!Chat.pendingImage;
    if (!content && !hasImg) return;

    const sendBtn = document.getElementById('chatSendBtn');
    Chat.isSending    = true;
    sendBtn.disabled  = true;

    try {
      let imageUrl = null;
      if (hasImg) {
        const file = Chat.pendingImage;
        const ext  = file.name.split('.').pop();
        const path = `${Chat.user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage.from('chat-images').upload(path, file, { upsert: false });
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
        image_url:       imageUrl,
        reply_to_id:     Chat.replyTo?.id || null,
      });

      if (!error) {
        input.value = '';
        input.style.height = 'auto';
        clearPendingImage();
        clearReplyContext();
      } else {
        console.error('[chat] Error al enviar mensaje:', error.message);
      }
    } catch (err) {
      console.error('[chat] Excepción en sendMessage:', err);
    } finally {
      Chat.isSending   = false;
      sendBtn.disabled = false;
      input.focus();
      // Dejar de "escribir" al enviar
      clearTimeout(Chat.typingTimer);
      broadcastTyping(false);
    }
  }

  /* ═══════════════════════════════════
     ELIMINAR MENSAJE
  ═══════════════════════════════════ */
  async function deleteMessage(msgId) {
    await sb.from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', msgId)
      .eq('sender_id', Chat.user.id);
  }

  /* ═══════════════════════════════════
     TIEMPO REAL
  ═══════════════════════════════════ */
  function subscribeToConversation(convId) {
    if (Chat.realtimeSub) { sb.removeChannel(Chat.realtimeSub); Chat.realtimeSub = null; }
    Chat.realtimeSub = sb.channel(`conv-${convId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
        async () => {
          if (Chat.activeConvId === convId) {
            await loadMessages(convId);
            await sb.from('conversation_members')
              .update({ last_read_at: new Date().toISOString() })
              .eq('conversation_id', convId)
              .eq('user_id', Chat.user.id);
          }
        })
      .subscribe();
  }

  function subscribeToNewMessages() {
    if (Chat.globalMsgSub) return;
    Chat.globalMsgSub = sb.channel('all-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        async payload => {
          const msg = payload.new;
          if (msg.sender_id === Chat.user?.id) return;
          const isMember = Chat.convs.some(c => c.id === msg.conversation_id);
          if (!isMember) { await loadConversations(); return; }
          if (Chat.activeConvId !== msg.conversation_id) {
            const conv = Chat.convs.find(c => c.id === msg.conversation_id);
            if (conv) conv.hasUnread = true;
            updateBadge(Chat.convs.filter(c => c.hasUnread).length);
          }
          await loadConversations();
        })
      .subscribe();
  }

  /* ═══════════════════════════════════
     BADGE
  ═══════════════════════════════════ */
  function updateBadge(count) {
    ['chatBadge', 'chatFabBadge'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = count > 9 ? '9+' : count;
      el.classList.toggle('visible', count > 0);
    });
  }

  /* ═══════════════════════════════════
     MODAL NUEVO CHAT
  ═══════════════════════════════════ */
  async function openNewModal() {
    Chat.selectedFriends = [];
    Chat.newChatMode     = '1on1';
    document.querySelectorAll('#chatNewModal .chat-type-tab').forEach((t, i) =>
      t.classList.toggle('active', i === 0));
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
    /* Si ya tenemos el caché de amigos, usarlo directamente */
    if (Chat.friendsCache.length) { renderFriendList(); return; }
    await loadActiveFriends();
    renderFriendList();
  }

  function renderFriendList(filter = '') {
    const list = document.getElementById('chatFriendList');
    if (!list) return;
    const friends = filter
      ? Chat.friendsCache.filter(f => f.username.toLowerCase().includes(filter.toLowerCase()))
      : Chat.friendsCache;

    if (!friends.length) {
      list.innerHTML = `<div style="text-align:center;color:#ccc;padding:24px;font-size:.85rem;">
        ${Chat.friendsCache.length === 0 ? 'Agrega amigos primero para chatear.' : 'Sin resultados.'}
      </div>`;
      return;
    }

    list.innerHTML = friends.map(f => {
      const selected = Chat.selectedFriends.includes(f.id);
      return `
        <div class="chat-friend-item ${selected ? 'selected' : ''}" data-uid="${f.id}">
          <img class="chat-friend-avatar" src="${f.avatar_url}" alt="${f.username}" loading="lazy" />
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
    btn.disabled = Chat.selectedFriends.length === 0;
    btn.textContent = (Chat.newChatMode === 'group' && Chat.selectedFriends.length > 0)
      ? `Crear grupo (${Chat.selectedFriends.length})`
      : 'Iniciar chat';
  }

  async function createConversation() {
    if (!Chat.user || !Chat.selectedFriends.length) return;
    const btn = document.getElementById('chatCreateBtn');
    btn.disabled = true;

    if (Chat.newChatMode === '1on1') {
      const existing = await findExisting1on1(Chat.selectedFriends[0]);
      if (existing) {
        closeNewModal();
        if (!Chat.convs.find(c => c.id === existing)) await loadConversations();
        openConversation(existing);
        btn.disabled = false;
        return;
      }
    }

    const groupName = document.getElementById('chatGroupName').value.trim();
    const { data: convId, error } = await sb.rpc('create_conversation', {
      conv_type:  Chat.newChatMode,
      conv_name:  Chat.newChatMode === 'group' ? (groupName || 'Grupo') : null,
      member_ids: Chat.selectedFriends
    });

    if (error || !convId) { btn.disabled = false; return; }
    closeNewModal();
    await loadConversations();
    await openConversation(convId);
    btn.disabled = false;
  }

  async function findExisting1on1(friendId) {
    const { data: myConvs } = await sb
      .from('conversation_members').select('conversation_id').eq('user_id', Chat.user.id);
    if (!myConvs) return null;
    const myIds = myConvs.map(m => m.conversation_id);
    const { data: friendConvs } = await sb
      .from('conversation_members').select('conversation_id')
      .eq('user_id', friendId).in('conversation_id', myIds);
    if (!friendConvs) return null;
    const { data: conv1on1 } = await sb
      .from('conversations').select('id')
      .in('id', friendConvs.map(m => m.conversation_id))
      .eq('type', '1on1').limit(1);
    return conv1on1?.[0]?.id || null;
  }

  /* ═══════════════════════════════════
     VISTA: LISTA
  ═══════════════════════════════════ */
  function showListView() {
    Chat.activeConvId = null;
    document.getElementById('chatViewConv').classList.remove('active');
    document.getElementById('chatViewList').classList.add('active');
    if (Chat.realtimeSub) { sb.removeChannel(Chat.realtimeSub); Chat.realtimeSub = null; }
    loadConversations();
  }

  /* ═══════════════════════════════════
     PREVIEW IMAGEN
  ═══════════════════════════════════ */
  function setImagePreview(file) {
    Chat.pendingImage = file;
    document.getElementById('chatImgPreviewImg').src = URL.createObjectURL(file);
    document.getElementById('chatImgPreviewWrap').classList.add('visible');
  }

  function clearImagePreview() {
    Chat.pendingImage = null;
    document.getElementById('chatImgPreviewWrap').classList.remove('visible');
    document.getElementById('chatImgPreviewImg').src = '';
    const inp = document.getElementById('chatImageInput');
    if (inp) inp.value = '';
  }

  /* ═══════════════════════════════════
     LIGHTBOX
  ═══════════════════════════════════ */
  function openLightbox(src) {
    document.getElementById('chatLightboxImg').src = src;
    document.getElementById('chatLightbox').classList.add('open');
  }
  function closeLightbox() { document.getElementById('chatLightbox').classList.remove('open'); }

  /* ═══════════════════════════════════
     MENÚ CONTEXTUAL
  ═══════════════════════════════════ */
  /* ══════════════════════════════════════════════
     WALLPAPER
  ══════════════════════════════════════════════ */
  const WALLPAPERS = [
    { id: 'none',     label: 'Ninguno', bg: 'none',                                                    preview: 'var(--bg-page)' },
    { id: 'dots',     label: 'Puntos',  bg: 'radial-gradient(circle, var(--wp-dot) 1.5px, transparent 1.5px)', size: '20px 20px', preview: '#e8f5e9' },
    { id: 'grid',     label: 'Cuadrícula', bg: 'linear-gradient(var(--wp-line) 1px, transparent 1px), linear-gradient(90deg, var(--wp-line) 1px, transparent 1px)', size: '24px 24px', preview: '#f3e5f5' },
    { id: 'leaves',   label: 'Hojas',   bg: 'radial-gradient(ellipse 6px 10px at 50% 50%, var(--wp-dot) 0%, transparent 100%)', size: '28px 28px', preview: '#e8f5e9' },
    { id: 'waves',    label: 'Ondas',   bg: 'repeating-linear-gradient(45deg, var(--wp-line) 0, var(--wp-line) 1px, transparent 0, transparent 50%)', size: '10px 10px', preview: '#e3f2fd' },
    { id: 'green',    label: 'Verde',   bg: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',       preview: '#c8e6c9' },
    { id: 'earth',    label: 'Tierra',  bg: 'linear-gradient(135deg, #efebe9 0%, #d7ccc8 100%)',       preview: '#d7ccc8' },
    { id: 'sky',      label: 'Cielo',   bg: 'linear-gradient(180deg, #e3f2fd 0%, #bbdefb 100%)',       preview: '#bbdefb' },
    { id: 'night',    label: 'Noche',   bg: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',       preview: '#16213e' },
  ];

  function applyWallpaper() {
    const msgs   = document.getElementById('chatMessages');
    if (!msgs) return;
    const wp = Chat.profile?.chat_wallpaper || 'none';
    const found = WALLPAPERS.find(w => w.id === wp) || WALLPAPERS[0];
    msgs.style.backgroundImage = found.bg === 'none' ? '' : found.bg;
    msgs.style.backgroundSize  = found.size || '';
    msgs.dataset.wallpaper     = wp;
    // Variables CSS para los patterns
    msgs.style.setProperty('--wp-dot',  'rgba(0,0,0,0.08)');
    msgs.style.setProperty('--wp-line', 'rgba(0,0,0,0.06)');
  }

  function openWallpaperPicker() {
    const existing = document.getElementById('chatWallpaperPicker');
    if (existing) { existing.remove(); return; }

    const picker = document.createElement('div');
    picker.id        = 'chatWallpaperPicker';
    picker.className = 'chat-wallpaper-picker';
    picker.innerHTML = `
      <div class="chat-wp-header">
        <span>Fondo del chat</span>
        <button class="chat-wp-close" id="chatWpClose">✕</button>
      </div>
      <div class="chat-wp-grid">
        ${WALLPAPERS.map(w => `
          <button class="chat-wp-opt ${(Chat.profile?.chat_wallpaper || 'none') === w.id ? 'active' : ''}"
                  data-wp="${w.id}" title="${w.label}"
                  style="background:${w.preview}">
            ${(Chat.profile?.chat_wallpaper || 'none') === w.id
              ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="none"><polyline points="20 6 9 17 4 12"/></svg>'
              : ''}
          </button>
        `).join('')}
      </div>
    `;

    // Insertar dentro del panel de conversación
    const convView = document.getElementById('chatViewConv');
    convView?.appendChild(picker);

    document.getElementById('chatWpClose')?.addEventListener('click', () => picker.remove());

    picker.querySelectorAll('.chat-wp-opt').forEach(btn => {
      btn.addEventListener('click', async () => {
        const wp = btn.dataset.wp;
        picker.querySelectorAll('.chat-wp-opt').forEach(b => {
          b.classList.remove('active');
          b.innerHTML = '';
        });
        btn.classList.add('active');
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="none"><polyline points="20 6 9 17 4 12"/></svg>';

        // Actualizar perfil local y en Supabase
        if (Chat.profile) Chat.profile.chat_wallpaper = wp;
        applyWallpaper();
        await sb.from('profiles').update({ chat_wallpaper: wp }).eq('id', Chat.user.id);

        setTimeout(() => picker.remove(), 400);
      });
    });
  }

  /* ══════════════════════════════════════════════
     TICKS DE LEÍDO
  ══════════════════════════════════════════════ */
  async function markMessagesRead(convId) {
    if (!Chat.user || !convId) return;
    // Obtener los IDs de los mensajes NO propios que aún no hemos marcado
    const { data: msgs } = await sb
      .from('messages')
      .select('id')
      .eq('conversation_id', convId)
      .neq('sender_id', Chat.user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!msgs?.length) return;
    const ids = msgs.map(m => m.id);

    // Upsert silencioso — la constraint UNIQUE evita duplicados
    await sb.from('message_reads').upsert(
      ids.map(id => ({ message_id: id, user_id: Chat.user.id })),
      { onConflict: 'message_id,user_id', ignoreDuplicates: true }
    );
  }

  async function loadReadStatus(convId) {
    if (!Chat.user) return {};
    // Para mensajes propios: ver quién los leyó
    const { data } = await sb
      .from('message_reads')
      .select('message_id, user_id')
      .in('message_id',
        (await sb.from('messages')
          .select('id')
          .eq('conversation_id', convId)
          .eq('sender_id', Chat.user.id)
          .then(r => r.data?.map(m => m.id) || []))
      );

    // Agrupar por message_id
    const reads = {};
    (data || []).forEach(r => {
      if (!reads[r.message_id]) reads[r.message_id] = [];
      reads[r.message_id].push(r.user_id);
    });
    return reads;
  }

  function tickHTML(status) {
    // status: 'sent' | 'read'
    const color = status === 'read' ? 'var(--green-btn)' : 'rgba(255,255,255,0.6)';
    return `<span class="chat-tick chat-tick--${status}" title="${status === 'read' ? 'Leído' : 'Enviado'}">
      <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 5L4.5 8.5L9 3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 5L8.5 8.5L13 3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>`;
  }

  function showContextMenu(item, convId) {
    closeContextMenu();
    const rect = item.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'chat-context-menu';
    menu.innerHTML = `
      <button class="chat-ctx-btn" data-action="wallpaper" data-conv-id="${convId}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        Fondo del chat
      </button>
      <button class="chat-ctx-btn" data-action="mute" data-conv-id="${convId}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
        Silenciar conversación
      </button>
      <button class="chat-ctx-btn" data-action="unfriend" data-conv-id="${convId}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/>
        </svg>
        Dejar de ser amigos
      </button>
      <div class="chat-ctx-divider"></div>
      <button class="chat-ctx-btn danger" data-action="leave" data-conv-id="${convId}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Salir de la conversación
      </button>
    `;
    document.body.appendChild(menu);
    const menuH = 130;
    let top = rect.bottom + window.scrollY + 4;
    if (top + menuH > window.innerHeight) top = rect.top + window.scrollY - menuH - 4;
    menu.style.top  = top + 'px';
    menu.style.left = Math.min(rect.right - 210, window.innerWidth - 220) + 'px';
    requestAnimationFrame(() => menu.classList.add('visible'));
  }

  function closeContextMenu() {
    document.querySelectorAll('.chat-context-menu').forEach(m => m.remove());
  }

  async function leaveConversation(convId) {
    if (!Chat.user) return;
    const { error } = await sb.rpc('leave_conversation', { conv_id: convId });
    if (error) return;
    if (Chat.activeConvId === convId) showListView();
    Chat.convs = Chat.convs.filter(c => c.id !== convId);
    renderConvList(Chat.convs);
    updateBadge(Chat.convs.filter(c => c.hasUnread).length);
  }

  async function muteConversation(convId) {
    if (!Chat.user) return;
    await sb.from('conversation_members')
      .update({ muted: true })
      .eq('conversation_id', convId)
      .eq('user_id', Chat.user.id);
    // Feedback visual sutil
    const conv = Chat.convs.find(c => c.id === convId);
    if (conv) { conv.muted = true; renderConvList(Chat.convs); }
  }

  async function unfriendFromConv(convId) {
    if (!Chat.user) return;
    // Obtener el otro usuario en la conversación 1-a-1
    const conv = Chat.convs.find(c => c.id === convId);
    if (!conv || conv.type !== '1on1') return;
    const otherId = conv.otherUserId;
    if (!otherId) return;
    if (!confirm('¿Seguro que quieres dejar de ser amigos?')) return;
    await sb.from('friends')
      .delete()
      .or(`and(user_id.eq.${Chat.user.id},friend_id.eq.${otherId}),and(user_id.eq.${otherId},friend_id.eq.${Chat.user.id})`);
    if (Chat.activeConvId === convId) showListView();
    Chat.convs = Chat.convs.filter(c => c.id !== convId);
    renderConvList(Chat.convs);
  }

  /* ═══════════════════════════════════
     PRESENCE (estado en línea real)
  ═══════════════════════════════════ */

  function startPresence() {
    if (!Chat.user || Chat.presenceSub) return;

    Chat.presenceSub = sb.channel('ecolinces-presence', {
      config: { presence: { key: Chat.user.id } }
    });

    Chat.presenceSub
      .on('presence', { event: 'sync' }, () => {
        const state = Chat.presenceSub.presenceState();
        Chat.onlineFriends = new Set(
          Object.keys(state).filter(id => id !== Chat.user.id)
        );
        refreshActiveDots();
        updateTypingIndicator(state);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key !== Chat.user.id) {
          Chat.onlineFriends.add(key);
          refreshActiveDots();
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        Chat.onlineFriends.delete(key);
        refreshActiveDots();
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await Chat.presenceSub.track({ user_id: Chat.user.id, online_at: Date.now(), typing_in: null });
        }
      });

    // Heartbeat cada 25 s para mantener la sesión activa
    Chat._presenceHeartbeat = setInterval(async () => {
      if (Chat.presenceSub && Chat.user) {
        await Chat.presenceSub.track({ user_id: Chat.user.id, online_at: Date.now() });
      }
    }, 25000);
  }

  function stopPresence() {
    if (Chat.presenceSub) {
      sb.removeChannel(Chat.presenceSub);
      Chat.presenceSub = null;
    }
    if (Chat._presenceHeartbeat) {
      clearInterval(Chat._presenceHeartbeat);
      Chat._presenceHeartbeat = null;
    }
    Chat.onlineFriends = new Set();
  }

  /* ── Typing indicator ── */
  function updateTypingIndicator(state) {
    if (!Chat.activeConvId) return;
    const others = Object.entries(state)
      .filter(([id]) => id !== Chat.user?.id)
      .map(([, presences]) => presences[0])
      .filter(p => p?.typing_in === Chat.activeConvId);

    const indicator = document.getElementById('chatTypingIndicator');
    const label     = document.getElementById('chatTypingLabel');
    const wrap      = document.getElementById('chatTypingWrap');
    if (!indicator) return;

    if (others.length > 0) {
      indicator.classList.add('visible');
      if (label) label.textContent = others.length === 1
        ? 'escribiendo...'
        : `${others.length} personas escribiendo...`;
      if (wrap) wrap.classList.add('visible');
    } else {
      indicator.classList.remove('visible');
      if (wrap) wrap.classList.remove('visible');
    }
  }

  function broadcastTyping(isTyping) {
    if (!Chat.presenceSub || !Chat.user) return;
    Chat.presenceSub.track({
      user_id:   Chat.user.id,
      online_at: Date.now(),
      typing_in: isTyping ? Chat.activeConvId : null,
    });
  }

  function onInputTyping() {
    broadcastTyping(true);
    clearTimeout(Chat.typingTimer);
    Chat.typingTimer = setTimeout(() => broadcastTyping(false), 2000);
  }

  /* Actualiza los puntos verdes en la fila de activos sin re-renderizar */
  function refreshActiveDots() {
    const row = document.getElementById('chatActiveRow');
    if (!row) return;
    row.querySelectorAll('.chat-active-item').forEach(item => {
      const uid = item.dataset.uid;
      const dot = item.querySelector('.chat-active-dot');
      if (!dot) return;
      const isOnline = Chat.onlineFriends.has(uid);
      dot.style.display      = isOnline ? 'block' : 'none';
      item.style.opacity     = isOnline ? '1' : '0.55';
      item.style.order       = isOnline ? '0' : '1'; // activos primero
    });
  }

  /* ═══════════════════════════════════
     PRESENCE (estado en línea real)
  ═══════════════════════════════════ */

  function startPresence() {
    if (!Chat.user || Chat.presenceSub) return;

    Chat.presenceSub = sb.channel('ecolinces-presence', {
      config: { presence: { key: Chat.user.id } }
    });

    Chat.presenceSub
      .on('presence', { event: 'sync' }, () => {
        const state = Chat.presenceSub.presenceState();
        Chat.onlineFriends = new Set(
          Object.keys(state).filter(id => id !== Chat.user.id)
        );
        refreshActiveDots();
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key !== Chat.user.id) {
          Chat.onlineFriends.add(key);
          refreshActiveDots();
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        Chat.onlineFriends.delete(key);
        refreshActiveDots();
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await Chat.presenceSub.track({ user_id: Chat.user.id, online_at: Date.now(), typing_in: null });
        }
      });

    // Heartbeat cada 25 s para mantener presencia activa
    Chat._presenceHeartbeat = setInterval(async () => {
      if (Chat.presenceSub && Chat.user) {
        await Chat.presenceSub.track({ user_id: Chat.user.id, online_at: Date.now() });
      }
    }, 25000);
  }

  function stopPresence() {
    if (Chat.presenceSub) { sb.removeChannel(Chat.presenceSub); Chat.presenceSub = null; }
    if (Chat._presenceHeartbeat) { clearInterval(Chat._presenceHeartbeat); Chat._presenceHeartbeat = null; }
    Chat.onlineFriends = new Set();
  }

  function refreshActiveDots() {
    const row = document.getElementById('chatActiveRow');
    if (!row) return;
    row.querySelectorAll('.chat-active-item').forEach(item => {
      const uid  = item.dataset.uid;
      const dot  = item.querySelector('.chat-active-dot');
      const online = Chat.onlineFriends.has(uid);
      if (dot) dot.style.display = online ? 'block' : 'none';
      item.style.opacity = online ? '1' : '0.55';
      item.style.order   = online ? '0' : '1';
    });
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
     API PÚBLICA
  ═══════════════════════════════════ */
  window.ChatSystem = {
    openWith: async function (targetUserId) {
      if (!Chat.user) return;
      openPanel();
      const existingId = await findExisting1on1(targetUserId);
      if (existingId) {
        if (!Chat.convs.find(c => c.id === existingId)) await loadConversations();
        openConversation(existingId);
      } else {
        Chat.selectedFriends = [targetUserId];
        Chat.newChatMode = '1on1';
        await createConversation();
      }
    }
  };

  /* ── Arrancar ── */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
