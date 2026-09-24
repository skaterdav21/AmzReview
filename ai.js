// Optional AI writing through free-tier APIs, called directly from the browser with the user's own key.
// Nothing goes through a server we run; the key stays in this browser's localStorage.
(function () {
  const STORAGE_KEY = 'review-sprint-ai';

  const PROVIDERS = {
    gemini: {
      name: 'Google Gemini',
      defaultModel: 'gemini-flash-latest',
      keyUrl: 'https://aistudio.google.com/app/apikey',
      note: 'Free tier with no credit card. Can also look up products from a link using Google Search.'
    },
    groq: {
      name: 'Groq',
      defaultModel: 'llama-3.3-70b-versatile',
      keyUrl: 'https://console.groq.com/keys',
      note: 'Free tier with no credit card. Runs open models (Llama, GPT-OSS) and is very fast.'
    }
  };

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { provider: saved.provider || 'none', key: saved.key || '', model: saved.model || '' };
    } catch { return { provider: 'none', key: '', model: '' }; }
  }
  function saveSettings(settings) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Storage can be disabled; settings then last for this visit. */ }
  }

  let settings = loadSettings();
  const enabled = () => settings.provider !== 'none' && PROVIDERS[settings.provider] && settings.key.trim().length > 10;
  const modelFor = () => settings.model.trim() || PROVIDERS[settings.provider]?.defaultModel;

  async function readError(response) {
    let detail = '';
    try { const body = await response.json(); detail = body.error?.message || body.message || ''; } catch { /* Non-JSON error body. */ }
    if (response.status === 401 || response.status === 403 || /api key/i.test(detail)) return 'The AI key was rejected. Check it in AI settings.';
    if (response.status === 429) return 'The free-tier rate limit was reached. Wait a minute and try again.';
    if (response.status === 404) return `Model "${modelFor()}" was not found. Clear the model field in AI settings to use the default.`;
    return detail ? `AI error: ${detail.slice(0, 180)}` : `AI request failed (${response.status}).`;
  }

  async function callGemini({ system, prompt, json, search, temperature }) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature }
    };
    // Structured JSON output and the search tool can't be combined, so search replies are parsed loosely.
    if (json && !search) body.generationConfig.responseMimeType = 'application/json';
    if (search) body.tools = [{ google_search: {} }];
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelFor())}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.key.trim() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
    if (!text) throw new Error(data.promptFeedback?.blockReason ? `The AI declined this request (${data.promptFeedback.blockReason}).` : 'The AI returned an empty reply.');
    return text;
  }

  async function callGroq({ system, prompt, json, temperature }) {
    const body = { model: modelFor(), temperature, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] };
    if (json) body.response_format = { type: 'json_object' };
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.key.trim()}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('The AI returned an empty reply.');
    return text;
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
    const call = settings.provider === 'gemini' ? callGemini : callGroq;
    const text = await call({ temperature: 0.7, ...options });
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
    if (settings.provider !== 'gemini') throw new Error('Link lookup needs the Gemini provider.');
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
    update(next) { settings = { ...settings, ...next }; saveSettings(settings); },
    enabled,
    modelFor,
    providerName: () => PROVIDERS[settings.provider]?.name || '',
    canLookup: () => enabled() && settings.provider === 'gemini',
    generateQuestions,
    writeReview,
    lookupProduct,
    testConnection
  };
})();
