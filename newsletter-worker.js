/**
 * Cloudflare Worker — Newsletter EcoLinces
 * 
 * Despliegue:
 *   1. Ve a https://dash.cloudflare.com → Workers & Pages → Create Worker
 *   2. Pega este código y guarda
 *   3. En Settings → Variables → añade el secreto:
 *        BREVO_KEY = xkeysib-4cf2562f...  (tipo Secret, no texto plano)
 *   4. Publica con el dominio que te asigne Cloudflare
 *      (ej: newsletter-ecolinces.tuusuario.workers.dev)
 *   5. Actualiza WORKER_URL en script.js y script_bento.js
 * 
 * Dominios permitidos (CORS): solo EcoLinces puede llamar a este Worker.
 * Cualquier otra origin recibe 403.
 */

const ALLOWED_ORIGINS = [
  'https://ecolinces.pages.dev',
  'http://localhost',        // para desarrollo local
  'http://127.0.0.1',
];

const BREVO_LIST_ID = 2;    // ID de la lista en Brevo

export default {
  async fetch(request, env) {

    const origin = request.headers.get('Origin') || '';

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, origin);
    }

    // ── Solo POST ───────────────────────────────────────────────────────────
    if (request.method !== 'POST') {
      return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405, origin);
    }

    // ── Validar origin ──────────────────────────────────────────────────────
    const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    if (!allowed) {
      return corsResponse(JSON.stringify({ error: 'Forbidden' }), 403, origin);
    }

    // ── Leer y validar body ─────────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400, origin);
    }

    const email = (body.email || '').trim().toLowerCase();
    const name  = (body.name  || '').trim();

    // Validación básica de email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return corsResponse(JSON.stringify({ error: 'Email inválido' }), 400, origin);
    }

    // ── Llamar a Brevo ──────────────────────────────────────────────────────
    const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': env.BREVO_KEY,        // Secreto seguro, nunca expuesto al cliente
      },
      body: JSON.stringify({
        email,
        attributes:    { FIRSTNAME: name },
        listIds:       [BREVO_LIST_ID],
        updateEnabled: true,
      }),
    });

    // ── Interpretar respuesta de Brevo ──────────────────────────────────────
    // 201 = creado, 204 = actualizado (ya existía), ambos son éxito
    if (brevoRes.ok || brevoRes.status === 204) {
      return corsResponse(JSON.stringify({ ok: true }), 200, origin);
    }

    // Error de Brevo — leer detalle sin exponer la key
    let brevoError = {};
    try { brevoError = await brevoRes.json(); } catch { /* ignorar */ }

    if (brevoError.code === 'duplicate_parameter') {
      // Ya suscrito — tratamos como éxito para el usuario
      return corsResponse(JSON.stringify({ ok: true, duplicate: true }), 200, origin);
    }

    console.error('Brevo error:', brevoError);
    return corsResponse(JSON.stringify({ error: 'Error al suscribir' }), 502, origin);
  }
};

// ── Helper: respuesta con headers CORS ──────────────────────────────────────
function corsResponse(body, status, origin) {
  const headers = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  return new Response(body, { status, headers });
}
