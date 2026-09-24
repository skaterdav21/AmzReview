// Review Sprint AI relay: a Cloudflare Worker that lets visitors use AI without their own key.
// The API key lives only in this Worker's secrets. The site sends the same request it would send
// to Gemini or Groq, and the relay adds the key, enforces limits, and forwards it.
//
// Settings (Worker → Settings → Variables and Secrets):
//   GEMINI_API_KEY   secret  Google AI Studio key (enables /gemini)
//   GROQ_API_KEY     secret  Groq key (enables /groq), optional
//   ALLOWED_ORIGINS  text    comma-separated site origins, e.g. https://skaterdav21.github.io
//   HOURLY_LIMIT     text    optional requests per visitor per hour (default 40)

const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'];
const MAX_BODY_BYTES = 40000;
const MAX_OUTPUT_TOKENS = 2048;
const clampTemperature = (value) => (Number.isFinite(Number(value)) ? Math.min(Math.max(Number(value), 0), 1.5) : 0.7);

// Per-isolate counters. Cloudflare may run several copies, so this is a best-effort cap on top of
// the optional LIMITER binding (see wrangler.toml) and the provider's own free-tier quota.
const hits = new Map();

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function reply(status, data, origin) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...(origin ? corsHeaders(origin) : {}) } });
}
const fail = (status, code, message, origin) => reply(status, { error: { code: status, status: code, message } }, origin);

function overHourlyLimit(ip, env) {
  const limit = Number(env.HOURLY_LIMIT) || 40;
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600000);
  if (recent.length >= limit) { hits.set(ip, recent); return true; }
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // Keep memory bounded.
  return false;
}

// Provider outages ("high demand" 503s) shouldn't use up a visitor's allowance.
function refundHit(ip) {
  const recent = hits.get(ip);
  if (recent && recent.length) recent.pop();
}

// Only pass through the fields the site uses, so the key can't be used for other kinds of requests.
function cleanGeminiBody(body) {
  const config = body.generationConfig || {};
  const out = {
    contents: body.contents,
    generationConfig: {
      temperature: clampTemperature(config.temperature),
      maxOutputTokens: Math.min(Number(config.maxOutputTokens) || MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS)
    }
  };
  if (body.systemInstruction) out.systemInstruction = body.systemInstruction;
  if (config.responseMimeType === 'application/json') out.generationConfig.responseMimeType = 'application/json';
  if (Array.isArray(body.tools) && body.tools.some((t) => t && t.google_search)) out.tools = [{ google_search: {} }];
  return out;
}

function cleanGroqBody(body) {
  const out = {
    model: body.model,
    messages: Array.isArray(body.messages) ? body.messages.slice(0, 4).map((m) => ({ role: m.role, content: String(m.content || '') })) : [],
    temperature: clampTemperature(body.temperature),
    max_tokens: MAX_OUTPUT_TOKENS
  };
  if (body.response_format?.type === 'json_object') out.response_format = { type: 'json_object' };
  return out;
}

export default {
  async fetch(request, env) {
    const origin = (request.headers.get('Origin') || '').replace(/\/$/, '');
    const allowed = allowedOrigins(env);
    const originOk = allowed.includes(origin);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return originOk ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
    }

    // Health check, handy for confirming the setup in a browser tab.
    if (request.method === 'GET' && url.pathname === '/') {
      return reply(200, {
        ok: true,
        providers: [env.GEMINI_API_KEY && 'gemini', env.GROQ_API_KEY && 'groq'].filter(Boolean),
        allowedOrigins: allowed
      }, originOk ? origin : '');
    }

    if (!originOk) return fail(403, 'RELAY_ORIGIN', 'This AI relay only works from its own website.', '');
    if (request.method !== 'POST') return fail(405, 'RELAY_METHOD', 'Use POST.', origin);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.LIMITER) {
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return fail(429, 'RELAY_RATE_LIMIT', 'Too many AI requests in a short time. Wait a minute and try again.', origin);
    }
    if (overHourlyLimit(ip, env)) {
      return fail(429, 'RELAY_RATE_LIMIT', "You've reached this site's hourly limit for free AI. Try again later, or add your own free key in AI settings.", origin);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail(413, 'RELAY_TOO_LARGE', 'That request is too large.', origin);
    let body;
    try { body = JSON.parse(raw); } catch { return fail(400, 'RELAY_BAD_JSON', 'Invalid request.', origin); }

    let upstream;
    const geminiMatch = url.pathname.match(/^\/gemini\/([\w.-]+)$/);
    if (geminiMatch) {
      if (!env.GEMINI_API_KEY) return fail(501, 'RELAY_NO_PROVIDER', 'Gemini is not set up on this relay.', origin);
      const model = geminiMatch[1];
      if (!GEMINI_MODELS.includes(model)) return fail(404, 'RELAY_MODEL', `Model "${model}" isn't available through this site.`, origin);
      upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(cleanGeminiBody(body))
      });
    } else if (url.pathname === '/groq') {
      if (!env.GROQ_API_KEY) return fail(501, 'RELAY_NO_PROVIDER', 'Groq is not set up on this relay.', origin);
      if (!GROQ_MODELS.includes(body.model)) return fail(404, 'RELAY_MODEL', `Model "${body.model}" isn't available through this site.`, origin);
      upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
        body: JSON.stringify(cleanGroqBody(body))
      });
    } else {
      return fail(404, 'RELAY_ROUTE', 'Unknown route.', origin);
    }

    // A rejected key is the site owner's problem, not the visitor's; don't echo provider details.
    if (upstream.status === 401 || upstream.status === 403) {
      return fail(502, 'RELAY_KEY', "The site's shared AI key isn't working right now. You can add your own free key in AI settings.", origin);
    }
    if (upstream.status >= 500) refundHit(ip);
    return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }
};
