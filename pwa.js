/* pwa.js — registra el Service Worker de EcoLinces */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        /* Comprueba si hay una actualización disponible */
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          newSW?.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              /* Hay una versión nueva lista — avisamos sutilmente */
              showUpdateBanner();
            }
          });
        });
      })
      .catch(err => console.warn('[PWA] Error al registrar SW:', err));
  });

  /* Si el SW tomó el control (recarga después de actualizar) */
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) { refreshing = true; window.location.reload(); }
  });
}

function showUpdateBanner() {
  /* Banner mínimo que no interrumpe — aparece abajo y se puede ignorar */
  if (document.getElementById('pwa-update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-update-banner';
  banner.innerHTML = `
    <span>🌿 Hay una actualización disponible.</span>
    <button id="pwa-update-btn">Actualizar</button>
    <button id="pwa-update-dismiss">✕</button>
  `;
  Object.assign(banner.style, {
    position:   'fixed',
    bottom:     '72px',        /* sobre el FAB del chat */
    left:       '50%',
    transform:  'translateX(-50%)',
    background: 'var(--bg-surface, #fff)',
    border:     '1px solid var(--border-subtle, #ddd)',
    borderRadius: '999px',
    padding:    '10px 18px',
    display:    'flex',
    alignItems: 'center',
    gap:        '12px',
    boxShadow:  '0 4px 20px rgba(0,0,0,0.14)',
    zIndex:     '99999',
    fontSize:   '0.85rem',
    fontFamily: "'Satoshi', Arial, sans-serif",
    color:      'var(--text-dark, #1a1a1a)',
    whiteSpace: 'nowrap',
  });

  /* Botón actualizar */
  const btn = banner.querySelector('#pwa-update-btn');
  Object.assign(btn.style, {
    background:   'var(--green-btn, #2e7d32)',
    color:        '#fff',
    border:       'none',
    borderRadius: '999px',
    padding:      '5px 14px',
    cursor:       'pointer',
    fontSize:     '0.82rem',
    fontWeight:   '600',
  });
  btn.addEventListener('click', () => {
    navigator.serviceWorker.getRegistration().then(reg => {
      reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });
    banner.remove();
  });

  /* Botón descartar */
  const dismiss = banner.querySelector('#pwa-update-dismiss');
  Object.assign(dismiss.style, {
    background: 'none',
    border:     'none',
    cursor:     'pointer',
    color:      'var(--text-mid, #666)',
    fontSize:   '0.9rem',
    padding:    '2px 4px',
  });
  dismiss.addEventListener('click', () => banner.remove());

  document.body.appendChild(banner);
}
