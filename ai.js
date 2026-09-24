// Optional AI writing through free-tier APIs, called directly from the browser with the user's own key.
// Nothing goes through a server we run; the key stays in this browser's localStorage.
(function () {
  const STORAGE_KEY = 'review-sprint-ai';

  // Each provider tries its models in order. Free tiers often answer "high demand" (503) or hit a
  // per-model quota (429) on one model while the others are fine, so we fall through the list.
  const PROVIDERS = {
    gemini: {
      name: 'Google Gemini',
      models: ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'],
      keyUrl: 'https://aistudio.google.com/app/apikey',
      note: 'Free tier with no credit card. Can also look up products from a link using Google Search.'
    },
    groq: {
      name: 'Groq',
      models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'],
      keyUrl: 'https://console.groq.com/keys',
      note: 'Free tier with no credit card. Runs open models (Llama, GPT-OSS) and is very fast.'
    }
  };

  // A site owner can run the relay in relay/ so visitors get AI without their own key.
  const CONFIG = window.REVIEW_SPRINT_CONFIG || {};
  const RELAY_URL = String(CONFIG.relayUrl || '').trim().replace(/\/+$/, '');
  const RELAY_BACKEND = PROVIDERS[CONFIG.relayProvider] ? CONFIG.relayProvider : 'gemini';
  const hasRelay = /^https:\/\//i.test(RELAY_URL);

  function loadSettings() {
    const fallback = hasRelay ? 'shared' : 'none';
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      let provider = saved.provider || fallback;
      if (provider === 'shared' && !hasRelay) provider = 'none';
      // Visitors who never set up their own key start on the shared AI once the site offers it.
      if (provider === 'none' && hasRelay && !saved.chosenOff) provider = 'shared';
      return { provider, key: saved.key || '', model: saved.model || '', chosenOff: Boolean(saved.chosenOff) };
    } catch { return { provider: fallback, key: '', model: '', chosenOff: false }; }
  }
  function saveSettings(settings) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Storage can be disabled; settings then last for this visit. */ }
  }

  let settings = loadSettings();
  let lastWorkingModel = '';
  let onProgress = () => {};
  const isShared = () => settings.provider === 'shared' && hasRelay;
  // The API the requests go to: the visitor's chosen provider, or the relay's.
  const backend = () => (isShared() ? RELAY_BACKEND : settings.provider);
  const enabled = () => isShared() || (Boolean(PROVIDERS[settings.provider]) && settings.key.trim().length > 10);
  const modelFor = () => lastWorkingModel || (!isShared() && settings.model.trim()) || PROVIDERS[backend()]?.models[0];

  // A chosen model goes first; the model that last worked is tried before the rest of the defaults.
  function modelsToTry() {
    const order = [!isShared() && settings.model.trim(), lastWorkingModel, ...(PROVIDERS[backend()]?.models || [])].filter(Boolean);
    return [...new Set(order)];
  }

  class AiError extends Error {
    constructor(message, { status = 0, detail = '', fatal = false } = {}) { super(message); this.status = status; this.detail = detail; this.fatal = fatal; }
  }
  const isBusy = (error) => error.status === 503 || error.status === 500 || error.status === 502 || error.status === 504 || /overloaded|high demand|unavailable/i.test(error.detail);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function readError(response, model) {
    let detail = ''; let code = '';
    try { const body = await response.json(); detail = body.error?.message || body.message || ''; code = String(body.error?.status || ''); } catch { /* Non-JSON error body. */ }
    // Relay errors are already written for visitors; only an unknown model should fall through to the next one.
    if (code.startsWith('RELAY_')) return new AiError(detail || 'The shared AI is unavailable right now.', { status: response.status, detail, fatal: code !== 'RELAY_MODEL' });
    if (response.status === 401 || response.status === 403 || /api key/i.test(detail)) {
      return new AiError('The AI key was rejected. Check it in AI settings.', { status: response.status, detail, fatal: true });
    }
    if (response.status === 429) return new AiError(`The free-tier limit was reached for ${model}.`, { status: 429, detail });
    if (response.status === 404) return new AiError(`Model "${model}" isn't available.`, { status: 404, detail });
    return new AiError(detail ? `AI error: ${detail.slice(0, 180)}` : `AI request failed (${response.status}).`, { status: response.status, detail });
  }

  async function post(url, headers, body, model) {
    let response;
    try {
      response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    } catch (error) {
      throw new AiError(error.name === 'TimeoutError' ? `${model} took too long to answer.` : 'Could not reach the AI service. Check your connection.', { status: 0, detail: 'unavailable' });
    }
    if (!response.ok) throw await readError(response, model);
    return response.json();
  }

  async function callGemini(model, { system, prompt, json, search, temperature }) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature }
    };
    // Structured JSON output and the search tool can't be combined, so search replies are parsed loosely.
    if (json && !search) body.generationConfig.responseMimeType = 'application/json';
    if (search) body.tools = [{ google_search: {} }];
    const data = isShared()
      ? await post(`${RELAY_URL}/gemini/${encodeURIComponent(model)}`, {}, body, model)
      : await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': settings.key.trim() }, body, model);
    const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
    if (!text) throw new AiError(data.promptFeedback?.blockReason ? `The AI declined this request (${data.promptFeedback.blockReason}).` : 'The AI returned an empty reply.', { fatal: Boolean(data.promptFeedback?.blockReason) });
    return text;
  }

  async function callGroq(model, { system, prompt, json, temperature }) {
    const body = { model, temperature, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] };
    if (json) body.response_format = { type: 'json_object' };
    const data = isShared()
      ? await post(`${RELAY_URL}/groq`, {}, body, model)
      : await post('https://api.groq.com/openai/v1/chat/completions', { Authorization: `Bearer ${settings.key.trim()}` }, body, model);
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) throw new AiError('The AI returned an empty reply.');
    return text;
  }

  // Tries each model in turn; a busy model gets one short retry before moving on.
  async function callWithFallback(options) {
    const call = backend() === 'gemini' ? callGemini : callGroq;
    const models = modelsToTry();
    let lastError;
    for (const [index, model] of models.entries()) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const text = await call(model, options);
          lastWorkingModel = model;
          return text;
        } catch (error) {
          if (error.fatal) throw error;
          lastError = error;
          if (!(isBusy(error) && attempt === 0)) break;
          onProgress(`${model} is busy. Retrying…`);
          await sleep(1500);
        }
      }
      if (index < models.length - 1) onProgress(`${model} is unavailable right now. Trying ${models[index + 1]}…`);
    }
    const everyModelBusy = lastError && (isBusy(lastError) || lastError.status === 429);
    throw new AiError(everyModelBusy
      ? `Every free ${PROVIDERS[backend()].name} model is overloaded or rate-limited right now. That's on the provider's side. Wait a minute and try again${isShared() ? ', or add your own free key in AI settings' : ', or switch provider in AI settings'}.`
      : lastError?.message || 'The AI request failed.');
  }

  function parseJson(text) {
    const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
    try { return JSON.parse(trimmed); } catch { /* Fall through to extracting the first object. */ }
    const start = trimmed.indexOf('{'); const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('The AI reply was not in the expected format. Try again.');
  }

  async function ask(options) {
    if (!enabled()) throw new Error('AI is not set up.');
    const text = await callWithFallback({ temperature: 0.7, ...options });
    return options.json ? parseJson(text) : text;
  }

  // ---------- Prompt building ----------
  function productBrief(product) {
    const parts = [`Product: ${product.title}`];
    if (product.brand) parts.push(`Brand/store: ${product.brand}`);
    if (product.price) parts.push(`Listed price: ${product.price}`);
    if (product.bullets.length) parts.push(`Listing highlights:\n${product.bullets.map((b) => `- ${b}`).join('\n')}`);
    if (product.specs.length) parts.push(`Specs:\n${product.specs.map((s) => `- ${s}`).join('\n')}`);
    if (product.description) parts.push(`Description: ${product.description}`);
    if (product.buyerSummary) parts.push(`What other buyers commonly mention: ${product.buyerSummary}`);
    return parts.join('\n\n');
  }

  async function generateQuestions(product) {
    const result = await ask({
      json: true,
      temperature: 0.5,
      system: 'You help shoppers write useful product reviews. You design short interview questions that draw out the concrete, first-hand details future buyers care about most for a specific product.',
      prompt: `${productBrief(product)}

Write exactly 3 questions for someone who owns this product. Each question should:
- target a detail buyers of THIS product actually worry about (e.g. sizing accuracy, battery life vs. claims, noise, assembly time, durability after washing, taste, smell, compatibility), using the listing's own claims where useful ("The listing says 40-hour battery — how long does it actually last for you?")
- ask for something observable and specific (numbers, comparisons, situations), not opinions in general
- be answerable in one or two sentences
Also give a 2-5 word lowercase category label for the product.

Return JSON: {"category": "...", "questions": [{"question": "...", "placeholder": "a short example answer, starting with e.g."}]}`
    });
    const questions = (result.questions || []).filter((q) => q && q.question).slice(0, 3)
      .map((q) => ({ question: String(q.question).slice(0, 220), placeholder: String(q.placeholder || '').slice(0, 160) }));
    if (!questions.length) throw new Error('No questions came back.');
    return { category: String(result.category || '').slice(0, 40), questions };
  }

  const LENGTHS = { short: '70-110 words', medium: '150-230 words', long: '260-380 words' };
  const TONES = {
    casual: 'conversational and warm, like telling a friend; contractions are fine',
    balanced: 'clear, confident, and even-handed, like a trusted reviewer',
    detailed: 'analytical and precise, focused on specifics, measurements, and trade-offs'
  };

  async function writeReview(product, answers, options) {
    const answerLines = answers.map(({ label, value }) => `- ${label}: ${value}`).join('\n');
    const structure = options.format === 'pros-cons'
      ? 'After the opening paragraphs, include a short "Pros:" list and a "Cons:" list (use "- " bullets, 2-4 items each, only from what the reviewer said; if they gave no cons, write the honest caveat they did give or omit the Cons list), then a closing paragraph.'
      : 'Write in paragraphs only (no bullet lists or headings), separated by blank lines.';
    const result = await ask({
      json: true,
      temperature: 0.75,
      system: `You are an editor who turns a real customer's rough notes into a polished, genuinely helpful Amazon review in their voice.

Hard rules:
- Every experience, result, opinion, and fact about their use must come from the reviewer's notes. Never invent usage, durations, numbers, people, pets, events, or problems they did not mention.
- The listing details are context only: use them to name features and parts correctly, or to confirm or contradict a claim the reviewer addressed. Do not repeat marketing copy or list features the reviewer didn't comment on.
- Match the star rating. Do not make a 2-star review sound positive or a 5-star review sound lukewarm.
- Write in first person. No hype words ("game-changer", "must-have", "10/10", "exceeded expectations"), no emojis, no "In conclusion", no mention of AI, and never claim the item was free or discounted for review unless the notes say so.

What makes it helpful:
- Open with the bottom line in one sentence: what it is to them and whether it delivered.
- Give the context a shopper needs to relate: why they bought it, how and how long they've used it, anything they compared it to.
- Turn vague praise into concrete specifics from the notes (numbers, situations, before/after).
- State the trade-offs plainly, and say who should and shouldn't buy it.
- Vary sentence length, and keep the reviewer's own memorable phrases where they're good.`,
      prompt: `${productBrief(product)}

Reviewer's star rating: ${options.rating} out of 5

Reviewer's notes:
${answerLines}

Write the review.
- Tone: ${TONES[options.tone] || TONES.balanced}
- Length of the body: ${LENGTHS[options.length] || LENGTHS.medium}
- ${structure}
- Title: under 70 characters, specific to their experience (a concrete takeaway, not "Great product").

Return JSON: {"title": "...", "body": "..."}`
    });
    if (!result.body) throw new Error('The AI reply had no review text. Try again.');
    return { title: String(result.title || '').replace(/^["']|["']$/g, '').trim(), body: String(result.body).trim() };
  }

  // Search-grounded lookup for links Amazon won't let us read directly (Gemini only).
  async function lookupProduct(url, asin) {
    if (backend() !== 'gemini') throw new Error('Link lookup needs the Gemini provider.');
    const result = await ask({
      json: true,
      search: true,
      temperature: 0.2,
      system: 'You look up Amazon product listings and report their details accurately. Only report details you found; never guess.',
      prompt: `Find the Amazon product listing at ${url}${asin ? ` (ASIN ${asin})` : ''}.
Return only JSON, no other text: {"found": true|false, "title": "full product title", "brand": "", "price": "", "bullets": ["up to 6 key feature bullets from the listing"], "description": "one or two sentence description"}
If you can't identify this exact product, return {"found": false}.`
    });
    if (!result.found || !result.title) throw new Error('The product could not be identified from the link.');
    return {
      title: String(result.title).slice(0, 300),
      brand: String(result.brand || '').slice(0, 80),
      price: String(result.price || '').slice(0, 30),
      bullets: (Array.isArray(result.bullets) ? result.bullets : []).map((b) => String(b).slice(0, 400)).slice(0, 6),
      description: String(result.description || '').slice(0, 800)
    };
  }

  async function testConnection() {
    const reply = await ask({ system: 'Reply with the single word OK.', prompt: 'Say OK.', temperature: 0 });
    return reply.trim().length > 0;
  }

  window.AI = {
    PROVIDERS,
    get settings() { return { ...settings }; },
    update(next) {
      const changed = ['provider', 'key', 'model'].some((field) => field in next && next[field] !== settings[field]);
      settings = { ...settings, ...next };
      if (changed) lastWorkingModel = '';
      saveSettings(settings);
    },
    enabled,
    modelFor,
    onProgress(listener) { onProgress = typeof listener === 'function' ? listener : () => {}; },
    providerName: () => (isShared() ? 'free AI' : PROVIDERS[settings.provider]?.name || ''),
    canLookup: () => enabled() && backend() === 'gemini',
    hasRelay,
    isShared,
    generateQuestions,
    writeReview,
    lookupProduct,
    testConnection
  };
})();
